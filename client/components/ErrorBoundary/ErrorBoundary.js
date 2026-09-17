// @ts-check
// 异常边界：兜住异步路由组件（React.lazy 分包）渲染/加载期的错误，
// 避免单个路由异常导致 React 整树卸载白屏。
import React from 'react';
import PropTypes from 'prop-types';
import { Result, Button } from 'antd';

/**
 * 判断错误是否为异步分包加载失败（线上发版后旧 chunk 404 / 网络中断）。
 * webpack 的动态分包加载失败会抛出 name 为 ChunkLoadError 的错误，
 * 其 message 形如 "Loading chunk 4 failed."（旧版本无 name，仅能按 message 识别）。
 * @param {*} error
 * @returns {boolean}
 */
function isChunkLoadError(error) {
  if (!error) {
    return false;
  }
  return (
    error.name === 'ChunkLoadError' || /Loading chunk/.test(String(error.message || ''))
  );
}

export default class ErrorBoundary extends React.Component {
  static propTypes = {
    children: PropTypes.node,
    // 自定义兜底 UI；不传时使用内置的 antd Result 提示卡片
    fallback: PropTypes.element
  };

  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 保留控制台输出便于线上排查；异常本身已被边界消化，不再向上传播
    console.error('ErrorBoundary caught an error:', error, info && info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { children, fallback } = this.props;
    const { error } = this.state;
    if (!error) {
      return children;
    }
    if (fallback) {
      return fallback;
    }
    if (isChunkLoadError(error)) {
      return (
        <Result
          status="warning"
          title="页面资源已更新或网络中断"
          subTitle="页面代码可能已发布更新或当前网络连接异常，请刷新页面重试"
          extra={
            <Button type="primary" onClick={this.handleReload}>
              刷新页面
            </Button>
          }
        />
      );
    }
    return (
      <Result
        status="error"
        title="页面出现异常"
        subTitle={String((error && error.message) || '未知错误')}
        extra={
          <Button type="primary" onClick={this.handleReload}>
            刷新页面
          </Button>
        }
      />
    );
  }
}

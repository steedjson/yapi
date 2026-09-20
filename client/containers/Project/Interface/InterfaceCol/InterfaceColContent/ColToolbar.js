// @ts-check
/**
 * InterfaceColContent 子组件：内容区顶部区域（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染「测试集合」标题（含文档入口）、测试用例环境选择器与右侧操作按钮组
 * （服务端测试 / 通用规则配置 / 开始测试），并把三类操作按原有签名回调上抛。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛，不持有状态；hasPlugin / curProjectRole / 环境值与
 *     折叠态均由父组件以 props 传入（原 state.hasPlugin / curProjectRole /
 *     state.currColEnvObj / state.collapseKey）；
 *   - 不引入包装 DOM 元素：根节点即原父组件中的 <Row>，CaseEnv 接线（envList /
 *     currProjectEnvChange / envValue / collapseKey / changeClose）原样保留。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Button, Row, Col } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import CaseEnv from 'client/components/CaseEnv';

/**
 * @param {any} props
 */
const ColToolbar = props => {
  const {
    envList,
    envValue,
    collapseKey,
    onEnvChange,
    onCollapseChange,
    hasPlugin,
    curProjectRole,
    onAutoTests,
    onOpenCommonSetting,
    onExecuteTests
  } = props;

  return (
    <Row type="flex" justify="center" align="top">
      <Col span={5}>
        <h2
          className="interface-title"
          style={{
            display: 'inline-block',
            margin: '8px 20px 16px 0px'
          }}
        >
          测试集合&nbsp;<a
            target="_blank"
            rel="noopener noreferrer"
            href="https://hellosean1025.github.io/yapi/documents/case.html"
          >
            <Tooltip title="点击查看文档">
              <QuestionCircleOutlined />
            </Tooltip>
          </a>
        </h2>
      </Col>
      <Col span={10}>
        <CaseEnv
          envList={envList}
          currProjectEnvChange={onEnvChange}
          envValue={envValue}
          collapseKey={collapseKey}
          changeClose={onCollapseChange}
        />
      </Col>
      <Col span={9}>
        {hasPlugin ? (
          <div
            style={{
              float: 'right',
              paddingTop: '8px'
            }}
          >
            {curProjectRole !== 'guest' && (
              <Tooltip title="在 YApi 服务端跑自动化测试，测试环境不能为私有网络，请确保 YApi 服务器可以访问到自动化测试环境domain">
                <Button
                  style={{
                    marginRight: '8px'
                  }}
                  onClick={onAutoTests}
                >
                  服务端测试
                </Button>
              </Tooltip>
            )}
            <Button onClick={onOpenCommonSetting} style={{
                    marginRight: '8px'
                  }} >通用规则配置</Button>
            &nbsp;
            <Button type="primary" onClick={onExecuteTests}>
              开始测试
            </Button>
          </div>
        ) : (
          <Tooltip title="请安装 cross-request Chrome 插件">
            <Button
              disabled
              type="primary"
              style={{
                float: 'right',
                marginTop: '8px'
              }}
            >
              开始测试
            </Button>
          </Tooltip>
        )}
      </Col>
    </Row>
  );
};

ColToolbar.propTypes = {
  envList: PropTypes.array,
  /** 每个项目 id → 已选环境名（原 state.currColEnvObj） */
  envValue: PropTypes.object,
  collapseKey: PropTypes.any,
  onEnvChange: PropTypes.func,
  onCollapseChange: PropTypes.func,
  hasPlugin: PropTypes.bool,
  curProjectRole: PropTypes.any,
  onAutoTests: PropTypes.func,
  onOpenCommonSetting: PropTypes.func,
  onExecuteTests: PropTypes.func
};

export default ColToolbar;
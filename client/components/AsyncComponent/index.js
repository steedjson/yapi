// @ts-check
import React from 'react';
import Loading from '../Loading/Loading';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';

/**
 * 路由/插件级代码分割的统一封装（单一来源，Application 路由与三个插件共用）：
 * React.lazy + ErrorBoundary > Suspense > Lazy 三层。
 *
 * - loader 内必须带 webpackChunkName 注释以命名异步 chunk（与各调用点注释规范一致）；
 * - 外层 ErrorBoundary 兜住分包加载失败（线上发版后旧 chunk 404 / 网络中断）与
 *   路由渲染异常：就地展示友好刷新卡片，而不是整树卸载白屏；
 * - displayName 统一为 `Async(${chunkName})`（评审/测试按此识别异步包装组件）。
 *
 * 背景（首屏性能优化批次 2 登记项）：此前 Application.js 工厂未导出，三个插件
 * client.js 各自就地镜像三层结构，存在双源漂移风险；本模块下沉后五处统一引用。
 *
 * @param {() => Promise<any>} loader 动态 import 加载器
 * @param {string} chunkName webpack 异步 chunk 名
 * @returns {any} 包装后的异步组件
 */
export const createAsyncComponent = (loader, chunkName) => {
  const LazyComponent = React.lazy(loader);
  /** @type {any} */
  const AsyncComponent = (/** @type {any} */ props) => (
    <ErrorBoundary>
      <React.Suspense fallback={<Loading visible />}>
        <LazyComponent {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
  AsyncComponent.displayName = `Async(${chunkName})`;
  return AsyncComponent;
};

export default createAsyncComponent;

// @ts-check
import React, { lazy, Suspense } from 'react';
import Loading from 'client/components/Loading/Loading';
import ErrorBoundary from 'client/components/ErrorBoundary/ErrorBoundary';

// 批次1（首屏性能优化）：Wiki 页组件经 React.lazy 异步化。WikiPage 链上挂有
// MarkdownEditor（@uiw/react-md-editor + markdown-it），同步 import 会把整链锁进
// index 入口模块图、被吸进首屏 vendor——异步化后随项目内 Wiki 子路由按需加载。
// loader 内必须带 webpackChunkName 注释以命名异步 chunk（与 Application.js 路由分包注释规范一致）。
// WikiPage 经 sub_nav 注册后在 Project.js 以 Route element 渲染，链路无内置
// Suspense 边界，故此处自带。批次2（M-1 顺手修）：补齐与 Application.js
// createAsyncComponent 同构的 ErrorBoundary > Suspense > Lazy 三层（该工厂未导出，
// 就地镜像）：分包加载失败（发版后旧 chunk 404/网络中断）不再整树卸载白屏。
const LazyWikiPage = lazy(() =>
  import(/* webpackChunkName: "wiki" */ './wikiPage/index')
);

const WikiPage = (/** @type {any} */ props) => (
  <ErrorBoundary>
    <Suspense fallback={<Loading visible />}>
      <LazyWikiPage {...props} />
    </Suspense>
  </ErrorBoundary>
);
WikiPage.displayName = 'Async(WikiPage)';

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('sub_nav', function(/** @type {any} */ app) {
    app.wiki = {
      name: 'Wiki',
      path: '/project/:id/wiki',
      // v6 嵌套路由相对路径：Project.js 以 route 字段注册子路由，缺失会导致导航死链
      route: 'wiki',
      component: WikiPage
    };
  });
};

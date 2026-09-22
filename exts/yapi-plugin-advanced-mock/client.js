// @ts-check
import React, { lazy, Suspense } from 'react';
import Loading from 'client/components/Loading/Loading';
import ErrorBoundary from 'client/components/ErrorBoundary/ErrorBoundary';
// mockCol reducer 必须同步注册：add_reducer 钩子在 createStore 前消费，
// reducer 不能延迟（store 形状必须在首个 dispatch 前定型），且自身轻量无重依赖。
import mockCol from './MockCol/mockColReducer.js';

// 批次1（首屏性能优化）：高级 Mock 页组件经 React.lazy 异步化。AdvMock 链上挂有
// mockEditor（CodeMirror 6 全家桶），同步 import 会把整链锁进 index 入口模块图、
// 被吸进首屏 vendor——异步化后随接口高级 Mock Tab 按需加载（与 project 路由
// chunk 的编辑器使用面一致）。
// loader 内必须带 webpackChunkName 注释以命名异步 chunk（与 Application.js 路由分包注释规范一致）。
// AdvMock 经 interface_tab 注册后在 InterfaceContent.js Tabs 内直接渲染，链路无
// 内置 Suspense 边界，故此处自带。批次2（M-1 顺手修）：补齐与 Application.js
// createAsyncComponent 同构的 ErrorBoundary > Suspense > Lazy 三层（该工厂未导出，
// 就地镜像）：分包加载失败（发版后旧 chunk 404/网络中断）不再整树卸载白屏。
const LazyAdvMock = lazy(() =>
  import(/* webpackChunkName: "adv-mock" */ './AdvMock')
);

const AdvMockTab = (/** @type {any} */ props) => (
  <ErrorBoundary>
    <Suspense fallback={<Loading visible />}>
      <LazyAdvMock {...props} />
    </Suspense>
  </ErrorBoundary>
);
AdvMockTab.displayName = 'Async(AdvMock)';

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function(){
  this.bindHook('interface_tab', function(/** @type {any} */ tabs){
    tabs.advMock = {
      name: '高级Mock',
      component: AdvMockTab
    }
  })
  this.bindHook('add_reducer', function(/** @type {any} */ reducerModules){
    reducerModules.mockCol = mockCol;
  })
}

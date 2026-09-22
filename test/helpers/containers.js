/**
 * containers 组件测试辅助。
 *
 * 使用方式：在测试文件顶部**第一行** import 本模块（或先 import jsdom-setup 再 import 本模块），
 * 再 require 被测生产代码。
 *
 * 提供：
 *   - makeStore(seedState, reducer?)：测试 store（挂 redux-promise 中间件并记录 action）；
 *     默认 reducer 固定返回种子 state；传入自定义 reducer 后可经 store.dispatch 驱动 state 变更
 *     （活 store 断言）；
 *   - renderWithProviders(ui, opts)：Provider + react-router v6 MemoryRouter 渲染封装，
 *     opts.routePath/initialPath 模拟 Application.js 的 <Routes><Route> 挂载方式；
 *     返回的 utils.navigate(to) 可在路由内导航（id/分组切换重拉类用例）；
 *   - flushEffects(ms)：在 act 中等待异步副作用（axios → 中间件 fulfilled → setState）；
 *   - stubDefaultExport(absPath, Stub)：以 require.cache 注入方式替换带默认导出的
 *     副作用子模块（如 TimeLine），仅限测试文件在 require 生产代码之前调用。
 */
require('./jsdom-setup');

const path = require('path');
const Module = require('module');
const React = require('react');
const { render, act } = require('@testing-library/react');
const { Provider } = require('react-redux');
const { createStore, applyMiddleware } = require('redux');
const promiseMiddleware = require('redux-promise');
const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');
const { StyleProvider } = require('@ant-design/cssinjs');
const { cleanupDom } = require('./jsdom-setup');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 与 components 测试一致：reducer 固定返回种子 state，入口 dispatch 包装记录
 * 经完整中间件链的 action（含 redux-promise 二次派发的 fulfilled action）供断言。
 */
function makeStore(seedState, reducer) {
  const dispatched = [];
  const record = action => {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
  };
  // 已知怪癖（评估后保持现状）：普通 action 会被记录 2 次（dispatch 包装 + reducer 各一次）。
  // 曾尝试去重但会破坏 promise 链语义：redux-promise 的解析后 action 经中间件内部 dispatch
  // 派发（不经本包装），需依赖 reducer 侧记录才能入队；而 promise-payload 的原始 action
  // 又需包装侧立即记录（否则 NewsList 类断言看不到原始 action）。去重收益仅“数组更干净”，
  // 不抵语义风险，故保留。
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    record(action);
    if (state === undefined) return seedState;
    return typeof reducer === 'function' ? reducer(state, action) : state;
  }, seedState);
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    record(action);
    return originalDispatch(action);
  };
  return { store, dispatched };
}

/**
 * 渲染封装：
 *   - opts.seedState：store 种子 state（缺省 {}）；
 *   - opts.routePath + opts.initialPath：以 <Routes><Route path element> 包裹被测组件，
 *     复刻 Application.js 的路由挂载语义（v6 下 useParams 依赖 Route match 上下文）；
 *   - 仅传 initialPath（不传 routePath）：仅提供 Router 上下文。
 */
function renderWithProviders(ui, opts) {
  const options = opts || {};
  const { store, dispatched } = makeStore(options.seedState || {}, options.reducer);
  const routerProps = {
    future: { v7_startTransition: true, v7_relativeSplatPath: true }
  };
  if (options.initialPath) {
    routerProps.initialEntries = [options.initialPath];
  }
  let element = ui;
  if (options.routePath) {
    element = React.createElement(
      Routes,
      null,
      React.createElement(Route, { path: options.routePath, element: ui })
    );
  }
  // 路由内导航捕获：把 useNavigate 暴露为 utils.navigate(to)，供「id/分组切换重拉」用例
  // 在不重建 Provider 的前提下驱动路由跳转（渲染 null，不影响 DOM）
  const navigationRef = { current: null };
  function NavigationCapture() {
    navigationRef.current = useNavigate();
    return null;
  }
  const utils = render(
    // StyleProvider hashPriority="high" 与 client/index.js 的生产挂载链一致：
    // cssinjs 以 .css-hash 前缀（计 1 类）注入 antd 规则，而非 :where() 计零；
    // 缺此包裹时 jsdom 下的特异性模型与生产不符（层 C 实测发现的偏差）。
    React.createElement(
      StyleProvider,
      { hashPriority: 'high' },
      React.createElement(
        Provider,
        { store },
        React.createElement(
          MemoryRouter,
          routerProps,
          React.createElement(NavigationCapture, { key: 'navigation-capture' }),
          element
        )
      )
    )
  );
  const result = Object.assign({ store, dispatched }, utils);
  result.navigate = to => {
    act(() => {
      navigationRef.current(to);
    });
  };
  return result;
}

// 在 act 中等待异步副作用完成（同步用例无需调用）
async function flushEffects(ms) {
  await act(async () => {
    await sleep(ms == null ? 15 : ms);
  });
}

/**
 * 以 require.cache 注入方式替换目标模块的默认导出（Node 解析相对导入时会命中同一
 * 绝对路径的缓存）。必须在 require 生产代码之前调用；每个 ava worker 为独立进程，
 * 不会跨测试文件污染。
 */
function stubDefaultExport(absPath, Stub) {
  const stubModule = new Module(absPath, null);
  stubModule.filename = absPath;
  stubModule.loaded = true;
  stubModule.exports = { __esModule: true, default: Stub };
  require.cache[absPath] = stubModule;
}

module.exports = {
  REPO_ROOT,
  makeStore,
  renderWithProviders,
  flushEffects,
  stubDefaultExport,
  cleanupDom
};

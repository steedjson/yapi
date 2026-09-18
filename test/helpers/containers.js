/**
 * containers 组件测试辅助。
 *
 * 使用方式：在测试文件顶部**第一行** import 本模块（或先 import jsdom-setup 再 import 本模块），
 * 再 require 被测生产代码。
 *
 * 提供：
 *   - makeStore(seedState)：固定 reducer 的测试 store（挂 redux-promise 中间件并记录 action）；
 *   - renderWithProviders(ui, opts)：Provider + react-router v6 MemoryRouter 渲染封装，
 *     opts.routePath/initialPath 模拟 Application.js 的 <Routes><Route> 挂载方式；
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
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const { cleanupDom } = require('./jsdom-setup');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 与 components 测试一致：reducer 固定返回种子 state，入口 dispatch 包装记录
 * 经完整中间件链的 action（含 redux-promise 二次派发的 fulfilled action）供断言。
 */
function makeStore(seedState) {
  const dispatched = [];
  const record = action => {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
  };
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    record(action);
    return state === undefined ? seedState : state;
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
  const { store, dispatched } = makeStore(options.seedState || {});
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
  const utils = render(
    React.createElement(Provider, { store }, React.createElement(MemoryRouter, routerProps, element))
  );
  return Object.assign({ store, dispatched }, utils);
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

/**
 * containers 组件测试辅助。
 *
 * 使用方式：在测试文件顶部**第一行** import 本模块（或先 import jsdom-setup 再 import 本模块），
 * 再 require 被测生产代码。
 *
 * 提供：
 *   - renderWithProviders(ui, opts)：react-router v6 MemoryRouter 渲染封装
 *     （Redux 已随状态管理迁移收尾批退役：原 Provider/makeStore 包装与 opts.seedState/
 *     opts.reducer 选项一并移除，Zustand store 无 Provider，组件测试直接
 *     useXxxStore.setState 播种 + afterEach 复位）；
 *     opts.routePath/initialPath 模拟 Application.js 的 <Routes><Route> 挂载方式；
 *     返回的 utils.navigate(to) 可在路由内导航（id/分组切换重拉类用例）；
 *   - flushEffects(ms)：在 act 中等待异步副作用（axios → store 写入 → setState）；
 *   - waitFor(checker, desc, timeout)：轮询等待断言条件成立（React 19 并发调度下
 *     替代「固定 sleep 再断言」，checker 可为条件函数或直接放既有断言）；
 *   - stubDefaultExport(absPath, Stub)：以 require.cache 注入方式替换带默认导出的
 *     副作用子模块（如 TimeLine），仅限测试文件在 require 生产代码之前调用。
 */
require('./jsdom-setup');

const path = require('path');
const Module = require('module');
const React = require('react');
const { render, act } = require('@testing-library/react');
const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');
const { StyleProvider } = require('@ant-design/cssinjs');
const { cleanupDom } = require('./jsdom-setup');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 渲染封装：
 *   - opts.routePath + opts.initialPath：以 <Routes><Route path element> 包裹被测组件，
 *     复刻 Application.js 的路由挂载语义（v6 下 useParams 依赖 Route match 上下文）；
 *   - 仅传 initialPath（不传 routePath）：仅提供 Router 上下文。
 */
function renderWithProviders(ui, opts) {
  const options = opts || {};
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
        MemoryRouter,
        routerProps,
        React.createElement(NavigationCapture, { key: 'navigation-capture' }),
        element
      )
    )
  );
  utils.navigate = to => {
    act(() => {
      navigationRef.current(to);
    });
  };
  return utils;
}

// 在 act 中等待异步副作用完成（同步用例无需调用）
async function flushEffects(ms) {
  await act(async () => {
    await sleep(ms == null ? 15 : ms);
  });
}

const DEFAULT_WAIT_FOR_TIMEOUT = 3000;
const WAIT_FOR_INTERVAL = 10;

/**
 * 轮询等待「断言条件成立」（React 19 并发调度下替代「固定 sleep 再断言」）。
 *
 * 背景：React 19 的并发调度会把事件后异步链路（axios → store 写入 → setState）的
 * 渲染/提交推迟到后续宏/微任务，固定 sleep 可能与提交窗口错位——断言跑在提交前，
 * 且更新落在 act 外触发 not wrapped in act(...) 告警。本助手每轮先在 act 中让出
 * 事件循环（React 在 act 作用域内完成调度的提交），再检查条件，成立即返回。
 *
 * checker 用法（不改变既有断言语义，只改等待方式）：
 *   - 条件式（推荐）：返回真值视为就绪，如 () => utils.container.querySelector('.foo');
 *     条件成立后再执行原断言，断言语句本身保持在 waitFor 之外。
 *   - 注意不要把 ava 断言直接放进 checker：ava 断言失败是「记录失败」而非抛错，
 *     早期轮询记录的失败会粘滞到测试结果（不会随后续轮询通过而撤销）。
 *   - checker 若因 DOM 查询辅助（getBy*）抛错，视为未就绪继续轮询，
 *     超时后把最后错误一并抛出，便于定位。
 *
 * @param {() => any} checker 条件函数（返回真值）或直接断言（抛错视为未就绪）
 * @param {string} [desc] 条件描述，超时报错附带，便于定位
 * @param {number} [timeout] 超时毫秒数，默认 3000
 */
async function waitFor(checker, desc, timeout) {
  const timeoutMs = timeout == null ? DEFAULT_WAIT_FOR_TIMEOUT : timeout;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    await act(async () => {
      await sleep(WAIT_FOR_INTERVAL);
    });
    let ok = false;
    try {
      ok = Boolean(checker());
    } catch (e) {
      lastError = e;
    }
    if (ok) {
      return;
    }
    if (Date.now() > deadline) {
      const reason = desc || '等待条件未满足';
      const hint = lastError ? `；最后错误: ${lastError.message}` : '';
      throw new Error(`waitFor 超时（${timeoutMs}ms）：${reason}${hint}`);
    }
  }
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
  renderWithProviders,
  flushEffects,
  waitFor,
  stubDefaultExport,
  cleanupDom
};

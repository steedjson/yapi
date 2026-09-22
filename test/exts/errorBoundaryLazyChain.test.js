// 首屏性能优化批次2（M-1 顺手修）：插件 client.js 三层结构（ErrorBoundary > Suspense > Lazy）
// 的「分包加载失败」端到端路径验证。
//
// 背景：批次1 只有两层（Suspense > Lazy），分包加载失败（发版后旧 chunk 404 / 网络中断，
// 抛 ChunkLoadError）会沿 Suspense 向上冒泡，把 React 整树卸载成白屏。批次2 在三个
// 插件 client.js（statistics / wiki / advanced-mock）外层补齐 ErrorBoundary，与
// Application.js createAsyncComponent 同构。lazyClientChains.test.js 已钉住"加载成功"
// 路径，本文件用 jsdom 钉住"import() 失败 → 兜底 UI 渲染"路径：
//   1. statistics 的 lazy loader import() reject ChunkLoadError 时，外层 ErrorBoundary
//      捕获并渲染「页面资源已更新或网络中断」刷新卡片，而不是白屏/向上冒泡；
//   2. 一般错误同样被兜底（展示异常 message），错误不逸出导致 React 卸载整树。
// 测试环境与 test/exts/setup.js 同构（jsdom + 别名 + axios 桩）。
import './setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { cleanupDom } from '../helpers/containers';

const { axiosMock } = require('./setup');
const { default: ErrorBoundary } = require(
  '../../client/components/ErrorBoundary/ErrorBoundary.js'
);

// jsdom-setup 的全局清单未包含 ShadowRoot，而 antd 图标挂载期 rc-util 的 inShadow()
// 会裸引用该构造器（与 ErrorBoundary.test.js 同款补齐）。
if (typeof globalThis.ShadowRoot === 'undefined' && globalThis.window && globalThis.window.ShadowRoot) {
  Object.defineProperty(globalThis, 'ShadowRoot', {
    value: globalThis.window.ShadowRoot,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

function loadHooks(relPath) {
  const register = require(relPath);
  const hooks = {};
  register.call({
    bindHook: (name, fn) => {
      hooks[name] = fn;
    }
  });
  return hooks;
}

// 异常路径的 console 噪音（React 记录渲染错误 + componentDidCatch 输出）不污染测试输出
test.serial.beforeEach(t => {
  t.context.originalConsoleError = console.error;
  t.context.axiosRoutes = axiosMock.routes;
  axiosMock.setRoutes([]);
  console.error = function() {};
});

test.serial.afterEach.always(t => {
  console.error = t.context.originalConsoleError;
  axiosMock.setRoutes(t.context.axiosRoutes);
  cleanup();
  cleanupDom();
});

/**
 * 构造「statistics 插件 client.js 的真实包装链」但把 lazy loader 替换为注定失败
 * 的 import()：以 hooks.app_route 注册的 component 为蓝本，手工复刻
 * ErrorBoundary > Suspense > lazy(fail) 三层——与生产 client.js 的 JSX 结构逐层一致，
 * 差异仅在 loader 用 reject 模拟 chunk 404（生产 loader 是静态 import，测试进程内
 * 无 webpack 运行时，无法让真实 import 失败）。
 * @param {() => Promise<any>} loader lazy 的加载函数
 * @returns {React.Element} 包装后的组件树
 */
function buildStatisticsChain(loader) {
  const { lazy, Suspense } = require('react');
  const Loading = require('../../client/components/Loading/Loading').default;
  const LazyPage = lazy(loader);
  function Wrapper() {
    return React.createElement(
      ErrorBoundary,
      null,
      React.createElement(Suspense, { fallback: React.createElement(Loading, { visible: true }) }, React.createElement(LazyPage))
    );
  }
  Wrapper.displayName = 'Async(StatisticsPage)';
  return React.createElement(Wrapper);
}

function chunkLoadError() {
  const error = new Error('Loading chunk statistics failed.');
  error.name = 'ChunkLoadError';
  return error;
}

test.serial('statistics 分包加载失败：ChunkLoadError 被边界消化，渲染资源更新刷新卡片', async t => {
  const hooks = loadHooks('../../exts/yapi-plugin-statistics/client.js');
  const app = {};
  hooks.app_route(app);
  t.truthy(app.statisticsPage, 'statistics client.js 应注册 statisticsPage（产物链在位）');

  render(buildStatisticsChain(() => Promise.reject(chunkLoadError())));

  // 失败异步落地后边界接管：出现分包失败专属提示与刷新入口
  const card = await screen.findByText('页面资源已更新或网络中断');
  t.truthy(card, '应渲染分包加载失败提示而非白屏');
  t.truthy(screen.getByRole('button', { name: '刷新页面' }), '应提供「刷新页面」按钮');
  t.is(screen.queryByText('页面出现异常'), null, 'ChunkLoadError 应走专属提示而非通用异常');
});

test.serial('statistics 分包加载失败：一般错误同样被兜底且异常 message 可见', async t => {
  const hooks = loadHooks('../../exts/yapi-plugin-statistics/client.js');
  const app = {};
  hooks.app_route(app);

  render(buildStatisticsChain(() => Promise.reject(new Error('网络中断'))));

  const generic = await screen.findByText('页面出现异常');
  t.truthy(generic, '一般错误应渲染通用异常提示');
  t.truthy(screen.getByText('网络中断'), '异常 message 应展示便于排查');
  t.truthy(screen.getByRole('button', { name: '刷新页面' }), '通用异常也应提供刷新入口');
});

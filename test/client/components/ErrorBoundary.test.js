// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

// jsdom-setup 的全局清单未包含 ShadowRoot，而 antd 图标挂载期 rc-util 的 inShadow()
// 会裸引用该构造器，缺失会在 act 副作用阶段抛 ReferenceError 卡住渲染。
// 这里沿用 jsdom-setup 的做法，从 jsdom window 补齐（等价于 GLOBAL_KEYS 的 defineGlobal）。
if (typeof globalThis.ShadowRoot === 'undefined' && globalThis.window && globalThis.window.ShadowRoot) {
  Object.defineProperty(globalThis, 'ShadowRoot', {
    value: globalThis.window.ShadowRoot,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

const { default: ErrorBoundary } = require(
  '../../../client/components/ErrorBoundary/ErrorBoundary.js'
);

// 渲染期抛出指定错误的子组件，用于触发异常边界
function Bomb({ error }) {
  throw error;
}

function makeError(message, name) {
  const error = new Error(message);
  if (name) {
    error.name = name;
  }
  return error;
}

// 异常路径的 console 噪音（React 记录渲染错误 + componentDidCatch 输出）不污染测试输出；
// ava 的 t.context 在 hooks 与当前用例间共享，每个用例独立装订，避免串扰。
test.serial.beforeEach(t => {
  t.context.originalConsoleError = console.error;
  let callCount = 0;
  t.context.consoleErrorSpy = function() {
    callCount++;
  };
  t.context.getCallCount = function() {
    return callCount;
  };
  console.error = t.context.consoleErrorSpy;
});

test.serial.afterEach.always(t => {
  console.error = t.context.originalConsoleError;
  cleanup();
  cleanupDom();
});

test.serial('无异常时正常渲染 children 且不出现兜底 UI', t => {
  render(
    <ErrorBoundary>
      <div>正常内容</div>
    </ErrorBoundary>
  );

  t.truthy(screen.getByText('正常内容'), 'children 应被原样渲染');
  t.is(screen.queryByText('页面出现异常'), null, '不应出现通用异常提示');
  t.is(screen.queryByText('页面资源已更新或网络中断'), null, '不应出现分包加载提示');
  t.is(screen.queryByRole('button', { name: '刷新页面' }), null, '不应出现刷新按钮');
});

test.serial('一般异常时渲染通用错误提示，异常被边界消化不向上抛出', t => {
  render(
    <ErrorBoundary>
      <Bomb error={makeError('爆炸了')} />
    </ErrorBoundary>
  );

  // render 未抛出即证明异常被边界捕获；再验证通用 UI 与 componentDidCatch 的控制台输出
  t.truthy(screen.getByText('页面出现异常'), '应渲染通用异常提示');
  t.truthy(screen.getByText('爆炸了'), '异常 message 应展示在副标题中便于排查');
  t.truthy(screen.getByRole('button', { name: '刷新页面' }), '通用异常也应提供刷新入口');
  t.true(
    t.context.getCallCount() >= 1,
    'componentDidCatch 应输出控制台日志, 实际调用: ' + t.context.getCallCount()
  );
});

test.serial('ChunkLoadError 时渲染资源更新/网络中断提示与刷新按钮', t => {
  render(
    <ErrorBoundary>
      <Bomb error={makeError('Loading chunk 4 failed.', 'ChunkLoadError')} />
    </ErrorBoundary>
  );

  t.truthy(screen.getByText('页面资源已更新或网络中断'), '应渲染分包加载失败的友好提示');
  t.truthy(screen.getByRole('button', { name: '刷新页面' }), '应提供「刷新页面」按钮');
  t.is(screen.queryByText('页面出现异常'), null, '不应落入通用异常提示');
});

test.serial('message 含 Loading chunk 但无 name 时同样识别为分包加载失败', t => {
  render(
    <ErrorBoundary>
      <Bomb error={makeError('Loading chunk 7 failed.\n(error: http://localhost/7.js)')} />
    </ErrorBoundary>
  );

  t.truthy(screen.getByText('页面资源已更新或网络中断'), '旧版本错误无 ChunkLoadError name，应按 message 识别');
});

test.serial('支持传入自定义 fallback 兜底 UI', t => {
  render(
    <ErrorBoundary fallback={<div>自定义兜底</div>}>
      <Bomb error={makeError('爆炸了')} />
    </ErrorBoundary>
  );

  t.truthy(screen.getByText('自定义兜底'), '应渲染自定义 fallback');
  t.is(screen.queryByText('页面出现异常'), null, '传入 fallback 时不应渲染内置提示');
});

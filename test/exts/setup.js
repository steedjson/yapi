/**
 * exts 插件组件测试共享环境。
 *
 * 使用方式：在测试文件顶部**第一行** import 本模块，再 import 被测生产代码。
 *
 * 职责：
 *   1. 复用 test/helpers/jsdom-setup（jsdom + common/ 别名 + 样式空加载 + 网络防护）；
 *   2. 补 client/、exts/ 裸前缀别名（插件组件以 webpack 别名引用 client/ 下模块）；
 *   3. 打桩重型/副作用模块：axios（可编程路由 + 调用记录）、mockEditor /
 *      AceEditor / MarkdownEditor（CodeMirror/tui-editor 不进 jsdom）；
 *   4. 提供可控 FakeWebSocket 替换 Node 原生实现（避免真实连接，收发可观测）。
 *
 * 每个测试文件在独立 ava worker 进程中运行，无跨文件污染。
 */
require('../helpers/jsdom-setup');

const path = require('path');
const Module = require('module');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ALIAS_FLAG = '__YAPI_EXTS_TEST_CLIENT_ALIAS__';

// client/、exts/ 裸前缀 → 仓库根（webpack alias 等价物）
if (!globalThis[ALIAS_FLAG]) {
  globalThis[ALIAS_FLAG] = true;
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    if (
      typeof request === 'string' &&
      (request.indexOf('client/') === 0 || request.indexOf('exts/') === 0)
    ) {
      return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- axios 桩：可编程路由 + 调用记录 ----------
const axiosAbs = require.resolve('axios', { paths: [REPO_ROOT] });

const axiosMock = {
  calls: [],
  routes: [],
  /** @param {any[]} routes [{ match: string | RegExp, respond: (arg: any) => any }] */
  setRoutes(routes) {
    this.routes = routes;
    this.calls = [];
  },
  /** 按 url 前缀/正则过滤已记录调用 */
  filter(match) {
    return this.calls.filter(c =>
      typeof match === 'string' ? c.url.indexOf(match) === 0 : match.test(c.url)
    );
  },
  reset() {
    this.routes = [];
    this.calls = [];
  }
};

function axiosRespond(url, arg) {
  for (const route of axiosMock.routes) {
    const hit =
      typeof route.match === 'string' ? url.indexOf(route.match) === 0 : route.match.test(url);
    if (hit) {
      return route.respond(arg);
    }
  }
  return { errcode: 0, data: null };
}

const axiosStub = {
  get: (url, config) => {
    axiosMock.calls.push({ method: 'get', url: String(url), params: config && config.params });
    return new Promise(resolve => {
      setTimeout(() => resolve({ data: axiosRespond(String(url), config) }), 10);
    });
  },
  post: (url, body) => {
    axiosMock.calls.push({ method: 'post', url: String(url), body });
    return new Promise(resolve => {
      setTimeout(() => resolve({ data: axiosRespond(String(url), body) }), 10);
    });
  }
};
{
  const stubModule = new Module(axiosAbs, null);
  stubModule.filename = axiosAbs;
  stubModule.loaded = true;
  stubModule.exports = { __esModule: true, default: axiosStub };
  require.cache[axiosAbs] = stubModule;
}

// ---------- 重型编辑器组件桩（必须在 require 被测组件前写入 require.cache） ----------
function stubDefaultExport(absPath, Stub) {
  const stubModule = new Module(absPath, null);
  stubModule.filename = absPath;
  stubModule.loaded = true;
  stubModule.exports = { __esModule: true, default: Stub };
  require.cache[absPath] = stubModule;
}

const mockEditorCalls = [];
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/mockEditor.js'),
  function StubMockEditor(options) {
    mockEditorCalls.push({
      container: options.container,
      data: String(options.data == null ? '' : options.data)
    });
    return { stub: true };
  }
);

const React = require('react');
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  function StubAceEditor(props) {
    return React.createElement(
      'div',
      { className: 'stub-ace-editor', 'data-data': String(props.data == null ? '' : props.data) },
      'STUB_ACE'
    );
  }
);

const MarkdownEditorStub = React.forwardRef(function StubMarkdownEditor(props, ref) {
  React.useImperativeHandle(ref, () => ({
    getHtml: () => '<p>stub-html</p>',
    getMarkdown: () => '# stub-md'
  }));
  return React.createElement(
    'div',
    { className: 'stub-markdown-editor', 'data-value': String(props.value == null ? '' : props.value) },
    'STUB_MARKDOWN_EDITOR'
  );
});
stubDefaultExport(path.join(REPO_ROOT, 'client/components/MarkdownEditor/index.js'), MarkdownEditorStub);

// ---------- WebSocket 桩：实例收发/开闭全部可观测 ----------
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    FakeWebSocket.created.push(this);
  }
  // 模拟连接建立：对齐真实 WebSocket 语义（open 事件时 readyState 已为 1）
  simulateOpen() {
    this.readyState = 1;
    if (typeof this.onopen === 'function') {
      this.onopen();
    }
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  static reset() {
    FakeWebSocket.created = [];
  }
}
FakeWebSocket.created = [];
globalThis.WebSocket = FakeWebSocket;
if (globalThis.window) {
  globalThis.window.WebSocket = FakeWebSocket;
}

module.exports = { axiosMock, mockEditorCalls, FakeWebSocket, REPO_ROOT, sleep };

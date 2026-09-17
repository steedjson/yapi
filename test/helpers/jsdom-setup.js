/**
 * 前端组件测试环境（jsdom + React 18）搭建。
 *
 * 使用方式：在测试文件顶部**第一行**显式 import 本模块，再 import 被测生产代码。
 * 不写入 ava.config.cjs 的 require，避免影响既有服务端 / 纯函数测试的运行环境。
 *
 * 本模块负责三件事：
 *   1. 把 jsdom 的 window/document/navigator 等挂到 globalThis，并补齐 jsdom
 *      缺失的浏览器 API（matchMedia / ResizeObserver / IntersectionObserver /
 *      Range.getClientRects 等）；
 *   2. 让 Node 能解析生产代码里的 `common/xxx` 裸模块路径（webpack alias 等价物）
 *      以及 `.css/.scss` 样式导入（webpack loader 等价物）；
 *   3. 提供 cleanupDom()，在每个用例后清空 document.body 并移除测试期注入的全局。
 */
const path = require('path');
const Module = require('module');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ALIAS_FLAG = '__YAPI_TEST_MODULE_ALIASES__';
const ASSET_FLAG = '__YAPI_TEST_ASSET_STUBS__';
const DOM_FLAG = '__YAPI_TEST_JSDOM__';

/**
 * 生产代码用 `require('common/mock-extra.js')` 这类裸路径引用仓库根目录下的 common/，
 * 由 webpack alias 解析。Node 原生解析不到，这里补一层等价映射。
 */
function installModuleAliases() {
  if (globalThis[ALIAS_FLAG]) {
    return;
  }
  globalThis[ALIAS_FLAG] = true;

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    if (typeof request === 'string' && request.indexOf('common/') === 0) {
      return originalResolveFilename.call(
        this,
        path.join(REPO_ROOT, request),
        parent,
        isMain,
        options
      );
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

/**
 * `.css/.scss` 由 webpack 的 loader 处理，Node 会当成 JS 解析并抛 SyntaxError。
 * 测试只需样式不参与逻辑，注册空 handler 即可。
 */
function installAssetStubs() {
  if (globalThis[ASSET_FLAG]) {
    return;
  }
  globalThis[ASSET_FLAG] = true;

  const extensions = Module._extensions || require.extensions;
  ['.css', '.scss', '.sass', '.less'].forEach(function(ext) {
    if (!extensions[ext]) {
      extensions[ext] = function() {};
    }
  });
}

function noop() {}

/**
 * rc-overflow（antd Menu 横向溢出测量依赖）通过 MessageChannel.port1.onmessage
 * 常驻监听来调度测量回调。Node 下该端口被隐式 start() 后会 ref 住事件循环，
 * 导致渲染过 Menu 的 ava worker 永远无法退出。
 * 测试环境做两层补丁（不改变库的消息投递语义，测试期间 ava 自身句柄足以
 * 维持事件循环），仅取消端口对进程存活的影响：
 *   1. MessageChannel 构造出的两个端口立即 unref；
 *   2. onmessage 赋值 / start() 的隐式启动会重新 ref，故在调用后再次 unref。
 */
function installMessageChannelUnref() {
  const RealMessageChannel = globalThis.MessageChannel;
  if (typeof RealMessageChannel !== 'function') {
    return;
  }
  function unrefPort(port) {
    if (port && typeof port.unref === 'function') {
      port.unref();
    }
  }
  const sample = new RealMessageChannel();
  const portProto = (sample.port1 && Object.getPrototypeOf(sample.port1)) || null;
  unrefPort(sample.port1);
  unrefPort(sample.port2);
  if (!portProto) {
    return;
  }
  function UnrefedMessageChannel() {
    const channel = new RealMessageChannel();
    unrefPort(channel.port1);
    unrefPort(channel.port2);
    return channel;
  }
  UnrefedMessageChannel.prototype = RealMessageChannel.prototype;
  globalThis.MessageChannel = UnrefedMessageChannel;

  const onmessageDesc = Object.getOwnPropertyDescriptor(portProto, 'onmessage');
  if (onmessageDesc && onmessageDesc.set) {
    Object.defineProperty(portProto, 'onmessage', {
      configurable: true,
      enumerable: onmessageDesc.enumerable,
      get: onmessageDesc.get,
      set: function(value) {
        onmessageDesc.set.call(this, value);
        unrefPort(this);
      }
    });
  }
  if (typeof portProto.start === 'function') {
    const originalStart = portProto.start;
    portProto.start = function() {
      const result = originalStart.call(this);
      unrefPort(this);
      return result;
    };
  }
}

function createMatchMedia() {
  return function matchMedia(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: function() {
        return false;
      }
    };
  };
}

function createResizeObserver() {
  return function ResizeObserver(callback) {
    this.observe = noop;
    this.unobserve = noop;
    this.disconnect = noop;
    this._callback = callback;
  };
}

function createIntersectionObserver() {
  return function IntersectionObserver(callback, options) {
    this.root = null;
    this.rootMargin = '';
    this.thresholds = [];
    this.takeRecords = function() {
      return [];
    };
    this.observe = noop;
    this.unobserve = noop;
    this.disconnect = noop;
    void callback;
    void options;
  };
}

function createClipboardEvent() {
  return function ClipboardEvent(type, init) {
    void init;
    const event = new globalThis.Event(type, { bubbles: true, cancelable: true });
    event.clipboardData = null;
    return event;
  };
}

// CodeMirror 6 依赖 Range 的测量 API，jsdom 未实现，返回空测量结果即可。
function patchRangeMeasure(window) {
  const proto = window.Range && window.Range.prototype;
  if (!proto) {
    return;
  }
  const emptyRectList = function() {
    return { length: 0, item: function() {
      return null;
    } };
  };
  if (!proto.getClientRects) {
    proto.getClientRects = emptyRectList;
  }
  if (!proto.getBoundingClientRect) {
    proto.getBoundingClientRect = function() {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    };
  }
}

/**
 * 测试网络防护：jsdom 的 XMLHttpRequest 默认会真实发出网络请求，是单测
 * 网络 flake 的根源。这里直接替换 XMLHttpRequest.prototype.open，让任何
 * 未打桩的请求在发起前立即抛错，把隐患前移为显式失败。
 * 还原函数记录在模块级 restoreNetworkInterceptor 上，由 cleanupDom 负责还原。
 */
let restoreNetworkInterceptor = null;

function installNetworkInterceptor(window) {
  if (!window || !window.XMLHttpRequest) return;
  const proto = window.XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  proto.open = function(method, url) {
    throw new Error(`[测试网络拦截] 单元测试中禁止未打桩的网络请求: ${method} ${url}`);
  };
  restoreNetworkInterceptor = function() {
    proto.open = originalOpen;
  };
}

const GLOBAL_KEYS = [
  'window',
  'Window',
  'document',
  'HTMLDocument',
  'navigator',
  'location',
  'history',
  'self',
  'Node',
  'NodeList',
  'DOMTokenList',
  'DOMRect',
  'DOMRectReadOnly',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLDivElement',
  'HTMLAnchorElement',
  'HTMLButtonElement',
  'SVGElement',
  'ShadowRoot',
  'Text',
  'Comment',
  'DocumentFragment',
  'Range',
  'Selection',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'InputEvent',
  'FocusEvent',
  'UIEvent',
  'DOMParser',
  'XMLSerializer',
  'XMLHttpRequest',
  'CSSStyleDeclaration',
  'FileReader',
  'Blob',
  'File',
  'FormData',
  'DataTransfer',
  'MutationObserver'
];

function defineGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    value: value,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

function setupDom() {
  if (globalThis[DOM_FLAG]) {
    return globalThis[DOM_FLAG];
  }

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const window = dom.window;

  // jsdom 未实现的浏览器 API 补齐
  if (!window.matchMedia) {
    window.matchMedia = createMatchMedia();
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = createResizeObserver();
  }
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = createIntersectionObserver();
  }
  if (!window.ClipboardEvent) {
    window.ClipboardEvent = createClipboardEvent();
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      return window.setTimeout(function() {
        callback(Date.now());
      }, 0);
    };
    window.cancelAnimationFrame = function(id) {
      window.clearTimeout(id);
    };
  }
  patchRangeMeasure(window);
  installNetworkInterceptor(window);

  GLOBAL_KEYS.forEach(function(key) {
    if (window[key] !== undefined) {
      defineGlobal(key, window[key]);
    }
  });

  // 以下需要绑定到 window，作为裸函数调用时 this 才不会丢
  defineGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  defineGlobal('matchMedia', window.matchMedia);
  defineGlobal('ResizeObserver', window.ResizeObserver);
  defineGlobal('IntersectionObserver', window.IntersectionObserver);
  defineGlobal('ClipboardEvent', window.ClipboardEvent);
  defineGlobal('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  defineGlobal('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
  defineGlobal('getSelection', window.getSelection.bind(window));

  // React 18 act() 需要显式声明测试环境
  defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  process.env.IS_REACT_ACT_ENVIRONMENT = 'true';

  globalThis[DOM_FLAG] = dom;
  return dom;
}

/**
 * 清空 document.body，并移除用例期注入到 navigator / document 上的 stub，
 * 保证用例之间互不污染。
 */
function cleanupDom() {
  const document = globalThis.document;
  if (document && document.body) {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  }
  // 测试里用 Object.defineProperty(..., { configurable: true }) 注入，这里直接删除还原
  if (globalThis.navigator) {
    delete globalThis.navigator.clipboard;
  }
  if (document) {
    delete document.execCommand;
  }
  // 网络防护先还原再重新布防：既擦掉用例期可能注入到原型上的 stub，
  // 又保证拦截器在后续用例中持续生效
  if (typeof restoreNetworkInterceptor === 'function') {
    restoreNetworkInterceptor();
    restoreNetworkInterceptor = null;
  }
  if (globalThis.window) {
    installNetworkInterceptor(globalThis.window);
  }
}

installModuleAliases();
installAssetStubs();
installMessageChannelUnref();
setupDom();

module.exports = {
  dom: globalThis[DOM_FLAG],
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  cleanupDom,
  setupDom
};

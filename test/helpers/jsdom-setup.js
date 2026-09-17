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
}

installModuleAliases();
installAssetStubs();
setupDom();

module.exports = {
  dom: globalThis[DOM_FLAG],
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  cleanupDom,
  setupDom
};

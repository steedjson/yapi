'use strict';

// Rsbuild dev server 的语义平移层：承接旧 webpack-dev-standalone.js 手工 http 服务器的
// 三类行为（/iconfont//image/ 静态服务、/ 与 /index.html 的显式 HTML、前端路由回退）
// 以 Connect 中间件形式挂到 Rsbuild dev server 上。
// 阶段四起旧模块随 webpack 链删除，其回退口径与 MIME 表原样迁入本模块
// （单一事实来源不变），由 test/build 覆盖。

const fs = require('fs');
const path = require('path');

const DEFAULT_STATIC_ROOT = path.resolve(__dirname, '../static');
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

// 已知静态资源扩展名：这类请求未被任何层命中时必须返回真实 404，
// 不能被前端路由回退吞成 HTML（否则脚本/样式/字体加载失败会被掩盖成页面渲染异常）。
const fileExtensions = new Set([
  'js', 'mjs', 'css', 'map', 'json', 'html', 'htm', 'txt', 'xml', 'pdf', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'webm', 'wav', 'ogg', 'mov', 'avi',
  'wasm', 'zip', 'gz', 'tar', 'csv'
]);

// 判定一个未被构建产物中间件命中的请求是否为前端 history 路由：
// 仅限 GET/HEAD；API、产物(/prd/)、iconfont/image 静态目录与 HMR 除外；
// 末段带已知资源扩展名的视为文件请求，保持 404。
// （自旧 webpack-dev-standalone.js 原样平移，口径与 Rsbuild dev 链路共享。）
function isHtmlFallbackCandidate(method, reqUrl) {
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }
  const pathname = reqUrl.split('?')[0];
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/prd/') ||
    pathname.startsWith('/iconfont/') ||
    pathname.startsWith('/image/') ||
    pathname === '/__webpack_hmr'
  ) {
    return false;
  }
  const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0) {
    return true;
  }
  return !fileExtensions.has(lastSegment.slice(dotIndex + 1).toLowerCase());
}

const mimeTypes = {
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

// 与旧链一致：非 API 响应统一禁缓存并放开跨域（iconfont 字体/图片会被跨域页面加载）。
function applyDevResponseHeaders(res, contentType) {
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

// /iconfont/ 与 /image/ 静态目录：未命中（前缀不符或文件缺失）时交还给后续中间件，
// 最终由 dev server 的 notFound 中间件返回真实 404（与旧链 isHtmlFallbackCandidate
// 对这两类前缀的排除配合）。路径做了归一化防穿越（旧链未防，dev-only 收紧，合法路径不变）。
function createDevStaticMiddleware(options) {
  const staticRoot = (options && options.staticRoot) || DEFAULT_STATIC_ROOT;

  return (req, res, next) => {
    const reqUrl = (req.url || '').split('?')[0];
    if (!reqUrl.startsWith('/iconfont/') && !reqUrl.startsWith('/image/')) {
      next();
      return;
    }
    const filePath = path.resolve(staticRoot, '.' + reqUrl);
    if (!filePath.startsWith(staticRoot + path.sep)) {
      next();
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      applyDevResponseHeaders(res, mimeTypes[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    next();
  };
}

// 旧链对 / 与 /index.html 的显式分支：无论何种方法都回 dev 页面（语义平移保持）。
// 提前注册（server.setup 主体），优先于 Rsbuild 内置 html completion，避免其对
// /index.html 的处理口径与旧链不一致。
function createDevIndexHtmlMiddleware(options) {
  const readHtml = (options && options.readHtml) || null;

  return async (req, res, next) => {
    const reqUrl = (req.url || '').split('?')[0];
    if (reqUrl !== '/' && reqUrl !== '/index.html') {
      next();
      return;
    }
    try {
      const html = readHtml ? readHtml() : await options.getHtml();
      applyDevResponseHeaders(res, HTML_CONTENT_TYPE);
      res.end(html);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('dev html unavailable: ' + (error && error.message ? error.message : error));
    }
  };
}

// 前端 history 路由回退：口径即旧链 isHtmlFallbackCandidate——仅 GET/HEAD、排除
// /api/ /prd/ /iconfont/ /image/ 与 HMR 端点、末段带已知扩展名的文件请求保持 404。
// 注册在 server.setup 的返回回调里（内置中间件之后、notFound 之前）。
function createHtmlFallbackMiddleware(options) {
  const getHtml = options.getHtml;

  return async (req, res, next) => {
    if (!isHtmlFallbackCandidate(req.method, (req.url || '').split('?')[0])) {
      next();
      return;
    }
    try {
      const html = await getHtml();
      applyDevResponseHeaders(res, HTML_CONTENT_TYPE);
      res.statusCode = 200;
      res.end(html);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('dev html unavailable: ' + (error && error.message ? error.message : error));
    }
  };
}

// server.setup 装配（Rsbuild 2.x：主体先于内置中间件注册，返回回调在内置之后执行）。
// 入参是 setup 上下文 { action, server: RsbuildDevServer, environments }，dev server 实例
// 在 server 键上；其 environments 才是带 getTransformedHtml 的环境 API（rsbuild 上下文里的
// environments 只是 EnvironmentContext）。环境名缺省 'web'（单环境默认），取不到时回退第一个。
function createRsbuildDevServerSetup(options) {
  const staticRoot = (options && options.staticRoot) || DEFAULT_STATIC_ROOT;
  const entryName = (options && options.entryName) || 'index';
  const environmentName = (options && options.environmentName) || 'web';

  const getEnvironment = server =>
    server.environments[environmentName] || Object.values(server.environments)[0];

  return context => {
    const server = context.server;
    server.middlewares.use(createDevStaticMiddleware({ staticRoot }));
    server.middlewares.use(
      createDevIndexHtmlMiddleware({
        getHtml: () => getEnvironment(server).getTransformedHtml(entryName)
      })
    );
    return () => {
      const environment = getEnvironment(server);
      server.middlewares.use(
        createHtmlFallbackMiddleware({ getHtml: () => environment.getTransformedHtml(entryName) })
      );
    };
  };
}

module.exports = {
  DEFAULT_STATIC_ROOT,
  fileExtensions,
  isHtmlFallbackCandidate,
  mimeTypes,
  applyDevResponseHeaders,
  createDevStaticMiddleware,
  createDevIndexHtmlMiddleware,
  createHtmlFallbackMiddleware,
  createRsbuildDevServerSetup
};

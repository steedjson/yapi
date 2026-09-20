'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const webpack = require('webpack');
const devMiddleware = require('webpack-dev-middleware');
const hotMiddleware = require('webpack-hot-middleware');

const htmlPath = path.resolve(__dirname, '../static/dev.html');
const staticRoot = path.resolve(__dirname, '../static');
// 本地后端 API 地址，与 config.json 的 port 保持一致。
const apiTarget = { host: '127.0.0.1', port: 3000 };

// 已知静态资源扩展名：这类请求未被任何层命中时必须返回真实 404，
// 不能被前端路由回退吞成 HTML（否则脚本/样式/字体加载失败会被掩盖成页面渲染异常）。
const fileExtensions = new Set([
  'js', 'mjs', 'css', 'map', 'json', 'html', 'htm', 'txt', 'xml', 'pdf', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'webm', 'wav', 'ogg', 'mov', 'avi',
  'wasm', 'zip', 'gz', 'tar', 'csv'
]);

// 判定一个未被 webpack 中间件命中的请求是否为前端 history 路由：
// 仅限 GET/HEAD；API、webpack 产物(/prd/)、iconfont/image 静态目录与 HMR 除外；
// 末段带已知资源扩展名的视为文件请求，保持 404。
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

// 最小 API 反向代理：把 /api/ 请求原样透传到本地后端，保留 method、headers、
// body 与查询串；后端不可达时返回 502 与可读错误信息，避免浏览器端拿到 404。
function proxyApiRequest(req, res, target) {
  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: req.headers
    },
    upstreamRes => {
      res.statusCode = upstreamRes.statusCode;
      Object.keys(upstreamRes.headers).forEach(name => {
        res.setHeader(name, upstreamRes.headers[name]);
      });
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', err => {
    if (res.headersSent) {
      // 响应已开始，只能中断连接，无法再改写状态码。
      res.destroy();
      return;
    }
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        errCode: 502,
        errmsg: '开发代理无法连接后端 ' + target.host + ':' + target.port + '：' + err.message
      })
    );
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

// 请求处理器：hot/middleware/readDevHtml 可注入，便于测试覆盖路由回退行为。
function createRequestHandler(options) {
  const hot = options.hot;
  const middleware = options.middleware;
  const readDevHtml = options.readDevHtml || (() => fs.readFileSync(htmlPath));

  return (req, res) => {
    const reqUrl = (req.url || '').split('?')[0];

    // API 请求最先透传到本地后端，避免落入 webpack-dev-middleware 返回 404；
    // 仅匹配 /api/ 前缀，不影响 HMR(/__webpack_hmr)、静态资源与开发页本身。
    if (reqUrl.startsWith('/api/')) {
      // 撤销为静态资源预设的响应头，让后端响应头保持权威。
      res.removeHeader('Cache-Control');
      res.removeHeader('Pragma');
      res.removeHeader('Access-Control-Allow-Origin');
      return proxyApiRequest(req, res, apiTarget);
    }

    // 支持开发页面跨域加载 iconfont 图标字体及图片，避免 404 和 CORS 导致的树形图标/折叠箭头失效。
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (reqUrl.startsWith('/iconfont/') || reqUrl.startsWith('/image/')) {
      const filePath = path.join(staticRoot, reqUrl);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    if (req.url === '/' || req.url === '/index.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(readDevHtml());
      return;
    }
    hot(req, res, () => middleware(req, res, () => {
      // 刷新 /group/14 等前端 history 路由时回退 dev.html，交由前端路由接管；
      // 明显的文件请求(.js/.css/.png 等)未命中则保持真实 404，不吞成 HTML。
      if (isHtmlFallbackCandidate(req.method, reqUrl)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readDevHtml());
        return;
      }
      res.statusCode = 404;
      res.end('Not Found');
    }));
  };
}

function createStandaloneServer() {
  const compiler = webpack(require('./webpack.standalone.config'));
  // standalone 开发服务保留现有 4000 端口和 static/dev.html 页面入口。
  // webpack-dev-middleware 8：publicPath 缺省即取 config.output.publicPath(/prd/)，
  // 显式传入保持自文档化；v4+ 已移除 quiet/noInfo 选项（由 stats 选项控制输出）。
  const middleware = devMiddleware(compiler, { publicPath: '/prd/', stats: 'errors-warnings' });
  const hot = hotMiddleware(compiler, { path: '/__webpack_hmr' });

  return http.createServer(createRequestHandler({ hot, middleware }));
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  createStandaloneServer().listen(port, '127.0.0.1', () => {
    console.log('Standalone client dev server listening on ' + port);
  });
}

// isHtmlFallbackCandidate/mimeTypes 额外导出：Rsbuild dev 链路（build/rsbuild-dev-server.js）
// 平移同一套回退口径与 MIME 表，单一事实来源，避免两处手写后漂移。
module.exports = {
  proxyApiRequest,
  apiTarget,
  createRequestHandler,
  isHtmlFallbackCandidate,
  fileExtensions,
  mimeTypes
};

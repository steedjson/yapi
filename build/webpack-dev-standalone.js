'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const webpack = require('webpack');
const devMiddleware = require('webpack-dev-middleware');
const hotMiddleware = require('webpack-hot-middleware');
const config = require('./webpack.standalone.config');

// standalone 开发服务保留现有 4000 端口和 static/dev.html 页面入口。
const compiler = webpack(config);
const middleware = devMiddleware(compiler, { publicPath: '/prd/', quiet: false });
const hot = hotMiddleware(compiler, { path: '/__webpack_hmr' });
const html = fs.readFileSync(path.resolve(__dirname, '../static/dev.html'));
const port = Number(process.env.PORT || 4000);

const staticRoot = path.resolve(__dirname, '../static');
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

const server = http.createServer((req, res) => {
  const reqUrl = (req.url || '').split('?')[0];

  // 支持开发页面跨域加载 iconfont 图标字体及图片，避免 404 和 CORS 导致的树形图标/折叠箭头失效。
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
    res.end(html);
    return;
  }
  hot(req, res, () => middleware(req, res, () => {
    res.statusCode = 404;
    res.end('Not Found');
  }));
});

server.listen(port, '127.0.0.1', () => {
  console.log('Standalone client dev server listening on ' + port);
});

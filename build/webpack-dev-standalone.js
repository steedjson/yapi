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
const server = http.createServer((req, res) => {
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

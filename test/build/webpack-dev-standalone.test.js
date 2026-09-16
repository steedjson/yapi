import test from 'ava';
import http from 'http';
import { proxyApiRequest, createRequestHandler } from '../../build/webpack-dev-standalone';

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

// mock 后端：回显 method、url(含查询串)、探测请求头与请求体，便于断言透传保真度。
function startEchoBackend() {
  return listen(
    http.createServer((req, res) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        res.setHeader('X-Echo-Backend', '1');
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            marker: req.headers['x-proxy-probe'],
            body: Buffer.concat(chunks).toString('utf8')
          })
        );
      });
    })
  );
}

function startProxy(target) {
  return listen(http.createServer((req, res) => proxyApiRequest(req, res, target)));
}

function request(port, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test.serial('GET /api/ 请求透传后端，保留查询串、请求头与后端响应头', async t => {
  const backend = await startEchoBackend();
  const proxy = await startProxy(backend.address());
  try {
    const res = await request(proxy.address().port, {
      method: 'GET',
      path: '/api/user/status?probe=1',
      headers: { 'x-proxy-probe': 'dev-proxy' }
    });
    const echo = JSON.parse(res.text);
    t.is(res.status, 200);
    t.is(echo.method, 'GET');
    t.is(echo.url, '/api/user/status?probe=1');
    t.is(echo.marker, 'dev-proxy');
    t.is(res.headers['x-echo-backend'], '1');
  } finally {
    await close(proxy);
    await close(backend);
  }
});

test.serial('POST /api/ 请求体被完整转发到后端', async t => {
  const backend = await startEchoBackend();
  const proxy = await startProxy(backend.address());
  try {
    const payload = JSON.stringify({ name: 'dev-proxy-case' });
    const res = await request(
      proxy.address().port,
      {
        method: 'POST',
        path: '/api/project/add',
        headers: { 'content-type': 'application/json' }
      },
      payload
    );
    const echo = JSON.parse(res.text);
    t.is(echo.method, 'POST');
    t.is(echo.body, payload);
    t.is(res.status, 200);
  } finally {
    await close(proxy);
    await close(backend);
  }
});

test.serial('后端不可达时返回 502 与可读错误信息', async t => {
  const proxy = await startProxy({ host: '127.0.0.1', port: 1 });
  try {
    const res = await request(proxy.address().port, {
      method: 'GET',
      path: '/api/user/status'
    });
    t.is(res.status, 502);
    const parsed = JSON.parse(res.text);
    t.is(parsed.errCode, 502);
    t.true(/127\.0\.0\.1:1/.test(parsed.errmsg));
  } finally {
    await close(proxy);
  }
});

// ---- 前端路由回退与未知静态资源 404 ----
// hot/middleware 用可控行为注入，避免测试真实触发 webpack 编译。
const passThrough = (req, res, next) => next();
const devHtmlStub = '<!doctype html><title>dev-html</title>';

function startHandlerServer(handler) {
  return listen(http.createServer(handler));
}

test.serial('GET /group/14 前端 history 路由回退 dev.html', async t => {
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware: passThrough, readDevHtml: () => devHtmlStub })
  );
  try {
    const res = await request(server.address().port, { method: 'GET', path: '/group/14' });
    t.is(res.status, 200);
    t.is(res.headers['content-type'], 'text/html; charset=utf-8');
    t.is(res.text, devHtmlStub);
  } finally {
    await close(server);
  }
});

test.serial('HEAD /group/14 同样回退 dev.html', async t => {
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware: passThrough, readDevHtml: () => devHtmlStub })
  );
  try {
    const res = await request(server.address().port, { method: 'HEAD', path: '/group/14' });
    t.is(res.status, 200);
    t.is(res.headers['content-type'], 'text/html; charset=utf-8');
  } finally {
    await close(server);
  }
});

test.serial('POST /group/14 不回退 HTML，保持 404', async t => {
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware: passThrough, readDevHtml: () => devHtmlStub })
  );
  try {
    const res = await request(server.address().port, { method: 'POST', path: '/group/14' });
    t.is(res.status, 404);
  } finally {
    await close(server);
  }
});

test.serial('未知静态资源 /prd/missing.js 与 /image/nope.png 保持真实 404', async t => {
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware: passThrough, readDevHtml: () => devHtmlStub })
  );
  try {
    const bundleRes = await request(server.address().port, { method: 'GET', path: '/prd/missing.js' });
    t.is(bundleRes.status, 404);
    const iconRes = await request(server.address().port, { method: 'GET', path: '/image/nope.png' });
    t.is(iconRes.status, 404);
    t.false(/dev-html/.test(iconRes.text));
  } finally {
    await close(server);
  }
});

test.serial('webpack 中间件已命中的产物请求不被回退劫持', async t => {
  const middleware = (req, res, next) => {
    if ((req.url || '').split('?')[0] === '/prd/app.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end('window.__bundle = 1;');
      return;
    }
    next();
  };
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware, readDevHtml: () => devHtmlStub })
  );
  try {
    const res = await request(server.address().port, { method: 'GET', path: '/prd/app.js' });
    t.is(res.status, 200);
    t.is(res.text, 'window.__bundle = 1;');
  } finally {
    await close(server);
  }
});

test.serial('tui-editor 图标雪碧图按别名映射 static/prd 提供', async t => {
  const server = await startHandlerServer(
    createRequestHandler({ hot: passThrough, middleware: passThrough, readDevHtml: () => devHtmlStub })
  );
  try {
    const res = await request(server.address().port, {
      method: 'GET',
      path: '/common/tui-editor/dist/tui-editor.png'
    });
    t.is(res.status, 200);
    t.is(res.headers['content-type'], 'image/png');
    // PNG 魔数第 2-4 字节为 "PNG"（0x89 经 utf8 解码会变成替换符，不作断言）。
    t.is(res.text.slice(1, 4), 'PNG');
    const missing = await request(server.address().port, {
      method: 'GET',
      path: '/common/tui-editor/dist/missing.png'
    });
    t.is(missing.status, 404);
  } finally {
    await close(server);
  }
});

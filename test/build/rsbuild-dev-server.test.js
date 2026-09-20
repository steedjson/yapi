import test from 'ava';
import path from 'path';
import { Writable } from 'stream';
import {
  createDevStaticMiddleware,
  createDevIndexHtmlMiddleware,
  createHtmlFallbackMiddleware,
  createRsbuildDevServerSetup
} from '../../build/rsbuild-dev-server';

const staticRoot = path.resolve(__dirname, '../../static');
const devHtmlStub = '<!doctype html><title>rsbuild-dev</title>';

// 可写流版响应桩：fs.createReadStream(...).pipe(res) 需要真实流接口，finish 事件
// 由 Writable 原生发出，经 res.done 暴露给断言。
function createRes() {
  const res = new Writable({
    write(chunk, _encoding, callback) {
      res.chunks.push(chunk);
      callback();
    }
  });
  res.chunks = [];
  res.headers = {};
  res.statusCode = 200;
  res.body = '';
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.getHeader = name => res.headers[name.toLowerCase()];
  res.removeHeader = name => {
    delete res.headers[name.toLowerCase()];
  };
  res.finishPromise = new Promise(resolve => res.on('finish', resolve));
  res.on('finish', () => {
    res.body = Buffer.concat(res.chunks).toString('utf8');
  });
  return res;
}

function nextSpy() {
  const spy = () => {
    spy.called = true;
  };
  spy.called = false;
  return spy;
}

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
}

// ---- /iconfont/ 与 /image/ 静态目录 ----

test.serial('/image/ 图片按静态目录提供，带 no-cache 与 CORS 头', async t => {
  const middleware = createDevStaticMiddleware({ staticRoot });
  const res = createRes();
  middleware({ method: 'GET', url: '/image/avatar-1.png' }, res, nextSpy());
  await res.finishPromise;
  t.is(res.statusCode, 200);
  t.is(res.headers['content-type'], 'image/png');
  t.is(res.headers['access-control-allow-origin'], '*');
  t.true(/no-store/.test(res.headers['cache-control']));
  t.is(res.body.slice(1, 4), 'PNG');
});

test.serial('/iconfont/ 字体按静态目录提供，woff MIME 正确', async t => {
  const middleware = createDevStaticMiddleware({ staticRoot });
  const res = createRes();
  middleware({ method: 'GET', url: '/iconfont/iconfont.woff' }, res, nextSpy());
  await res.finishPromise;
  t.is(res.statusCode, 200);
  t.is(res.headers['content-type'], 'font/woff');
  t.true(res.chunks.length > 0);
});

test.serial('静态目录未命中文件或路径穿越时交回后续中间件（最终 404 不被吞成 HTML）', async t => {
  const middleware = createDevStaticMiddleware({ staticRoot });
  for (const url of ['/image/nope.png', '/iconfont/nope.woff', '/image/../../../package.json']) {
    const res = createRes();
    const next = nextSpy();
    middleware({ method: 'GET', url }, res, next);
    await flushPromises();
    t.true(next.called, url + ' 应该走 next()');
    t.is(res.chunks.length, 0);
  }
});

test.serial('非 /iconfont/ 与 /image/ 前缀不进入静态分支', async t => {
  const middleware = createDevStaticMiddleware({ staticRoot });
  const res = createRes();
  const next = nextSpy();
  middleware({ method: 'GET', url: '/group/14' }, res, next);
  await flushPromises();
  t.true(next.called);
});

// ---- / 与 /index.html 显式分支 ----

test.serial('GET / 与 /index.html 回 dev 页面', async t => {
  const middleware = createDevIndexHtmlMiddleware({ readHtml: () => devHtmlStub });
  for (const url of ['/', '/index.html']) {
    const res = createRes();
    await middleware({ method: 'GET', url }, res, nextSpy());
    await res.finishPromise;
    t.is(res.statusCode, 200);
    t.is(res.body, devHtmlStub);
    t.is(res.headers['content-type'], 'text/html; charset=utf-8');
  }
});

test.serial('其余路径不进入显式 HTML 分支', async t => {
  const middleware = createDevIndexHtmlMiddleware({ readHtml: () => devHtmlStub });
  const res = createRes();
  const next = nextSpy();
  await middleware({ method: 'GET', url: '/project/36' }, res, next);
  t.true(next.called);
});

// ---- 前端 history 路由回退（口径 = isHtmlFallbackCandidate）----

const fallback = createHtmlFallbackMiddleware({ getHtml: async () => devHtmlStub });

test.serial('GET 深度 history 路由回退 dev 页面', async t => {
  const res = createRes();
  await fallback({ method: 'GET', url: '/project/36/interface/api/3562' }, res, nextSpy());
  await res.finishPromise;
  t.is(res.statusCode, 200);
  t.is(res.body, devHtmlStub);
  t.is(res.headers['content-type'], 'text/html; charset=utf-8');
});

test.serial('HEAD history 路由同样回退', async t => {
  const res = createRes();
  await fallback({ method: 'HEAD', url: '/group/14' }, res, nextSpy());
  await res.finishPromise;
  t.is(res.body, devHtmlStub);
});

test.serial('POST 不回退 HTML', async t => {
  const res = createRes();
  const next = nextSpy();
  await fallback({ method: 'POST', url: '/group/14' }, res, next);
  t.true(next.called);
  t.is(res.chunks.length, 0);
});

test.serial('API/产物/静态前缀与已知扩展名请求不回退，保持真实 404 语义', async t => {
  for (const url of [
    '/api/user/status',
    '/prd/missing.js',
    '/prd/nonexist@dev.js',
    '/image/nope.png',
    '/iconfont/nope.woff',
    '/missing.css',
    '/__webpack_hmr'
  ]) {
    const res = createRes();
    const next = nextSpy();
    await fallback({ method: 'GET', url }, res, next);
    t.true(next.called, url + ' 应该走 next()');
    t.is(res.chunks.length, 0);
  }
});

test.serial('末段未知扩展名的请求按旧链口径回退 HTML', async t => {
  const res = createRes();
  await fallback({ method: 'GET', url: '/foo.bar' }, res, nextSpy());
  await res.finishPromise;
  t.is(res.statusCode, 200);
  t.is(res.body, devHtmlStub);
});

// ---- server.setup 装配与整体链路 ----

const fakeHtmlCalls = [];

function createFakeDevServer() {
  const registered = [];
  return {
    registered,
    middlewares: {
      use: middleware => registered.push(middleware)
    },
    environments: {
      web: {
        getTransformedHtml: async entryName => {
          fakeHtmlCalls.push(entryName);
          return devHtmlStub;
        }
      }
    }
  };
}

test.serial('setup 主体注册 2 个前置中间件，返回回调注册 1 个后置中间件', t => {
  const setup = createRsbuildDevServerSetup({ staticRoot });
  const fakeServer = createFakeDevServer();
  // Rsbuild 传入的是 setup 上下文，dev server 实例在 server 键上。
  const post = setup({ action: 'dev', server: fakeServer, environments: {} });
  t.is(fakeServer.registered.length, 2);
  t.is(typeof post, 'function');
  post();
  t.is(fakeServer.registered.length, 3);
});

test.serial('装配后的完整链路：/、深度路由回退 HTML，产物 404，静态目录 200', async t => {
  const setup = createRsbuildDevServerSetup({ staticRoot });
  const fakeServer = createFakeDevServer();
  const post = setup({ action: 'dev', server: fakeServer, environments: {} });
  const notFound = (_req, res) => {
    res.statusCode = 404;
    res.end('Not Found');
  };
  // 模拟 Rsbuild：返回回调在内置中间件之后执行，post() 注册完回退中间件再组链。
  post();
  const middlewares = [...fakeServer.registered];
  const handle = composeRunner(middlewares, notFound);

  const rootRes = createRes();
  handle({ method: 'GET', url: '/' }, rootRes);
  await rootRes.finishPromise;
  t.is(rootRes.statusCode, 200);
  t.is(rootRes.body, devHtmlStub);

  const deepRoute = createRes();
  handle({ method: 'GET', url: '/project/36/interface/api/3562' }, deepRoute);
  await deepRoute.finishPromise;
  t.is(deepRoute.statusCode, 200);
  t.is(deepRoute.body, devHtmlStub);
  t.deepEqual(fakeHtmlCalls, ['index', 'index']);

  const bundle = createRes();
  handle({ method: 'GET', url: '/prd/missing.js' }, bundle);
  await bundle.finishPromise;
  t.is(bundle.statusCode, 404);

  const image = createRes();
  handle({ method: 'GET', url: '/image/avatar-1.png' }, image);
  await image.finishPromise;
  t.is(image.statusCode, 200);
  t.is(image.headers['content-type'], 'image/png');
});

// 最小 Connect 语义的顺序执行器：任一中间件结束响应即停止，否则落到终态 404。
function composeRunner(middlewares, notFound) {
  function run(index, req, res) {
    if (index >= middlewares.length) {
      notFound(req, res);
      return;
    }
    middlewares[index](req, res, () => run(index + 1, req, res));
  }
  return (req, res) => run(0, req, res);
}

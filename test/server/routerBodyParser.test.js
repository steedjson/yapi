import test from 'ava';
import http from 'http';

const app = require('../../server/app');
// app.js 已加载过 router(同一模块缓存), 这里取回实例校验 @koa/router 的注册结果
const router = require('../../server/router.js');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const yapi = require('../../server/yapi.js');
const testController = require('../../server/controllers/test.js');

// 与 server/app.js 保持一致的 koa-body v8 选项
const koaBodyOptions = {
  multipart: true,
  jsonLimit: '2mb',
  formLimit: '1mb',
  textLimit: '1mb',
  jsonStrict: false,
  parsedMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'HEAD']
};

test('@koa/router 与 koa-body v8 的 require 形态正确', t => {
  t.true(typeof Router === 'function');
  t.true(typeof koaBody === 'function');
  // routerConfig 中 test 控制器 delete 路由依赖的 del 别名在 @koa/router v15 中保留
  const instance = new Router();
  t.true(typeof instance.del === 'function');
  t.true(typeof instance.all === 'function');
});

test('路由注册 smoke: test 控制器 get/delete/files/upload 经 createAction 注册到 @koa/router', t => {
  const layers = router.stack || [];
  const findLayer = suffix =>
    layers.find(
      layer => typeof layer.path === 'string' && layer.path === suffix
    );

  const getLayer = findLayer('/api/test/get');
  const deleteLayer = findLayer('/api/test/delete');
  const uploadLayer = findLayer('/api/test/files/upload');

  t.truthy(getLayer, '/api/test/get 应已注册');
  t.true(getLayer.methods.indexOf('GET') > -1);

  // routerConfig 中 method: 'del' 应映射为 HTTP DELETE
  t.truthy(deleteLayer, '/api/test/delete 应已注册');
  t.true(deleteLayer.methods.indexOf('DELETE') > -1);

  t.truthy(uploadLayer, '/api/test/files/upload 应已注册');
  t.true(uploadLayer.methods.indexOf('POST') > -1);
});

function request(appCallback, method, path, headers, body) {
  const finalHeaders = { ...headers };
  if (body) {
    finalHeaders['Content-Length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer(appCallback);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: finalHeaders
        },
        response => {
          let data = '';
          response.setEncoding('utf8');
          response.on('data', chunk => {
            data += chunk;
          });
          response.on('end', () => {
            server.close(error => {
              if (error) return reject(error);
              resolve({ statusCode: response.statusCode, body: data });
            });
          });
        }
      );
      request.on('error', reject);
      request.end(body);
    });
    server.on('error', reject);
  });
}

test('koa-body v8 在 DELETE 请求上解析 JSON body(parsedMethods 配置生效)', async t => {
  const Koa = require('koa');
  const koaApp = new Koa();
  koaApp.use(koaBody(koaBodyOptions));
  koaApp.use(async ctx => {
    ctx.body = { received: ctx.request.body };
  });

  const result = await request(
    koaApp.callback(),
    'DELETE',
    '/whatever',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ hello: 'yapi' })
  );

  t.is(result.statusCode, 200);
  t.deepEqual(JSON.parse(result.body), { received: { hello: 'yapi' } });
});

test('koa-body v8 multipart 上传: 文件出现在 ctx.request.files 且 testFilesUpload 正常落盘', async t => {
  const Koa = require('koa');
  const koaApp = new Koa();
  koaApp.use(koaBody(koaBodyOptions));
  koaApp.use(async ctx => {
    // 走真实控制器逻辑: koa-body v8 下文件应在 ctx.request.files.file, 路径属性 filepath
    t.truthy(ctx.request.files && ctx.request.files.file, 'multipart 文件应挂载到 ctx.request.files');
    const inst = new testController(ctx);
    await inst.testFilesUpload(ctx);
  });

  const boundary = '----yapitestboundary';
  const multipartBody = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="upload.txt"\r\n` +
      `Content-Type: text/plain\r\n` +
      `\r\n` +
      `hello-yapi\r\n` +
      `--${boundary}--\r\n`
  );

  const result = await request(
    koaApp.callback(),
    'POST',
    '/api/test/files/upload',
    { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    multipartBody
  );

  const parsed = JSON.parse(result.body);
  t.is(parsed.errcode, 0);
  t.deepEqual(parsed.data, { res: '上传成功' });
  // 控制器把上传文件 rename 到 WEBROOT_RUNTIME/test.text, 校验内容一致后清理
  const fs = require('fs');
  const target = require('path').join(yapi.WEBROOT_RUNTIME, 'test.text');
  t.is(fs.readFileSync(target, 'utf8'), 'hello-yapi');
  fs.unlinkSync(target);
});

// 收尾取消定时任务并关闭 MongoDB 连接, 避免 AVA 因常驻句柄强制退出
test.after.always('cleanup lingering handles', async () => {
  try {
    const schedule = require('node-schedule');
    schedule.scheduledJobs && Object.keys(schedule.scheduledJobs).forEach(name => {
      schedule.scheduledJobs[name].cancel();
    });
  } catch (e) {}
  const mongoose = require('mongoose');
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await new Promise(r => setTimeout(r, 200));
    await mongoose.connection.close();
  }
});

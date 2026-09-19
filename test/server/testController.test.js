import test from 'ava';
import http from 'http';
import fs from 'fs';
import path from 'path';

const yapi = require('../../server/yapi.js');
// server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现（与 open.test.js 引导方式一致）
yapi.commons = require('../../server/utils/commons.js');

const testController = require('../../server/controllers/test.js');

// 控制器把上传内容写入 WEBROOT_RUNTIME/test.text
const target = path.join(yapi.WEBROOT_RUNTIME, 'test.text');

function request(appCallback, method, reqPath, headers, body) {
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
          path: reqPath,
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

function buildApp() {
  const Koa = require('koa');
  const koaApp = new Koa();
  koaApp.use(async ctx => {
    const inst = new testController(ctx);
    await inst.testSingleUpload(ctx);
  });
  return koaApp;
}

// 两个用例共享 fs.promises.writeFile 桩与同一目标文件, 必须串行执行避免相互污染
test.serial('testSingleUpload: 原始请求体异步落盘 test.text, 写入成功后才响应上传成功', async t => {
  const payload = 'hello-yapi-single-upload';
  const result = await request(
    buildApp().callback(),
    'POST',
    '/api/test/single/upload',
    { 'Content-Type': 'application/octet-stream' },
    payload
  );

  t.is(result.statusCode, 200);
  const parsed = JSON.parse(result.body);
  t.is(parsed.errcode, 0);
  t.deepEqual(parsed.data, { res: '上传成功' });
  t.is(fs.readFileSync(target, 'utf8'), payload);
  fs.unlinkSync(target);
});

test.serial('testSingleUpload: 写入失败时返回 402 写入失败(修复 writeFileSync 假回调缺陷)', async t => {
  const fsPromises = require('fs').promises;
  const originalWriteFile = fsPromises.writeFile;
  // 用可恢复的桩替换 fs.promises.writeFile, 模拟磁盘写入失败, 验证失败路径真实生效
  fsPromises.writeFile = () => Promise.reject(new Error('mock write failure'));
  try {
    const result = await request(
      buildApp().callback(),
      'POST',
      '/api/test/single/upload',
      { 'Content-Type': 'application/octet-stream' },
      'payload-that-fails-to-persist'
    );

    t.is(result.statusCode, 200);
    const parsed = JSON.parse(result.body);
    t.is(parsed.errcode, 402);
    t.is(parsed.errmsg, '写入失败');
    t.is(parsed.data, null);
  } finally {
    fsPromises.writeFile = originalWriteFile;
  }
});

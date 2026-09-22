/**
 * /prd 静态中间件压缩协商回归（首屏性能优化批次 2，docs/first-paint-perf-plan.md）。
 *
 * 背景：server/app.js 的 /prd 中间件在 .gz 分支之前新增 .br 优先协商
 * （ctx.acceptsEncodings('br', 'identity') === 'br' 且磁盘存在 .br 配对才改写），
 * gzip 永远兜底；/prd/assets.js 的 no-cache 豁免保持（批次 4 语义）。
 * 本文件经完整 Koa 应用（server/app.js callback + 真实 koa-static/koa-send）
 * 以真实 HTTP 请求钉住协商行为，产物直接取 static/prd 提交态：
 *   1. Accept-Encoding: br 且 .br 存在 → Content-Encoding: br + 正确 Content-Type
 *      + 响应体字节与磁盘 .br 文件逐字节一致（koa-send 改写后缀不破坏内容）；
 *   2. Accept-Encoding: gzip（仅）→ 落既有 .gz 分支（兜底不被 br 分支吞掉）；
 *   3. Accept-Encoding: br + 无配对小文件 → 原始 200、无 Content-Encoding；
 *   4. /prd/assets.js 无论协商结果 Cache-Control: no-cache（清单永远回源校验）；
 *   5. Accept-Encoding: br;q=0 → 显式拒绝 br（RFC 7231），不得改写 .br。
 */
import test from 'ava';
import http from 'http';
import fs from 'fs';
import path from 'path';

const app = require('../../server/app');

const PRD_DIR = path.resolve(__dirname, '../../static/prd');

/**
 * 真实 HTTP GET（完整 Koa 应用链路），按 buffer 收集响应体（压缩字节不可按 utf8 解码）。
 * @param {string} reqPath 请求路径
 * @param {Record<string, string>} headers 附加请求头（Accept-Encoding 等）
 * @returns {Promise<{statusCode: number, headers: http.IncomingHttpHeaders, body: Buffer}>}
 */
function requestRaw(reqPath, headers) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.callback());
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method: 'GET',
          headers
        },
        response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            server.close(error => {
              if (error) return reject(error);
              resolve({
                statusCode: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks)
              });
            });
          });
        }
      );
      request.on('error', reject);
      request.end();
    });
    server.on('error', reject);
  });
}

// /prd 中间件仅在 /prd 前缀路径生效；被改写文件由 koa-static 从 static/ 下服务
const BR_FIXTURE = fs
  .readdirSync(PRD_DIR)
  .find(name => name.startsWith('antd@') && name.endsWith('.js.br'));
// manifest@*.js 远小于 10KB 阈值，既无 .br 也无 .gz 配对
const SMALL_FIXTURE = fs
  .readdirSync(PRD_DIR)
  .find(name => name.startsWith('manifest@') && name.endsWith('.js'));

test.serial('br 协商：Accept-Encoding br 时 .br 配对生效且字节与磁盘一致', async t => {
  t.truthy(BR_FIXTURE, 'static/prd 提交态应存在 antd chunk 的 .br 配对');
  const rawName = BR_FIXTURE.slice(0, -3); // 去掉 .br
  const diskBr = fs.readFileSync(path.join(PRD_DIR, BR_FIXTURE));

  const res = await requestRaw('/prd/' + rawName, { 'Accept-Encoding': 'br' });

  t.is(res.statusCode, 200);
  t.is(res.headers['content-encoding'], 'br');
  // koa-send 按改写后文件名推断类型会得到错误的 application/octet-stream，
  // 中间件按原始扩展名显式声明，浏览器才能按 JS 执行
  t.is(res.headers['content-type'], 'application/javascript; charset=utf-8');
  t.is(Buffer.compare(res.body, diskBr), 0, '响应体必须与磁盘 .br 文件逐字节一致');
});

test.serial('gzip 兜底：仅声明 gzip 时落既有 .gz 分支', async t => {
  // antd chunk 同时持有 .gz 与 .br 配对，是 gzip 兜底路径的代表性产物
  const rawName = BR_FIXTURE.slice(0, -3);
  const diskGz = fs.readFileSync(path.join(PRD_DIR, rawName + '.gz'));

  const res = await requestRaw('/prd/' + rawName, { 'Accept-Encoding': 'gzip' });

  t.is(res.statusCode, 200);
  t.is(res.headers['content-encoding'], 'gzip');
  t.is(res.headers['content-type'], 'application/javascript; charset=utf-8');
  t.is(Buffer.compare(res.body, diskGz), 0, '响应体必须与磁盘 .gz 文件逐字节一致');
});

test.serial('无配对小文件：Accept-Encoding br 也不改写，原始 200 无 Content-Encoding', async t => {
  const rawName = SMALL_FIXTURE;
  t.false(fs.existsSync(path.join(PRD_DIR, rawName + '.br')));
  const diskRaw = fs.readFileSync(path.join(PRD_DIR, rawName));

  const res = await requestRaw('/prd/' + rawName, { 'Accept-Encoding': 'br, gzip' });

  t.is(res.statusCode, 200);
  t.falsy(res.headers['content-encoding']);
  t.is(Buffer.compare(res.body, diskRaw), 0, '无配对时必须回原始内容');
});

test.serial('assets.js no-cache 豁免：br 协商命中与否都保持 Cache-Control: no-cache', async t => {
  // assets.js 本体无 .br/.gz 配对（< 10KB），走 br/gzip 均不命中，仍须回原始内容
  const resBr = await requestRaw('/prd/assets.js', { 'Accept-Encoding': 'br' });
  t.is(resBr.statusCode, 200);
  t.is(resBr.headers['cache-control'], 'no-cache');
  t.falsy(resBr.headers['content-encoding']);
  t.regex(resBr.body.toString('utf8'), /^window\.WEBPACK_ASSETS = /);

  // 对照：普通产物路径是长 max-age（批次 4 语义：仅 assets.js 豁免）
  const resManifest = await requestRaw('/prd/' + SMALL_FIXTURE, { 'Accept-Encoding': 'br, gzip' });
  t.is(resManifest.statusCode, 200);
  t.regex(resManifest.headers['cache-control'], /^max-age=/);
});

test.serial('br;q=0 显式拒绝：不得改写 .br（RFC 7231 q 值口径）', async t => {
  const rawName = BR_FIXTURE.slice(0, -3);
  const diskGzName = rawName + '.gz';
  t.true(fs.existsSync(path.join(PRD_DIR, diskGzName)), 'br 被拒绝时应可落 .gz 兜底');
  const diskGz = fs.readFileSync(path.join(PRD_DIR, diskGzName));

  const res = await requestRaw('/prd/' + rawName, { 'Accept-Encoding': 'br;q=0, gzip' });

  t.is(res.statusCode, 200);
  // .gz 分支现与 .br 镜像走 acceptsEncodings 协商（批次 2 补齐），命中中间件改写路径
  t.is(res.headers['content-encoding'], 'gzip');
  t.is(Buffer.compare(res.body, diskGz), 0, 'q=0 拒绝 br 后应回 .gz 内容而非 .br');
});

// 收尾取消定时任务并关闭 MongoDB 连接，避免 AVA 因常驻句柄强制退出（与 httpApp.test.js 一致）
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

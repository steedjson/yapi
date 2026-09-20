import test from 'ava';
import path from 'path';
import { loadConfig } from '@rsbuild/core';

const repoRoot = path.resolve(__dirname, '../..');

// dev 链 /api/ 反代的 502 语义守护：旧 webpack 链的 proxyApiRequest 已随阶段四删除，
// 新链的等价逻辑内联在 rsbuild.config.mjs dev 分支 proxy[0].on.error。本文件直接取
// 该处理器做注入式验证（headersSent 分支与可读 502 JSON 分支），防止回退语义静默劣化。

async function getProxyErrorHandler(t) {
  // ava 下 NODE_ENV=test，加载即 dev 分支；fresh 绕过 jiti 缓存防串扰。
  const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
  const proxy = content.server && content.server.proxy;
  t.truthy(Array.isArray(proxy) && proxy.length > 0, 'dev 分支必须配置 /api/ 反代');
  const handler = proxy[0] && proxy[0].on && proxy[0].on.error;
  t.is(typeof handler, 'function', 'proxy onError 处理器必须在位');
  return handler;
}

function createMockRes({ headersSent = false } = {}) {
  const res = {
    headersSent,
    writeHeadArgs: null,
    endBody: null,
    destroyed: false,
    writeHead(...args) {
      res.writeHeadArgs = args;
      return res;
    },
    end(body) {
      res.endBody = body;
    },
    destroy() {
      res.destroyed = true;
    }
  };
  return res;
}

const fakeError = new Error('connect ECONNREFUSED 127.0.0.1:3000');

test.serial('后端不可达：返回 502 与可读 JSON 错误（对齐旧链 proxyApiRequest）', async t => {
  const onError = await getProxyErrorHandler(t);
  const res = createMockRes();
  onError(fakeError, { url: '/api/user/status' }, res);
  t.is(res.writeHeadArgs[0], 502);
  t.is(res.writeHeadArgs[1]['Content-Type'], 'application/json; charset=utf-8');
  const parsed = JSON.parse(res.endBody);
  t.is(parsed.errCode, 502);
  t.true(/127\.0\.0\.1:3000/.test(parsed.errmsg), 'errmsg 应包含后端地址');
  t.true(/ECONNREFUSED/.test(parsed.errmsg), 'errmsg 应包含原始错误信息');
  t.false(res.destroyed);
});

test.serial('响应已开始（headersSent）时只能中断连接，不得改写状态码', async t => {
  const onError = await getProxyErrorHandler(t);
  const res = createMockRes({ headersSent: true });
  onError(fakeError, { url: '/api/user/status' }, res);
  t.true(res.destroyed, '应 destroy 连接');
  t.is(res.writeHeadArgs, null, '不得再 writeHead 改写状态码');
  t.is(res.endBody, null, '不得再写出响应体');
});

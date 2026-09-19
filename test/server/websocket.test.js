import test from 'ava';
import WebSocket from 'ws';

const app = require('../../server/app');
const closeMongoose = require('../helpers/closeMongoose.js');

/**
 * koa-websocket 4→7 升级回归:
 * 经真实 server/app.js 装配链(websockify v7 + server/websocket.js 的
 * @koa/router 路由注册 + 兜底 404 中间件)验证 ws 升级与消息收发。
 */

let server;
let port;

test.before('start ws-capable server on ephemeral port', async () => {
  await new Promise((resolve, reject) => {
    // websockify 劫持了 app.listen, 同时启动 HTTP 与 WebSocket 服务
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
    server.on('error', reject);
  });
});

test.after.always('close server', async () => {
  if (server) {
    // 强制清掉未发帧场景下仍存活的 ws 连接, 避免 AVA 因常驻句柄退出超时
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise(resolve => server.close(resolve));
  }
  await closeMongoose();
});

/**
 * 打开 ws 连接并等待首帧(带超时)
 * @param {string} path
 * @param {number} timeoutMs
 * @returns {Promise<string|null>} 首帧文本, 超时未收到返回 null
 */
function firstFrame(path, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const timer = setTimeout(() => {
      cleanup();
      socket.terminate();
      resolve(null);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeAllListeners();
    };
    socket.on('open', () => {
      // 打开后等首帧; open 本身不代表任何中间件输出
    });
    socket.on('message', data => {
      const text = data.toString();
      cleanup();
      socket.close();
      resolve(text);
    });
    socket.on('error', err => {
      cleanup();
      reject(err);
    });
  });
}

test.serial('ws 兜底中间件: 未匹配路径返回 errcode 404 帧', async t => {
  const frame = await firstFrame('/api/ws/no_such_plugin');
  t.truthy(frame, '兜底中间件应发送 404 帧');
  const payload = JSON.parse(frame);
  t.is(payload.errcode, 404);
});

test.serial('ws 路由注册生效: solve_conflict 命中路由而非兜底 404', async t => {
  // 未登录场景控制器不产生 ws 帧; 断言关键是"没有落入兜底 404",
  // 证明 @koa/router 路由在 koa-websocket v7 的中间件链上正常匹配。
  const frame = await firstFrame('/api/interface/solve_conflict?id=1', 1200);
  if (frame !== null) {
    const payload = JSON.parse(frame);
    t.not(payload.errcode, 404, '不应命中兜底 404(路由未注册才会兜底)');
  } else {
    t.pass('路由命中, 未登录无 ws 帧, 符合预期');
  }
});

test.serial('ws 连接建立: 升级握手成功且协议为 ws', async t => {
  const raw = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/ws/handshake_probe`);
    socket.on('open', () => {
      resolve(socket);
    });
    socket.on('error', reject);
  });
  t.is(raw.readyState, WebSocket.OPEN);
  raw.close();
});

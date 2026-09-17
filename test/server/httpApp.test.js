import test from 'ava';
import http from 'http';

const app = require('../../server/app');

function requestLogin(body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.callback());
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/user/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
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
              resolve({ statusCode: response.statusCode, body: JSON.parse(data) });
            });
          });
        }
      );
      request.on('error', reject);
      request.end(JSON.stringify(body));
    });
    server.on('error', reject);
  });
}

// 使用完整 Koa 应用验证路由、中间件和控制器能通过真实 HTTP 链路工作。
test('完整 Koa 应用支持真实 HTTP 请求', async t => {
  const result = await requestLogin({ password: 'test-password' });

  t.is(result.statusCode, 200);
  t.is(result.body.errcode, 400);
  t.is(result.body.errmsg, 'email不能为空');
});


// 收尾取消定时任务并关闭 MongoDB 连接，避免 AVA 因常驻句柄强制退出
test.after.always('cleanup lingering handles', async () => {
  try {
    const schedule = require('node-schedule');
    schedule.scheduledJobs && Object.keys(schedule.scheduledJobs).forEach(name => {
      schedule.scheduledJobs[name].cancel();
    });
  } catch (e) {}
  const mongoose = require('mongoose');
  const yapi = require('../../server/yapi.js');
  try {
    // 等待初始连接与建库流程真正结束，避免后台任务尚未完成就开始关连接
    if (yapi.connect) {
      await yapi.connect;
    }
  } catch (e) {}
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    // 缓冲等待后台创建索引等收尾任务结束，防止 close 时触发 MongoClientClosedError
    await new Promise(r => setTimeout(r, 500));
    try {
      await mongoose.connection.close();
    } catch (e) {}
  }
});

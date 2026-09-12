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

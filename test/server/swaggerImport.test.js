import test from 'ava';

const run = require('../../exts/yapi-plugin-import-swagger/run');

test('兼容 OpenAPI 3.1 的服务器路径和 JSON 媒体类型', async t => {
  const result = await run({
    openapi: '3.1.0',
    info: { title: '示例', version: '1.0.0' },
    servers: [{ url: 'https://example.com/api/{version}', variables: { version: { default: 'v1' } } }],
    paths: {
      '/users': {
        post: {
          summary: '创建用户',
          requestBody: {
            content: {
              'application/vnd.api+json': {
                schema: { type: 'object', properties: { name: { type: 'string' } } }
              }
            }
          },
          responses: {
            200: {
              description: '成功',
              content: { 'application/hal+json': { schema: { type: 'object' } } }
            }
          }
        }
      }
    }
  });

  t.is(result.basePath, '/api/v1');
  t.is(result.apis.length, 1);
  t.is(result.apis[0].req_body_type, 'json');
  t.true(result.apis[0].req_body_other.includes('"name"'));
  t.is(result.apis[0].res_body_type, 'json');
});

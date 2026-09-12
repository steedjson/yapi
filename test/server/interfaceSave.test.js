import test from 'ava';

const controller = require('rewire')('../../server/controllers/interface');
const handleHeaders = controller.__get__('handleHeaders');

// 导入数据可能缺少请求头或表单字段，保存前应补齐可用的默认请求头。
test('保存表单接口时兼容缺失请求头和表单字段', t => {
  const values = {
    req_body_type: 'form',
    req_body_form: [{ type: 'text', name: 'name' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
  ]);
});

test('保存 JSON 接口时兼容缺失请求头', t => {
  const values = { req_body_type: 'json' };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'application/json' }]);
});

test('保存文件表单时使用 multipart 请求头', t => {
  const values = {
    req_body_type: 'form',
    req_headers: [],
    req_body_form: [{ type: 'file', name: 'file' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'multipart/form-data' }]);
});


test('导入数据携带异常请求头类型时仍可补齐请求头', t => {
  const values = { req_body_type: 'json', req_headers: {} };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'application/json' }]);
});

test('导入数据缺少表单数组时仍可补齐请求头', t => {
  const values = { req_body_type: 'form', req_body_form: null, req_headers: null };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
  ]);
});

import test from 'ava';

const controller = require('rewire')('../../server/controllers/interface');
const InterfaceController = controller.__get__('interfaceController');
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


test('导入接口编辑保存成功后返回成功结果', async t => {
  controller.__set__('yapi', {
    commons: {
      verifyPath: () => true,
      resReturn: (data, errcode, message) => ({ data, errcode: errcode || 0, message }),
      validateParams: () => ({ valid: true })
    }
  });
  const instance = Object.create(InterfaceController.prototype);
  let updatedParams;
  instance.$tokenAuth = true;
  instance.schemaMap = { up: {} };
  instance.Model = {
    getByPath: async () => [{ _id: 17, res_body: '{}', path: '/users', method: 'GET' }]
  };
  instance.up = async ctx => {
    updatedParams = ctx.params;
    ctx.body = { errcode: 0 };
  };

  const ctx = {
    params: {
      project_id: 1,
      path: '/users',
      method: 'get',
      title: '导入用户接口'
    }
  };

  await instance.save(ctx);

  t.is(updatedParams.id, 17);
  t.is(updatedParams.method, 'GET');
  t.is(ctx.body.errcode, 0);
});

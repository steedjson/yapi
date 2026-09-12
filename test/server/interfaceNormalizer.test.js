import test from 'ava';
import handleHeaders from '../../server/utils/interfaceNormalizer';

// 模块应原生导出可调用的归一化函数。
test('模块原生导出 handleHeaders 函数', t => {
  t.is(typeof handleHeaders, 'function');
});

// ---------- JSON 请求体 ----------

test('JSON 请求体缺失请求头时补齐 application/json', t => {
  const values = { req_body_type: 'json' };

  const result = handleHeaders(values);

  t.is(result, undefined);
  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'application/json' }]);
});

test('JSON 请求体请求头为空数组时补齐 application/json', t => {
  const values = { req_body_type: 'json', req_headers: [] };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'application/json' }]);
});

test('JSON 请求体保留其他请求头并前置 Content-Type', t => {
  const values = {
    req_body_type: 'json',
    req_headers: [{ name: 'Accept', value: 'application/xml' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Accept', value: 'application/xml' }
  ]);
});

test('JSON 请求体已存在 Content-Type 时原位替换且不重复添加', t => {
  const contentType = { name: 'Content-Type', value: 'text/plain' };
  const values = {
    req_body_type: 'json',
    req_headers: [{ name: 'Accept', value: '*/*' }, contentType]
  };

  handleHeaders(values);

  t.is(values.req_headers.length, 2);
  t.is(values.req_headers[1], contentType);
  t.deepEqual(values.req_headers, [
    { name: 'Accept', value: '*/*' },
    { name: 'Content-Type', value: 'application/json' }
  ]);
});

test('JSON 请求体请求头为 null/undefined/对象等非法值时归一化为空数组后补齐', t => {
  [null, undefined, {}, 'Content-Type: text/html', 42].forEach(reqHeaders => {
    const values = { req_body_type: 'json', req_headers: reqHeaders };

    handleHeaders(values);

    t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'application/json' }]);
  });
});

test('JSON 请求体忽略 null 请求头条目并原位替换已有 Content-Type', t => {
  const values = {
    req_body_type: 'json',
    req_headers: [null, undefined, { name: 'Content-Type', value: 'text/html' }]
  };

  handleHeaders(values);

  t.is(values.req_headers.length, 3);
  t.deepEqual(values.req_headers[2], { name: 'Content-Type', value: 'application/json' });
});

test('JSON 请求体跳过 null 请求头条目后仍会补齐 Content-Type', t => {
  const values = { req_body_type: 'json', req_headers: [null] };

  handleHeaders(values);

  t.is(values.req_headers.length, 2);
  t.deepEqual(values.req_headers[0], { name: 'Content-Type', value: 'application/json' });
  t.is(values.req_headers[1], null);
});

test('Content-Type 名称匹配区分大小写，小写请求头不会被替换', t => {
  const values = {
    req_body_type: 'json',
    req_headers: [{ name: 'content-type', value: 'text/html' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'content-type', value: 'text/html' }
  ]);
});

// ---------- Form 请求体（文本） ----------

test('纯文本表单缺失请求头时补齐 urlencoded', t => {
  const values = {
    req_body_type: 'form',
    req_body_form: [{ type: 'text', name: 'name' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
  ]);
});

test('文本表单已存在 Content-Type 时原位替换为 urlencoded', t => {
  const contentType = { name: 'Content-Type', value: 'application/json' };
  const values = {
    req_body_type: 'form',
    req_headers: [contentType],
    req_body_form: [{ type: 'text', name: 'name' }]
  };

  handleHeaders(values);

  t.is(values.req_headers.length, 1);
  t.is(values.req_headers[0], contentType);
  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
  ]);
});

// ---------- Form 请求体（文件 / multipart） ----------

test('含文件表单缺失请求头时补齐 multipart/form-data', t => {
  const values = {
    req_body_type: 'form',
    req_headers: [],
    req_body_form: [{ type: 'file', name: 'file' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'multipart/form-data' }]);
});

test('含文件表单已存在 Content-Type 时原位替换为 multipart/form-data', t => {
  const contentType = { name: 'Content-Type', value: 'application/x-www-form-urlencoded' };
  const values = {
    req_body_type: 'form',
    req_headers: [{ name: 'Accept', value: '*/*' }, contentType],
    req_body_form: [{ type: 'file', name: 'file' }]
  };

  handleHeaders(values);

  t.is(values.req_headers.length, 2);
  t.is(values.req_headers[1], contentType);
  t.deepEqual(values.req_headers, [
    { name: 'Accept', value: '*/*' },
    { name: 'Content-Type', value: 'multipart/form-data' }
  ]);
});

test('表单条目包含 null 与混合类型时仍能识别文件字段', t => {
  const values = {
    req_body_type: 'form',
    req_headers: [],
    req_body_form: [null, { type: 'text', name: 'name' }, undefined, { type: 'file', name: 'f' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [{ name: 'Content-Type', value: 'multipart/form-data' }]);
});

test('表单 req_body_form 为 null/undefined/非数组时按空表单处理使用 urlencoded', t => {
  [null, undefined, {}, 'not-array', 7].forEach(bodyForm => {
    const values = {
      req_body_type: 'form',
      req_headers: [],
      req_body_form: bodyForm
    };

    handleHeaders(values);

    t.deepEqual(values.req_headers, [
      { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
    ]);
  });
});

test('表单请求头为 null 时归一化后仍补齐 urlencoded', t => {
  const values = {
    req_body_type: 'form',
    req_headers: null,
    req_body_form: [{ type: 'text', name: 'name' }]
  };

  handleHeaders(values);

  t.deepEqual(values.req_headers, [
    { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }
  ]);
});

// ---------- 未知或缺失的请求体类型 ----------

test('未知请求体类型仅归一化请求头，不添加 Content-Type', t => {
  const accept = { name: 'Accept', value: '*/*' };
  const values = { req_body_type: 'raw', req_headers: [accept] };

  handleHeaders(values);

  t.is(values.req_headers.length, 1);
  t.is(values.req_headers[0], accept);
});

test('缺失请求体类型时仅把请求头归一化为空数组', t => {
  const values = {};

  handleHeaders(values);

  t.deepEqual(values.req_headers, []);
});

test('未知请求体类型携带非法请求头时归一化为空数组且不添加 Content-Type', t => {
  const values = { req_body_type: 'form-data', req_headers: { name: 'Content-Type' } };

  handleHeaders(values);

  t.deepEqual(values.req_headers, []);
});

// ---------- 引用语义 ----------

test('请求头为合法数组时原数组引用被保留并原地修改', t => {
  const headers = [];
  const values = { req_body_type: 'json', req_headers: headers };

  handleHeaders(values);

  t.is(values.req_headers, headers);
  t.is(headers.length, 1);
});

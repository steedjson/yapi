import test from 'ava';

const commons = require('../../server/utils/commons.js');

test('closeRemoveAdditional 为 true 时保留额外字段, 且不再原地修改 schemaMap', t => {
  const schemaMap = {
    '*id': 'number',
    mode: { type: 'string', default: 'html' },
    closeRemoveAdditional: true
  };
  const params = { id: 1, extra: 'keep-me' };

  const first = commons.validateParams(schemaMap, params);
  const second = commons.validateParams(schemaMap, params);

  t.true(first.valid);
  t.true(second.valid);
  // 额外字段不被删除, 后续调用仍保持同一行为(schemaMap 未被第一次调用污染)
  t.is(params.extra, 'keep-me');
  t.true(schemaMap.closeRemoveAdditional === true);
});

test('无 closeRemoveAdditional 时移除额外字段(removeAdditional)', t => {
  const schemaMap = { '*id': 'number' };
  const params = { id: 2, junk: 'remove-me' };

  const result = commons.validateParams(schemaMap, params);

  t.true(result.valid);
  t.false('junk' in params);
});

test('缺失必填字段返回 invalid 且 message 包含字段名', t => {
  const result = commons.validateParams({ '*id': 'number' }, {});

  t.false(result.valid);
  t.true(result.message.indexOf('id') > -1);
});

test('coerceTypes 将字符串入参强制转换为数字', t => {
  const schemaMap = { '*id': 'number' };
  const params = { id: '42' };

  const result = commons.validateParams(schemaMap, params);

  t.true(result.valid);
  t.is(params.id, 42);
});

test('无法强转换的类型返回 invalid', t => {
  const result = commons.validateParams({ '*id': 'number' }, { id: 'not-a-number' });

  t.false(result.valid);
});

test('useDefaults 应用 schema 默认值', t => {
  const schemaMap = { id: 'number', mode: { type: 'string', default: 'html' } };
  const params = { id: 1 };

  const result = commons.validateParams(schemaMap, params);

  t.true(result.valid);
  t.is(params.mode, 'html');
});

test('嵌套数组 DSL(如 log/listByUpdate)可正常校验', t => {
  const schemaMap = {
    '*type': 'string',
    '*typeid': 'number',
    apis: [{ method: 'string', path: 'string' }]
  };

  const ok = commons.validateParams(schemaMap, {
    type: 'project',
    typeid: 11,
    apis: [{ method: 'GET', path: '/a/b' }]
  });
  t.true(ok.valid);

  // coerceTypes 会把数字 method 强转为字符串
  const coerced = commons.validateParams(schemaMap, {
    type: 'project',
    typeid: 11,
    apis: [{ method: 123, path: '/a/b' }]
  });
  t.true(coerced.valid);

  // 对象无法强转为字符串, 校验失败
  const bad = commons.validateParams(schemaMap, {
    type: 'project',
    typeid: 11,
    apis: [{ method: {}, path: '/a/b' }]
  });
  t.false(bad.valid);
});

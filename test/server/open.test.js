import test from 'ava';

const yapi = require('../../server/yapi.js');
// server/controllers/open.js 在模块加载阶段会调用 yapi.emitHook('import_data', ...)，
// 插件系统（server/plugin.js）仅在服务启动时挂载 emitHook，测试环境注入行为一致的空实现
yapi.emitHook = yapi.emitHook || function() {
  return Promise.resolve([]);
};
// server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现
yapi.commons = require('../../server/utils/commons.js');

const baseController = require('../../server/controllers/base.js');
const openController = require('../../server/controllers/open.js');
const projectModel = require('../../server/models/project.js');
const interfaceColModel = require('../../server/models/interfaceCol.js');
const interfaceCaseModel = require('../../server/models/interfaceCase.js');
const interfaceModel = require('../../server/models/interface.js');
const interfaceCatModel = require('../../server/models/interfaceCat.js');
const followModel = require('../../server/models/follow.js');
const userModel = require('../../server/models/user.js');

// openController 构造函数会通过 yapi.getInst 获取 7 个 model 实例，
// 预先写入 mock 可阻止真实 model 构造（其依赖 yapi.db/mongodb 连接）
test.before('注入 mock model 实例，避免真实 mongoose 连接', () => {
  yapi.getInsts.set(projectModel, {
    get: async () => null,
    getByEnv: async () => ({ env: [] })
  });
  yapi.getInsts.set(interfaceColModel, { get: async () => null });
  yapi.getInsts.set(interfaceCaseModel, {});
  yapi.getInsts.set(interfaceModel, {});
  yapi.getInsts.set(interfaceCatModel, {});
  yapi.getInsts.set(followModel, {});
  yapi.getInsts.set(userModel, {});
});

// —— 继承关系与实例化 ——

test('openController 继承自 baseController', t => {
  t.is(Object.getPrototypeOf(openController), baseController);
  t.is(Object.getPrototypeOf(openController.prototype), baseController.prototype);
  const inst = new openController({});
  t.true(inst instanceof baseController);
  t.true(inst instanceof openController);
});

// —— schemaMap 结构完整性 ——

test('实例化时初始化 schemaMap，包含 runAutoTest 与 importData', t => {
  const inst = new openController({});
  t.truthy(inst.schemaMap);
  t.deepEqual(Object.keys(inst.schemaMap), ['runAutoTest', 'importData']);
});

test('schemaMap.runAutoTest 校验规则', t => {
  const inst = new openController({});
  const rule = inst.schemaMap.runAutoTest;
  t.is(rule['*id'], 'number');
  t.is(rule.project_id, 'string');
  t.is(rule.token, 'string');
  t.deepEqual(rule.mode, { type: 'string', default: 'html' });
  t.deepEqual(rule.email, { type: 'boolean', default: false });
  t.deepEqual(rule.download, { type: 'boolean', default: false });
  t.is(rule.closeRemoveAdditional, true);
});

test('schemaMap.importData 校验规则', t => {
  const inst = new openController({});
  const rule = inst.schemaMap.importData;
  t.is(rule['*type'], 'string');
  t.is(rule['*token'], 'string');
  t.is(rule.url, 'string');
  t.is(rule.json, 'string');
  t.is(rule.project_id, 'string');
  t.deepEqual(rule.merge, { type: 'string', default: 'normal' });
});

// —— handleValue(val, global) ——

test('handleValue: 普通字符串原样返回（仅去除首尾空白）', t => {
  const inst = new openController({});
  t.is(inst.handleValue('abc'), 'abc');
  t.is(inst.handleValue('  abc  '), 'abc');
  t.is(inst.handleValue(''), '');
});

test('handleValue: 非字符串入参原样返回', t => {
  const inst = new openController({});
  t.is(inst.handleValue(123), 123);
  t.is(inst.handleValue(null), null);
  t.is(inst.handleValue(undefined), undefined);
});

test('handleValue: global 数组转对象后完成整串插值', t => {
  const inst = new openController({});
  t.is(inst.handleValue('{{global.token}}', [{ name: 'token', value: 'abc123' }]), 'abc123');
});

test('handleValue: 混合文本中的 global 插值', t => {
  const inst = new openController({});
  t.is(
    inst.handleValue('Bearer {{global.token}}@{{global.host}}', [
      { name: 'token', value: 'abc123' },
      { name: 'host', value: 'yapi.example.com' }
    ]),
    'Bearer abc123@yapi.example.com'
  );
});

test('handleValue: global 缺失对应变量时返回去花括号的占位串', t => {
  const inst = new openController({});
  t.is(inst.handleValue('{{global.missing}}', []), 'global.missing');
});

// —— handleEvnParams(params) ——

test('handleEvnParams: 提取 env_ 前缀参数并按项目 id 归组', t => {
  const inst = new openController({});
  t.deepEqual(inst.handleEvnParams({ env_123: 'prd', env_456: 'dev', other: 'val' }), [
    { curEnv: 'prd', project_id: '123' },
    { curEnv: 'dev', project_id: '456' }
  ]);
});

test('handleEvnParams: curEnv 会经过 trim 处理', t => {
  const inst = new openController({});
  t.deepEqual(inst.handleEvnParams({ env_789: '  prd  ' }), [
    { curEnv: 'prd', project_id: '789' }
  ]);
});

test('handleEvnParams: 无 env_ 前缀参数时返回空数组', t => {
  const inst = new openController({});
  t.deepEqual(inst.handleEvnParams({ foo: 'bar', token: 'x' }), []);
});

// —— handleReqHeader(req_header, envData, curEnvName) ——

const envData = [
  {
    name: 'prd',
    domain: 'http://prd.example.com',
    header: [{ name: 'X-Env-Token', value: 'prd-token' }]
  },
  {
    name: 'dev',
    domain: 'http://dev.example.com',
    header: [{ name: 'X-Env-Token', value: 'dev-token' }]
  }
];

test('handleReqHeader: 未在 req_header 中的环境变量 header 自动追加并置 abled 为 true', t => {
  const inst = new openController({});
  const result = inst.handleReqHeader([{ name: 'Content-Type', value: 'application/json' }], envData, 'prd');
  t.deepEqual(result, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Env-Token', value: 'prd-token', abled: true }
  ]);
});

test('handleReqHeader: 已存在的 header 不会被重复添加', t => {
  const inst = new openController({});
  const reqHeader = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Env-Token', value: 'local-token' }
  ];
  const result = inst.handleReqHeader(reqHeader, envData, 'dev');
  t.is(result.length, 2);
  t.deepEqual(result, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Env-Token', value: 'local-token' }
  ]);
});

test('handleReqHeader: 未匹配到环境名时回退到第一个环境配置', t => {
  const inst = new openController({});
  const result = inst.handleReqHeader([], [
    { name: 'prd', header: [{ name: 'H1', value: 'v1' }] },
    { name: 'dev', header: [{ name: 'H2', value: 'v2' }] }
  ], 'not-exist-env');
  t.deepEqual(result, [{ name: 'H1', value: 'v1', abled: true }]);
});

test('handleReqHeader: 过滤字符串/数字等非对象条目', t => {
  const inst = new openController({});
  const result = inst.handleReqHeader(
    ['bad-string', 42, { name: 'Accept', value: '*/*' }],
    [{ name: 'prd', header: [{ name: 'X-Token', value: 't1' }] }],
    'prd'
  );
  t.deepEqual(result, [
    { name: 'Accept', value: '*/*' },
    { name: 'X-Token', value: 't1', abled: true }
  ]);
});

test('handleReqHeader: 过滤 null/undefined 等非对象条目', t => {
  const inst = new openController({});
  const result = inst.handleReqHeader(
    [null, undefined, { name: 'Accept', value: '*/*' }],
    [{ name: 'prd', header: [{ name: 'X-Token', value: 't1' }] }],
    'prd'
  );
  t.deepEqual(result, [
    { name: 'Accept', value: '*/*' },
    { name: 'X-Token', value: 't1', abled: true }
  ]);
});

// —— projectInterfaceData(ctx) ——

test('projectInterfaceData: 将响应体设置为占位字符串', async t => {
  const inst = new openController({});
  const ctx = {};
  await inst.projectInterfaceData(ctx);
  t.is(ctx.body, 'projectInterfaceData');
});

// —— runAutoTest(ctx) 的 token 鉴权保护 ——

test('runAutoTest: $tokenAuth 为 falsy 时直接返回 40022 token 验证失败', async t => {
  const inst = new openController({});
  inst.$tokenAuth = false;
  const ctx = {};
  await inst.runAutoTest(ctx);
  t.deepEqual(ctx.body, { errcode: 40022, errmsg: 'token 验证失败', data: null });
});

test('runAutoTest: $tokenAuth 未初始化(undefined)时同样被拦截', async t => {
  const inst = new openController({});
  t.falsy(inst.$tokenAuth);
  const ctx = {};
  await inst.runAutoTest(ctx);
  t.is(ctx.body.errcode, 40022);
  t.is(ctx.body.errmsg, 'token 验证失败');
});

import test from 'ava';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const upMethods = require('../../server/controllers/interface/upMethods.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // up() 的 resReturn/time 依赖 yapi.commons, 测试环境手动挂载真实工具模块
  yapi.commons = commons;
  // server/plugin.js 仅在服务启动时挂载 emitHook, 测试环境注入行为一致的空实现(同 open.test.js)
  yapi.emitHook =
    yapi.emitHook ||
    function() {
      return Promise.resolve([]);
    };
});

/**
 * 构造 interfaceController 实例桩: 仅提供 up() 触达鉴权段与保存主链所需字段,
 * this 由 upMethods.up.call(inst, ctx) 注入(与 interface.js 原型合并的调用形态一致)。
 * @param {any} opts tokenAuth/$tokenProjectId/checkAuthResult/interfaceProjectId 注入值
 * @returns {any} { inst: 控制器桩, calls: checkAuth/Model.up 调用记录 }
 */
function createInst(opts) {
  const calls = { checkAuthArgs: [], modelUps: [] };
  const iface = {
    _id: 77,
    project_id: opts.interfaceProjectId,
    catid: 3,
    title: 'iface',
    toObject: () => ({ _id: 77, project_id: opts.interfaceProjectId, catid: 3, title: 'iface' })
  };
  const inst = {
    $tokenAuth: opts.tokenAuth,
    $tokenProjectId: opts.tokenProjectId,
    checkAuth: async (...args) => {
      calls.checkAuthArgs.push(args);
      return opts.checkAuthResult;
    },
    Model: {
      get: async () => iface,
      up: async (id, data) => {
        calls.modelUps.push({ id, up_time: data.up_time });
        return { _id: id };
      },
      checkRepeat: async () => 0
    },
    // catModel.get 置空使日志分类读取短路, 不触达 saveLog
    catModel: { get: async () => null },
    projectModel: { up: async () => ({}), getBaseInfo: async () => ({}) },
    getUsername: () => 'tester',
    getUid: () => 1,
    autoAddTag: async () => ({})
  };
  return { inst, calls };
}

/**
 * 构造 /api/interface/up 请求上下文桩。
 * @returns {any} ctx 桩
 */
function createCtx() {
  return {
    params: { id: 77 },
    query: {},
    request: { origin: 'http://localhost' },
    body: null
  };
}

// ---------- ① $tokenAuth + 接口属于归属项目 → 放行 ----------

test.serial('up: token 请求更新归属项目的接口放行保存, 不走 checkAuth', async t => {
  // interfaceData.project_id 传字符串形态, 钉死新校验 Number() 归一化不误伤
  const { inst, calls } = createInst({
    tokenAuth: true,
    tokenProjectId: 123,
    interfaceProjectId: '123',
    checkAuthResult: true
  });
  const ctx = createCtx();

  await upMethods.up.call(inst, ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.modelUps.length, 1);
  // token 路径在原 checkAuth 分支之前短路, 不得触达原权限链
  t.deepEqual(calls.checkAuthArgs, []);
});

// ---------- ② $tokenAuth + 接口属于其它项目 → 406 ----------

test.serial('up: token 请求更新其它项目的接口返回 406 没有权限', async t => {
  const { inst, calls } = createInst({
    tokenAuth: true,
    tokenProjectId: 999,
    interfaceProjectId: 123,
    checkAuthResult: true
  });
  const ctx = createCtx();

  await upMethods.up.call(inst, ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 越界写操作在保存前被拦截, 且不回退到原 checkAuth 链
  t.is(calls.modelUps.length, 0);
  t.deepEqual(calls.checkAuthArgs, []);
});

test.serial('up: token 归属判定兼容字符串形态的 $tokenProjectId', async t => {
  const { inst, calls } = createInst({
    tokenAuth: true,
    tokenProjectId: '123',
    interfaceProjectId: 123,
    checkAuthResult: true
  });
  const ctx = createCtx();

  await upMethods.up.call(inst, ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.modelUps.length, 1);
});

// ---------- ③ 无 $tokenAuth(登录态) → 原逻辑不受新校验影响 ----------

test.serial('up: 非 token 请求仍走原 checkAuth 放行链, 不受归属校验影响', async t => {
  const { inst, calls } = createInst({
    tokenAuth: undefined,
    tokenProjectId: undefined,
    interfaceProjectId: 123,
    checkAuthResult: true
  });
  const ctx = createCtx();

  await upMethods.up.call(inst, ctx);

  // 原 checkAuth 以 (project_id, 'project', 'edit') 被调用
  t.deepEqual(calls.checkAuthArgs, [[123, 'project', 'edit']]);
  // $tokenProjectId 未挂载时新校验若失效会误 406, 此处证明正常保存
  t.is(ctx.body.errcode, 0);
  t.is(calls.modelUps.length, 1);
});

test.serial('up: 非 token 请求 checkAuth 拒绝时维持原 400 拦截(回归)', async t => {
  const { inst, calls } = createInst({
    tokenAuth: undefined,
    tokenProjectId: undefined,
    interfaceProjectId: 123,
    checkAuthResult: false
  });
  const ctx = createCtx();

  await upMethods.up.call(inst, ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.modelUps.length, 0);
});

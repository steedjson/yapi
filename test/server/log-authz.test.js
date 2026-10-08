import test from 'ava';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const logController = require('../../server/controllers/log.js');

// 日志端点的项目域可见性判定（对齐 project.get / interface.list 的 view 级口径）。
// 修复前：/api/log/list 与 /api/log/list_by_update 直接按请求方自报的 typeid 查询，
// 无任何域判定——任意登录用户可读他人项目/分组的操作日志与接口变更记录。
// 修复后：分组按 group view、项目按 private→project view（公开项目放行）。

const MY_UID = 5;

test.before('挂载真实 commons 到 yapi 单例', () => {
  yapi.commons = commons;
});

/**
 * 构造 logController 实例桩：只提供两个方法触达的 this.Model / projectModel /
 * checkAuth / getUid 与调用记录（反恒真：参数与次数全断言）。
 * @param {{ authz?: boolean, projectType?: string, typeid?: number }} opts
 * @returns {{ inst: any, calls: any }}
 */
function createHarness(opts = {}) {
  const calls = { checkAuth: [], getBaseInfo: [], listWithPaging: [], listWithPagingByGroup: [] };
  const inst = Object.create(logController.prototype);
  inst.$uid = String(MY_UID);
  inst.projectModel = {
    getBaseInfo: async (id, select) => {
      calls.getBaseInfo.push([id, select]);
      // 模拟 mongoose 文档：listByUpdate 会调用 .toObject()（真实模型返回 doc）
      const doc = { _id: id, basepath: '', project_type: opts.projectType || 'private' };
      return Object.assign(doc, { toObject: () => doc });
    },
    list: async () => []
  };
  inst.Model = {
    listWithPaging: async (...args) => {
      calls.listWithPaging.push(args);
      return [];
    },
    listWithPagingByGroup: async (...args) => {
      calls.listWithPagingByGroup.push(args);
      return [];
    },
    listCount: async () => 0,
    listCountByGroup: async () => 0
  };
  inst.interfaceModel = { getByPath: async () => [] };
  inst.checkAuth = async (...args) => {
    calls.checkAuth.push(args);
    return opts.authz === undefined ? true : opts.authz;
  };
  return { inst, calls };
}

/**
 * 构造 ctx 桩（query 用于 list，params 用于 listByUpdate）。
 * @param {{ typeid?: number, type?: string, apis?: any[] }} opts
 * @returns {any}
 */
function createCtx(opts = {}) {
  const typeid = opts.typeid === undefined ? 42 : opts.typeid;
  const type = opts.type || 'project';
  return {
    request: { query: { typeid, type, page: 1, limit: 10 }, body: {} },
    params: { typeid, type, apis: opts.apis || [] },
    body: null
  };
}

// ---------- log.list ----------

test.serial('log.list 项目域：私有项目非成员 → 406 且不查询日志', async t => {
  const { inst, calls } = createHarness({ authz: false, projectType: 'private' });
  const ctx = createCtx({ type: 'project', typeid: 42 });
  await inst.list(ctx);

  t.is(ctx.body.errcode, 406, '越权读必须 406');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.checkAuth, [[42, 'project', 'view']], '判定参数精确');
  t.deepEqual(calls.listWithPaging, [], '拒绝态不得触达日志查询（防先查后判）');
});

test.serial('log.list 项目域：公开项目非成员放行（现状口径）', async t => {
  const { inst, calls } = createHarness({ authz: false, projectType: 'public' });
  const ctx = createCtx({ type: 'project', typeid: 42 });
  await inst.list(ctx);

  t.is(ctx.body.errcode, 0, '公开项目放行');
  t.deepEqual(calls.checkAuth, [], '公开项目不调用 checkAuth');
  t.is(calls.listWithPaging.length, 1, '日志查询确实执行');
});

test.serial('log.list 项目域：私有项目成员放行', async t => {
  const { inst, calls } = createHarness({ authz: true, projectType: 'private' });
  const ctx = createCtx({ type: 'project', typeid: 42 });
  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.checkAuth, [[42, 'project', 'view']]);
  t.is(calls.listWithPaging.length, 1);
});

test.serial('log.list 分组域：非成员 → 406 且不查询分组日志', async t => {
  const { inst, calls } = createHarness({ authz: false });
  const ctx = createCtx({ type: 'group', typeid: 7 });
  await inst.list(ctx);

  t.is(ctx.body.errcode, 406);
  t.deepEqual(calls.checkAuth, [[7, 'group', 'view']], '分组按 group 域判定');
  t.deepEqual(calls.listWithPagingByGroup, [], '拒绝态不得触达日志查询');
});

test.serial('log.list 分组域：成员放行', async t => {
  const { inst, calls } = createHarness({ authz: true });
  const ctx = createCtx({ type: 'group', typeid: 7 });
  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.checkAuth, [[7, 'group', 'view']]);
  t.is(calls.listWithPagingByGroup.length, 1);
});

test.serial('log.list 缺参回归：无 typeid/type 仍 400', async t => {
  const { inst } = createHarness();
  const ctx = createCtx({ typeid: undefined });
  ctx.request.query = { page: 1 };
  await inst.list(ctx);
  t.is(ctx.body.errcode, 400);
});

// ---------- log.listByUpdate ----------

test.serial('log.listByUpdate：私有项目非成员 → 406 且不查询接口/日志', async t => {
  const { inst, calls } = createHarness({ authz: false, projectType: 'private' });
  const ctx = createCtx({
    typeid: 42,
    apis: [{ path: '/a', method: 'GET' }]
  });
  await inst.listByUpdate(ctx);

  t.is(ctx.body.errcode, 406);
  t.deepEqual(calls.checkAuth, [[42, 'project', 'view']]);
  t.deepEqual(
    calls.getBaseInfo,
    [[42, 'basepath project_type']],
    '窄投影须同时含 basepath 与 project_type（否则取不到 project_type 无法判定）'
  );
});

test.serial('log.listByUpdate：公开项目非成员放行且不调 checkAuth', async t => {
  const { inst, calls } = createHarness({ authz: false, projectType: 'public' });
  const ctx = createCtx({ typeid: 42, apis: [{ path: '/a', method: 'GET' }] });
  await inst.listByUpdate(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.checkAuth, []);
});

test.serial('log.listByUpdate：私有项目成员放行', async t => {
  const { inst, calls } = createHarness({ authz: true, projectType: 'private' });
  const ctx = createCtx({ typeid: 42, apis: [{ path: '/a', method: 'GET' }] });
  await inst.listByUpdate(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.checkAuth, [[42, 'project', 'view']]);
});

test.serial('反恒真：判定确实被调用（checkAuth 记录非空）且分组/项目域参数不同', async t => {
  const proj = createHarness({ authz: true, projectType: 'private' });
  await proj.inst.list(createCtx({ type: 'project', typeid: 42 }));
  const grp = createHarness({ authz: true });
  await grp.inst.list(createCtx({ type: 'group', typeid: 7 }));

  t.deepEqual(proj.calls.checkAuth[0], [42, 'project', 'view']);
  t.deepEqual(grp.calls.checkAuth[0], [7, 'group', 'view']);
  t.notDeepEqual(proj.calls.checkAuth[0], grp.calls.checkAuth[0], '两域判定参数必须可区分');
});

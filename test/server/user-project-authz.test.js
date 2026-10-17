import test from 'ava';

// /api/user/project 路由初始化鉴权面独立验证（不连库）：
// 修复前该入口对 type=interface/project 直接查库回填 result（interface/project/group
// 三段数据），私有项目对任意登录用户无可见性判定——非成员可借路由初始化读取
// 私有项目全量数据；且异常路径回泄半成品 result（含已取到的 interface/project 段）。
// 修复后：资源不存在回 407；私有项目先过 checkAuth(view)（判定用真实归属
// projectData._id，不信请求自报 id）；异常路径 data=null。
// 桩形态沿用 test/server/log-authz.test.js / getenv-authz.test.js：Object.create
// 控制器原型 + yapi.getInst 按 model 分发桩 + checkAuth 埋点，不触 DB。
const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userController = require('../../server/controllers/user.js');
const interfaceModel = require('../../server/models/interface.js');
const projectModel = require('../../server/models/project.js');
const groupModel = require('../../server/models/group.js');

const MY_UID = 5;
// 请求自报 id=77（接口）——真实归属项目 501、分组 7：
// 鉴权判定必须建立在资源实际归属（projectData._id）上，而非请求方自报。
const IFACE_ID = 77;
const PROJECT_ID = 501;
const GROUP_ID = 7;

test.before('挂载真实 commons 到 yapi 单例', () => {
  yapi.commons = commons;
});

/**
 * 构造 user.project 的 this / ctx 桩与调用记录。
 * @param {{ iface?: any, project?: any, group?: any, authz?: boolean | Record<string, boolean> }} opts
 *   iface/project/group：各 model get 返回值（null 模拟不存在；默认按 fixture 回）。
 *   authz：checkAuth 桩返回值，boolean 全 action 统一；按 action 映射区分
 *   view/danger/site（角色标注链 owner→dev→member）。
 * @returns {{ inst: any, ctx: any, calls: any }}
 */
function createHarness(opts = {}) {
  const calls = { getInst: [], ifaceGet: [], projectGet: [], groupGet: [], checkAuth: [] };
  const iface =
    opts.iface === undefined
      ? { _id: IFACE_ID, project_id: PROJECT_ID, title: 'iface-1', edit_uid: 0 }
      : opts.iface;
  const project =
    opts.project === undefined
      ? {
          _id: PROJECT_ID,
          name: 'proj-501',
          project_type: 'private',
          group_id: GROUP_ID,
          toObject() {
            return this;
          }
        }
      : opts.project;
  const group =
    opts.group === undefined
      ? {
          _id: GROUP_ID,
          group_name: 'grp-7',
          toObject() {
            return this;
          }
        }
      : opts.group;
  yapi.getInst = m => {
    calls.getInst.push(m);
    if (m === interfaceModel) {
      return { get: async id => { calls.ifaceGet.push(id); return iface; } };
    }
    if (m === projectModel) {
      return { get: async id => { calls.projectGet.push(id); return project; } };
    }
    if (m === groupModel) {
      return { get: async id => { calls.groupGet.push(id); return group; } };
    }
    throw new Error('unexpected yapi.getInst(' + (m && m.name) + ')');
  };
  const inst = Object.create(userController.prototype);
  inst.$uid = String(MY_UID);
  inst.checkAuth = (...args) => {
    calls.checkAuth.push(args);
    if (typeof opts.authz === 'boolean' || typeof opts.authz === 'number') return Promise.resolve(opts.authz);
    return Promise.resolve((opts.authz || {}).view);
  };
  const ctx = { request: { query: {} }, body: null };
  return { inst, ctx, calls };
}

/**
 * 让 checkAuth 桩按 action 返回不同结果并记录（角色标注链需要）。
 * @param {any} harness createHarness 返回值
 * @param {Record<string, boolean>} byAction action → 结果
 */
function setAuthByAction(harness, byAction) {
  harness.calls.checkAuth = [];
  harness.inst.checkAuth = (...args) => {
    harness.calls.checkAuth.push(args);
    return Promise.resolve(byAction[args[2]]);
  };
}

// ---------- ① 越权：私有项目非成员 → 406，无任何资源段外泄 ----------

test.serial('user.project(type=interface)：私有项目非成员 → 406 data null，不触达分组查询', async t => {
  const { inst, ctx, calls } = createHarness({ authz: false });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(ctx.body.data, null, '拒绝响应不得携带 project/group 数据');
  // 判定参数：接口真实归属的 project_id（经 interface→project 反查），而非请求自报 id=77
  t.deepEqual(calls.ifaceGet, [String(IFACE_ID)]);
  t.deepEqual(calls.projectGet, [PROJECT_ID], '以 interface.project_id 反查项目');
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']], '以 projectData._id 判 view');
  // 硬短路：拒绝后不得继续读分组（result.group 不外泄）
  t.deepEqual(calls.getInst.filter(m => m === groupModel), [], '不触达分组查询');
  t.deepEqual(calls.groupGet, []);
});

test.serial('user.project(type=project)：私有项目非成员 → 同样 406（不绕过 interface 反查链）', async t => {
  const { inst, ctx, calls } = createHarness({ authz: false });
  ctx.request.query = { id: String(PROJECT_ID), type: 'project' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']]);
  t.deepEqual(calls.groupGet, [], '拒绝后不读分组');
});

// ---------- ② 实际归属优先：判定不信请求自报 id ----------

test.serial('user.project：interface 自报 project_id 与实际归属不一致 → 判定用 projectData._id', async t => {
  // 请求拿接口 77；接口声称 project_id=999，但 999 反查回的文档 _id=501：
  // 鉴权必须以资源实际归属 501 判定（999 只是转发用的中间值）。
  const { inst, ctx, calls } = createHarness({
    iface: { _id: IFACE_ID, project_id: 999, title: 'iface-1', edit_uid: 0 },
    project: {
      _id: PROJECT_ID,
      name: 'proj-501',
      project_type: 'private',
      group_id: GROUP_ID,
      toObject() {
        return this;
      }
    },
    authz: false
  });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 406);
  t.deepEqual(calls.projectGet, [999], '反查用 interface.project_id');
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']], '判定用 projectData._id（实际归属）');
});

// ---------- ③ 公开项目：非成员放行且不进入私有判定 ----------

test.serial('user.project：公开项目非成员 → 200 回填 project+group（现状口径，不调用 view 判定）', async t => {
  const { inst, ctx, calls } = createHarness({
    project: {
      _id: PROJECT_ID,
      name: 'pub',
      project_type: 'public',
      group_id: GROUP_ID,
      toObject() {
        return this;
      }
    },
    authz: false
  });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 0);
  t.truthy(ctx.body.data.project, '回填 project 段');
  t.truthy(ctx.body.data.group, '回填 group 段');
  t.deepEqual(calls.groupGet, [GROUP_ID], '公开项目继续读分组');
  // 公开项目不进私有判定分支：无 (id,'project','view') 调用
  t.deepEqual(calls.checkAuth.filter(c => c[2] === 'view'), [], '公开项目不做 view 判定');
});

// ---------- ④ 私有项目成员：view 放行 + 角色标注链 ----------

test.serial('user.project：私有项目 owner（view/danger/site 全 true）→ 200 且 role=owner', async t => {
  const harness = createHarness();
  const { inst, ctx, calls } = harness;
  setAuthByAction(harness, { view: true, danger: true, site: true });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.project.role, 'owner', 'danger 通过标注 owner');
  t.deepEqual(calls.checkAuth, [
    [PROJECT_ID, 'project', 'view'],
    [PROJECT_ID, 'project', 'danger'],
    [GROUP_ID, 'group', 'danger']
  ], 'view 判定 + project/group 角色标注链参数精确');
});

test.serial('user.project：私有项目 dev（view/site 通过、danger 拒绝）→ 200 且 role=dev', async t => {
  const harness = createHarness();
  const { inst, ctx } = harness;
  setAuthByAction(harness, { view: true, danger: false, site: true });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.project.role, 'dev', 'danger 拒、site 过标注 dev');
});

test.serial('user.project：私有项目 guest（仅 view 通过）→ 200 且 role=member（读取放行）', async t => {
  const harness = createHarness();
  const { inst, ctx } = harness;
  setAuthByAction(harness, { view: true, danger: false, site: false });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 0, 'guest 为 view 级成员：路由初始化读取放行');
  t.is(ctx.body.data.project.role, 'member', 'danger/site 皆拒标注 member');
});

// ---------- ⑤ 不存在资源：407，不进鉴权 ----------

test.serial('user.project(type=interface)：接口不存在 → 407 不存在的接口，不触达项目查询', async t => {
  const { inst, ctx, calls } = createHarness({ iface: null, authz: false });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 407);
  t.is(ctx.body.errmsg, '不存在的接口');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.getInst.filter(m => m === projectModel), [], '不反查项目');
  t.deepEqual(calls.checkAuth, [], '不进鉴权');
});

test.serial('user.project(type=project)：项目不存在 → 407 不存在的项目，不进鉴权', async t => {
  const { inst, ctx, calls } = createHarness({ project: null, authz: false });
  ctx.request.query = { id: String(PROJECT_ID), type: 'project' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 407);
  t.is(ctx.body.errmsg, '不存在的项目');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.checkAuth, [], '不进鉴权');
});

// ---------- ⑥ 严格判定与 id 双形态 ----------

test.serial('user.project：checkAuth 返回 truthy 非严格 true（1）→ 仍 406（保持 !== true 严格判定）', async t => {
  const { inst, ctx } = createHarness({ authz: 1 });
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
});

test.serial('user.project：数字 id 与字符串 id 行为一致（77 与 "77" 同判 406）', async t => {
  for (const id of [IFACE_ID, String(IFACE_ID)]) {
    const { inst, ctx, calls } = createHarness({ authz: false });
    ctx.request.query = { id, type: 'interface' };
    await inst.project(ctx);
    t.is(ctx.body.errcode, 406);
    t.deepEqual(calls.ifaceGet, [id], 'id 原样透传 model.get');
  }
});

// ---------- ⑦ 异常路径：不回泄中间 result ----------

test.serial('user.project：分组段抛错 → 422 且 data=null（不回泄已取到的 interface/project 段）', async t => {
  const { inst, ctx } = createHarness({ authz: true, group: null });
  // group get 返回 null → groupData.toObject() 抛 TypeError → catch 路径。
  // 修复前 catch 回传半成品 result（含 interface+project 两段越权数据）。
  ctx.request.query = { id: String(IFACE_ID), type: 'interface' };

  await inst.project(ctx);

  t.is(ctx.body.errcode, 422);
  t.is(ctx.body.data, null, '异常路径 data 必须为 null，不携带半成品 result');
});

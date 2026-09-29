import test from 'ava';

const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const commons = require('../../server/utils/commons.js');
const projectModel = require('../../server/models/project.js');
const interfaceModel = require('../../server/models/interface.js');
const groupModel = require('../../server/models/group.js');
const tokenModel = require('../../server/models/token.js');
const userModel = require('../../server/models/user.js');
const { getToken } = require('../../server/utils/token.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // getProjectRole 异常兜底依赖 yapi.commons.log, 测试环境手动挂载
  yapi.commons = commons;
});

/**
 * 构造仅用于 getProjectRole 单测的 baseController 实例。
 * 不执行 init(ctx), 权限相关字段按 openapi token 语义直接注入。
 * @param {any} fields 注入的实例字段($tokenAuth/$tokenProjectId/$uid/$user)
 * @returns {any} baseController 实例
 */
function createInst(fields) {
  const inst = new baseController({ request: { query: {}, body: {} } });
  return Object.assign(inst, fields);
}

/**
 * 注入 project/group/interface model 桩并记录 project.get 调用。
 * @param {any} opts project/group/interfaceData 桩返回值, 传 null 表示不安装对应桩
 * @returns {any} { projectGets: project.get 的入参记录 }
 */
function installModelStubs(opts) {
  const calls = { projectGets: [] };
  if (opts.project !== null) {
    yapi.getInsts.set(projectModel, {
      get: async id => {
        calls.projectGets.push(id);
        return opts.project;
      }
    });
  }
  if (opts.group !== null) {
    yapi.getInsts.set(groupModel, {
      get: async () => opts.group
    });
  }
  if (opts.interfaceData !== null) {
    yapi.getInsts.set(interfaceModel, {
      get: async () => opts.interfaceData
    });
  }
  return calls;
}

// 构造"项目创建者 uid=1、无成员、属分组 9"的项目数据: 登录态用例走原判定链落分组, token 用例作严格域短路桩
const nonMemberProject = { uid: 1, members: [], group_id: 9 };
const nonMemberGroup = { uid: 1, members: [] };
// 模拟旧版 token 路径写入的系统用户(init 中 tokenUid === '999999' 分支)
const tokenUser = { _id: '999999', role: 'member', username: 'system' };

// ---------- ① $tokenAuth + 归属项目 id → dev ----------

test.serial('token 请求查询归属项目(数字 id)返回 dev 且不触达 project 分支', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: tokenUser
  });

  const role = await inst.getProjectRole(123, 'project');

  t.is(role, 'dev');
  // token 分支位于 project 分支之前, 归属项目内不应触发 project 查询
  t.deepEqual(calls.projectGets, []);
});

test.serial('token 归属判定兼容数字与字符串两种 id 形态', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });

  const withStringProjectId = createInst({
    $tokenAuth: true,
    $tokenProjectId: '123',
    $uid: '999999',
    $user: tokenUser
  });
  t.is(await withStringProjectId.getProjectRole(123, 'project'), 'dev');

  const withStringRoleId = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: tokenUser
  });
  // 查询参数形态的 id 常为字符串(如 ctx.query.id)
  t.is(await withStringRoleId.getProjectRole('123', 'project'), 'dev');
});

test.serial('token 请求查询归属项目下的接口时归一化到项目 id 后返回 dev', async t => {
  installModelStubs({
    project: nonMemberProject,
    group: nonMemberGroup,
    interfaceData: { _id: 77, uid: 555, project_id: 123 }
  });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: tokenUser
  });

  // 接口创建者 uid=555 与 token uid=999999 不同, 不走 owner 分支
  const role = await inst.getProjectRole(77, 'interface');

  t.is(role, 'dev');
});

test.serial('token 请求绑定账号恰为接口创建者时, 创建者早退被 !tokenAuth 守卫拦截, 严格域返回 member 而非 owner', async t => {
  // 接口创建者 uid=42 恰为 token 绑定账号: 无守卫时旧判定链在此返回 owner(越权)。
  // 接口挂 456 号项目(非 token 归属项目 123): 归一化后 token 分支非命中, 严格域直接 member
  const calls = installModelStubs({
    project: { _id: 456, uid: 1, members: [], group_id: 9 },
    group: null,
    interfaceData: { _id: 77, uid: 42, project_id: 456 }
  });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '42',
    $user: { _id: 42, role: 'member', username: 'creator42' }
  });

  const role = await inst.getProjectRole(77, 'interface');

  t.is(role, 'member');
  // 严格域短路生效时 project.get 不会被触达; 若失败说明 !tokenAuth 守卫失效回落旧判定链(将错误返回 owner)
  t.deepEqual(calls.projectGets, []);
});

test.serial('token 请求不继承使用者全局 admin 角色: 归属项目返回 dev 而非 admin', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '1',
    $user: { _id: 1, role: 'admin', username: 'root' }
  });

  const role = await inst.getProjectRole(123, 'project');

  t.is(role, 'dev');
  // admin 早退被 !this.$tokenAuth 守卫短路, 走 token 归属分支且不触达 project 查询
  t.deepEqual(calls.projectGets, []);
});

test.serial('token 请求绑定全局 admin 用户查询非归属项目时不再命中 admin 早退, 严格项目域直接 member', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  // 严格项目域: 非命中直接 member, 不触达项目查询; _id=42 避开 fixture 创建者 uid=1, 若短路失效也不应借 owner 分支越权
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '42',
    $user: { _id: 42, role: 'admin', username: 'root2' }
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'member');
  t.deepEqual(calls.projectGets, []);
});

test.serial('登录态(无 $tokenAuth)全局超管仍返回 admin(回归)', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $uid: '1',
    $user: { _id: 1, role: 'admin', username: 'root' }
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'admin');
});

// ---------- ② $tokenAuth + 非归属项目 id → 严格项目域: 非命中直接 member, 不触达项目查询 ----------

test.serial('token 请求查询非归属项目不命中 dev, 严格项目域直接返回 member', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: tokenUser
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'member');
  // 严格项目域: 非命中在 token 分支短路返回 member, 不再落入原 project/group 判定链
  t.deepEqual(calls.projectGets, []);
});

test.serial('token 绑定账号是其它项目创建者时, 仍返回 member 不获得 owner', async t => {
  // 456 号项目创建者恰为 token 绑定账号(uid=42): 旧判定链会在此返回 owner, 新语义必须短路收敛为 member
  const calls = installModelStubs({
    project: { _id: 456, uid: 42, members: [], group_id: 9 },
    group: null,
    interfaceData: null
  });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '42',
    $user: { _id: 42, role: 'member', username: 'creator42' }
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'member');
  // 严格域短路生效时 project.get 不会被触达; 若断言失败说明回落了旧判定链(将错误返回 owner)
  t.deepEqual(calls.projectGets, []);
});

test.serial('token 绑定账号是其它项目成员时, 私有项目 view 仍拒', async t => {
  // 绑定账号(uid=42)在 456 号项目 members 中持 dev 角色: 旧判定链会返回 dev, 新语义必须收敛为 member(无 dev 特权)
  const calls = installModelStubs({
    project: { _id: 456, uid: 1, members: [{ uid: 42, role: 'dev' }], group_id: 9 },
    group: null,
    interfaceData: null
  });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '42',
    $user: { _id: 42, role: 'member', username: 'member42' }
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'member');
  t.deepEqual(calls.projectGets, []);
});

// ---------- ③ 无 $tokenAuth(登录态) → 原逻辑不受影响 ----------

test.serial('登录态项目成员按 members 中的 role 返回 dev', async t => {
  installModelStubs({ project: { uid: 1, members: [{ uid: 5, role: 'dev' }], group_id: 3 }, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $uid: '5',
    $user: { _id: 5, role: 'member', username: 'alice' }
  });

  const role = await inst.getProjectRole(8, 'project');

  t.is(role, 'dev');
});

test.serial('登录态项目创建者返回 owner', async t => {
  installModelStubs({ project: { uid: 5, members: [], group_id: 3 }, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $uid: '5',
    $user: { _id: 5, role: 'member', username: 'alice' }
  });

  const role = await inst.getProjectRole(8, 'project');

  t.is(role, 'owner');
});

test.serial('登录态(无 $tokenAuth)接口创建者仍返回 owner(!tokenAuth 守卫回归)', async t => {
  // 登录态接口创建者 uid=42 与登录 uid 一致: 新守卫不得误伤原 owner 早退。
  // project/group 桩刻意用 uid=1(非登录者): 若守卫误伤漏过 owner 早退, 将落入后续判定链
  // 返回 member(兜底), 断言即失败, 保证失败模式可归因
  installModelStubs({
    project: nonMemberProject,
    group: nonMemberGroup,
    interfaceData: { _id: 77, uid: 42, project_id: 123 }
  });
  const inst = createInst({
    $uid: '42',
    $user: { _id: 42, role: 'member', username: 'creator42' }
  });

  const role = await inst.getProjectRole(77, 'interface');

  t.is(role, 'owner');
});

test.serial('登录态非项目成员且非分组成员返回 member', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $uid: '5',
    $user: { _id: 5, role: 'member', username: 'alice' }
  });

  const role = await inst.getProjectRole(8, 'project');

  t.is(role, 'member');
});

// ---------- ④ $tokenProjectId 未挂载(无效 token 路径) → 不误判 ----------

test.serial('$tokenAuth 为 true 但 $tokenProjectId 未挂载时不误判 dev', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $uid: '999999',
    $user: tokenUser
  });

  const role = await inst.getProjectRole(123, 'project');

  t.is(role, 'member');
  // $tokenProjectId 缺失同样走严格项目域短路: 非命中直接 member, 不触达项目查询
  t.deepEqual(calls.projectGets, []);
});

test.serial('$tokenAuth 与 $tokenProjectId 均未挂载(token 无效提前返回)时不误判', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $uid: '999999',
    $user: tokenUser
  });

  const role = await inst.getProjectRole(123, 'project');

  t.is(role, 'member');
});

// ---------- ⑤ token 上下文绑定账号异常语义($user=null / disabled) ----------

test.serial('token 上下文 $user 为 null 时 getProjectRole 不抛错且不返回 admin(守卫短路口径)', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  // 生产链路中该状态不可达: init 对绑定账号缺失提前 return, createAction 以 $auth!==true 拦截,
  // 此处钉死 `!this.$tokenAuth && this.getRole()` 的短路顺序, 防止条件换序后解引用 null
  const owned = createInst({ $tokenAuth: true, $tokenProjectId: 123, $uid: '999999', $user: null });
  t.is(await owned.getProjectRole(123, 'project'), 'dev');

  const foreign = createInst({ $tokenAuth: true, $tokenProjectId: 123, $uid: '999999', $user: null });
  t.is(await foreign.getProjectRole(456, 'project'), 'member');
});

test.serial('getProjectRole 不消费 disabled 字段, 禁用拦截由 init 提前返回承担', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: { _id: '999999', role: 'member', username: 'system', disabled: true }
  });

  t.is(await inst.getProjectRole(123, 'project'), 'dev');
});

// ---------- ⑥ init() 直测: 包装串绑定账号禁用/删除时不授予鉴权 ----------

/**
 * 构造 openapi 请求上下文桩(无 cookie 登录态, checkLogin 直接返回 false)。
 * @param {string} token 包装串或原始 token
 * @returns {any} ctx 桩
 */
function createOpenCtx(token) {
  return {
    path: '/api/open/import_data',
    query: { token },
    request: { body: {} },
    cookies: { get: () => undefined },
    params: {}
  };
}

/**
 * 注入 token/user model 桩, 服务于 init() 包装串分支。
 * @param {any} opts tokenRow 为 tokenModel.findId 返回值, user 为 userModel.findById 返回值
 * @returns {void}
 */
function installUserTokenStubs(opts) {
  yapi.getInsts.set(tokenModel, {
    findId: async () => opts.tokenRow
  });
  yapi.getInsts.set(userModel, {
    findById: async () => opts.user
  });
}

test.serial('init: 包装串绑定账号被禁用时提前返回, 不写入任何鉴权置位', async t => {
  installModelStubs({ project: { _id: 123 }, group: null, interfaceData: null });
  installUserTokenStubs({
    tokenRow: { toObject: () => ({ project_id: 123 }) },
    user: { _id: 7, role: 'member', username: 'bob', disabled: true }
  });
  const wrapped = getToken('project-token-123', '7');
  const ctx = createOpenCtx(wrapped);
  const inst = new baseController(ctx);

  await inst.init(ctx);

  // 全部置位($tokenAuth/$tokenProjectId/$uid/$user/$auth 及 ctx 兼容字段)均已前移到禁用判断之后,
  // 早退不得残留任何鉴权状态
  t.falsy(inst.$tokenAuth);
  t.is(inst.$tokenProjectId, undefined);
  t.is(inst.$uid, undefined);
  t.is(inst.$user, null);
  // createAction 依赖 $auth === true 放行, 未置位时统一回 40011 请登录
  t.falsy(inst.$auth);
  t.is(ctx.query.pid, undefined);
  t.is(ctx.params.project_id, undefined);
});

test.serial('init: 包装串绑定账号已被删除(findById 为 null)时同样提前返回', async t => {
  installModelStubs({ project: { _id: 123 }, group: null, interfaceData: null });
  installUserTokenStubs({
    tokenRow: { toObject: () => ({ project_id: 123 }) },
    user: null
  });
  const wrapped = getToken('project-token-123', '7');
  const inst = new baseController(createOpenCtx(wrapped));

  await inst.init(createOpenCtx(wrapped));

  // 与禁用分支同一语义: 删除账号同样在任何置位之前早退, 不得残留 $tokenAuth/$tokenProjectId
  t.falsy(inst.$tokenAuth);
  t.is(inst.$tokenProjectId, undefined);
  t.is(inst.$user, null);
  t.falsy(inst.$auth);
});

test.serial('init: 包装串绑定账号正常启用时照常授予 $auth(回归)', async t => {
  installModelStubs({ project: { _id: 123 }, group: null, interfaceData: null });
  installUserTokenStubs({
    tokenRow: { toObject: () => ({ project_id: 123 }) },
    user: { _id: 7, role: 'member', username: 'bob', disabled: false }
  });
  const wrapped = getToken('project-token-123', '7');
  const inst = new baseController(createOpenCtx(wrapped));

  await inst.init(createOpenCtx(wrapped));

  t.true(inst.$auth);
  t.is(inst.$uid, '7');
  t.is(inst.$user.username, 'bob');
});

// 收尾兜底: 本文件不触发真实 mongoose 连接, 此处仅防御性清理常驻句柄
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

import test from 'ava';

const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const commons = require('../../server/utils/commons.js');
const projectModel = require('../../server/models/project.js');
const interfaceModel = require('../../server/models/interface.js');
const groupModel = require('../../server/models/group.js');

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

// 构造"项目创建者 uid=1、无成员、属分组 9"的项目数据: token 分支若失效会落到原逻辑并返回 member
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

test.serial('token 命中归属项目但用户为全局 admin 时保持 admin 优先', async t => {
  installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '1',
    $user: { _id: 1, role: 'admin', username: 'root' }
  });

  const role = await inst.getProjectRole(123, 'project');

  t.is(role, 'admin');
});

// ---------- ② $tokenAuth + 非归属项目 id → 走原逻辑 ----------

test.serial('token 请求查询非归属项目不命中 dev, 按原逻辑返回 member', async t => {
  const calls = installModelStubs({ project: nonMemberProject, group: nonMemberGroup, interfaceData: null });
  const inst = createInst({
    $tokenAuth: true,
    $tokenProjectId: 123,
    $uid: '999999',
    $user: tokenUser
  });

  const role = await inst.getProjectRole(456, 'project');

  t.is(role, 'member');
  // 证明确实落入原 project/group 判定链而非 token 分支
  t.deepEqual(calls.projectGets, [456]);
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
  t.deepEqual(calls.projectGets, [123]);
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

// 收尾兜底: 本文件不触发真实 mongoose 连接, 此处仅防御性清理常驻句柄
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

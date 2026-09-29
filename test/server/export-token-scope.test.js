import test from 'ava';

// 插件控制器以非相对路径 require('controllers/base.js')/'yapi.js',
// 生产由 server/app.js 置 NODE_PATH=server 后 Module._initPaths() 解析;
// 测试进程复刻同一机制, 必须先于下方插件 controller 的 require 执行
const Module = require('module');
const nodePath = require('path');
process.env.NODE_PATH = nodePath.join(__dirname, '../../server');
Module._initPaths();

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const projectModel = require('../../server/models/project.js');
const groupModel = require('../../server/models/group.js');
const interfaceModel = require('../../server/models/interface.js');
const interfaceCatModel = require('../../server/models/interfaceCat.js');
const exportDataController = require('../../exts/yapi-plugin-export-data/controller.js');
const exportSwaggerController = require('../../exts/yapi-plugin-export-swagger2-data/controller.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // exportData 的 resReturn/log 依赖 yapi.commons, 测试环境手动挂载真实工具模块
  yapi.commons = commons;
});

// ---------- fixtures ----------
// 分组桩: 创建者 uid=1、无成员, 使登录态判定链落空归 member(同 token-project-role.test.js)
const nonMemberGroup = { uid: 1, members: [] };
// 公开项目: 创建者 uid=1、无成员(登录态非成员 uid=5 打它即业务回归场景)
const publicProject = {
  _id: 11,
  uid: 1,
  name: 'public-proj',
  members: [],
  group_id: 9,
  project_type: 'public'
};
// 私有项目: 创建者 uid=1、无成员
const privateProject = {
  _id: 12,
  uid: 1,
  name: 'private-proj',
  members: [],
  group_id: 9,
  project_type: 'private'
};
// 私有项目: uid=5 持 dev 成员角色
const privateDevProject = {
  _id: 12,
  uid: 1,
  name: 'private-dev-proj',
  members: [{ uid: 5, role: 'dev' }],
  group_id: 9,
  project_type: 'private'
};
// 私有项目: uid=5 持最低角色 guest(view 语义下仍应放行)
const privateGuestProject = {
  _id: 12,
  uid: 1,
  name: 'private-guest-proj',
  members: [{ uid: 5, role: 'guest' }],
  group_id: 9,
  project_type: 'private'
};
// 另一私有项目(99): 供 token 越界负向用例
const otherPrivateProject = {
  _id: 99,
  uid: 2,
  name: 'other-private-proj',
  members: [],
  group_id: 9,
  project_type: 'private'
};
// 登录态非成员(uid=5, 非项目创建者/成员/分组成员/全局管理员)
const loginNonMember = {
  $uid: '5',
  $user: { _id: 5, role: 'member', username: 'alice' }
};
// token 请求路径 init 写入的系统用户(init 中 tokenUid === '999999' 分支)
const tokenUser = { _id: '999999', role: 'member', username: 'system' };

/**
 * 构造导出控制器实例与请求上下文桩。
 * 不执行 init(ctx), 登录态/token 字段按语义直接注入(同 token-project-role.test.js);
 * checkAuth 保留真实判定链, 仅在外层包一层记录入参, 断言「是否触达权限判定」与入参形态。
 * @param {any} Ctrl 导出控制器类
 * @param {any} opts projectData/$uid/$user/tokenAuth/$tokenProjectId/query
 * @returns {any} { inst, ctx, checkAuthCalls }
 */
function createExportHarness(Ctrl, opts) {
  const checkAuthCalls = [];
  // 三个 model 均在控制器构造器里经 yapi.getInst 取实例, 先桩化避免实例化真实 mongoose model
  yapi.getInsts.set(projectModel, {
    get: async () => opts.projectData
  });
  yapi.getInsts.set(groupModel, {
    get: async () => nonMemberGroup
  });
  yapi.getInsts.set(interfaceModel, {
    listByInterStatus: async () => []
  });
  yapi.getInsts.set(interfaceCatModel, {
    list: async () => []
  });
  const inst = new Ctrl({ request: { query: {} } });
  const realCheckAuth = inst.checkAuth;
  inst.checkAuth = async (...args) => {
    checkAuthCalls.push(args);
    return realCheckAuth.apply(inst, args);
  };
  Object.assign(inst, {
    $uid: opts.$uid,
    $user: opts.$user
  });
  if (opts.tokenAuth) {
    inst.$tokenAuth = true;
    inst.$tokenProjectId = opts.$tokenProjectId;
  }
  const ctx = {
    request: { query: opts.query },
    set: () => {}
  };
  return { inst, ctx, checkAuthCalls };
}

// ---------- export-data 控制器(json 导出走全流程, 断言产物为 '[]' 或 406 拦截) ----------

test.serial('export-data: 公开项目登录态非成员不 406, 走原导出流程且不触达 checkAuth', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportDataController, {
    projectData: publicProject,
    ...loginNonMember,
    query: { pid: '11', type: 'json' }
  });

  await inst.exportData(ctx);

  // 放行且完成 json 导出(空分类列表序列化为 '[]')
  t.is(ctx.body, '[]');
  // 公开项目在门禁处短路, 不应发起权限判定; 若误改为无条件 checkAuth, 非成员将回归为 406
  t.deepEqual(checkAuthCalls, []);
});

test.serial('export-data: 私有项目登录态非成员返回 406 没有权限, 不进入导出流程', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportDataController, {
    projectData: privateProject,
    ...loginNonMember,
    query: { pid: '12', type: 'json' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 门禁以 (pid, 'project', 'view') 触达真实权限链
  t.deepEqual(checkAuthCalls, [['12', 'project', 'view']]);
});

test.serial('export-data: 私有项目登录态 dev 成员放行', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportDataController, {
    projectData: privateDevProject,
    ...loginNonMember,
    query: { pid: '12', type: 'json' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body, '[]');
  t.is(checkAuthCalls.length, 1);
});

test.serial('export-data: 私有项目登录态 guest 成员在 view 语义下放行', async t => {
  const { inst, ctx } = createExportHarness(exportDataController, {
    projectData: privateGuestProject,
    ...loginNonMember,
    query: { pid: '12', type: 'json' }
  });

  await inst.exportData(ctx);

  // guest 是最低成员角色: view 动作对 guest 放行是导出门禁的边界语义
  t.is(ctx.body, '[]');
});

test.serial('export-data: token 请求(pid 已被 init 改写为归属项目)导出私有项目放行', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportDataController, {
    projectData: privateProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    // pid 沿用查询串字符串形态, 钉死 getProjectRole 内 Number() 归一化不误伤
    query: { pid: '12', type: 'json', token: 'any-project-token' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body, '[]');
  // 放行经真实 checkAuth(归属项目内 token 得 dev → view 通过), 不靠门禁短路
  t.deepEqual(checkAuthCalls, [['12', 'project', 'view']]);
});

test.serial('export-data: token 请求打其它私有项目仍 406(归属域外不借 token 越权)', async t => {
  const { inst, ctx } = createExportHarness(exportDataController, {
    projectData: otherPrivateProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    query: { pid: '99', type: 'json', token: 'project-12-token' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
});

test.serial('export-data: 公开项目对非归属 token 请求保持放行(门禁只收敛私有域, 语义钉死)', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportDataController, {
    projectData: publicProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    query: { pid: '11', type: 'json', token: 'project-12-token' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body, '[]');
  t.deepEqual(checkAuthCalls, []);
});

// ---------- export-swagger2-data 控制器(门禁为复制实现, 同矩阵独立覆盖) ----------

test.serial('export-swagger: 公开项目登录态非成员不 406, 走原导出流程且不触达 checkAuth', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportSwaggerController, {
    projectData: publicProject,
    ...loginNonMember,
    query: { pid: '11', type: 'OpenAPIV2' }
  });

  await inst.exportData(ctx);

  const parsed = JSON.parse(ctx.body);
  t.is(parsed.swagger, '2.0');
  t.deepEqual(checkAuthCalls, []);
});

test.serial('export-swagger: 私有项目登录态非成员返回 406 没有权限, 不进入导出流程', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportSwaggerController, {
    projectData: privateProject,
    ...loginNonMember,
    query: { pid: '12', type: 'OpenAPIV2' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.deepEqual(checkAuthCalls, [['12', 'project', 'view']]);
});

test.serial('export-swagger: 私有项目登录态 dev 成员放行', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportSwaggerController, {
    projectData: privateDevProject,
    ...loginNonMember,
    query: { pid: '12', type: 'OpenAPIV2' }
  });

  await inst.exportData(ctx);

  const parsed = JSON.parse(ctx.body);
  t.is(parsed.swagger, '2.0');
  t.is(checkAuthCalls.length, 1);
});

test.serial('export-swagger: 私有项目登录态 guest 成员在 view 语义下放行', async t => {
  const { inst, ctx } = createExportHarness(exportSwaggerController, {
    projectData: privateGuestProject,
    ...loginNonMember,
    query: { pid: '12', type: 'OpenAPIV2' }
  });

  await inst.exportData(ctx);

  const parsed = JSON.parse(ctx.body);
  t.is(parsed.swagger, '2.0');
});

test.serial('export-swagger: token 请求(pid 已被 init 改写为归属项目)导出私有项目放行', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportSwaggerController, {
    projectData: privateProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    query: { pid: '12', type: 'OpenAPIV2', token: 'any-project-token' }
  });

  await inst.exportData(ctx);

  const parsed = JSON.parse(ctx.body);
  t.is(parsed.swagger, '2.0');
  t.deepEqual(checkAuthCalls, [['12', 'project', 'view']]);
});

test.serial('export-swagger: token 请求打其它私有项目仍 406(归属域外不借 token 越权)', async t => {
  const { inst, ctx } = createExportHarness(exportSwaggerController, {
    projectData: otherPrivateProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    query: { pid: '99', type: 'OpenAPIV2', token: 'project-12-token' }
  });

  await inst.exportData(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
});

test.serial('export-swagger: 公开项目对非归属 token 请求保持放行(门禁只收敛私有域, 语义钉死)', async t => {
  const { inst, ctx, checkAuthCalls } = createExportHarness(exportSwaggerController, {
    projectData: publicProject,
    $uid: '999999',
    $user: tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    query: { pid: '11', type: 'OpenAPIV2', token: 'project-12-token' }
  });

  await inst.exportData(ctx);

  const parsed = JSON.parse(ctx.body);
  t.is(parsed.swagger, '2.0');
  t.deepEqual(checkAuthCalls, []);
});

// 收尾兜底: 本文件不触发真实 mongoose 连接, 此处仅防御性清理常驻句柄
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

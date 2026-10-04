import test from 'ava';

// 插件控制器以非相对路径 require('controllers/base.js')/'yapi.js',
// 生产由 server/app.js 置 NODE_PATH=server 后 Module._initPaths() 解析;
// 测试进程复刻同一机制, 必须先于下方插件 controller 的 require 执行(同 plugin-open-scope.test.js)
const Module = require('module');
const nodePath = require('path');
process.env.NODE_PATH = nodePath.join(__dirname, '../../server');
Module._initPaths();

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userModel = require('../../server/models/user.js');
const interfaceModel = require('../../server/models/interface.js');
const projectModel = require('../../server/models/project.js');
const groupModel = require('../../server/models/group.js');
const advModel = require('../../exts/yapi-plugin-advanced-mock/advMockModel.js');
const caseModel = require('../../exts/yapi-plugin-advanced-mock/caseModel.js');
const advMockController = require('../../exts/yapi-plugin-advanced-mock/controller.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // 插件控制器的 resReturn/time 依赖 yapi.commons, 测试环境手动挂载真实工具模块
  yapi.commons = commons;
});

// 语义背景: advanced-mock 控制器 getCase/getMock 补 view、saveCase/delCase/hideCase/upMock 补 edit,
// 判定域一律取接口表真实归属(interfaceData.project_id), 不采信 body/query 自述;
// token 请求在既有守卫或 checkAuth 严格域内收敛为归属项目 dev(同 token-project-role.test.js 语义)。

// ---------- fixtures ----------

// 私有项目(12): 创建者 uid=1、无成员 → 登录态 uid=5 打它判定链落 member
const nonMemberProject = { _id: 12, uid: 1, name: 'private-proj', members: [], group_id: 9, project_type: 'private' };
// 私有项目(12): uid=5 持 dev 成员角色
const privateDevProject = { _id: 12, uid: 1, name: 'private-dev-proj', members: [{ uid: 5, role: 'dev' }], group_id: 9, project_type: 'private' };
// 私有项目(12): uid=5 持最低角色 guest(view 放行 / edit 拒绝的边界语义)
const privateGuestProject = { _id: 12, uid: 1, name: 'private-guest-proj', members: [{ uid: 5, role: 'guest' }], group_id: 9, project_type: 'private' };
// 私有项目(12): 创建者即 uid=5(登录者) → owner 早退
const privateOwnerProject = { _id: 12, uid: 5, name: 'private-owner-proj', members: [], group_id: 9, project_type: 'private' };
// 无成员分组: 判定链落分组后仍不命中, 归 member(同 export-token-scope.test.js)
const nonMemberGroup = { uid: 1, members: [] };
// 接口(77): 挂 12 号项目, 创建者 uid=42 与登录者/token 绑定账号均不同
const ownedInterface = { _id: 77, project_id: 12, uid: 42 };
// 期望(100): 挂接口 77
const ownedCase = { _id: 100, interface_id: 77, name: 'case-1' };
// caseModel.list 返回的期望文档桩: 携带 toObject 与 uid, 服务 list 成功分支的 username 补全
const listedCaseDoc = {
  _id: 100,
  interface_id: 77,
  uid: '7',
  name: 'case-list-1',
  toObject() {
    return { _id: 100, interface_id: 77, uid: '7', name: 'case-list-1' };
  }
};
// caseModel.list 返回的「创建者账号已删除」期望文档桩: uid 在 userModel.findById 查无此人;
// toObject 结果不含 username(username 非期望表字段, 由控制器补全), 钉 uid 失配路径
const orphanCaseDoc = {
  _id: 101,
  interface_id: 77,
  uid: '404',
  name: 'case-list-orphan',
  toObject() {
    return { _id: 101, interface_id: 77, uid: '404', name: 'case-list-orphan' };
  }
};
// 登录态普通用户(uid=5, 非项目创建者/成员/分组成员/全局管理员)
const loginMember = { $uid: '5', $user: { _id: 5, role: 'member', username: 'alice' } };
// token 请求路径 init 写入的系统用户(init 中 tokenUid === '999999' 分支)
const tokenUser = { $uid: '999999', $user: { _id: '999999', role: 'member', username: 'system' } };

/**
 * 构造 advanced-mock 控制器实例与调用记录。
 * 五个 model 均在构造器里经 yapi.getInst 取实例, 先以 getInsts 桩化避免实例化真实 mongoose model;
 * project/group 桩服务于 checkAuth 真实判定链(type='project' 路径)。
 * @param {any} opts $uid/$user/tokenAuth/$tokenProjectId/interfaceData/caseData/caseListData/project/mockData/userFindById
 * @returns {any} { inst, calls }
 */
function createAdvMockInst(opts) {
  const calls = {
    advModelGets: [],
    advSaves: [],
    advUps: [],
    interfaceGets: [],
    caseGets: [],
    caseLists: [],
    caseSaves: [],
    caseUps: [],
    caseDels: [],
    userFindByIds: [],
    checkAuthCalls: []
  };
  yapi.getInsts.set(advModel, {
    get: async id => {
      calls.advModelGets.push(id);
      return opts.mockData !== undefined ? opts.mockData : { interface_id: id, enable: false, mock_script: '' };
    },
    // save/up 服务 upMock 落库分支(get 命中走 up, 未命中走 save), 返回值由用例给定
    save: async data => {
      calls.advSaves.push(data);
      return { _id: 2 };
    },
    up: async data => {
      calls.advUps.push(data);
      return { _id: 2 };
    }
  });
  yapi.getInsts.set(caseModel, {
    // get 同时服务 getCase/delCase/hideCase 取期望与 saveCase 查重, 返回值由用例给定
    get: async query => {
      calls.caseGets.push(query);
      return opts.caseData !== undefined ? opts.caseData : null;
    },
    // list 服务 list 端点按接口取期望列表, 返回值由用例给定
    list: async id => {
      calls.caseLists.push(id);
      return opts.caseListData !== undefined ? opts.caseListData : [];
    },
    save: async data => {
      calls.caseSaves.push(data);
      return { _id: 1 };
    },
    up: async data => {
      calls.caseUps.push(data);
      return { _id: 1 };
    },
    del: async id => {
      calls.caseDels.push(id);
      return { _id: id };
    }
  });
  yapi.getInsts.set(userModel, {
    // findById 服务 list 端点列表项 username 补全; 默认命中用户,
    // opts.userFindById 可覆盖为查无此人(null), 覆盖 uid 失配路径
    findById: async uid => {
      calls.userFindByIds.push(uid);
      if (opts.userFindById) {
        return opts.userFindById(uid);
      }
      return { username: `alice-${uid}` };
    }
  });
  yapi.getInsts.set(interfaceModel, {
    get: async id => {
      calls.interfaceGets.push(id);
      return opts.interfaceData !== undefined ? opts.interfaceData : ownedInterface;
    }
  });
  yapi.getInsts.set(projectModel, {
    get: async () => (opts.project !== undefined ? opts.project : nonMemberProject)
  });
  yapi.getInsts.set(groupModel, {
    get: async () => nonMemberGroup
  });
  const inst = new advMockController({ request: { query: {} } });
  // checkAuth 保留真实判定链, 仅在外层包一层记录入参, 断言「是否触达权限判定」与入参形态
  // (同 export-token-scope.test.js 模式)
  const realCheckAuth = inst.checkAuth;
  inst.checkAuth = async (...args) => {
    calls.checkAuthCalls.push(args);
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
  return { inst, calls };
}

/**
 * 构造 saveCase 请求上下文桩(body 缺省为合法期望参数)。
 * @param {any} overrides body 覆盖字段
 * @returns {any} ctx 桩
 */
function createSaveCaseCtx(overrides) {
  return {
    request: {
      body: Object.assign(
        {
          interface_id: 77,
          project_id: 12,
          res_body: '{"code":0}',
          name: 'case-1'
        },
        overrides
      )
    },
    body: null
  };
}

/**
 * 构造 upMock 请求上下文桩(body 缺省为合法 mock 脚本参数)。
 * @param {any} overrides body 覆盖字段
 * @returns {any} ctx 桩
 */
function createUpMockCtx(overrides) {
  return {
    request: {
      body: Object.assign(
        {
          interface_id: 77,
          project_id: 12,
          mock_script: 'const a = 1;',
          enable: true
        },
        overrides
      )
    },
    body: null
  };
}

// ---------- getMock: 登录态 view 校验 + token 既有守卫 ----------

test.serial('advmock getMock: 登录态非成员(member)返回 406, 不触达 mock 配置读取', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 门禁以接口真实归属(12, 'project', 'view')触达真实权限链
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'view']]);
  t.is(calls.advModelGets.length, 0);
});

test.serial('advmock getMock: 登录态 dev 成员放行读取', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.interface_id, 77);
  t.is(calls.advModelGets.length, 1);
});

test.serial('advmock getMock: 登录态 guest 成员 view 语义放行', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateGuestProject });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.advModelGets.length, 1);
});

test.serial('advmock getMock: token 归属项目经真实 checkAuth 以 dev 放行', async t => {
  // 接口 project_id 传字符串形态, 钉死 Number() 归一化不误伤(同 plugin-open-scope 先例)
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: '12' }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.interface_id, 77);
  // 放行经真实 checkAuth(归属项目内 token 得 dev → view 通过), 不靠守卫短路
  t.deepEqual(calls.checkAuthCalls, [['12', 'project', 'view']]);
});

test.serial('advmock getMock: token 非归属项目在既有守卫 406, 不触达 checkAuth 与 mock 读取', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 既有 token 归属守卫位于 checkAuth 之前: 越界请求不发起权限判定
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.advModelGets.length, 0);
});

// ---------- getCase: 空态收敛 + 登录态 view 校验 ----------

test.serial('advmock getCase: 期望不存在返回 408', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: null });
  const ctx = { query: { id: '100' }, body: null };

  await inst.getCase(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '期望不存在');
  t.deepEqual(calls.checkAuthCalls, []);
});

test.serial('advmock getCase: 接口不存在返回 408', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: ownedCase, interfaceData: null });
  const ctx = { query: { id: '100' }, body: null };

  await inst.getCase(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '接口不存在');
  t.deepEqual(calls.checkAuthCalls, []);
});

test.serial('advmock getCase: 登录态非成员(member)返回 406', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: ownedCase });
  const ctx = { query: { id: '100' }, body: null };

  await inst.getCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 判定域取期望所属接口的真实归属, 不采信请求自述
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'view']]);
});

test.serial('advmock getCase: 登录态 dev 成员放行返回期望数据', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject, caseData: ownedCase });
  const ctx = { query: { id: '100' }, body: null };

  await inst.getCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data._id, 100);
  t.is(calls.caseDels.length, 0);
});

test.serial('advmock getCase: 登录态 guest 成员 view 语义放行', async t => {
  const { inst } = createAdvMockInst({ ...loginMember, project: privateGuestProject, caseData: ownedCase });
  const ctx = { query: { id: '100' }, body: null };

  await inst.getCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data._id, 100);
});

// ---------- list: 空态收敛 + 登录态/token view 校验 ----------

test.serial('advmock list: 登录态非成员(member)返回 406 不触达期望列表读取', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 门禁以接口真实归属(12, 'project', 'view')触达真实权限链
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'view']]);
  t.is(calls.caseLists.length, 0);
});

test.serial('advmock list: 登录态 dev 成员放行返回期望列表且补全 username', async t => {
  const { inst, calls } = createAdvMockInst({
    ...loginMember,
    project: privateDevProject,
    caseListData: [listedCaseDoc]
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.length, 1);
  t.is(ctx.body.data[0]._id, 100);
  // 列表项经 toObject + username 补全后返回
  t.is(ctx.body.data[0].username, 'alice-7');
  t.deepEqual(calls.caseLists, [77]);
});

test.serial('advmock list: 接口不存在返回 408 不触达权限判定与列表读取', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, interfaceData: null });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '接口不存在');
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.caseLists.length, 0);
});

test.serial('advmock list: token 非归属项目经 checkAuth 严格域 406 不返回列表', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // list 无前置 token 守卫, 越界请求由 checkAuth 严格域拒绝(非归属 → member → view 不过),
  // 与 upMock/delCase/hideCase 同语义
  t.deepEqual(calls.checkAuthCalls, [[99, 'project', 'view']]);
  t.is(calls.caseLists.length, 0);
});

// ---------- list: userinfo 空值守卫回归(uid 失配 → 不得 TypeError 兜 400) ----------
// 背景: 期望创建者账号被删除后, caseModel.list 仍返回其期望, 而 userModel.findById
// 查无此人(null); 守卫缺失时 userinfo.username 抛 TypeError, 被 list 外层 catch 兜成
// 400(Cannot read properties of null)。三条用例(失配/命中/混合)共同钉住:
// 命中项 username 补全不回归, 失配项跳过补全且整体 errcode 0 放行。

test.serial('advmock list: 创建者账号已删除(uid 失配)errcode 0 放行且该 item 不含 username', async t => {
  const { inst, calls } = createAdvMockInst({
    ...loginMember,
    project: privateDevProject,
    caseListData: [orphanCaseDoc],
    // 反恒真: 失配路径必须真实发生过 findById 查询(null 由读取结果驱动, 非 stub 未接线)
    userFindById: () => null
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  // 区别于修复前行为: 守卫缺失时 TypeError 落 catch → errcode 400 + TypeError 文案
  t.not(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '成功！');
  t.is(ctx.body.data.length, 1);
  t.is(ctx.body.data[0]._id, 101);
  t.is(ctx.body.data[0].name, 'case-list-orphan');
  t.false('username' in ctx.body.data[0], 'uid 失配项不得携带 username 字段');
  // 反恒真: 确实按 item.uid 查过用户(未查即返回 0 说明 userinfo 补全路径被绕过)
  t.deepEqual(calls.userFindByIds, ['404']);
  t.deepEqual(calls.caseLists, [77]);
});

test.serial('advmock list: uid 命中用户时 username 正常补全(守卫不得吞掉既有补全)', async t => {
  const { inst, calls } = createAdvMockInst({
    ...loginMember,
    project: privateDevProject,
    caseListData: [listedCaseDoc]
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data[0].username, 'alice-7');
  t.deepEqual(calls.userFindByIds, ['7']);
});

test.serial('advmock list: 混合列表逐项独立处理, 失配项无 username 不中断后续补全', async t => {
  const { inst, calls } = createAdvMockInst({
    ...loginMember,
    project: privateDevProject,
    // 失配项在前: 若守卫缺失或循环被异常中断, 后续命中项断言即红
    caseListData: [orphanCaseDoc, listedCaseDoc],
    userFindById: uid => (uid === '404' ? null : { username: `alice-${uid}` })
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.not(ctx.body.errcode, 400);
  t.is(ctx.body.data.length, 2);
  t.is(ctx.body.data[0]._id, 101);
  t.false('username' in ctx.body.data[0], '失配项不得携带 username 字段');
  t.is(ctx.body.data[1]._id, 100);
  t.is(ctx.body.data[1].username, 'alice-7');
  // 反恒真: 两项都真实查过用户, 顺序即循环顺序(证明失配不短路循环)
  t.deepEqual(calls.userFindByIds, ['404', '7']);
});

// ---------- saveCase: 登录态 edit 校验 + 落库归属归一 + token 既有守卫 ----------

test.serial('advmock saveCase: 登录态非成员(member)返回 406 不落库', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 门禁以接口真实归属(12, 'project', 'edit')触达真实权限链
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'edit']]);
  t.is(calls.caseSaves.length, 0);
  t.is(calls.caseUps.length, 0);
});

test.serial('advmock saveCase: 登录态 dev 成员放行且落库 project_id 以接口真实归属为准', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject });
  // body 伪报 project_id=99: 落库值必须被归一回接口真实归属 12
  const ctx = createSaveCaseCtx({ project_id: 99 });

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
  t.is(calls.caseSaves[0].project_id, 12);
});

test.serial('advmock saveCase: 登录态项目创建者(owner)放行', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateOwnerProject });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
});

test.serial('advmock saveCase: 登录态全局 admin 放行', async t => {
  const { inst, calls } = createAdvMockInst({
    $uid: '5',
    $user: { _id: 5, role: 'admin', username: 'root' }
  });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
});

test.serial('advmock saveCase: 登录态 guest 成员 edit 被拒返回 406(最低角色边界)', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateGuestProject });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(calls.caseSaves.length, 0);
  t.is(calls.caseUps.length, 0);
});

test.serial('advmock saveCase: token 归属项目放行落库(严格域 dev → edit 通过)', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: '12' }
  });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
  // 落库归属以接口表为准(字符串 '12' 即真实归属)
  t.is(calls.caseSaves[0].project_id, '12');
  t.deepEqual(calls.checkAuthCalls, [['12', 'project', 'edit']]);
});

test.serial('advmock saveCase: token 非归属项目在既有守卫 406 不落库', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  // body 伪报成归属项目也拦: 判定基准是接口表真实归属
  const ctx = createSaveCaseCtx({ project_id: 12 });

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.caseSaves.length, 0);
  t.is(calls.caseUps.length, 0);
});

// ---------- upMock: 判空收敛 + 登录态/token edit 校验 + 落库归属归一 ----------

test.serial('advmock upMock: 登录态非成员(member)返回 40033 不落库不触达 mock 读取', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = createUpMockCtx({});

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 40033);
  t.is(ctx.body.errmsg, '没有权限');
  // 门禁以接口真实归属(12, 'project', 'edit')触达真实权限链, 不采信 body 自述
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'edit']]);
  t.is(calls.advModelGets.length, 0);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps.length, 0);
});

test.serial('advmock upMock: 登录态 dev 成员放行且落库 project_id 以接口真实归属为准(up 更新分支)', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject });
  // body 伪报 project_id=99: 鉴权域与落库值都必须归一回接口真实归属 12
  const ctx = createUpMockCtx({ project_id: 99 });

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.advUps.length, 1);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps[0].interface_id, 77);
  t.is(calls.advUps[0].project_id, 12);
  t.is(calls.advUps[0].uid, 5);
  t.is(calls.advUps[0].mock_script, 'const a = 1;');
  t.true(calls.advUps[0].enable);
});

test.serial('advmock upMock: dev 首次保存(mock 不存在)走 save 分支且落库归属归一', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject, mockData: null });
  const ctx = createUpMockCtx({ project_id: 99, enable: 'true' });

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.advSaves.length, 1);
  t.is(calls.advUps.length, 0);
  t.is(calls.advSaves[0].project_id, 12);
  // enable 归一: 非严格 true 一律落 false
  t.false(calls.advSaves[0].enable);
});

test.serial('advmock upMock: interface_id 指向不存在接口返回 408 不产生 upsert', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, interfaceData: null });
  const ctx = createUpMockCtx({});

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '接口不存在');
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.advModelGets.length, 0);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps.length, 0);
});

test.serial('advmock upMock: 缺少 interface_id 返回 408', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = createUpMockCtx({ interface_id: undefined });

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '缺少interface_id');
  t.is(calls.interfaceGets.length, 0);
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps.length, 0);
});

test.serial('advmock upMock: 缺少 project_id 返回 408', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember });
  const ctx = createUpMockCtx({ project_id: undefined });

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '缺少project_id');
  t.is(calls.interfaceGets.length, 0);
  t.deepEqual(calls.checkAuthCalls, []);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps.length, 0);
});

test.serial('advmock upMock: token 归属项目放行落库(严格域 dev → edit 通过)', async t => {
  // 接口 project_id 传字符串形态, 钉死 Number() 归一化不误伤(同 plugin-open-scope 先例)
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: '12' }
  });
  const ctx = createUpMockCtx({});

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.advUps.length, 1);
  t.is(calls.advSaves.length, 0);
  // 落库归属以接口表为准(字符串 '12' 即真实归属)
  t.is(calls.advUps[0].project_id, '12');
  t.deepEqual(calls.checkAuthCalls, [['12', 'project', 'edit']]);
});

test.serial('advmock upMock: token 非归属项目经 checkAuth 严格域 40033 不落库', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  // body 伪报成归属项目也拦: 鉴权基准是接口表真实归属 99
  const ctx = createUpMockCtx({ project_id: 12 });

  await inst.upMock(ctx);

  t.is(ctx.body.errcode, 40033);
  t.is(ctx.body.errmsg, '没有权限');
  // upMock 无前置 token 守卫, 越界请求由 checkAuth 严格域拒绝(非归属 → member → edit 不过),
  // 与 delCase/hideCase 同语义; getMock/saveCase 的前置守卫则不触达 checkAuth
  t.deepEqual(calls.checkAuthCalls, [[99, 'project', 'edit']]);
  t.is(calls.advModelGets.length, 0);
  t.is(calls.advSaves.length, 0);
  t.is(calls.advUps.length, 0);
});

// ---------- delCase: 空态收敛 + 登录态/token edit 校验 ----------

test.serial('advmock delCase: 期望不存在返回 408 不执行删除', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: null });
  const ctx = { request: { body: { id: '100' } }, body: null };

  await inst.delCase(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '期望不存在');
  t.is(calls.caseDels.length, 0);
  t.deepEqual(calls.checkAuthCalls, []);
});

test.serial('advmock delCase: 登录态非成员(member)返回 406 不删除', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: ownedCase });
  const ctx = { request: { body: { id: '100' } }, body: null };

  await inst.delCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'edit']]);
  t.is(calls.caseDels.length, 0);
});

test.serial('advmock delCase: 登录态 dev 成员放行删除', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject, caseData: ownedCase });
  const ctx = { request: { body: { id: '100' } }, body: null };

  await inst.delCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseDels.length, 1);
  t.is(calls.caseDels[0], '100');
});

test.serial('advmock delCase: token 归属项目放行删除(严格域 dev → edit 通过)', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    caseData: ownedCase
  });
  const ctx = { request: { body: { id: '100' } }, body: null };

  await inst.delCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseDels.length, 1);
});

test.serial('advmock delCase: token 非归属项目经 checkAuth 严格域 406 不删除', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    caseData: ownedCase,
    interfaceData: { _id: 77, project_id: 99 }
  });
  const ctx = { request: { body: { id: '100' } }, body: null };

  await inst.delCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.caseDels.length, 0);
});

// ---------- hideCase: 空态收敛 + 登录态/token edit 校验 ----------

test.serial('advmock hideCase: 期望不存在返回 408 不更新', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: null });
  const ctx = { request: { body: { id: '100', enable: false } }, body: null };

  await inst.hideCase(ctx);

  t.is(ctx.body.errcode, 408);
  t.is(ctx.body.errmsg, '期望不存在');
  t.is(calls.caseUps.length, 0);
  t.deepEqual(calls.checkAuthCalls, []);
});

test.serial('advmock hideCase: 登录态非成员(member)返回 406 不更新', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, caseData: ownedCase });
  const ctx = { request: { body: { id: '100', enable: false } }, body: null };

  await inst.hideCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.deepEqual(calls.checkAuthCalls, [[12, 'project', 'edit']]);
  t.is(calls.caseUps.length, 0);
});

test.serial('advmock hideCase: 登录态 dev 成员放行更新', async t => {
  const { inst, calls } = createAdvMockInst({ ...loginMember, project: privateDevProject, caseData: ownedCase });
  const ctx = { request: { body: { id: '100', enable: false } }, body: null };

  await inst.hideCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseUps.length, 1);
  t.deepEqual(calls.caseUps[0], { id: '100', case_enable: false });
});

test.serial('advmock hideCase: token 非归属项目经 checkAuth 严格域 406 不更新', async t => {
  const { inst, calls } = createAdvMockInst({
    ...tokenUser,
    tokenAuth: true,
    $tokenProjectId: 12,
    caseData: ownedCase,
    interfaceData: { _id: 77, project_id: 99 }
  });
  const ctx = { request: { body: { id: '100', enable: false } }, body: null };

  await inst.hideCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.caseUps.length, 0);
});

// 收尾兜底: 本文件不触发真实 mongoose 连接, 此处仅防御性清理常驻句柄
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

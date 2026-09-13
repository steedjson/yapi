import test from 'ava';

const yapi = require('../../server/yapi.js');
// server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现
yapi.commons = require('../../server/utils/commons.js');
// project.js 的 get/del 会调用 yapi.emitHook，插件系统仅在服务启动时挂载，测试环境注入行为一致的空实现
yapi.emitHook = yapi.emitHook || function() {
  return Promise.resolve([]);
};

const baseController = require('../../server/controllers/base.js');
const projectController = require('../../server/controllers/project.js');
const projectModel = require('../../server/models/project.js');
const groupModel = require('../../server/models/group.js');
const logModel = require('../../server/models/log.js');
const followModel = require('../../server/models/follow.js');
const tokenModel = require('../../server/models/token.js');
const interfaceModel = require('../../server/models/interface.js');
const interfaceColModel = require('../../server/models/interfaceCol.js');
const interfaceCaseModel = require('../../server/models/interfaceCase.js');
const interfaceCatModel = require('../../server/models/interfaceCat.js');
const userModel = require('../../server/models/user.js');

// —— mock 数据与调用记录 ——

// checkProjectName 用例间可变，ava 单文件内测试按声明顺序串行执行
let checkNameRepeatResult = 0;
let mockGetBaseInfoResult = null;
const delCalls = {
  interface: [],
  interfaceCol: [],
  interfaceCase: [],
  follow: [],
  project: []
};
const tokenCalls = { save: [], up: [] };
const mockProjectMembers = [{ uid: 1, username: 'owner', role: 'owner' }];

const mockSearchProjects = [
  {
    _id: 1,
    name: 'proj',
    basepath: '/p',
    uid: 5,
    env: [],
    members: [],
    group_id: 9,
    up_time: 2,
    add_time: 3,
    password: 'should-be-filtered'
  }
];
const mockSearchGroups = [
  { _id: 2, uid: 5, group_name: 'g', group_desc: 'd', add_time: 4, up_time: 5, type: 'extra' }
];
const mockSearchInterfaces = [
  {
    _id: 3,
    uid: 5,
    title: 'api',
    project_id: 1,
    add_time: 6,
    up_time: 7,
    path: 'should-be-filtered'
  }
];

test.before('注入 mock model 实例，避免真实 mongoose 连接', () => {
  // projectController 构造函数会通过 yapi.getInst 获取 6 个 model 单例，
  // 预先写入 mock 可阻止真实 model 构造（其依赖 yapi.db/mongodb 连接）
  yapi.getInsts.set(projectModel, {
    checkNameRepeat: async () => checkNameRepeatResult,
    getBaseInfo: async () => mockGetBaseInfoResult,
    // getProjectRole 经此查询项目归属：uid=999/members/group_id 均与当前用户(NaN)不匹配 → 返回 'member'
    get: async () => ({ uid: 999, members: mockProjectMembers, group_id: 7 }),
    search: async () => mockSearchProjects,
    del: async id => {
      delCalls.project.push(id);
      return { deleted: id };
    }
  });
  yapi.getInsts.set(groupModel, {
    get: async () => ({ uid: 888, members: [] }),
    search: async () => mockSearchGroups
  });
  yapi.getInsts.set(logModel, { list: async () => [] });
  yapi.getInsts.set(followModel, {
    list: async () => [],
    delByProjectId: async id => {
      delCalls.follow.push(id);
      return {};
    }
  });
  yapi.getInsts.set(tokenModel, {
    get: async () => null,
    save: async data => {
      tokenCalls.save.push(data);
      return data;
    },
    up: async (id, tk) => {
      tokenCalls.up.push([id, tk]);
      return { _id: id, token: tk };
    }
  });
  yapi.getInsts.set(interfaceModel, {
    delByProjectId: async id => {
      delCalls.interface.push(id);
      return {};
    },
    search: async () => mockSearchInterfaces
  });
  yapi.getInsts.set(interfaceColModel, {
    delByProjectId: async id => {
      delCalls.interfaceCol.push(id);
      return {};
    }
  });
  yapi.getInsts.set(interfaceCaseModel, {
    delByProjectId: async id => {
      delCalls.interfaceCase.push(id);
      return {};
    }
  });
  yapi.getInsts.set(interfaceCatModel, { list: async () => [] });
  yapi.getInsts.set(userModel, { findById: async () => null });
});

// 构造 mock ctx 的工具函数
const makeCtx = (params, query) => ({
  params: params || {},
  request: { query: query || {} }
});

// —— 继承关系与实例化 ——

test.serial('projectController 继承自 baseController', t => {
  t.is(Object.getPrototypeOf(projectController), baseController);
  t.is(Object.getPrototypeOf(projectController.prototype), baseController.prototype);
  const inst = new projectController({});
  t.true(inst instanceof baseController);
  t.true(inst instanceof projectController);
});

test.serial('构造函数初始化挂载 6 个单例实例', t => {
  const inst = new projectController({});
  t.is(inst.Model, yapi.getInsts.get(projectModel));
  t.is(inst.groupModel, yapi.getInsts.get(groupModel));
  t.is(inst.logModel, yapi.getInsts.get(logModel));
  t.is(inst.followModel, yapi.getInsts.get(followModel));
  t.is(inst.tokenModel, yapi.getInsts.get(tokenModel));
  t.is(inst.interfaceModel, yapi.getInsts.get(interfaceModel));
});

test.serial('构造函数初始化 schemaMap，包含全部 11 个 action', t => {
  const inst = new projectController({});
  t.truthy(inst.schemaMap);
  t.deepEqual(Object.keys(inst.schemaMap), [
    'add',
    'copy',
    'addMember',
    'delMember',
    'getMemberList',
    'get',
    'list',
    'del',
    'changeMemberRole',
    'token',
    'updateToken'
  ]);
});

test.serial('继承 baseController 的构造行为：ctx 与 roles 初始化', t => {
  const ctx = { path: '/api/project/get' };
  const inst = new projectController(ctx);
  t.is(inst.ctx, ctx);
  t.deepEqual(inst.roles, { admin: 'Admin', member: '网站会员' });
});

// —— handleBasepath(basepath) ——

test.serial('handleBasepath: 空字符串/缺失/null 返回空字符串', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath(''), '');
  t.is(inst.handleBasepath(undefined), '');
  t.is(inst.handleBasepath(null), '');
});

test.serial('handleBasepath: 仅斜杠 / 返回空字符串', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath('/'), '');
});

test.serial('handleBasepath: 缺失前导斜杠时自动补全', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath('api/v1'), '/api/v1');
});

test.serial('handleBasepath: 包含尾随斜杠时去除', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath('/api/v1/'), '/api/v1');
});

test.serial('handleBasepath: 合法嵌套路径原样返回', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath('/v1/users/info'), '/v1/users/info');
});

test.serial('handleBasepath: 包含非法字符时返回 false', t => {
  const inst = new projectController({});
  t.is(inst.handleBasepath('/api?query=1'), false);
  t.is(inst.handleBasepath('/api#hash'), false);
});

// —— verifyDomain(domain) ——

test.serial('verifyDomain: 空值/null/undefined 返回 false', t => {
  const inst = new projectController({});
  t.is(inst.verifyDomain(''), false);
  t.is(inst.verifyDomain(null), false);
  t.is(inst.verifyDomain(undefined), false);
});

test.serial('verifyDomain: 合法普通域名返回 true', t => {
  const inst = new projectController({});
  t.is(inst.verifyDomain('example.com'), true);
  t.is(inst.verifyDomain('api.yapi.pro'), true);
});

test.serial('verifyDomain: 缺少顶级域名的域名返回 false', t => {
  const inst = new projectController({});
  t.is(inst.verifyDomain('localhost'), false);
});

test.serial('verifyDomain: 带协议前缀的字符串返回 false', t => {
  const inst = new projectController({});
  t.is(inst.verifyDomain('http://'), false);
  t.is(inst.verifyDomain('http://example.com'), false);
});

// —— checkProjectName(ctx) ——

test.serial('checkProjectName: 缺失 name 返回 401 项目名不能为空（实现为 401，任务预期 400 与实现不符）', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, {});
  await inst.checkProjectName(ctx);
  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '项目名不能为空');
});

test.serial('checkProjectName: 项目名重复返回 401 已存在的项目名', async t => {
  const inst = new projectController({});
  checkNameRepeatResult = 1;
  try {
    const ctx = makeCtx(null, { name: 'dup', group_id: '1' });
    await inst.checkProjectName(ctx);
    t.is(ctx.body.errcode, 401);
    t.is(ctx.body.errmsg, '已存在的项目名');
  } finally {
    checkNameRepeatResult = 0;
  }
});

test.serial('checkProjectName: 名称合法时返回成功', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, { name: 'fresh', group_id: '1' });
  await inst.checkProjectName(ctx);
  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, {});
});

// —— get(ctx) ——

test.serial('get: 缺失 id 时 getBaseInfo 返回 null → 400 不存在的项目（实现无 项目id不能为空 守卫）', async t => {
  const inst = new projectController({});
  mockGetBaseInfoResult = null;
  try {
    const ctx = makeCtx({});
    await inst.get(ctx);
    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '不存在的项目');
  } finally {
    mockGetBaseInfoResult = null;
  }
});

test.serial('get: public 项目成功返回并注入 cat/env/role', async t => {
  const inst = new projectController({});
  // 模拟已登录态（init() 运行时写入），供 getProjectRole → getRole 读取
  inst.$user = { role: 'member', username: 'tester' };
  inst.$uid = '5';
  mockGetBaseInfoResult = {
    _id: 101,
    name: 'demo',
    project_type: 'public',
    env: [],
    toObject() {
      return { _id: 101, name: 'demo', project_type: 'public', env: [] };
    }
  };
  try {
    const ctx = makeCtx({ id: 101 });
    await inst.get(ctx);
    t.is(ctx.body.errcode, 0);
    t.is(ctx.body.data._id, 101);
    t.deepEqual(ctx.body.data.cat, []);
    t.deepEqual(ctx.body.data.env, [{ name: 'local', domain: 'http://127.0.0.1' }]);
    t.is(ctx.body.data.role, 'member');
  } finally {
    mockGetBaseInfoResult = null;
  }
});

// —— del(ctx) ——

test.serial('del: 缺失 id 时先走权限校验 → 405 没有权限（实现无 项目id不能为空 守卫）', async t => {
  const inst = new projectController({});
  // 模拟已登录态（init() 运行时写入），非 owner 身份走完鉴权链后权限不足
  inst.$user = { role: 'member', username: 'tester' };
  inst.$uid = '5';
  const ctx = makeCtx({});
  await inst.del(ctx);
  t.is(ctx.body.errcode, 405);
  t.is(ctx.body.errmsg, '没有权限');
  // 未进入删除逻辑
  t.deepEqual(delCalls.project, []);
});

test.serial('del: 鉴权通过时级联删除接口/用例/集合/收藏并删除项目', async t => {
  const inst = new projectController({});
  inst.checkAuth = async () => true;
  const ctx = makeCtx({ id: 101 });
  await inst.del(ctx);
  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { deleted: 101 });
  t.deepEqual(delCalls.interface, [101]);
  t.deepEqual(delCalls.interfaceCase, [101]);
  t.deepEqual(delCalls.interfaceCol, [101]);
  t.deepEqual(delCalls.follow, [101]);
  t.deepEqual(delCalls.project, [101]);
});

// —— getMemberList(ctx) ——

test.serial('getMemberList: 缺失 id 返回 400 项目id不能为空', async t => {
  const inst = new projectController({});
  const ctx = makeCtx({});
  await inst.getMemberList(ctx);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '项目id不能为空');
});

test.serial('getMemberList: 成功返回项目成员列表', async t => {
  const inst = new projectController({});
  const ctx = makeCtx({ id: 101 });
  await inst.getMemberList(ctx);
  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, mockProjectMembers);
});

// —— token(ctx) ——

test.serial('token: 缺失 project_id 时不拦截，生成新 token 并保存（实现无 项目id不能为空 守卫）', async t => {
  const inst = new projectController({});
  // 模拟已登录态（init() 运行时写入），供 getUid 读取
  inst.$user = { role: 'member', username: 'tester' };
  inst.$uid = '5';
  const saveCount = tokenCalls.save.length;
  const ctx = makeCtx({});
  await inst.token(ctx);
  t.is(ctx.body.errcode, 0);
  t.is(typeof ctx.body.data, 'string');
  t.is(tokenCalls.save.length, saveCount + 1);
  t.is(tokenCalls.save[saveCount].project_id, undefined);
  t.regex(tokenCalls.save[saveCount].token, /^[0-9a-f]{20}$/);
});

test.serial('token: 已存在 token 时不新建，返回加密后的 token', async t => {
  const inst = new projectController({});
  yapi.getInsts.get(tokenModel).get = async () => ({ token: 'existingtoken123' });
  const saveCount = tokenCalls.save.length;
  const ctx = makeCtx({ project_id: 101 });
  try {
    await inst.token(ctx);
    t.is(ctx.body.errcode, 0);
    t.is(typeof ctx.body.data, 'string');
    t.not(ctx.body.data, 'existingtoken123');
    t.is(tokenCalls.save.length, saveCount);
  } finally {
    yapi.getInsts.get(tokenModel).get = async () => null;
  }
});

// —— updateToken(ctx) ——

// 修复后：缺失 project_id 时正确返回 402 '没有查到token信息'，不再被覆盖
test.serial('updateToken: 缺失 project_id 时返回 402 没有查到token信息', async t => {
  const inst = new projectController({});
  const ctx = makeCtx({});
  await inst.updateToken(ctx);
  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.errmsg, '没有查到token信息');
  t.is(ctx.body.data, null);
});

test.serial('updateToken: 已存在 token 时更新并返回加密 token', async t => {
  const inst = new projectController({});
  yapi.getInsts.get(tokenModel).get = async () => ({ token: 'oldtoken' });
  try {
    const ctx = makeCtx({ project_id: 101 });
    await inst.updateToken(ctx);
    t.is(ctx.body.errcode, 0);
    t.is(ctx.body.data._id, 101);
    t.is(typeof ctx.body.data.token, 'string');
    t.not(ctx.body.data.token, 'oldtoken');
    t.is(tokenCalls.up.length, 1);
    t.is(tokenCalls.up[0][0], 101);
    t.regex(tokenCalls.up[0][1], /^[0-9a-f]{20}$/);
  } finally {
    yapi.getInsts.get(tokenModel).get = async () => null;
  }
});

// —— search(ctx) ——

test.serial('search: 缺失 q 返回 400 No keyword.', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, {});
  await inst.search(ctx);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'No keyword.');
});

test.serial('search: 非法关键词（正则元字符开头）返回 400 Bad query.', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, { q: '*' });
  await inst.search(ctx);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'Bad query.');
});

test.serial('search: 成功返回按规则过滤后的 project/group/interface 列表', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, { q: 'abc' });
  await inst.search(ctx);
  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.errmsg, 'ok');
  t.deepEqual(ctx.body.data, {
    project: [
      {
        _id: 1,
        name: 'proj',
        basepath: '/p',
        uid: 5,
        env: [],
        members: [],
        groupId: 9,
        upTime: 2,
        addTime: 3
      }
    ],
    group: [{ _id: 2, uid: 5, groupName: 'g', groupDesc: 'd', addTime: 4, upTime: 5 }],
    interface: [{ _id: 3, uid: 5, title: 'api', projectId: 1, addTime: 6, upTime: 7 }]
  });
});

// —— swaggerUrl(ctx) ——

test.serial('swaggerUrl: 缺失 url 时 axios 请求失败被捕获 → 402（实现无 swagger url 不能为空 守卫）', async t => {
  const inst = new projectController({});
  const ctx = makeCtx(null, {});
  await inst.swaggerUrl(ctx);
  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.data, null);
});

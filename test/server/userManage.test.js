import test from 'ava';

const yapi = require('../../server/yapi.js');
const userModel = require('../../server/models/user.js');
const groupModel = require('../../server/models/group.js');
const userController = require('../../server/controllers/user.js');

// 记录 handlePrivateGroup 对 group model 的写入, 供 add/handleThirdLogin 用例断言
const groupCalls = { save: [] };

test.before('挂载真实 commons 并注入 group model mock, 避免真实 mongoose 连接', () => {
  // server/app.js 运行时才挂载 yapi.commons, 测试环境手动挂载真实实现
  yapi.commons = require('../../server/utils/commons.js');
  yapi.getInsts.set(groupModel, {
    save: async data => {
      groupCalls.save.push(data);
      return data;
    }
  });
});

/**
 * 构造带 cookies spy 的 mock Koa 上下文(与 test/server/user.test.js 保持一致)。
 * @param {any} body 模拟 request.body
 * @param {any} query 模拟 request.query
 * @returns {any} 含 ctx 与 cookies 调用记录的对象
 */
function createMockCtx(body = {}, query = {}) {
  const cookieCalls = [];
  const cookies = {
    set(...args) {
      cookieCalls.push(args);
    },
    get() {
      return undefined;
    }
  };
  const ctx = {
    request: { body, query },
    query: query,
    cookies: cookies,
    body: null,
    set() {},
    redirect() {}
  };
  return { ctx: ctx, cookieCalls: cookieCalls };
}

/**
 * 注入可记录调用的 user model mock, 并以指定登录态构造控制器实例。
 * 默认构造 admin(uid=1) 登录态; 模型交互全部记录在 calls 中。
 * @param {any} overrides 覆盖 body/query/登录态/模型返回值的配置
 * @returns {any} { inst, ctx, cookieCalls, calls }
 */
function createInst(overrides = {}) {
  const calls = {
    save: [],
    update: [],
    findById: [],
    checkRepeat: [],
    listWithPaging: [],
    listCount: [],
    findByEmail: []
  };
  yapi.getInsts.set(userModel, {
    save: async data => {
      calls.save.push(data);
      return Object.assign({ _id: 99, study: false, disabled: false, type: 'site' }, data);
    },
    findById: async id => {
      calls.findById.push(id);
      return overrides.findByIdResult === undefined ? null : overrides.findByIdResult;
    },
    update: async (id, data) => {
      calls.update.push([id, data]);
      return { _id: id, ok: 1 };
    },
    checkRepeat: async email => {
      calls.checkRepeat.push(email);
      return overrides.checkRepeatCount || 0;
    },
    listWithPaging: async (page, limit, keyword) => {
      calls.listWithPaging.push([page, limit, keyword]);
      return overrides.listWithPagingResult || [];
    },
    listCount: async keyword => {
      calls.listCount.push(keyword);
      return overrides.listCountResult || 0;
    },
    findByEmail: async email => {
      calls.findByEmail.push(email);
      return overrides.findByEmailResult === undefined ? null : overrides.findByEmailResult;
    }
  });
  const mock = createMockCtx(overrides.body || {}, overrides.query || {});
  const inst = new userController(mock.ctx);
  inst.$uid = overrides.uid === undefined ? 1 : overrides.uid;
  inst.$user = { role: overrides.role || 'admin', username: 'admin', email: 'admin@admin.com' };
  return { inst: inst, ctx: mock.ctx, cookieCalls: mock.cookieCalls, calls: calls };
}

/**
 * 构造登录/第三方登录共用的既有用户记录。
 * @param {boolean|undefined} disabled 禁用状态, undefined 模拟旧数据无该字段
 * @returns {any} 用户记录
 */
function buildLoginUser(disabled) {
  const user = {
    _id: 22,
    username: 'bob',
    email: 'bob@example.com',
    role: 'member',
    passsalt: 'salt456',
    password: yapi.commons.generatePassword('pw123456', 'salt456'),
    add_time: 1700000000,
    up_time: 1700000001,
    study: false
  };
  if (disabled !== undefined) {
    user.disabled = disabled;
  }
  return user;
}

// ---------- add ----------

test.serial('add admin 成功: save 入参为 generatePassword 加密格式且显式 role=admin 生效', async t => {
  const { inst, ctx, cookieCalls, calls } = createInst({
    body: { username: 'carol', email: 'carol@example.com', password: 'pw123456', role: 'admin' }
  });
  const groupSaveCount = groupCalls.save.length;

  await inst.add(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.save.length, 1);
  const saved = calls.save[0];
  t.is(saved.username, 'carol');
  t.is(saved.email, 'carol@example.com');
  t.is(saved.role, 'admin');
  t.is(saved.type, 'site');
  t.true(typeof saved.passsalt === 'string' && saved.passsalt.length > 0);
  // password 必须是 generatePassword(明文, 随机盐) 的加密结果
  t.is(saved.password, yapi.commons.generatePassword('pw123456', saved.passsalt));
  t.true(typeof saved.add_time === 'number');
  t.true(typeof saved.up_time === 'number');
  // 会为新建用户建立私人分组
  t.is(groupCalls.save.length, groupSaveCount + 1);
  t.is(groupCalls.save[groupSaveCount].uid, 99);
  t.is(groupCalls.save[groupSaveCount].group_name, 'User-99');
  t.is(groupCalls.save[groupSaveCount].type, 'private');
  // 管理员创建的是其他用户, 不替其建立登录态
  t.is(cookieCalls.length, 0);
  // 返回记录脱敏: 不含 password/passsalt
  t.false('password' in ctx.body.data);
  t.false('passsalt' in ctx.body.data);
  t.deepEqual(ctx.body.data, {
    uid: 99,
    username: 'carol',
    email: 'carol@example.com',
    role: 'admin',
    type: 'site',
    add_time: saved.add_time,
    up_time: saved.up_time,
    study: false,
    disabled: false
  });
});

test.serial('add 缺省 role 时回落为 member', async t => {
  const { inst, ctx, calls } = createInst({
    body: { username: 'carol', email: 'carol@example.com', password: 'pw123456' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.save[0].role, 'member');
  t.is(ctx.body.data.role, 'member');
});

test.serial('add 非法 role 值返回 400 role仅允许admin或member', async t => {
  const { inst, ctx, calls } = createInst({
    body: { username: 'carol', email: 'carol@example.com', password: 'pw123456', role: 'owner' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'role仅允许admin或member');
  t.is(calls.save.length, 0);
});

test.serial('add email 重复返回 401 该email已经注册', async t => {
  const { inst, ctx, calls } = createInst({
    body: { username: 'carol', email: 'dup@example.com', password: 'pw123456' },
    checkRepeatCount: 1
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '该email已经注册');
  t.deepEqual(calls.checkRepeat, ['dup@example.com']);
  t.is(calls.save.length, 0);
});

test.serial('add 缺失 username 返回 400 用户名不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { email: 'carol@example.com', password: 'pw123456' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '用户名不能为空');
  t.is(calls.save.length, 0);
});

test.serial('add 缺失 email 返回 400 邮箱不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { username: 'carol', password: 'pw123456' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '邮箱不能为空');
  t.is(calls.checkRepeat.length, 0);
  t.is(calls.save.length, 0);
});

test.serial('add 缺失 password 返回 400 密码不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { username: 'carol', email: 'carol@example.com' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '密码不能为空');
  t.is(calls.save.length, 0);
});

test.serial('add 非 admin 返回 401 没有权限', async t => {
  const { inst, ctx, calls } = createInst({
    role: 'member',
    body: { username: 'carol', email: 'carol@example.com', password: 'pw123456' }
  });

  await inst.add(ctx);

  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.checkRepeat.length, 0);
  t.is(calls.save.length, 0);
});

// ---------- resetPassword ----------

test.serial('resetPassword 成功: update 入参为新盐加密的 password 与 up_time', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, password: 'newpw888' },
    findByIdResult: { _id: 22, username: 'bob', passsalt: 'oldsalt' }
  });

  await inst.resetPassword(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.update.length, 1);
  const updateUid = calls.update[0][0];
  const updateData = calls.update[0][1];
  t.is(updateUid, 22);
  t.true(typeof updateData.passsalt === 'string' && updateData.passsalt.length > 0);
  // 盐必须重新生成, 使原密码与旧登录态失效
  t.not(updateData.passsalt, 'oldsalt');
  t.is(updateData.password, yapi.commons.generatePassword('newpw888', updateData.passsalt));
  t.true(typeof updateData.up_time === 'number');
  t.deepEqual(Object.keys(updateData).sort(), ['passsalt', 'password', 'up_time']);
  t.deepEqual(ctx.body.data, { _id: 22, ok: 1 });
});

test.serial('resetPassword uid 不存在返回 400 uid不存在', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 404, password: 'newpw888' }
  });

  await inst.resetPassword(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不存在');
  t.is(calls.update.length, 0);
});

test.serial('resetPassword 缺失 uid 返回 400 uid不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { password: 'newpw888' }
  });

  await inst.resetPassword(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不能为空');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

test.serial('resetPassword 缺失 password 返回 400 密码不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22 }
  });

  await inst.resetPassword(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '密码不能为空');
  t.is(calls.update.length, 0);
});

test.serial('resetPassword 非 admin 返回 401 没有权限', async t => {
  const { inst, ctx, calls } = createInst({
    role: 'member',
    body: { uid: 22, password: 'newpw888' }
  });

  await inst.resetPassword(ctx);

  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

// ---------- changeStatus ----------

test.serial('changeStatus 禁用成功: update 入参为 {disabled:true, up_time}', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, disabled: true },
    findByIdResult: { _id: 22, username: 'bob', disabled: false }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.update.length, 1);
  const updateUid = calls.update[0][0];
  const updateData = calls.update[0][1];
  t.is(updateUid, 22);
  t.is(updateData.disabled, true);
  t.true(typeof updateData.up_time === 'number');
  t.deepEqual(Object.keys(updateData).sort(), ['disabled', 'up_time']);
  t.deepEqual(ctx.body.data, { _id: 22, ok: 1 });
});

test.serial('changeStatus 启用成功: update 入参为 {disabled:false, up_time}', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, disabled: false },
    findByIdResult: { _id: 22, username: 'bob', disabled: true }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.update.length, 1);
  const updateData = calls.update[0][1];
  t.is(updateData.disabled, false);
  t.true(typeof updateData.up_time === 'number');
  t.deepEqual(Object.keys(updateData).sort(), ['disabled', 'up_time']);
});

test.serial('changeStatus 禁用自己返回 403 不能禁用自己', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 1, disabled: true },
    findByIdResult: { _id: 1, username: 'admin' }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 403);
  t.is(ctx.body.errmsg, '不能禁用自己');
  t.is(calls.update.length, 0);
});

test.serial('changeStatus disabled 非布尔值返回 400 disabled参数需要为布尔值', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, disabled: 'true' }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'disabled参数需要为布尔值');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

test.serial('changeStatus uid 不存在返回 400 uid不存在', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 404, disabled: true }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不存在');
  t.is(calls.update.length, 0);
});

test.serial('changeStatus 缺失 uid 返回 400 uid不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { disabled: true }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不能为空');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

test.serial('changeStatus 非 admin 返回 401 没有权限', async t => {
  const { inst, ctx, calls } = createInst({
    role: 'member',
    body: { uid: 22, disabled: true }
  });

  await inst.changeStatus(ctx);

  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

// ---------- changeRole ----------

test.serial('changeRole 提升 admin 成功: update 入参为 {role:"admin", up_time}', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, role: 'admin' },
    findByIdResult: { _id: 22, username: 'bob', role: 'member' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.update.length, 1);
  const updateUid = calls.update[0][0];
  const updateData = calls.update[0][1];
  t.is(updateUid, 22);
  t.is(updateData.role, 'admin');
  t.true(typeof updateData.up_time === 'number');
  t.deepEqual(Object.keys(updateData).sort(), ['role', 'up_time']);
  t.deepEqual(ctx.body.data, { _id: 22, ok: 1 });
});

test.serial('changeRole 降级 member 成功: update 入参为 {role:"member", up_time}', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, role: 'member' },
    findByIdResult: { _id: 22, username: 'bob', role: 'admin' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.update.length, 1);
  const updateData = calls.update[0][1];
  t.is(updateData.role, 'member');
  t.true(typeof updateData.up_time === 'number');
  t.deepEqual(Object.keys(updateData).sort(), ['role', 'up_time']);
});

test.serial('changeRole 修改自己的角色返回 403 不能修改自己的角色', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 1, role: 'member' },
    findByIdResult: { _id: 1, username: 'admin', role: 'admin' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 403);
  t.is(ctx.body.errmsg, '不能修改自己的角色');
  t.is(calls.update.length, 0);
});

test.serial('changeRole 非法 role 返回 400 role仅允许admin或member', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 22, role: 'owner' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'role仅允许admin或member');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

test.serial('changeRole uid 不存在返回 400 uid不存在', async t => {
  const { inst, ctx, calls } = createInst({
    body: { uid: 404, role: 'member' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不存在');
  t.is(calls.update.length, 0);
});

test.serial('changeRole 缺失 uid 返回 400 uid不能为空', async t => {
  const { inst, ctx, calls } = createInst({
    body: { role: 'member' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不能为空');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

test.serial('changeRole 非 admin 返回 401 没有权限', async t => {
  const { inst, ctx, calls } = createInst({
    role: 'member',
    body: { uid: 22, role: 'member' }
  });

  await inst.changeRole(ctx);

  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.findById.length, 0);
  t.is(calls.update.length, 0);
});

// ---------- list keyword ----------

test.serial('list 携带 keyword 时透传给 listWithPaging 与 listCount', async t => {
  const { inst, ctx, calls } = createInst({
    query: { page: '2', limit: '5', keyword: 'ali' },
    listWithPagingResult: [{ _id: 11, username: 'alice', disabled: false }],
    listCountResult: 3
  });

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.listWithPaging, [['2', '5', 'ali']]);
  t.deepEqual(calls.listCount, ['ali']);
  t.deepEqual(ctx.body.data, {
    count: 3,
    total: 1,
    list: [{ _id: 11, username: 'alice', disabled: false }]
  });
});

test.serial('list 无 keyword 时按原行为收到 undefined', async t => {
  const { inst, ctx, calls } = createInst({
    query: { page: '1', limit: '10' }
  });

  await inst.list(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(calls.listWithPaging, [['1', '10', undefined]]);
  t.deepEqual(calls.listCount, [undefined]);
});

test.serial('list 非法 keyword 返回 400 Bad query. 且不触达模型', async t => {
  const { inst, ctx, calls } = createInst({
    query: { page: '1', limit: '10', keyword: 'a?b' }
  });

  await inst.list(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'Bad query.');
  t.is(calls.listWithPaging.length, 0);
  t.is(calls.listCount.length, 0);
});

// ---------- login 禁用拦截 ----------

test.serial('login 被禁用账号即使密码正确也返回 403 且不写登录 cookie', async t => {
  const { inst, ctx, cookieCalls, calls } = createInst({
    body: { email: 'bob@example.com', password: 'pw123456' },
    findByEmailResult: buildLoginUser(true)
  });

  await inst.login(ctx);

  t.is(ctx.body.errcode, 403);
  t.is(ctx.body.errmsg, '账号已被禁用，请联系管理员');
  t.is(ctx.body.data, null);
  // 密码校验与登录态写入都不应发生
  t.deepEqual(calls.findByEmail, ['bob@example.com']);
  t.is(cookieCalls.length, 0);
});

test.serial('login 正常用户密码正确时登录成功并写入两个 cookie', async t => {
  const { inst, ctx, cookieCalls } = createInst({
    body: { email: 'bob@example.com', password: 'pw123456' },
    findByEmailResult: buildLoginUser(false)
  });

  await inst.login(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.uid, 22);
  t.is(ctx.body.data.role, 'member');
  t.is(ctx.body.data.type, 'site');
  t.is(cookieCalls.length, 2);
});

test.serial('login 旧数据无 disabled 字段视为启用, 登录不受影响', async t => {
  const { inst, ctx, cookieCalls } = createInst({
    body: { email: 'bob@example.com', password: 'pw123456' },
    findByEmailResult: buildLoginUser(undefined)
  });

  await inst.login(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(cookieCalls.length, 2);
});

// ---------- handleThirdLogin 禁用拦截(loginByToken/getLdapAuth 共用漏斗) ----------

test.serial('handleThirdLogin 既有用户被禁用时抛错且不发登录 cookie', async t => {
  const originError = console.error;
  const errorCalls = [];
  console.error = (...args) => {
    errorCalls.push(args);
  };
  try {
    const { inst, ctx, cookieCalls, calls } = createInst({
      findByEmailResult: buildLoginUser(true)
    });

    let caught = null;
    try {
      await inst.handleThirdLogin('bob@example.com', 'bob');
    } catch (e) {
      caught = e;
    }

    t.truthy(caught);
    t.is(caught.message, 'third_login: 账号已被禁用，请联系管理员');
    t.is(cookieCalls.length, 0);
    t.is(calls.save.length, 0);
  } finally {
    console.error = originError;
  }
});

test.serial('handleThirdLogin 既有正常用户直接复用登录态并写 cookie', async t => {
  const { inst, ctx, cookieCalls, calls } = createInst({
    findByEmailResult: buildLoginUser(undefined)
  });

  const result = await inst.handleThirdLogin('bob@example.com', 'bob');

  t.is(result, true);
  t.is(cookieCalls.length, 2);
  t.is(calls.save.length, 0);
});

import test from 'ava';

const jwt = require('jsonwebtoken');
const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const userModel = require('../../server/models/user.js');
const avatarModel = require('../../server/models/avatar.js');
const userController = require('../../server/controllers/user.js');

// 模拟用户数据，供 search 成功用例断言 filterRes 字段映射
const mockSearchUsers = [
  {
    _id: 11,
    username: 'alice',
    email: 'alice@example.com',
    role: 'member',
    add_time: 1700000000,
    up_time: 1700000001,
    password: 'should-be-filtered',
    passsalt: 'should-be-filtered'
  }
];

test.before('注入 mock model 实例，避免真实 mongoose 连接', () => {
  // yapi.getInst 按 model 类缓存实例，预先写入 mock 可阻止真实 model 构造（其依赖 yapi.db/mongodb）
  yapi.getInsts.set(userModel, {
    findByEmail: async () => null,
    findById: async () => null,
    checkRepeat: async () => 0,
    update: async () => ({}),
    search: async () => mockSearchUsers
  });
  yapi.getInsts.set(avatarModel, {
    up: async (uid, basecode, type) => ({ uid, type, size: basecode.length })
  });
  // server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现
  yapi.commons = require('../../server/utils/commons.js');
});

/**
 * 构造带 cookies spy 的 mock Koa 上下文。
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

test('userController 继承自 baseController 且实例化时挂载 Model 与 ctx', t => {
  t.is(Object.getPrototypeOf(userController), baseController);
  t.is(Object.getPrototypeOf(userController.prototype), baseController.prototype);
  const { ctx } = createMockCtx();
  const inst = new userController(ctx);
  t.true(inst instanceof baseController);
  t.true(inst instanceof userController);
  // 构造函数中将 this.Model 挂载为 yapi.getInst(userModel) 返回的单例实例
  t.is(inst.Model, yapi.getInst(userModel));
  t.is(inst.ctx, ctx);
});

test('setLoginCookie 写入 _yapi_token(JWT) 与 _yapi_uid 两个 cookie', t => {
  const { ctx, cookieCalls } = createMockCtx();
  const inst = new userController(ctx);

  inst.setLoginCookie('123', 'salt456');

  t.is(cookieCalls.length, 2);

  const [tokenName, token, tokenOpts] = cookieCalls[0];
  t.is(tokenName, '_yapi_token');
  // 使用 passsalt 作为密钥签发的 JWT 必须能被 jwt.verify 成功解析出 uid
  const decoded = jwt.verify(token, 'salt456');
  t.is(decoded.uid, '123');
  t.true(tokenOpts.httpOnly === true);
  t.true(tokenOpts.expires instanceof Date);

  const [uidName, uid, uidOpts] = cookieCalls[1];
  t.is(uidName, '_yapi_uid');
  t.is(uid, '123');
  t.true(uidOpts.httpOnly === true);
  t.true(uidOpts.expires instanceof Date);
});

test('logout 清空 _yapi_token 与 _yapi_uid 并返回 ok', async t => {
  const { ctx, cookieCalls } = createMockCtx();
  const inst = new userController(ctx);

  await inst.logout(ctx);

  t.is(cookieCalls.length, 2);
  t.deepEqual(cookieCalls[0], ['_yapi_token', null]);
  t.deepEqual(cookieCalls[1], ['_yapi_uid', null]);
  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data, 'ok');
});

test('login 缺失 email 返回 400 email不能为空', async t => {
  const { ctx } = createMockCtx({ password: '123456' });
  const inst = new userController(ctx);

  await inst.login(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'email不能为空');
});

test('login email 为全空白（trim 后为空）返回 400 email不能为空', async t => {
  const { ctx } = createMockCtx({ email: '   ', password: '123456' });
  const inst = new userController(ctx);

  await inst.login(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'email不能为空');
});

test('login 缺失 password 返回 400 密码不能为空', async t => {
  const { ctx } = createMockCtx({ email: 'admin@example.com' });
  const inst = new userController(ctx);

  await inst.login(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '密码不能为空');
});

test('reg closeRegister 为 true 时直接拦截返回 400 禁止注册', async t => {
  const prevCloseRegister = yapi.WEBCONFIG.closeRegister;
  yapi.WEBCONFIG.closeRegister = true;
  try {
    const { ctx } = createMockCtx({ email: 'a@example.com', password: '123456' });
    const inst = new userController(ctx);

    await inst.reg(ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '禁止注册，请联系管理员');
  } finally {
    yapi.WEBCONFIG.closeRegister = prevCloseRegister;
  }
});

test('reg 缺失 email 返回 400 邮箱不能为空', async t => {
  const prevCloseRegister = yapi.WEBCONFIG.closeRegister;
  yapi.WEBCONFIG.closeRegister = false;
  try {
    const { ctx } = createMockCtx({ password: '123456' });
    const inst = new userController(ctx);

    await inst.reg(ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '邮箱不能为空');
  } finally {
    yapi.WEBCONFIG.closeRegister = prevCloseRegister;
  }
});

test('reg 缺失 password 返回 400 密码不能为空', async t => {
  const prevCloseRegister = yapi.WEBCONFIG.closeRegister;
  yapi.WEBCONFIG.closeRegister = false;
  try {
    const { ctx } = createMockCtx({ email: 'new@example.com' });
    const inst = new userController(ctx);

    await inst.reg(ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '密码不能为空');
  } finally {
    yapi.WEBCONFIG.closeRegister = prevCloseRegister;
  }
});

test('changePassword 缺失 uid 返回 400 uid不能为空', async t => {
  const { ctx } = createMockCtx({ password: '123456' });
  const inst = new userController(ctx);

  await inst.changePassword(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'uid不能为空');
});

test('changePassword 缺失 password 返回 400 密码不能为空', async t => {
  const { ctx } = createMockCtx({ uid: 11 });
  const inst = new userController(ctx);

  await inst.changePassword(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '密码不能为空');
});

test('uploadAvatar 缺失 basecode 返回 400 basecode不能为空', async t => {
  const { ctx } = createMockCtx({});
  const inst = new userController(ctx);

  await inst.uploadAvatar(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'basecode不能为空');
});

test('uploadAvatar 非法图片格式前缀返回 400 仅支持jpeg和png格式的图片', async t => {
  const { ctx } = createMockCtx({ basecode: 'data:image/gif;base64,R0lGODlh' });
  const inst = new userController(ctx);

  await inst.uploadAvatar(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '仅支持jpeg和png格式的图片');
});

test('uploadAvatar basecode 超过 200kb 计算限制返回 400 图片大小不能超过200kb', async t => {
  // 控制器按 (len - len/8*2) = 0.75*len 经 parseInt 截断后与 200000 严格比较，
  // 266668 字符换算后恰为 200001，确保触发拦截（266667 截断后恰为 200000，不会触发）
  const oversizedBasecode = 'data:image/png;base64,' + 'A'.repeat(266668);
  const { ctx } = createMockCtx({ basecode: oversizedBasecode });
  const inst = new userController(ctx);

  await inst.uploadAvatar(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '图片大小不能超过200kb');
});

test('uploadAvatar 合法 png 且低于大小阈值时调用 avatar.up 成功', async t => {
  // 266666 字符换算后为 199999.5，未超阈值，走正常上传分支
  const basecode = 'data:image/png;base64,' + 'A'.repeat(266666);
  const { ctx } = createMockCtx({ basecode: basecode });
  const inst = new userController(ctx);
  inst.$uid = 11;

  await inst.uploadAvatar(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { uid: 11, type: 'image/png', size: 266666 });
});

test('search 缺失 q 参数返回 400 No keyword.', async t => {
  const { ctx } = createMockCtx({}, {});
  const inst = new userController(ctx);

  await inst.search(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'No keyword.');
});

test('search 含非法正则关键字返回 400 Bad query.', async t => {
  const { ctx } = createMockCtx({}, { q: 'a?b' });
  const inst = new userController(ctx);

  await inst.search(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'Bad query.');
});

test('search 合法关键字返回 this.Model.search 结果并过滤字段', async t => {
  const { ctx } = createMockCtx({}, { q: 'alice' });
  const inst = new userController(ctx);

  await inst.search(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.errmsg, 'ok');
  // _id/add_time/up_time 按规则映射为 uid/addTime/upTime，password 等敏感字段被过滤
  t.deepEqual(ctx.body.data, [
    {
      uid: 11,
      username: 'alice',
      email: 'alice@example.com',
      role: 'member',
      addTime: 1700000000,
      upTime: 1700000001
    }
  ]);
});

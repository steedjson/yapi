import test from 'ava';
import http from 'http';

const jwt = require('jsonwebtoken');
const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const userModel = require('../../server/models/user.js');
const commons = require('../../server/utils/commons.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // server/app.js 运行时才挂载 yapi.commons, 测试环境手动挂载; 两者为同一 commons.js 实例
  yapi.commons = commons;
});

/**
 * 构造带 cookies spy 的 mock Koa 上下文, cookie 读取来源可配置。
 * @param {any} cookieJar 模拟请求携带的 cookie 表
 * @param {any} body 模拟 request.body
 * @param {any} query 模拟 request.query
 * @returns {any} 含 ctx 与 cookies 写入调用记录的对象
 */
function createMockCtx(cookieJar = {}, body = {}, query = {}) {
  const cookieCalls = [];
  const ctx = {
    request: { body, query },
    query: query,
    cookies: {
      set(...args) {
        cookieCalls.push(args);
      },
      get(name) {
        return cookieJar[name];
      }
    },
    body: null,
    set() {},
    redirect() {}
  };
  return { ctx: ctx, cookieCalls: cookieCalls };
}

/**
 * 注入可记录 findById 调用的 user model mock, 阻止真实 model 构造。
 * @param {any} findByIdResult findById 的返回值, 缺省为 null(用户不存在)
 * @returns {any} 调用记录
 */
function installUserMock(findByIdResult) {
  const calls = { findById: [] };
  yapi.getInsts.set(userModel, {
    findById: async id => {
      calls.findById.push(id);
      return findByIdResult === undefined ? null : findByIdResult;
    }
  });
  return calls;
}

// ---------- base.checkLogin 禁用拦截 ----------

test.serial('checkLogin 被禁用账号返回 false 并写入 401 禁用响应', async t => {
  const user = {
    _id: 11,
    username: 'bob',
    email: 'bob@example.com',
    role: 'member',
    passsalt: 'salt456',
    disabled: true
  };
  const calls = installUserMock(user);
  const { ctx } = createMockCtx({ _yapi_token: 'any-token', _yapi_uid: '11' });
  const inst = new baseController(ctx);

  const result = await inst.checkLogin(ctx);

  t.is(result, false);
  t.is(inst.$auth, false);
  // 拦截复用本次 findById 结果, 不新增查询
  t.deepEqual(calls.findById, ['11']);
  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '账号已被禁用，请联系管理员');
  t.is(ctx.body.data, null);
});

test.serial('checkLogin 正常账号通过 cookie 校验写入 $uid/$auth/$user 且不写响应', async t => {
  const user = {
    _id: 11,
    username: 'bob',
    email: 'bob@example.com',
    role: 'admin',
    passsalt: 'salt456',
    disabled: false
  };
  installUserMock(user);
  const token = jwt.sign({ uid: '11' }, 'salt456');
  const { ctx } = createMockCtx({ _yapi_token: token, _yapi_uid: '11' });
  const inst = new baseController(ctx);

  const result = await inst.checkLogin(ctx);

  t.is(result, true);
  t.is(inst.$auth, true);
  t.is(inst.$uid, '11');
  t.is(inst.$user, user);
  // 正常路径不应写入响应体
  t.is(ctx.body, null);
});

test.serial('checkLogin 未登录(无 cookie)返回 false 且不写响应不查库', async t => {
  const calls = installUserMock();
  const { ctx } = createMockCtx({});
  const inst = new baseController(ctx);

  const result = await inst.checkLogin(ctx);

  t.is(result, false);
  t.is(ctx.body, null);
  t.is(calls.findById.length, 0);
});

test.serial('checkLogin cookie 指向的用户不存在返回 false 且不写响应', async t => {
  const calls = installUserMock();
  const { ctx } = createMockCtx({ _yapi_token: 'tok', _yapi_uid: '99' });
  const inst = new baseController(ctx);

  const result = await inst.checkLogin(ctx);

  t.is(result, false);
  t.is(ctx.body, null);
  t.deepEqual(calls.findById, ['99']);
});

test.serial('getLoginStatus 未登录路径行为不变返回 40011 请登录...', async t => {
  installUserMock();
  const { ctx } = createMockCtx({});
  const inst = new baseController(ctx);

  await inst.getLoginStatus(ctx);

  t.is(ctx.body.errcode, 40011);
  t.is(ctx.body.errmsg, '请登录...');
});

// ---------- commons.createAction 响应体守卫 ----------

/**
 * 通过真实 createAction 注册桩控制器, 捕获生成的路由处理器。
 * @param {any} ControllerClass 桩控制器类
 * @param {string} action 调用的 action 名
 * @returns {any} { path, handler }
 */
function registerStubAction(ControllerClass, action) {
  let captured = null;
  const router = {
    post: (path, handler) => {
      captured = { path: path, handler: handler };
    }
  };
  commons.createAction(router, '/api/user/', ControllerClass, action, 'add', 'post');
  return captured;
}

/**
 * 构造 createAction 可用的最小请求上下文。
 * @returns {any} mock ctx
 */
function createBareCtx() {
  return { request: { query: {}, body: {} }, params: {}, body: null };
}

test.serial('createAction $auth=true 时执行 action 并透传其响应', async t => {
  let actionCalls = 0;
  class StubController {
    constructor(ctx) {
      this.ctx = ctx;
    }
    async init() {
      this.$auth = true;
    }
    async action(ctx) {
      actionCalls += 1;
      ctx.body = commons.resReturn('from action');
    }
  }

  const registered = registerStubAction(StubController, 'action');
  t.is(registered.path, '/api/user/add');

  const ctx = createBareCtx();
  await registered.handler(ctx);

  t.is(actionCalls, 1);
  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data, 'from action');
});

test.serial('createAction auth 层已写入 401 禁用响应时透传, 不被 40011 覆盖', async t => {
  let actionCalls = 0;
  const written = commons.resReturn(null, 401, '账号已被禁用，请联系管理员');
  class StubController {
    constructor(ctx) {
      this.ctx = ctx;
    }
    async init(ctx) {
      this.$auth = false;
      ctx.body = written;
    }
    async action(ctx) {
      actionCalls += 1;
      ctx.body = commons.resReturn('from action');
    }
  }

  const { handler } = registerStubAction(StubController, 'action');
  const ctx = createBareCtx();
  await handler(ctx);

  t.is(actionCalls, 0);
  t.is(ctx.body, written);
  t.is(ctx.body.errcode, 401);
  t.is(ctx.body.errmsg, '账号已被禁用，请联系管理员');
});

test.serial('createAction auth 层已写入 token 无效 42014 响应时透传', async t => {
  let actionCalls = 0;
  const written = commons.resReturn(null, 42014, 'token 无效');
  class StubController {
    constructor(ctx) {
      this.ctx = ctx;
    }
    async init(ctx) {
      this.$auth = false;
      ctx.body = written;
    }
    async action(ctx) {
      actionCalls += 1;
      ctx.body = commons.resReturn('from action');
    }
  }

  const { handler } = registerStubAction(StubController, 'action');
  const ctx = createBareCtx();
  await handler(ctx);

  t.is(actionCalls, 0);
  t.is(ctx.body.errcode, 42014);
  t.is(ctx.body.errmsg, 'token 无效');
});

test.serial('createAction $auth=false 且无响应体时返回 40011 请登录...', async t => {
  let actionCalls = 0;
  class StubController {
    constructor(ctx) {
      this.ctx = ctx;
    }
    async init() {
      this.$auth = false;
    }
    async action() {
      actionCalls += 1;
    }
  }

  const { handler } = registerStubAction(StubController, 'action');
  const ctx = createBareCtx();
  await handler(ctx);

  t.is(actionCalls, 0);
  t.is(ctx.body.errcode, 40011);
  t.is(ctx.body.errmsg, '请登录...');
  t.is(ctx.body.data, null);
});

// ---------- 真实 app 冒烟: 新用户管理路由注册 ----------

/**
 * 用真实 Koa app 发起一次 POST JSON 请求。
 * @param {any} app Koa 应用
 * @param {string} path 请求路径
 * @param {any} body 请求体
 * @returns {Promise<any>} { statusCode, body, json }
 */
function postJson(app, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.callback());
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const payload = JSON.stringify(body || {});
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        },
        response => {
          let data = '';
          response.setEncoding('utf8');
          response.on('data', chunk => {
            data += chunk;
          });
          response.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch (e) {
              json = null;
            }
            server.close(() => resolve({ statusCode: response.statusCode, body: data, json: json }));
          });
        }
      );
      request.on('error', reject);
      request.end(payload);
    });
    server.on('error', reject);
  });
}

test.serial('真实 app 冒烟: 4 条新用户管理路由已注册且未登录统一返回 40011', async t => {
  // app.js require 时发起 mongoose 连接(失败仅记录日志), 未登录路径不会触达数据库
  const app = require('../../server/app.js');
  const newPaths = [
    '/api/user/add',
    '/api/user/reset_password',
    '/api/user/change_status',
    '/api/user/change_role'
  ];

  for (const path of newPaths) {
    const res = await postJson(app, path, {});
    t.is(res.statusCode, 200, path);
    t.is(res.json.errcode, 40011, path);
    t.is(res.json.errmsg, '请登录...', path);
  }

  // 对照: 未注册路由返回 404
  const missing = await postJson(app, '/api/user/no_such_action', {});
  t.is(missing.statusCode, 404);
});


// 收尾取消定时任务并关闭 MongoDB 连接，避免 AVA 因常驻句柄强制退出
test.after.always('cleanup lingering handles', async () => {
  try {
    const schedule = require('node-schedule');
    schedule.scheduledJobs && Object.keys(schedule.scheduledJobs).forEach(name => {
      schedule.scheduledJobs[name].cancel();
    });
  } catch (e) {}
  const mongoose = require('mongoose');
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await new Promise(r => setTimeout(r, 200));
    await mongoose.connection.close();
  }
});

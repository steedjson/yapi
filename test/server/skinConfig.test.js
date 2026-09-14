import test from 'ava';
import http from 'http';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userController = require('../../server/controllers/user.js');
const storageModel = require('../../server/models/storage.js');
const userModel = require('../../server/models/user.js');

test.before('挂载真实 commons 并注入 model mock, 避免真实 mongoose 连接', () => {
  // server/app.js 运行时才挂载 yapi.commons, 测试环境手动挂载真实实现
  yapi.commons = commons;
  // userController 构造函数固定执行 yapi.getInst(userModel);
  // 皮肤端点不触达用户模型, 预挂最小桩避免构造真实 mongoose 模型
  yapi.getInsts.set(userModel, {});
});

/**
 * 注入可记录 get/save 调用的 storage model mock。
 * storageCreator('skin_config') 内部经 yapi.getInst(storageModel) 取实例,
 * 预先挂入 getInsts Map 使 getInst 直接返回 mock, 免于构造真实 mongoose 模型。
 * @param {any} initialRecord 预置的 storage 记录; undefined 模拟表内无记录(get 返回 null)
 * @returns {any} { calls, getRecord } 调用记录与当前记录读取器
 */
function installStorageMock(initialRecord) {
  const calls = { get: [], save: [] };
  let record = initialRecord === undefined ? null : initialRecord;
  yapi.getInsts.set(storageModel, {
    get: async id => {
      calls.get.push(id);
      return record;
    },
    save: async (id, data, isInsert) => {
      calls.save.push({ id: id, data: data, isInsert: isInsert });
      record = data;
      return { ok: 1 };
    }
  });
  return { calls: calls, getRecord: () => record };
}

/**
 * 注入 get 直接抛错的 storage model mock, 模拟底层读失败。
 * @param {string} message 抛出的错误信息
 * @returns {any} 调用记录
 */
function installBrokenStorageMock(message) {
  const calls = { get: [], save: [] };
  yapi.getInsts.set(storageModel, {
    get: async id => {
      calls.get.push(id);
      throw new Error(message);
    },
    save: async (id, data, isInsert) => {
      calls.save.push({ id: id, data: data, isInsert: isInsert });
      return { ok: 1 };
    }
  });
  return { calls: calls };
}

/**
 * 构造 mock Koa 上下文(与 test/server/userManage.test.js 保持一致)。
 * @param {any} body 模拟 request.body
 * @param {any} query 模拟 request.query
 * @returns {any} mock ctx
 */
function createMockCtx(body = {}, query = {}) {
  return {
    request: { body: body, query: query },
    query: query,
    cookies: {
      set() {},
      get() {
        return undefined;
      }
    },
    body: null,
    set() {},
    redirect() {}
  };
}

/**
 * 以指定登录态构造控制器实例; $user.role 驱动 getRole()。
 * 默认构造 admin(uid=1) 登录态。
 * @param {any} overrides body/query/登录态配置
 * @returns {any} { inst, ctx }
 */
function createInst(overrides = {}) {
  const ctx = createMockCtx(overrides.body || {}, overrides.query || {});
  const inst = new userController(ctx);
  inst.$uid = overrides.uid === undefined ? 1 : overrides.uid;
  inst.$user = { role: overrides.role || 'admin', username: 'admin', email: 'admin@admin.com' };
  return { inst: inst, ctx: ctx };
}

// ---------- getSkinConfig ----------

test.serial('getSkinConfig storage 无记录时回落默认皮肤 enterprise 且只读不写', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst();

  await inst.getSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'enterprise' });
  // 端点以 ('skin_config') 语义读取 storage
  t.deepEqual(storage.calls.get, ['skin_config']);
  t.is(storage.calls.save.length, 0);
});

test.serial('getSkinConfig storage 已配置 gov 时原样透传', async t => {
  installStorageMock({ default: 'gov' });
  const { inst, ctx } = createInst();

  await inst.getSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'gov' });
});

test.serial('getSkinConfig 记录存在但缺 default 键时同样回落 enterprise', async t => {
  installStorageMock({ other: 'keep' });
  const { inst, ctx } = createInst();

  await inst.getSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'enterprise' });
});

test.serial('getSkinConfig 非 admin 普通登录用户同样可读取', async t => {
  installStorageMock({ default: 'dark' });
  const { inst, ctx } = createInst({ role: 'member', uid: 22 });

  await inst.getSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'dark' });
});

test.serial('getSkinConfig storage 读失败走 400 返回错误信息', async t => {
  installBrokenStorageMock('storage down');
  const { inst, ctx } = createInst();

  await inst.getSkinConfig(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, 'storage down');
  t.is(ctx.body.data, null);
});

// ---------- setSkinConfig ----------

test.serial('setSkinConfig admin 设置 anime 成功: save(skin_config, {default:anime}, isInsert=true)', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'anime' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'anime' });
  t.is(storage.calls.save.length, 1);
  t.is(storage.calls.save[0].id, 'skin_config');
  t.deepEqual(storage.calls.save[0].data, { default: 'anime' });
  t.is(storage.calls.save[0].isInsert, true);
});

test.serial('setSkinConfig 已有记录时 isInsert=false 更新且保留其他键', async t => {
  const storage = installStorageMock({ default: 'enterprise', other: 'keep' });
  const { inst, ctx } = createInst({ body: { skin: 'dark' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'dark' });
  t.is(storage.calls.save.length, 1);
  t.is(storage.calls.save[0].id, 'skin_config');
  t.is(storage.calls.save[0].isInsert, false);
  t.deepEqual(storage.calls.save[0].data, { default: 'dark', other: 'keep' });
});

test.serial('setSkinConfig 非法 skin pink 返回 400 皮肤参数不合法且不触达 storage', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'pink' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '皮肤参数不合法');
  t.is(ctx.body.data, null);
  t.is(storage.calls.get.length, 0);
  t.is(storage.calls.save.length, 0);
});

test.serial('setSkinConfig 缺失 skin 返回 400 皮肤参数不合法', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: {} });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '皮肤参数不合法');
  t.is(storage.calls.save.length, 0);
});

test.serial('setSkinConfig 非 admin 返回 402 没有权限且不触达 storage', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ role: 'member', uid: 22, body: { skin: 'gov' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(ctx.body.data, null);
  t.is(storage.calls.get.length, 0);
  t.is(storage.calls.save.length, 0);
});

// ---------- 白名单边界 ----------

test.serial('setSkinConfig 白名单边界 enterprise 接受并写入', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'enterprise' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'enterprise' });
  t.deepEqual(storage.calls.save[0].data, { default: 'enterprise' });
});

test.serial('setSkinConfig 白名单边界 gov 接受并写入', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'gov' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'gov' });
  t.deepEqual(storage.calls.save[0].data, { default: 'gov' });
});

test.serial('setSkinConfig 白名单边界 anime 接受并写入', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'anime' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'anime' });
  t.deepEqual(storage.calls.save[0].data, { default: 'anime' });
});

test.serial('setSkinConfig 白名单边界 dark 接受并写入', async t => {
  const storage = installStorageMock();
  const { inst, ctx } = createInst({ body: { skin: 'dark' } });

  await inst.setSkinConfig(ctx);

  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data, { skin: 'dark' });
  t.deepEqual(storage.calls.save[0].data, { default: 'dark' });
});

// ---------- 路由注册冒烟 ----------

/**
 * 用真实 Koa app 发起一次 JSON 请求(GET 不携带请求体)。
 * @param {any} app Koa 应用
 * @param {string} method HTTP 方法
 * @param {string} path 请求路径
 * @param {any} body 请求体
 * @returns {Promise<any>} { statusCode, json }
 */
function requestJson(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.callback());
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const payload = method === 'GET' ? null : JSON.stringify(body || {});
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}
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
            server.close(() => resolve({ statusCode: response.statusCode, json: json }));
          });
        }
      );
      request.on('error', reject);
      if (payload) request.end(payload);
      else request.end();
    });
    server.on('error', reject);
  });
}

test.serial('路由配置冒烟: skin_config 的 GET/POST 两条路由均已注册到 /api/user 前缀下', async t => {
  // app.js require 时完成插件与全部路由注册(mongoose 连接失败仅记录日志);
  // 随后 require router.js 命中模块缓存, 直接检查已注册的路由层
  require('../../server/app.js');
  const router = require('../../server/router.js');
  const layers = router.stack.filter(layer => layer.path === '/api/user/skin_config');

  t.is(layers.length, 2);
  // koa-router 为 GET 路由自动附加 HEAD, 断言时排除
  const methodSets = layers.map(layer => layer.methods.filter(method => method !== 'HEAD').sort());
  methodSets.sort((a, b) => (a.join() < b.join() ? -1 : 1));
  t.deepEqual(methodSets, [['GET'], ['POST']]);
});

test.serial('真实 app 冒烟: 未登录访问 skin_config 两条路由均返回 40011 而非 404', async t => {
  const app = require('../../server/app.js');

  const getResult = await requestJson(app, 'GET', '/api/user/skin_config');
  t.is(getResult.statusCode, 200);
  t.is(getResult.json.errcode, 40011);
  t.is(getResult.json.errmsg, '请登录...');

  const postResult = await requestJson(app, 'POST', '/api/user/skin_config', { skin: 'gov' });
  t.is(postResult.statusCode, 200);
  t.is(postResult.json.errcode, 40011);
  t.is(postResult.json.errmsg, '请登录...');

  // 对照: 未注册路径返回 404
  const missing = await requestJson(app, 'POST', '/api/user/no_such_action', {});
  t.is(missing.statusCode, 404);
});

test.serial('storage 模型契约: key 为 String(skin_config 以字符串命名空间存取)', t => {
  // 回归钉子: key 曾为 Number,导致真实 DB 下 skin_config 存取触发
  // "Cast to Number failed for value \"skin_config\"" (mock 测试无法暴露)
  // getSchema 为实例方法但实现不依赖 this,构造器依赖 mongoose 连接,故走原型调用
  const schema = storageModel.prototype.getSchema();
  t.is(schema.key.type, String);
  t.truthy(schema.key.required);
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

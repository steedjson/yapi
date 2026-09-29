import test from 'ava';

// 插件控制器以非相对路径 require('controllers/base.js')/'yapi.js',
// 生产由 server/app.js 置 NODE_PATH=server 后 Module._initPaths() 解析;
// 测试进程复刻同一机制, 必须先于下方插件 controller 的 require 执行(同 export-token-scope.test.js)
const Module = require('module');
const nodePath = require('path');
process.env.NODE_PATH = nodePath.join(__dirname, '../../server');
Module._initPaths();

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
// server/plugin.js 仅在服务启动时挂载 emitHook; interfaceSyncUtils 顶层 require 的
// controllers/open.js 在模块级调用 emitHook('import_data'), 测试环境注入行为一致的空实现
// (同 up-token-scope.test.js), 必须先于下方 interfaceSyncUtils 的 require 执行
yapi.emitHook =
  yapi.emitHook ||
  function() {
    return Promise.resolve([]);
  };
const userModel = require('../../server/models/user.js');
const interfaceModel = require('../../server/models/interface.js');
const projectModel = require('../../server/models/project.js');
const advModel = require('../../exts/yapi-plugin-advanced-mock/advMockModel.js');
const caseModel = require('../../exts/yapi-plugin-advanced-mock/caseModel.js');
const advMockController = require('../../exts/yapi-plugin-advanced-mock/controller.js');
const wikiModel = require('../../exts/yapi-plugin-wiki/wikiModel.js');
const wikiController = require('../../exts/yapi-plugin-wiki/controller.js');
const syncModel = require('../../exts/yapi-plugin-swagger-auto-sync/syncModel.js');
const interfaceSyncUtils = require('../../exts/yapi-plugin-swagger-auto-sync/interfaceSyncUtils.js');
const syncController = require('../../exts/yapi-plugin-swagger-auto-sync/controller/syncController.js');

test.before('挂载真实 commons 到 yapi 单例', () => {
  // 插件控制器的 resReturn/time 依赖 yapi.commons, 测试环境手动挂载真实工具模块
  yapi.commons = commons;
});

// 批3 语义背景: 三个插件控制器均为 /api/plugin/* 路由, 控制器内守卫只对
// $tokenAuth=true 的请求(token 域)收紧归属校验; 非 token(登录态)请求必须维持原逻辑。
// 控制器方法级桩测, $tokenAuth/$tokenProjectId 按语义直接注入(同 up-token-scope.test.js)。

// ---------- fixtures ----------

/**
 * 构造 advanced-mock 控制器实例与调用记录。
 * 四个 model 均在构造器里经 yapi.getInst 取实例, 先以 getInsts 桩化避免实例化真实 mongoose model。
 * @param {any} opts tokenAuth/$tokenProjectId/interfaceData(接口表查询结果)/mockData
 * @returns {any} { inst, calls }
 */
function createAdvMockInst(opts) {
  const calls = { advModelGets: [], caseSaves: [], caseUps: [] };
  yapi.getInsts.set(advModel, {
    get: async id => {
      calls.advModelGets.push(id);
      return { interface_id: id, enable: false, mock_script: '' };
    }
  });
  yapi.getInsts.set(caseModel, {
    // findRepeat 查重恒空, 使用例聚焦归属守卫与落库归一
    get: async () => null,
    save: async data => {
      calls.caseSaves.push(data);
      return { _id: 1 };
    },
    up: async data => {
      calls.caseUps.push(data);
      return { _id: 1 };
    }
  });
  yapi.getInsts.set(userModel, {});
  yapi.getInsts.set(interfaceModel, {
    get: async () => opts.interfaceData
  });
  const inst = new advMockController({ request: { query: {} } });
  inst.$uid = '1';
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
 * 构造 wiki 控制器实例与调用记录。
 * @param {any} opts tokenAuth/$tokenProjectId
 * @returns {any} { inst, calls }
 */
function createWikiInst(opts) {
  const calls = { wikiModelGets: [] };
  yapi.getInsts.set(wikiModel, {
    get: async projectId => {
      calls.wikiModelGets.push(projectId);
      return { project_id: projectId, desc: 'wiki-desc' };
    }
  });
  yapi.getInsts.set(projectModel, {});
  const inst = new wikiController({ request: { query: {} } });
  if (opts.tokenAuth) {
    inst.$tokenAuth = true;
    inst.$tokenProjectId = opts.$tokenProjectId;
  }
  return { inst, calls };
}

/**
 * 构造 swagger-auto-sync 控制器实例与调用记录。
 * @param {any} opts tokenAuth/$tokenProjectId
 * @returns {any} { inst, calls }
 */
function createSyncInst(opts) {
  const calls = { getByProjectId: [] };
  yapi.getInsts.set(syncModel, {
    getByProjectId: async projectId => {
      calls.getByProjectId.push(projectId);
      return { project_id: projectId, is_sync_open: false };
    }
  });
  yapi.getInsts.set(projectModel, {});
  yapi.getInsts.set(interfaceSyncUtils, {});
  const inst = new syncController({ query: {} });
  if (opts.tokenAuth) {
    inst.$tokenAuth = true;
    inst.$tokenProjectId = opts.$tokenProjectId;
  }
  return { inst, calls };
}

// ---------- advanced-mock getMock: token 归属校验 ----------

test.serial('advmock getMock: token 请求读取归属项目的接口配置放行', async t => {
  // 接口 project_id 传字符串形态, 钉死 Number() 归一化不误伤(同 up-token-scope 先例)
  const { inst, calls } = createAdvMockInst({
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: '12' }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data.interface_id, 77);
  t.is(calls.advModelGets.length, 1);
});

test.serial('advmock getMock: token 请求打其它项目的 interface_id 返回 406, 不触达 mock 配置读取', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  // 越界读在触达 advMock 配置前被拦截
  t.is(calls.advModelGets.length, 0);
});

test.serial('advmock getMock: interface 不存在时无论是否 token 一律 406(空态收敛)', async t => {
  const nonToken = createAdvMockInst({ tokenAuth: false, interfaceData: null });
  const ctxNonToken = { query: { interface_id: 404 }, body: null };
  await nonToken.inst.getMock(ctxNonToken);
  t.is(ctxNonToken.body.errcode, 406);

  const withToken = createAdvMockInst({ tokenAuth: true, $tokenProjectId: 12, interfaceData: null });
  const ctxToken = { query: { interface_id: 404 }, body: null };
  await withToken.inst.getMock(ctxToken);
  t.is(ctxToken.body.errcode, 406);
  t.is(withToken.calls.advModelGets.length, 0);
});

test.serial('advmock getMock: 非 token 请求不受新守卫影响, 维持原读取链放行', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: false,
    interfaceData: { _id: 77, project_id: 12 }
  });
  const ctx = { query: { interface_id: 77 }, body: null };

  await inst.getMock(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.advModelGets.length, 1);
});

// ---------- advanced-mock saveCase: token 归属校验与落库 project_id 归一 ----------

test.serial('advmock saveCase: token 请求给归属项目的接口添加期望放行', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 12 }
  });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
});

test.serial('advmock saveCase: token 请求打其它项目的 interface_id 返回 406, 不落库', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 99 }
  });
  // body 伪报成归属项目也拦: 判定基准是接口表真实归属, 不是 body 自述
  const ctx = createSaveCaseCtx({ project_id: 12 });

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.caseSaves.length, 0);
  t.is(calls.caseUps.length, 0);
});

test.serial('advmock saveCase: interface 不存在返回 406, 不落库', async t => {
  const { inst, calls } = createAdvMockInst({ tokenAuth: false, interfaceData: null });
  const ctx = createSaveCaseCtx({});

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(calls.caseSaves.length, 0);
  t.is(calls.caseUps.length, 0);
});

test.serial('advmock saveCase: token 请求 body 伪报 project_id 时, 落库以接口真实归属为准', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: true,
    $tokenProjectId: 12,
    interfaceData: { _id: 77, project_id: 12 }
  });
  // 归属项目的接口, 但 body 把 project_id 伪报成 99: 落库值必须被归一回 12
  const ctx = createSaveCaseCtx({ project_id: 99 });

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
  t.is(calls.caseSaves[0].project_id, 12);
});

test.serial('advmock saveCase: 非 token 请求 body 伪报 project_id 同样以接口真实归属落库', async t => {
  const { inst, calls } = createAdvMockInst({
    tokenAuth: false,
    interfaceData: { _id: 77, project_id: 12 }
  });
  const ctx = createSaveCaseCtx({ project_id: 99 });

  await inst.saveCase(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.caseSaves.length, 1);
  t.is(calls.caseSaves[0].project_id, 12);
});

// ---------- wiki getWikiDesc: token 归属校验 ----------

test.serial('wiki getWikiDesc: token 请求读取归属项目的 wiki 放行', async t => {
  // query 串字符串形态 vs number 型 $tokenProjectId, 钉死 Number() 归一化
  const { inst, calls } = createWikiInst({ tokenAuth: true, $tokenProjectId: 12 });
  const ctx = { request: { query: { project_id: '12' } }, body: null };

  await inst.getWikiDesc(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.wikiModelGets.length, 1);
});

test.serial('wiki getWikiDesc: token 请求打其它项目的 project_id 返回 406, 不触达读取', async t => {
  const { inst, calls } = createWikiInst({ tokenAuth: true, $tokenProjectId: 12 });
  const ctx = { request: { query: { project_id: '99' } }, body: null };

  await inst.getWikiDesc(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.wikiModelGets.length, 0);
});

test.serial('wiki getWikiDesc: 非 token 请求不受新守卫影响, 维持原读取链放行', async t => {
  const { inst, calls } = createWikiInst({ tokenAuth: false });
  const ctx = { request: { query: { project_id: '99' } }, body: null };

  await inst.getWikiDesc(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.wikiModelGets.length, 1);
});

// ---------- swagger-auto-sync getSync: token 归属校验 ----------

test.serial('autoSync getSync: token 请求读取归属项目的同步配置放行', async t => {
  const { inst, calls } = createSyncInst({ tokenAuth: true, $tokenProjectId: 12 });
  const ctx = { query: { project_id: '12' }, body: null };

  await inst.getSync(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.getByProjectId.length, 1);
});

test.serial('autoSync getSync: token 请求打其它项目的 project_id 返回 406, 不触达读取', async t => {
  const { inst, calls } = createSyncInst({ tokenAuth: true, $tokenProjectId: 12 });
  const ctx = { query: { project_id: 99 }, body: null };

  await inst.getSync(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(calls.getByProjectId.length, 0);
});

test.serial('autoSync getSync: 非 token 请求不受新守卫影响, 维持原读取链放行', async t => {
  const { inst, calls } = createSyncInst({ tokenAuth: false });
  const ctx = { query: { project_id: 99 }, body: null };

  await inst.getSync(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(calls.getByProjectId.length, 1);
});

// 收尾兜底: 本文件不触发真实 mongoose 连接, 此处仅防御性清理常驻句柄
const closeMongoose = require('../helpers/closeMongoose.js');
test.after.always('cleanup lingering handles', () => closeMongoose());

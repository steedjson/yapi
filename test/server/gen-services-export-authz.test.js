import test from 'ava';

// 插件导出入口（/api/plugin/export / export/full）鉴权面独立验证（不连库）：
// 修复前 exportData/exportFullData 拿 pid 直查项目后立即读 wiki / 导出接口列表，
// 无任何可见性判定——任意登录用户可导出私有项目全量接口数据（含 wiki）。
// 修复后：项目不存在 407；私有项目先过 checkAuth(view)（判定用 curProject._id
// 实际归属，不信请求自报 pid），拒绝态发生在 wiki/接口列表读取之前。
// 桩形态沿用 test/server/gen-services-pid-guard.test.js（NODE_PATH 复刻 +
// yapi.getInsts 注入 mock 实例），另对 checkAuth / wiki.get / catModel.list 埋点。

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
const interfaceModel = require('../../server/models/interface.js');
const interfaceCatModel = require('../../server/models/interfaceCat.js');
// 与 exportData 内 require('../yapi-plugin-wiki/wikiModel.js') 同一模块实例
// （require 缓存共享），wiki 读取埋点据此生效
const wikiModel = require('../../exts/yapi-plugin-wiki/wikiModel.js');
const genServicesController = require('../../exts/yapi-plugin-gen-services/controller.js');

// 请求自报 pid=36；真实归属项目 _id=501（判定用实际归属的反例基准）
const PID = 36;
const PROJECT_ID = 501;

/**
 * 构造 export 控制器实例与调用记录。
 * @param {{ project?: any, authz?: boolean | number }} opts
 *   project：projectModel.get 返回值（null 模拟不存在；默认私有项目 fixture）。
 *   authz：checkAuth 桩返回值（true 成员 / false 非成员 / 1 truthy 非严格）。
 * @returns {{ inst: any, calls: any }}
 */
function createHarness(opts = {}) {
  const calls = { checkAuth: [], projectGet: [], wikiGet: [], catList: [], interList: [], sets: [] };
  const project =
    opts.project === undefined
      ? { _id: PROJECT_ID, name: 'proj-501', desc: 'd', basepath: '', project_type: 'private' }
      : opts.project;
  yapi.commons = commons;
  yapi.getInsts.set(projectModel, {
    get: async pid => {
      calls.projectGet.push(pid);
      return project;
    }
  });
  yapi.getInsts.set(interfaceModel, {
    listByInterStatus: async (...args) => {
      calls.interList.push(args);
      return [];
    }
  });
  yapi.getInsts.set(interfaceCatModel, {
    list: async (...args) => {
      calls.catList.push(args);
      return [];
    }
  });
  yapi.getInsts.set(wikiModel, {
    get: async (...args) => {
      calls.wikiGet.push(args);
      return null;
    }
  });
  const inst = new genServicesController({});
  inst.$uid = '5';
  inst.checkAuth = (...args) => {
    calls.checkAuth.push(args);
    return Promise.resolve(opts.authz);
  };
  return { inst, calls };
}

/**
 * 构造 export Koa ctx 桩（GET query 传参；记录响应头写入）。
 * @param {any} [query] request.query
 * @param {any} calls 调用记录（接收 set 埋点）
 * @returns {any} ctx 桩
 */
function createCtx(query, calls) {
  return { request: { query: query || {} }, set: (...args) => calls.sets.push(args), body: null };
}

// ---------- ① 越权：私有项目非成员 → 406，先于 wiki 与接口列表读取 ----------

test.serial('exportData: 私有项目非成员 → 406 data null，不读 wiki、不读接口列表', async t => {
  const { inst, calls } = createHarness({ authz: false });
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.projectGet, [String(PID)], 'pid 原样反查项目');
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']], '以 curProject._id 实际归属判 view');
  // 硬短路：拒绝必须先于任何数据读取（无导出列表、无 wiki）
  t.deepEqual(calls.catList, [], '不读接口分类列表（无导出列表）');
  t.deepEqual(calls.wikiGet, [], '不读 wiki');
  t.deepEqual(calls.sets, [], '不写下载响应头');
});

test.serial('exportData(isWiki=true): 私有项目非成员 → 406 且 wiki 读取前拒绝', async t => {
  const { inst, calls } = createHarness({ authz: false });
  const ctx = createCtx({ pid: String(PID), type: 'json', isWiki: 'true' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.deepEqual(calls.wikiGet, [], 'wiki 读取前被拒（wikiModel.get 零调用）');
  t.deepEqual(calls.catList, []);
});

test.serial('exportFullData: 经委托同样先鉴权 → 406，不读任何数据', async t => {
  const { inst, calls } = createHarness({ authz: false });
  const ctx = createCtx({ pid: String(PID), type: 'json', isWiki: 'true' }, calls);

  await inst.exportFullData(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.deepEqual(calls.wikiGet, []);
  t.deepEqual(calls.catList, []);
});

// ---------- ② 实际归属优先：判定不信请求自报 pid ----------

test.serial('exportData: 自报 pid 与项目实际归属不一致 → 判定用 curProject._id', async t => {
  // pid=36（自报）反查回 _id=501 的私有项目：判定必须以 501 为准
  const { inst, calls } = createHarness({
    project: { _id: PROJECT_ID, name: 'p', desc: 'd', basepath: '', project_type: 'private' },
    authz: false
  });
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 406);
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']], '判定用实际归属 _id=501 而非自报 pid=36');
});

// ---------- ③ 公开项目与成员：导出能力不变 ----------

test.serial('exportData: 公开项目非成员 → 放行并完成导出（现状口径，不调用 checkAuth）', async t => {
  const { inst, calls } = createHarness({
    project: { _id: PROJECT_ID, name: 'pub', desc: 'd', basepath: '', project_type: 'public' },
    authz: false
  });
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body, '[]', '空分类导出 json 列表（导出链完整走通）');
  t.deepEqual(calls.checkAuth, [], '公开项目不进私有判定');
  t.deepEqual(calls.catList, [[String(PID)]], '接口列表读取确实执行');
});

test.serial('exportData(isWiki=true): 私有项目成员 → 放行且 wiki 读取发生', async t => {
  const { inst, calls } = createHarness({ authz: true });
  const ctx = createCtx({ pid: String(PID), type: 'json', isWiki: 'true' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body, '[]');
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'view']]);
  t.deepEqual(calls.wikiGet, [[String(PID)]], '成员 wiki 读取放行');
  t.deepEqual(calls.catList, [[String(PID)]]);
});

test.serial('exportData: 数字 pid 与字符串 pid 行为一致（私有非成员同样 406）', async t => {
  for (const pid of [PID, String(PID)]) {
    const { inst, calls } = createHarness({ authz: false });
    const ctx = createCtx({ pid, type: 'json' }, calls);
    await inst.exportData(ctx, 'full-path');
    t.is(ctx.body.errcode, 406);
    t.deepEqual(calls.projectGet, [pid], 'pid 双形态原样反查');
  }
});

// ---------- ④ 不存在项目：407，不进鉴权 ----------

test.serial('exportData: 项目不存在 → 407 不存在的项目，不进鉴权不读列表', async t => {
  const { inst, calls } = createHarness({ project: null, authz: false });
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 407);
  t.is(ctx.body.errmsg, '不存在的项目');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.checkAuth, []);
  t.deepEqual(calls.catList, []);
  t.deepEqual(calls.wikiGet, []);
});

// ---------- ⑤ 严格判定与异常路径 ----------

test.serial('exportData: checkAuth 返回 truthy 非严格 true（1）→ 仍 406（保持 !== true 严格判定）', async t => {
  const { inst, calls } = createHarness({ authz: 1 });
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.deepEqual(calls.catList, []);
});

test.serial('exportData: checkAuth 抛错 → 502 下载出错 data null（异常不外泄、不降级放行）', async t => {
  const { inst, calls } = createHarness({ authz: true });
  inst.checkAuth = () => Promise.reject(new Error('auth backend down'));
  const ctx = createCtx({ pid: String(PID), type: 'json' }, calls);

  await inst.exportData(ctx, 'full-path');

  t.is(ctx.body.errcode, 502);
  t.is(ctx.body.errmsg, '下载出错');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.catList, [], '异常路径不读导出列表');
});

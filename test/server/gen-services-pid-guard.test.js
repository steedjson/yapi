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
const interfaceModel = require('../../server/models/interface.js');
const interfaceCatModel = require('../../server/models/interfaceCat.js');
const genServicesController = require('../../exts/yapi-plugin-gen-services/controller.js');

test.before('挂载真实 commons 并注入 mock model 实例，避免真实 mongoose 连接', () => {
  yapi.commons = commons;
  yapi.getInsts.set(projectModel, {
    get: async () => ({ _id: 36, name: 'proj-36', desc: 'd', basepath: '' })
  });
  yapi.getInsts.set(interfaceModel, {
    listByInterStatus: async () => []
  });
  yapi.getInsts.set(interfaceCatModel, {
    list: async () => []
  });
});

const makeCtx = query => ({ request: { query }, set() {} });

// —— !pid 守卫: 修复前误用 errcode 200(语义为成功), 修复后必须 400 ——

test('exportData: pid 缺失时返回 400「pid 不能为空」', async t => {
  const inst = new genServicesController({});
  const ctx = makeCtx({});
  await inst.exportData(ctx, 'full-path');
  t.deepEqual(ctx.body, { errcode: 400, errmsg: 'pid 不能为空', data: null });
});

test('exportData: pid 为空字符串时同样被 400 拦截(空值边界)', async t => {
  const inst = new genServicesController({});
  const ctx = makeCtx({ pid: '' });
  await inst.exportData(ctx, 'full-path');
  t.deepEqual(ctx.body, { errcode: 400, errmsg: 'pid 不能为空', data: null });
});

test('exportFullData: 经 full-path 委托后守卫语义不变', async t => {
  const inst = new genServicesController({});
  const ctx = makeCtx({});
  await inst.exportFullData(ctx);
  t.deepEqual(ctx.body, { errcode: 400, errmsg: 'pid 不能为空', data: null });
});

// —— 回归守卫: pid 合法时不得被 400 误拦(守卫通过后走 type=json 导出链, 空列表导出为 '[]') ——

test('exportData: pid 合法时守卫放行并完成 json 导出', async t => {
  const inst = new genServicesController({});
  const ctx = makeCtx({ pid: '36', type: 'json' });
  await inst.exportData(ctx, 'full-path');
  t.is(ctx.body, '[]');
});

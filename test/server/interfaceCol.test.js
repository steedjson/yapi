import test from 'ava';

const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const interfaceColModel = require('../../server/models/interfaceCol.js');
const interfaceCaseModel = require('../../server/models/interfaceCase.js');
const interfaceModel = require('../../server/models/interface.js');
const projectModel = require('../../server/models/project.js');
const logModel = require('../../server/models/log.js');
const interfaceColController = require('../../server/controllers/interfaceCol.js');

// 说明：本文件为特征测试（characterization tests），断言均以
// server/controllers/interfaceCol.js 当前实际实现为准。
// 其中部分错误文案与历史接口文档描述不一致（如 upCol 为 '缺少 col_id 参数'），
// 以实现为准断言，不一致点已在测试报告中逐条列出供评审。

test.before('挂载真实的 yapi.commons 实现，测试环境无需启动 server/app.js', () => {
  // server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现
  yapi.commons = require('../../server/utils/commons.js');
});

/**
 * 构造一套全新的 mock model 实例并注册进 yapi.getInsts 缓存，
 * 阻止真实 model 构造（其依赖 yapi.db/mongodb 连接）。
 * @returns {any} calls 为各方法的调用记录，returns 为可配置的查询返回值
 */
function createModelMocks() {
  const calls = {
    colGet: [],
    colSave: [],
    colUp: [],
    colUpColIndex: [],
    colDel: [],
    caseGet: [],
    caseList: [],
    caseSave: [],
    caseUp: [],
    caseDel: [],
    caseDelByCol: [],
    caseUpCaseIndex: [],
    interfaceGet: [],
    interfaceGetByIds: [],
    projectGetBaseInfo: [],
    projectUp: [],
    logSave: []
  };
  const returns = {
    colGet: null, // colModel.get 返回值
    caseGet: null, // caseModel.get 返回值
    caseList: [], // caseModel.list 返回值
    interfaceGet: null, // interfaceModel.get 返回值
    interfaceGetByIds: [], // interfaceModel.getByIds 返回值
    projectGetBaseInfo: null // projectModel.getBaseInfo 返回值
  };
  const insts = {
    col: {
      get: async id => {
        calls.colGet.push(id);
        return returns.colGet;
      },
      save: async data => {
        calls.colSave.push(data);
        return Object.assign({ _id: 71 }, data);
      },
      up: async (id, data) => {
        calls.colUp.push({ id, data });
        return { ok: 1 };
      },
      upColIndex: async (id, index) => {
        calls.colUpColIndex.push({ id, index });
        return { ok: 1 };
      },
      del: async id => {
        calls.colDel.push(id);
        return { ok: 1 };
      }
    },
    case: {
      get: async id => {
        calls.caseGet.push(id);
        return returns.caseGet;
      },
      list: async (id, type) => {
        calls.caseList.push({ id, type });
        return returns.caseList;
      },
      save: async data => {
        calls.caseSave.push(data);
        return Object.assign({ _id: 81 }, data);
      },
      up: async (id, data) => {
        calls.caseUp.push({ id, data });
        return { ok: 1 };
      },
      del: async id => {
        calls.caseDel.push(id);
        return { ok: 1 };
      },
      delByCol: async id => {
        calls.caseDelByCol.push(id);
        return { ok: 1 };
      },
      upCaseIndex: async (id, index) => {
        calls.caseUpCaseIndex.push({ id, index });
        return { ok: 1 };
      }
    },
    interface: {
      get: async id => {
        calls.interfaceGet.push(id);
        return returns.interfaceGet;
      },
      getByIds: async ids => {
        calls.interfaceGetByIds.push(ids);
        return returns.interfaceGetByIds;
      }
    },
    project: {
      getBaseInfo: async id => {
        calls.projectGetBaseInfo.push(id);
        return returns.projectGetBaseInfo;
      },
      up: async (id, data) => {
        calls.projectUp.push({ id, data });
        return { ok: 1 };
      }
    },
    // commons.saveLog 内部通过 yapi.getInst(logModel) 取实例，预先注入 mock 避免真实入库
    log: {
      save: async data => {
        calls.logSave.push(data);
        return { ok: 1 };
      }
    }
  };
  yapi.getInsts.set(interfaceColModel, insts.col);
  yapi.getInsts.set(interfaceCaseModel, insts.case);
  yapi.getInsts.set(interfaceModel, insts.interface);
  yapi.getInsts.set(projectModel, insts.project);
  yapi.getInsts.set(logModel, insts.log);
  return { calls, returns };
}

/**
 * 构造最小可用的 mock Koa 上下文。
 * @param {any} body 模拟 request.body（POST 参数）
 * @param {any} query 模拟 ctx.query（GET 参数）
 * @returns {any} mock ctx
 */
function createMockCtx(body = {}, query = {}) {
  return {
    request: { body, query },
    query: query,
    body: null
  };
}

/**
 * 创建一套完整的测试环境：注册 mock model、实例化控制器。
 * 注册与实例化之间无 await，AVA 并发执行时不会交错。
 * $user.role 为 admin 时 baseController.checkAuth 直接放行，
 * 无需额外覆写 checkAuth 即可通过鉴权分支。
 * @param {any} body 模拟 request.body
 * @param {any} query 模拟 ctx.query
 * @returns {any} 含 ctx、inst、calls、returns 的测试环境
 */
function createTestEnv(body, query) {
  const ctx = createMockCtx(body, query);
  const mocks = createModelMocks();
  const inst = new interfaceColController(ctx);
  inst.$uid = 11;
  inst.$user = { role: 'admin', username: 'admin' };
  return { ctx, inst, calls: mocks.calls, returns: mocks.returns };
}

/**
 * 等待一轮事件循环，让控制器中“发射后不管”的日志 Promise 链执行完毕。
 * @returns {Promise<void>}
 */
function flushAsync() {
  return new Promise(resolve => setImmediate(resolve));
}

test.serial('interfaceColController 继承自 baseController 且构造函数挂载 4 个 model 实例与 ctx', t => {
  t.is(Object.getPrototypeOf(interfaceColController), baseController);
  t.is(Object.getPrototypeOf(interfaceColController.prototype), baseController.prototype);
  const ctx = createMockCtx();
  createModelMocks();
  const inst = new interfaceColController(ctx);
  t.true(inst instanceof baseController);
  t.true(inst instanceof interfaceColController);
  // 构造函数中将 4 个 model 挂载为 yapi.getInst(modelClass) 返回的单例实例
  t.is(inst.colModel, yapi.getInst(interfaceColModel));
  t.is(inst.caseModel, yapi.getInst(interfaceCaseModel));
  t.is(inst.interfaceModel, yapi.getInst(interfaceModel));
  t.is(inst.projectModel, yapi.getInst(projectModel));
  t.is(inst.ctx, ctx);
});

test.serial('addCol 缺失 project_id 返回 400 项目id不能为空', async t => {
  const { ctx, inst } = createTestEnv({ name: '测试集' });

  await inst.addCol(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '项目id不能为空');
});

test.serial('addCol 缺失 name 返回 400 名称不能为空', async t => {
  const { ctx, inst } = createTestEnv({ project_id: 1 });

  await inst.addCol(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '名称不能为空');
});

test.serial('addCol 校验通过后保存接口集并写入操作日志', async t => {
  const { ctx, inst, calls } = createTestEnv({ project_id: 1, name: '测试集A', desc: '描述' });

  await inst.addCol(ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data._id, 71);
  t.is(calls.colSave.length, 1);
  t.is(calls.colSave[0].name, '测试集A');
  t.is(calls.colSave[0].project_id, 1);
  t.is(calls.colSave[0].desc, '描述');
  t.is(calls.colSave[0].uid, 11);
  t.true(typeof calls.colSave[0].add_time === 'number');
  // saveLog 为同步调用，日志 typeid 为项目 id
  t.is(calls.logSave.length, 1);
  t.is(calls.logSave[0].typeid, 1);
  t.is(calls.logSave[0].username, 'admin');
});

test.serial('addCase 缺失 project_id 返回 400 项目id不能为空', async t => {
  const { ctx, inst } = createTestEnv({ col_id: 5, interface_id: 301 });

  await inst.addCase(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '项目id不能为空');
});

test.serial('addCase 缺失 interface_id 返回 400 接口id不能为空', async t => {
  const { ctx, inst } = createTestEnv({ project_id: 1, col_id: 5 });

  await inst.addCase(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '接口id不能为空');
});

// 实现中该分支文案为 '接口集id不能为空'（addCol/addCaseList 同名分支一致），
// 历史描述中的 '接口分类id不能为空' 在源码中不存在
test.serial('addCase 鉴权通过后缺失 col_id 返回 400 接口集id不能为空', async t => {
  const { ctx, inst } = createTestEnv({ project_id: 1, interface_id: 301 });

  await inst.addCase(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '接口集id不能为空');
});

test.serial('addCase 校验通过后保存用例、更新项目时间并异步写日志', async t => {
  const env = createTestEnv({
    project_id: 1,
    col_id: 5,
    interface_id: 301,
    casename: '用例A',
    case_env: 'local'
  });
  env.returns.colGet = { _id: 5, name: '测试集A' };

  await env.inst.addCase(env.ctx);
  await flushAsync();

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data._id, 81);
  t.is(env.calls.caseSave.length, 1);
  t.is(env.calls.caseSave[0].casename, '用例A');
  t.is(env.calls.caseSave[0].uid, 11);
  t.is(env.calls.caseSave[0].index, 0);
  // 异步日志链：colModel.get(col_id) 后写操作日志
  t.deepEqual(env.calls.colGet, [5]);
  t.is(env.calls.logSave.length, 1);
  t.is(env.calls.logSave[0].typeid, 1);
  t.is(env.calls.projectUp.length, 1);
  t.is(env.calls.projectUp[0].id, 1);
  t.true(typeof env.calls.projectUp[0].data.up_time === 'number');
});

// 实现中校验的是 interface_list（case_list 参数在源码中不存在）；
// 非数组在 project_id 校验之前拦截；空数组因 truthy 会绕过该数组校验
test.serial('addCaseList interface_list 非数组返回 400，空数组绕过校验后缺失 project_id 返回 400', async t => {
  const missing = createTestEnv({ project_id: 1 });
  await missing.inst.addCaseList(missing.ctx);
  t.is(missing.ctx.body.errcode, 400);
  t.is(missing.ctx.body.errmsg, 'interface_list 参数有误');

  const empty = createTestEnv({ interface_list: [] });
  await empty.inst.addCaseList(empty.ctx);
  t.is(empty.ctx.body.errcode, 400);
  t.is(empty.ctx.body.errmsg, '项目id不能为空');
});

test.serial('addCaseList 校验通过后批量导入用例并逐条写日志', async t => {
  const env = createTestEnv({
    project_id: 1,
    col_id: 5,
    interface_list: [301, 302]
  });
  env.returns.colGet = { _id: 5, name: '测试集A' };
  env.returns.interfaceGetByIds = [
    {
      _id: 301,
      title: '接口A',
      req_body_type: 'json',
      req_body_other: '{"a":1}',
      req_body_is_json_schema: false
    },
    {
      _id: 302,
      title: '接口B',
      req_body_type: 'form',
      req_body_other: '',
      req_body_is_json_schema: false
    }
  ];

  await env.inst.addCaseList(env.ctx);
  await flushAsync();

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data, 'ok');
  // 批量读取接口，避免逐条查询
  t.deepEqual(env.calls.interfaceGetByIds, [[301, 302]]);
  t.deepEqual(env.calls.colGet, [5]);
  t.is(env.calls.caseSave.length, 2);
  t.is(env.calls.caseSave[0].project_id, 1);
  t.is(env.calls.caseSave[0].col_id, 5);
  t.is(env.calls.caseSave[0].uid, 11);
  t.is(env.calls.projectUp.length, 1);
  // 每条导入的用例各写一条操作日志
  t.is(env.calls.logSave.length, 2);
  t.is(env.calls.logSave[0].typeid, 1);
});

test.serial('cloneCaseList 依次缺失 project_id / col_id / new_col_id 分别返回 400 对应文案', async t => {
  // 实现文案为 '被克隆的接口集id不能为空' / '克隆的接口集id不能为空'，
  // 历史描述中的 'col_id 不能为空' / 'new_col_id 不能为空' 在源码中不存在
  const noProject = createTestEnv({});
  await noProject.inst.cloneCaseList(noProject.ctx);
  t.is(noProject.ctx.body.errcode, 400);
  t.is(noProject.ctx.body.errmsg, '项目id不能为空');

  const noCol = createTestEnv({ project_id: 1 });
  await noCol.inst.cloneCaseList(noCol.ctx);
  t.is(noCol.ctx.body.errcode, 400);
  t.is(noCol.ctx.body.errmsg, '被克隆的接口集id不能为空');

  const noNewCol = createTestEnv({ project_id: 1, col_id: 5 });
  await noNewCol.inst.cloneCaseList(noNewCol.ctx);
  t.is(noNewCol.ctx.body.errcode, 400);
  t.is(noNewCol.ctx.body.errmsg, '克隆的接口集id不能为空');
});

test.serial('cloneCaseList 校验通过后克隆用例到新接口集并清除旧 id 与时间戳', async t => {
  const env = createTestEnv({ project_id: 1, col_id: 5, new_col_id: 7 });
  env.returns.caseList = [
    {
      index: 1,
      toObject: () => ({
        _id: 501,
        col_id: 5,
        add_time: 1,
        up_time: 2,
        __v: 0,
        casename: '旧用例',
        req_body_other: '{"x":1}',
        req_query: [],
        req_params: [],
        req_body_form: []
      })
    }
  ];

  await env.inst.cloneCaseList(env.ctx);

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data, 'ok');
  t.deepEqual(env.calls.caseList, [{ id: 5, type: 'all' }]);
  t.is(env.calls.caseSave.length, 1);
  const saved = env.calls.caseSave[0];
  t.is(saved.col_id, 7);
  t.is(saved.casename, '旧用例');
  t.false('_id' in saved);
  t.false('add_time' in saved);
  t.false('up_time' in saved);
  t.false('__v' in saved);
  t.is(env.calls.projectUp.length, 1);
  t.is(env.calls.projectUp[0].id, 1);
});

test.serial('upCase 缺失 id 返回 400 用例id不能为空', async t => {
  const { ctx, inst } = createTestEnv({ casename: '新名字' });

  await inst.upCase(ctx);

  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '用例id不能为空');
});

test.serial('upCase 更新用例时不允许修改接口 id 与项目 id', async t => {
  const env = createTestEnv({
    id: 81,
    casename: '新名字',
    interface_id: 999,
    project_id: 2
  });
  env.returns.caseGet = { _id: 81, project_id: 1, col_id: 5, casename: '旧名字' };
  env.returns.colGet = { _id: 5, name: '测试集A' };

  await env.inst.upCase(env.ctx);
  await flushAsync();

  t.is(env.ctx.body.errcode, 0);
  t.deepEqual(env.calls.caseUp, [{ id: 81, data: { id: 81, casename: '新名字', uid: 11 } }]);
  // 日志链读取用例所属接口集
  t.deepEqual(env.calls.colGet, [5]);
  t.is(env.calls.logSave.length, 1);
  t.is(env.calls.projectUp.length, 1);
  t.is(env.calls.projectUp[0].id, 1);
});

// 实现中 caseModel.get 查不到数据时返回 '不存在的case'，
// 历史描述中的 '缺少caseid' 文案在源码中不存在
test.serial('getCase 缺失 caseid 时查询为空返回 400 不存在的case', async t => {
  const { ctx, inst, calls } = createTestEnv({}, {});

  await inst.getCase(ctx);

  t.deepEqual(calls.caseGet, [undefined]);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '不存在的case');
});

test.serial('getCase 返回用例详情并拼接接口路径与环境信息', async t => {
  const env = createTestEnv({}, { caseid: 81 });
  env.returns.caseGet = {
    toObject: () => ({ _id: 81, interface_id: 301, casename: '用例A' })
  };
  env.returns.interfaceGet = {
    toObject: () => ({
      _id: 301,
      path: '/a/b',
      method: 'get',
      project_id: 1,
      up_time: 123,
      req_body_type: 'json',
      res_body: '{}',
      res_body_type: 'json',
      req_body_is_json_schema: false,
      res_body_is_json_schema: false,
      req_headers: [],
      req_body_form: [],
      req_query: [],
      req_params: []
    })
  };
  env.returns.projectGetBaseInfo = { basepath: '/v1' };

  await env.inst.getCase(env.ctx);

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data.path, '/v1/a/b');
  t.is(env.ctx.body.data.method, 'get');
  t.is(env.ctx.body.data.interface_up_time, 123);
  t.deepEqual(env.ctx.body.data.req_query, []);
});

// 实现文案为 '缺少 col_id 参数'（含空格），历史描述中的 '缺少col_id' 在源码中不存在
test.serial('upCol 缺失 col_id 返回 400 缺少 col_id 参数，接口集不存在返回 400 不存在', async t => {
  const missing = createTestEnv({ name: '新名字' });
  await missing.inst.upCol(missing.ctx);
  t.is(missing.ctx.body.errcode, 400);
  t.is(missing.ctx.body.errmsg, '缺少 col_id 参数');

  const notFound = createTestEnv({ col_id: 404, name: '新名字' });
  await notFound.inst.upCol(notFound.ctx);
  t.is(notFound.ctx.body.errcode, 400);
  t.is(notFound.ctx.body.errmsg, '不存在');
});

test.serial('upCol 校验通过后更新接口集且更新数据不含 col_id', async t => {
  const env = createTestEnv({ col_id: 5, name: '新名字' });
  env.returns.colGet = { _id: 5, name: '旧名字', project_id: 1, uid: 22 };

  await env.inst.upCol(env.ctx);

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data.ok, 1);
  t.deepEqual(env.calls.colUp, [{ id: 5, data: { name: '新名字' } }]);
  // saveLog 为同步调用
  t.is(env.calls.logSave.length, 1);
  t.is(env.calls.logSave[0].typeid, 1);
});

// 实现中 body 本身必须为数组（参数名并非 cancels）；
// 非数组时虽进入 '请求参数必须是数组' 分支，但缺少 return，
// 随后 forEach 抛出 TypeError 被 catch 覆盖响应，最终 errcode 仍为 400
test.serial('upCaseIndex body 非数组返回 400，空数组直接成功，合法数组逐项更新 index', async t => {
  const bad = createTestEnv({ id: 101, index: 2 });
  await bad.inst.upCaseIndex(bad.ctx);
  t.is(bad.ctx.body.errcode, 400);
  t.is(bad.ctx.body.data, null);

  const empty = createTestEnv([]);
  await empty.inst.upCaseIndex(empty.ctx);
  t.is(empty.ctx.body.errcode, 0);
  t.is(empty.ctx.body.data, '成功！');
  t.is(empty.calls.caseUpCaseIndex.length, 0);

  const ok = createTestEnv([{ id: 101, index: 2 }, { id: 102, index: 1 }, { index: 9 }]);
  await ok.inst.upCaseIndex(ok.ctx);
  t.is(ok.ctx.body.errcode, 0);
  t.is(ok.ctx.body.data, '成功！');
  t.deepEqual(ok.calls.caseUpCaseIndex, [{ id: 101, index: 2 }, { id: 102, index: 1 }]);
});

test.serial('upColIndex body 非数组返回 400，合法数组逐项更新 index', async t => {
  const bad = createTestEnv(null);
  await bad.inst.upColIndex(bad.ctx);
  t.is(bad.ctx.body.errcode, 400);
  t.is(bad.ctx.body.data, null);

  const ok = createTestEnv([{ id: 201, index: 1 }, { id: 202, index: 3 }]);
  await ok.inst.upColIndex(ok.ctx);
  t.is(ok.ctx.body.errcode, 0);
  t.is(ok.ctx.body.data, '成功！');
  t.deepEqual(ok.calls.colUpColIndex, [{ id: 201, index: 1 }, { id: 202, index: 3 }]);
});

// 实现中缺失 col_id 时 colModel.get 查不到数据返回 '不存在的id'（该分支无 return，
// 后续读取 colData.uid 抛错但 catch 未回写 ctx.body），历史描述 '缺少col_id' 不存在
test.serial('delCol 接口集不存在时返回 400 不存在的id 且不执行删除', async t => {
  const { ctx, inst, calls } = createTestEnv({}, {});

  await inst.delCol(ctx);

  t.deepEqual(calls.colGet, [undefined]);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '不存在的id');
  t.is(calls.colDel.length, 0);
  t.is(calls.caseDelByCol.length, 0);
});

test.serial('delCol 非 owner 但具备 danger 权限时删除接口集及其用例', async t => {
  const env = createTestEnv({}, { col_id: 5 });
  env.returns.colGet = { _id: 5, name: '测试集A', project_id: 1, uid: 22 };

  await env.inst.delCol(env.ctx);

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data.ok, 1);
  t.deepEqual(env.calls.colDel, [5]);
  t.deepEqual(env.calls.caseDelByCol, [5]);
  t.is(env.calls.logSave.length, 1);
});

test.serial('delCase 缺失 caseid 时查询为空返回 400 不存在的caseid 且不执行删除', async t => {
  const { ctx, inst, calls } = createTestEnv({}, {});

  await inst.delCase(ctx);

  t.deepEqual(calls.caseGet, [undefined]);
  t.is(ctx.body.errcode, 400);
  t.is(ctx.body.errmsg, '不存在的caseid');
  t.is(calls.caseDel.length, 0);
});

test.serial('delCase 本人用例删除成功并异步写日志、更新项目时间', async t => {
  const env = createTestEnv({}, { caseid: 81 });
  env.returns.caseGet = { _id: 81, uid: 11, col_id: 5, project_id: 1, casename: '用例A' };
  env.returns.colGet = { _id: 5, name: '测试集A' };

  await env.inst.delCase(env.ctx);
  await flushAsync();

  t.is(env.ctx.body.errcode, 0);
  t.is(env.ctx.body.data.ok, 1);
  t.deepEqual(env.calls.caseDel, [81]);
  t.deepEqual(env.calls.colGet, [5]);
  t.is(env.calls.logSave.length, 1);
  t.is(env.calls.projectUp.length, 1);
  t.is(env.calls.projectUp[0].id, 1);
});

test.serial('requestParamsToObj 空输入返回空对象，name 数组映射为键且值为空字符串', async t => {
  const { inst } = createTestEnv({}, {});
  t.deepEqual(inst.requestParamsToObj(null), {});
  t.deepEqual(inst.requestParamsToObj(undefined), {});
  t.deepEqual(inst.requestParamsToObj([]), {});
  t.deepEqual(inst.requestParamsToObj('abc'), {});
  t.deepEqual(inst.requestParamsToObj([{ name: 'token' }, { name: 'page' }]), {
    token: '',
    page: ''
  });
  // 重复 name 合并为同一个键
  t.deepEqual(inst.requestParamsToObj([{ name: 'a' }, { name: 'b' }, { name: 'a' }]), {
    a: '',
    b: ''
  });
});

test.serial('unique 按指定字段去重且保持首次出现顺序，空数组返回空数组', async t => {
  const { inst } = createTestEnv({}, {});
  const deduped = inst.unique(
    [{ project_id: 3 }, { project_id: 1 }, { project_id: 3 }, { project_id: 2 }],
    'project_id'
  );
  t.deepEqual(deduped, [3, 1, 2]);
  t.deepEqual(inst.unique([], 'project_id'), []);
});

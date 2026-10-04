import test from 'ava';

// GET /api/project/get_env 鉴权面独立验证（不连库）：
// 口径对齐同资源既有判定 project/get（server/controllers/project/queryMethods.js:75-79）——
// 公开项目放行；私有项目需 view 级成员（admin/owner/dev/guest，base.js:381-385），
// 拒绝态必须在 env 查询之前硬短路（env.header 可能含目标 API 密钥）。
// 桩形态沿用 test/server/up-token-scope.test.js：直接 require 方法组模块，
// 以 this 注入调用（与 project.js 原型合并后的调用形态一致），不实例化控制器、不触 DB。
const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const baseController = require('../../server/controllers/base.js');
const envTokenMethods = require('../../server/controllers/project/envTokenMethods.js');
const ProjectController = require('../../server/controllers/project.js');
const projectModel = require('../../server/models/project.js');
const groupModel = require('../../server/models/group.js');
const logModel = require('../../server/models/log.js');
const followModel = require('../../server/models/follow.js');
const tokenModel = require('../../server/models/token.js');
const interfaceModel = require('../../server/models/interface.js');

test.before('挂载真实 commons 到 yapi 单例（resReturn 依赖）', () => {
  yapi.commons = commons;
});

// 作为 data 返回的哨兵对象：以引用相等断言证明桩返回值原样透传（防剥离/复制/改写）
const ENV_SENTINEL = {
  _id: 123,
  env: [
    {
      name: 'local',
      domain: 'http://127.0.0.1',
      header: [{ name: 'X-Target-Token', value: 'secret' }]
    }
  ]
};

/**
 * 构造 getEnv 实例桩（对齐原型合并后的 this 注入调用形态）。
 * 记录三处协作调用的完整参数：checkAuth / Model.getBaseInfo / Model.getByEnv；
 * getProjectRole 一并埋点，用于证明鉴权判定未绕过 checkAuth 直查角色。
 * @param {any} opts projectType/checkAuthResult/env/role/$user/getBaseInfoError/getByEnvError
 * @returns {any} { inst: 控制器桩, calls: 调用记录 }
 */
function createInst(opts) {
  const calls = { checkAuth: [], getBaseInfo: [], getByEnv: [], getProjectRole: [] };
  const inst = {
    $user: opts.$user,
    checkAuth: async (...args) => {
      calls.checkAuth.push(args);
      return opts.checkAuthResult;
    },
    getProjectRole: async (...args) => {
      calls.getProjectRole.push(args);
      return opts.role;
    },
    Model: {
      getBaseInfo: async (...args) => {
        calls.getBaseInfo.push(args);
        if (opts.getBaseInfoError) throw new Error(opts.getBaseInfoError);
        return opts.projectType;
      },
      getByEnv: async (...args) => {
        calls.getByEnv.push(args);
        if (opts.getByEnvError) throw new Error(opts.getByEnvError);
        return opts.env;
      }
    }
  };
  return { inst, calls };
}

/**
 * 构造 /api/project/get_env 的 Koa ctx 桩（真实路由为 GET query 传参）。
 * @param {any} [query] request.query 对象
 * @returns {any} ctx 桩
 */
function createCtx(query) {
  return { request: { query: query || {} }, body: null };
}

// ---------- ① 越权身份：非成员 + 私有项目 → 406，拒绝态不触达 env 查询 ----------

test.serial('getEnv: 非成员读私有项目 → 406 且未调用 getByEnv（拒绝先于查询）', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: false,
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(ctx.body.data, null);
  // 反恒真守卫：拒绝结论必须建立在真实发生的 getBaseInfo + checkAuth 判定上
  t.is(calls.getBaseInfo.length, 1);
  t.is(calls.checkAuth.length, 1);
  // 私有项目拒绝为硬短路：不得「先读 env 再判权限」
  t.is(calls.getByEnv.length, 0);
  t.deepEqual(calls.checkAuth[0], [123, 'project', 'view']);
});

// ---------- ② 高角色但非成员：判定只信 checkAuth 返回值 ----------

test.serial('getEnv: caller 自称高角色但 checkAuth=false → 仍 406（不绕过 checkAuth 直查角色）', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: false,
    role: 'owner',
    $user: { _id: 9, role: 'admin' },
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.is(calls.getByEnv.length, 0);
  // 未绕过 checkAuth 直查角色（否则高角色自称可能被采信）
  t.is(calls.getProjectRole.length, 0);
});

test.serial('getEnv: checkAuth 返回 truthy 非严格 true（1）→ 仍 406（保持 !== true 严格判定）', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: 1,
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.data, null);
  t.is(calls.getByEnv.length, 0);
});

// ---------- ③ 角色矩阵（成员侧）：view 级 guest/dev/admin/owner 一律放行 ----------

// 与 base.js:381-385 的 view 映射一致（admin/owner/dev/guest → true），口径来源 queryMethods.js:75-79
const VIEW_MEMBER_ROLES = ['guest', 'dev', 'admin', 'owner'];

VIEW_MEMBER_ROLES.forEach(role => {
  test.serial(`getEnv: 私有项目 ${role} 成员（view 级）放行并原样返回 {env}`, async t => {
    const { inst, calls } = createInst({
      projectType: { project_type: 'private' },
      checkAuthResult: true,
      env: ENV_SENTINEL
    });
    const ctx = createCtx({ project_id: 123 });

    await envTokenMethods.getEnv.call(inst, ctx);

    t.is(ctx.body.errcode, 0);
    t.is(ctx.body.errmsg, '成功！');
    // 引用相等：payload 形状与现状一致（data 即 getByEnv 返回值本身，未新增/剥离字段）
    t.is(ctx.body.data, ENV_SENTINEL);
    t.deepEqual(Object.keys(ctx.body).sort(), ['data', 'errcode', 'errmsg']);
    t.deepEqual(calls.checkAuth[0], [123, 'project', 'view']);
    t.is(calls.getByEnv.length, 1);
  });
});

test.serial('getEnv 口径补证: 真实 base.checkAuth(project, view) 对四类成员放行、非成员拒绝', async t => {
  const probe = Object.create(baseController.prototype);
  const authFor = role => {
    probe.getProjectRole = async () => role;
    return probe.checkAuth(123, 'project', 'view');
  };

  for (const role of VIEW_MEMBER_ROLES) {
    t.true(await authFor(role), `${role} 应通过 view 级判定`);
  }
  // 非成员经 getProjectRole 落到 'member'（base.js:357），view 级拒绝
  t.false(await authFor('member'));
});

// ---------- ④ 公开项目：非成员放行，且完全不调用 checkAuth ----------

[
  ['公开项目', { project_type: 'public' }],
  ['缺 project_type 字段', {}]
].forEach(([label, projectType]) => {
  test.serial(`getEnv: ${label} 非成员放行且不调用 checkAuth`, async t => {
    const { inst, calls } = createInst({
      projectType,
      checkAuthResult: false,
      env: ENV_SENTINEL
    });
    const ctx = createCtx({ project_id: 123 });

    await envTokenMethods.getEnv.call(inst, ctx);

    t.is(ctx.body.errcode, 0);
    t.is(ctx.body.data, ENV_SENTINEL);
    // 公开项目不进入鉴权分支：调用记录为空即证据（checkAuth 桩返回 false 也不影响放行）
    t.deepEqual(calls.checkAuth, []);
    t.deepEqual(calls.getBaseInfo, [[123, 'project_type']]);
    t.is(calls.getByEnv.length, 1);
  });
});

// ---------- ⑤ project_id 双形态：字符串 '123' / 数字行为一致 ----------

[
  ['字符串', '123'],
  ['数字', 123]
].forEach(([label, id]) => {
  test.serial(`getEnv: project_id ${label}形态（${id}）私有项目同为 406，参数原样透传`, async t => {
    const { inst, calls } = createInst({
      projectType: { project_type: 'private' },
      checkAuthResult: false,
      env: ENV_SENTINEL
    });
    const ctx = createCtx({ project_id: id });

    await envTokenMethods.getEnv.call(inst, ctx);

    t.is(ctx.body.errcode, 406);
    t.is(ctx.body.data, null);
    // 双形态不改判定：getBaseInfo/checkAuth 收到原样 id（未做 Number 归一化，与现状一致）
    t.deepEqual(calls.getBaseInfo, [[id, 'project_type']]);
    t.deepEqual(calls.checkAuth, [[id, 'project', 'view']]);
    t.is(calls.getByEnv.length, 0);
  });

  test.serial(`getEnv: project_id ${label}形态（${id}）公开项目同样放行`, async t => {
    const { inst, calls } = createInst({
      projectType: { project_type: 'public' },
      checkAuthResult: false,
      env: ENV_SENTINEL
    });
    const ctx = createCtx({ project_id: id });

    await envTokenMethods.getEnv.call(inst, ctx);

    t.is(ctx.body.errcode, 0);
    t.is(ctx.body.data, ENV_SENTINEL);
    t.is(calls.getByEnv.length, 1);
  });
});

test.serial('getEnv: 非数字字符串 id "abc" 不得泄露 env 数据（getBaseInfo null → 现状 null 形态）', async t => {
  const { inst, calls } = createInst({
    projectType: null,
    checkAuthResult: true,
    env: null
  });
  const ctx = createCtx({ project_id: 'abc' });

  await envTokenMethods.getEnv.call(inst, ctx);

  // 现状口径：项目查不到 → errcode 0 + data null（无 env 内容泄露）
  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.data, null);
  // 非数字 id 未被当作私有项目进入鉴权分支
  t.deepEqual(calls.checkAuth, []);
});

// ---------- ⑥ 参数缺失：无 project_id → 405，且不触达任何查询 ----------

test.serial('getEnv: 无 project_id → 405 空参拦截，未触达任何查询', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: true,
    env: ENV_SENTINEL
  });
  const ctx = createCtx();

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 405);
  t.is(ctx.body.errmsg, '项目id不能为空');
  t.is(ctx.body.data, null);
  t.deepEqual(calls.getBaseInfo, []);
  t.deepEqual(calls.getByEnv, []);
  t.deepEqual(calls.checkAuth, []);
});

test.serial('getEnv: project_id 为空串（边界）同样 405 且不触达查询', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: true,
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: '' });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 405);
  t.is(ctx.body.data, null);
  t.deepEqual(calls.getBaseInfo, []);
  t.deepEqual(calls.getByEnv, []);
});

// ---------- ⑦ 不存在项目：getBaseInfo null + getByEnv null → 现状 null 形态（回归钉） ----------

test.serial('getEnv: 项目不存在 → errcode 0 + data null（回归钉），不调用 checkAuth', async t => {
  const { inst, calls } = createInst({
    projectType: null,
    checkAuthResult: true,
    env: null
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 0);
  t.is(ctx.body.errmsg, '成功！');
  t.is(ctx.body.data, null);
  // projectType 为 null 时不进入鉴权分支（与现状一致）
  t.deepEqual(calls.checkAuth, []);
  t.is(calls.getByEnv.length, 1);
});

// ---------- ⑧ checkAuth 调用参数精确断言：(project_id, 'project', 'view') ----------

test.serial("getEnv: checkAuth 必须以 (project_id, 'project', 'view') 调用，防止被改成 edit/其它资源域", async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    checkAuthResult: false,
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(calls.checkAuth.length, 1);
  t.deepEqual(calls.checkAuth[0], [123, 'project', 'view']);
  t.is(calls.checkAuth[0][1], 'project');
  t.is(calls.checkAuth[0][2], 'view');
  // getBaseInfo 只取 project_type 最小字段（不整包读取项目）
  t.deepEqual(calls.getBaseInfo[0], [123, 'project_type']);
});

// ---------- ⑨ 异常路径：402 + e.message（回归钉） ----------

test.serial('getEnv: getByEnv 抛错 → 402 + e.message 且不泄露数据', async t => {
  const { inst } = createInst({
    projectType: { project_type: 'public' },
    getByEnvError: 'env 查询失败'
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.errmsg, 'env 查询失败');
  t.is(ctx.body.data, null);
});

test.serial('getEnv: getBaseInfo 抛错 → 402 + e.message，且不触达 env 查询', async t => {
  const { inst, calls } = createInst({
    getBaseInfoError: '项目查询失败',
    checkAuthResult: true,
    env: ENV_SENTINEL
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.errmsg, '项目查询失败');
  t.is(ctx.body.data, null);
  t.is(calls.getByEnv.length, 0);
});

test.serial('getEnv: checkAuth 抛错 → 402 且不触达 env 查询（异常不得降级为放行）', async t => {
  const { inst, calls } = createInst({
    projectType: { project_type: 'private' },
    env: ENV_SENTINEL
  });
  inst.checkAuth = async () => {
    throw new Error('鉴权异常');
  };
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  t.is(ctx.body.errcode, 402);
  t.is(ctx.body.errmsg, '鉴权异常');
  t.is(ctx.body.data, null);
  t.is(calls.getByEnv.length, 0);
});

// ---------- ⑩ 反恒真守卫：桩被真实调用的证据 ----------

test.serial('getEnv: 桩调用证据（引用透传 + 调用计数），防 stub 失效导致全绿假象', async t => {
  const envObj = { _id: 123, env: [{ name: 'prod' }] };
  const { inst, calls } = createInst({
    projectType: { project_type: 'public' },
    checkAuthResult: false,
    env: envObj
  });
  const ctx = createCtx({ project_id: 123 });

  await envTokenMethods.getEnv.call(inst, ctx);

  // 1) 被控桩确实被执行：计数非零
  t.is(calls.getBaseInfo.length, 1);
  t.is(calls.getByEnv.length, 1);
  // 2) 返回值走的是桩对象本身（引用相等），不是 undefined/复制体
  t.is(ctx.body.data, envObj);
  t.is(calls.getByEnv[0][0], 123);
});

// ---------- ⑪ 集成面：真实控制器实例 + 真实 base.checkAuth（仅模型桩，不连库） ----------

test.serial('getEnv(集成): 真实 projectController 实例 + 真实 base.checkAuth 拒绝跨项目 token 身份', async t => {
  const calls = { getBaseInfo: [], getByEnv: [] };
  const modelStub = {
    getBaseInfo: async (...args) => {
      calls.getBaseInfo.push(args);
      return { _id: 123, project_type: 'private' };
    },
    getByEnv: async (...args) => {
      calls.getByEnv.push(args);
      return ENV_SENTINEL;
    }
  };
  // 预置 model 实例桩，阻止真实 model 构造（其依赖 yapi.db/mongodb 连接），手法同 open.test.js
  yapi.getInsts.set(projectModel, modelStub);
  yapi.getInsts.set(groupModel, {});
  yapi.getInsts.set(logModel, {});
  yapi.getInsts.set(followModel, {});
  yapi.getInsts.set(tokenModel, {});
  yapi.getInsts.set(interfaceModel, {});

  const ctx = createCtx({ project_id: 123 });
  const inst = new ProjectController(ctx);
  // token 身份严格收敛为归属项目内 dev（base.js:296-305）：归属他项目时 getProjectRole 落 'member'，
  // 真实 base.checkAuth('view') 拒绝——用于验证原型合并后方法可达且判定链真实生效
  inst.$tokenAuth = true;
  inst.$tokenProjectId = 999;
  inst.$uid = 1;

  await inst.getEnv(ctx);

  t.is(ctx.body.errcode, 406);
  t.is(ctx.body.errmsg, '没有权限');
  t.is(ctx.body.data, null);
  t.is(calls.getByEnv.length, 0);
  t.deepEqual(calls.getBaseInfo, [[123, 'project_type']]);
});
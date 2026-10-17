import test from 'ava';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userModel = require('../../server/models/user.js');
const interfaceController = require('../../server/controllers/interface.js');

const MY_UID = 5;
// 接口真实归属项目 501：鉴权判定只信 doc.project_id（实际归属），
// 与连接自报的任何 id/项目信息无关。
const PROJECT_ID = 501;

// 持锁人 uid=42 的接口：① 持锁人存在为 busy 态，② 持锁人账号已删（findById→null）为自愈态
const LOCKED_DOC = { _id: 77, project_id: PROJECT_ID, edit_uid: 42, title: 'iface-1' };
const BUSY_HOLDER = { _id: 42, username: 'bob' };

test.before('挂载真实 commons 到 yapi 单例', () => {
  // solveConflict 的 catch 依赖 yapi.commons.log，测试环境手动挂载真实工具模块
  yapi.commons = commons;
});

// 注：「修复前必红 / 三态等价」证据在验证轮经 git-show 探针完成并留档（BUGLOG 2026-10-04、
// TECH_DEBT「四、11」）；常驻套件只钉修复后行为——CI 为浅克隆（fetch-depth 1），不做 git
// 历史回溯，故不入库依赖 git 的对照用例。

/**
 * 构造 solveConflict 的 this / ctx 桩与调用记录（反恒真：参数与次数全断言）。
 * @param {{ uid: number, doc: any, holder: any, queryId?: string, Controller?: any,
 *           authz?: boolean | Record<string, boolean>, authzError?: string }} opts
 *   authz：checkAuth 桩返回值——boolean 全 action 统一；按 action 映射（如
 *   { view: true, edit: false } 钉 guest 语义：可读但不可编辑。
 * @returns {{ inst: any, ctx: any, calls: any }}
 */
function createHarness(opts) {
  const Controller = opts.Controller || interfaceController;
  const calls = { checkAuth: [], getInst: [], findById: [], upEditUid: [], sends: [], closeRegs: [] };
  yapi.getInst = m => {
    calls.getInst.push(m);
    return {
      findById: async id => {
        calls.findById.push(id);
        return opts.holder;
      }
    };
  };
  const inst = Object.create(Controller.prototype);
  // 经真实 baseController.getUid()（parseInt($uid, 10)）取数，与生产登录态同形
  inst.$uid = String(opts.uid);
  // checkAuth 桩：solveConflict 修复后先于读锁持有人/写锁判定 edit 权限
  inst.checkAuth = (...args) => {
    calls.checkAuth.push(args);
    if (opts.authzError) return Promise.reject(new Error(opts.authzError));
    const r = typeof opts.authz === 'boolean' ? opts.authz : (opts.authz || {}).edit;
    return Promise.resolve(r);
  };
  inst.Model = {
    get: async () => opts.doc,
    upEditUid: (id, uid) => {
      calls.upEditUid.push([id, uid]);
      return Promise.resolve();
    }
  };
  const ctx = {
    // id 以字符串形态下发，钉死 parseInt(ctx.query.id, 10) 归一化后的调用参数
    // （doc 为 null 的用例需显式传 queryId——不能从 doc._id 推导）
    query: { id: opts.queryId === undefined ? String(opts.doc._id) : opts.queryId },
    websocket: {
      send: frame => calls.sends.push(frame),
      on: (event, handler) => calls.closeRegs.push([event, handler])
    }
  };
  return { inst, ctx, calls };
}

/**
 * 断言恰 1 帧 websocket 输出并解析（修复前的 TypeError 会被 catch 吞掉、表现为零发送）。
 * @param {any} t ava 断言对象
 * @param {any[]} frames websocket.send 记录
 * @returns {any} 解析后帧
 */
function parseSingleFrame(t, frames) {
  t.is(frames.length, 1, 'websocket.send 恰 1 帧');
  return JSON.parse(frames[0]);
}

/**
 * 消费者行为断言辅助：触发全部已注册 close 处理器。
 * 锁释放语义必须以「处理器执行后 Model 收到什么」为准，而非只数回调注册数量。
 * @param {any} calls createHarness 的调用记录
 */
function fireCloseHandlers(calls) {
  calls.closeRegs.forEach(([, handler]) => handler());
}

// ---------- 授权态（owner/dev：checkAuth edit=true）四态语义 ----------

test.serial('solveConflict ① 持锁人存在：恰 1 帧 errno=edit_uid 与持锁人名，不移交锁', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER, authz: true
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.deepEqual(frame, { errno: 42, data: { uid: 42, username: 'bob' } });
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'edit']], '鉴权以接口实际归属 project_id 判 edit');
  t.deepEqual(calls.getInst, [userModel], 'userInst 恰经 yapi.getInst(userModel) 取得一次');
  t.deepEqual(calls.findById, [42], 'findById 恰以持锁人 uid 调一次');
  t.deepEqual(calls.upEditUid, [], 'busy 分支不得写 edit_uid');
  // busy 旁观连接（未取得锁）不得注册 close 释放回调：以消费者行为钉死——
  // 即使实现仍注册了处理器，执行后也不得产生 (接口id, 0) 的释放写。
  t.deepEqual(calls.closeRegs, [], 'busy 连接不注册 close 回调');
  fireCloseHandlers(calls);
  t.deepEqual(calls.upEditUid, [], '触发任何 close 处理器都不得释放他人锁');
});

test.serial('solveConflict ② 持锁人账号已删：恰 1 帧 errno 0 并移交锁给当前打开者', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc: LOCKED_DOC, holder: null, authz: true
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, LOCKED_DOC);
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'edit']]);
  t.deepEqual(calls.getInst, [userModel], '失效判定必须先查 user 表');
  t.deepEqual(calls.findById, [42], 'findById 以持锁人 uid 调一次并回 null');
  t.deepEqual(calls.upEditUid, [[77, MY_UID]], 'upEditUid(接口id, 我的uid) 参数精确且恰一次');
});

test.serial('solveConflict ③ edit_uid=本人：走 else 不查 user 表，锁写回本人', async t => {
  const doc = { _id: 77, project_id: PROJECT_ID, edit_uid: MY_UID, title: 'iface-1' };
  // holder 置为有效用户：若误入查表路径会返回 busy，钉死分支由 getUid 判定
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc, holder: BUSY_HOLDER, authz: true
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, doc);
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'edit']]);
  t.deepEqual(calls.getInst, [], '本人持锁不查 user 表');
  t.deepEqual(calls.findById, [], '本人持锁不调 findById');
  t.deepEqual(calls.upEditUid, [[77, MY_UID]], '锁写回本人');
});

test.serial('solveConflict ④ edit_uid=0（无锁）：走 else，锁写回本人', async t => {
  const doc = { _id: 77, project_id: PROJECT_ID, edit_uid: 0, title: 'iface-1' };
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc, holder: BUSY_HOLDER, authz: true
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, doc);
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'edit']]);
  t.deepEqual(calls.getInst, []);
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [[77, MY_UID]]);
});

// ---------- 锁生命周期：取锁连接 close 归还锁（消费者行为） ----------

test.serial('solveConflict 取锁连接 close：释放回调以 (接口id, 0) 归还锁', async t => {
  const doc = { _id: 77, project_id: PROJECT_ID, edit_uid: 0, title: 'iface-1' };
  const { inst, ctx, calls } = createHarness({ uid: MY_UID, doc, holder: null, authz: true });
  await inst.solveConflict(ctx);

  t.deepEqual(calls.closeRegs.map(r => r[0]), ['close'], '取锁连接恰注册 1 个 close 回调');
  fireCloseHandlers(calls);
  t.deepEqual(calls.upEditUid, [[77, MY_UID], [77, 0]], 'close 消费者行为：先取锁、关闭后归还 (77, 0)');
});

// ---------- 越权入口回归：非成员 / guest 在读锁持有人与写锁之前被拒 ----------

test.serial('solveConflict 越权①：非成员（checkAuth edit=false）→ errno 406 data null，无资源帧', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER, authz: false
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 406);
  t.is(frame.data, null, '拒绝帧不得携带接口文档（资源不外泄）');
  t.deepEqual(calls.checkAuth, [[PROJECT_ID, 'project', 'edit']], '以 doc 实际归属判 edit，而非连接自报');
  // 拒绝必须先于一切副作用：不读锁持有人、不写锁、不注册 close
  t.deepEqual(calls.getInst, [], '不查 user 表（不读锁持有人）');
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [], '不得写编辑锁');
  t.deepEqual(calls.closeRegs, []);
  fireCloseHandlers(calls);
  t.deepEqual(calls.upEditUid, [], '任何 close 处理器执行后仍无锁写');
});

test.serial('solveConflict 越权②：guest 成员（view 放行 / edit 拒绝）仍 406——判的是 edit 不是 view', async t => {
  const doc = { _id: 77, project_id: PROJECT_ID, edit_uid: 0, title: 'iface-1' };
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc, holder: BUSY_HOLDER, authz: { view: true, edit: false }
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 406, 'guest 可读不代表可写编辑锁（WS 入口同样拒绝）');
  t.is(frame.data, null);
  t.deepEqual(calls.checkAuth[0].slice(1), ['project', 'edit'], 'action 必须是 edit（弱化成 view 即越权）');
  t.deepEqual(calls.upEditUid, [], '无锁写');
});

test.serial('solveConflict 越权③：checkAuth 返回 truthy 非严格 true（1）→ 仍 406（保持 !== true 严格判定）', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER, authz: 1
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 406);
  t.is(frame.data, null);
  t.deepEqual(calls.upEditUid, []);
});

test.serial('solveConflict 越权④：project_id 以字符串形态存储时原样参与判定（id string/number 一致拒绝）', async t => {
  const doc = { _id: 77, project_id: String(PROJECT_ID), edit_uid: 0, title: 'iface-1' };
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc, holder: BUSY_HOLDER, authz: false
  });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 406);
  t.deepEqual(calls.checkAuth, [[String(PROJECT_ID), 'project', 'edit']], '字符串 project_id 原样透传判定');
  t.deepEqual(calls.upEditUid, []);
});

test.serial('solveConflict 越权⑤：checkAuth 抛错 → 被 catch 吞掉不外抛、零发送（异常不得降级为放行）', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER, authzError: 'auth backend down'
  });
  await inst.solveConflict(ctx);

  t.deepEqual(calls.sends, [], '异常路径零发送');
  t.deepEqual(calls.upEditUid, [], '异常路径不得写锁');
  t.deepEqual(calls.closeRegs, []);
});

// ---------- 既有回归：接口不存在 ----------

test.serial('solveConflict ⑤ 接口不存在（Model.get→null）：回错误帧而非静默零发送', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID,
    doc: null,
    holder: BUSY_HOLDER,
    queryId: '77',
    authz: false
  });
  await inst.solveConflict(ctx);

  // 修复前：result 为 null → 下行 result.edit_uid 抛错被 catch 吞 → 零发送，
  // 前端只能等 3 秒超时降级（锁语义失效且无提示）。现回一帧 errno 0 + data null。
  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0, 'errno 0 让前端立即进入可编辑态（不再等待超时）');
  t.is(frame.data, null);
  t.deepEqual(calls.checkAuth, [], '文档不存在先短路，不进鉴权');
  t.deepEqual(calls.getInst, [], 'null 文档不查 user 表');
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [], 'null 文档不写锁');
});

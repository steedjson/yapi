import test from 'ava';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userModel = require('../../server/models/user.js');
const interfaceController = require('../../server/controllers/interface.js');

const MY_UID = 5;

// 持锁人 uid=42 的接口：① 持锁人存在为 busy 态，② 持锁人账号已删（findById→null）为自愈态
const LOCKED_DOC = { _id: 77, edit_uid: 42, title: 'iface-1' };
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
 * @param {{ uid: number, doc: any, holder: any, queryId?: string, Controller?: any }} opts
 * @returns {{ inst: any, ctx: any, calls: any }}
 */
function createHarness(opts) {
  const Controller = opts.Controller || interfaceController;
  const calls = { getInst: [], findById: [], upEditUid: [], sends: [], closeRegs: [] };
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

test.serial('solveConflict ① 持锁人存在：恰 1 帧 errno=edit_uid 与持锁人名，不移交锁', async t => {
  const { inst, ctx, calls } = createHarness({ uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.deepEqual(frame, { errno: 42, data: { uid: 42, username: 'bob' } });
  t.deepEqual(calls.getInst, [userModel], 'userInst 恰经 yapi.getInst(userModel) 取得一次');
  t.deepEqual(calls.findById, [42], 'findById 恰以持锁人 uid 调一次');
  t.deepEqual(calls.upEditUid, [], 'busy 分支不得写 edit_uid');
  t.deepEqual(calls.closeRegs.map(r => r[0]), ['close']);
});

test.serial('solveConflict ② 持锁人账号已删：恰 1 帧 errno 0 并移交锁给当前打开者', async t => {
  const { inst, ctx, calls } = createHarness({ uid: MY_UID, doc: LOCKED_DOC, holder: null });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, LOCKED_DOC);
  t.deepEqual(calls.getInst, [userModel], '失效判定必须先查 user 表');
  t.deepEqual(calls.findById, [42], 'findById 以持锁人 uid 调一次并回 null');
  t.deepEqual(calls.upEditUid, [[77, MY_UID]], 'upEditUid(接口id, 我的uid) 参数精确且恰一次');
  t.deepEqual(calls.closeRegs.map(r => r[0]), ['close']);
});

test.serial('solveConflict ③ edit_uid=本人：走 else 不查 user 表，锁写回本人', async t => {
  const doc = { _id: 77, edit_uid: MY_UID, title: 'iface-1' };
  // holder 置为有效用户：若误入查表路径会返回 busy，钉死分支由 getUid 判定
  const { inst, ctx, calls } = createHarness({ uid: MY_UID, doc, holder: BUSY_HOLDER });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, doc);
  t.deepEqual(calls.getInst, [], '本人持锁不查 user 表');
  t.deepEqual(calls.findById, [], '本人持锁不调 findById');
  t.deepEqual(calls.upEditUid, [[77, MY_UID]], '锁写回本人');
});

test.serial('solveConflict ④ edit_uid=0（无锁）：走 else，锁写回本人', async t => {
  const doc = { _id: 77, edit_uid: 0, title: 'iface-1' };
  const { inst, ctx, calls } = createHarness({ uid: MY_UID, doc, holder: BUSY_HOLDER });
  await inst.solveConflict(ctx);

  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0);
  t.deepEqual(frame.data, doc);
  t.deepEqual(calls.getInst, []);
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [[77, MY_UID]]);
});

test.serial('solveConflict ⑤ 接口不存在（Model.get→null）：回错误帧而非静默零发送', async t => {
  const { inst, ctx, calls } = createHarness({
    uid: MY_UID,
    doc: null,
    holder: BUSY_HOLDER,
    queryId: '77'
  });
  await inst.solveConflict(ctx);

  // 修复前：result 为 null → 下行 result.edit_uid 抛错被 catch 吞 → 零发送，
  // 前端只能等 3 秒超时降级（锁语义失效且无提示）。现回一帧 errno 0 + data null。
  const frame = parseSingleFrame(t, calls.sends);
  t.is(frame.errno, 0, 'errno 0 让前端立即进入可编辑态（不再等待超时）');
  t.is(frame.data, null);
  t.deepEqual(calls.getInst, [], 'null 文档不查 user 表');
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [], 'null 文档不写锁');
});
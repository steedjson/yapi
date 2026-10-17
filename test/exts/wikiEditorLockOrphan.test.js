import test from 'ava';

// wiki 控制器以非相对路径 require('controllers/base.js')/'yapi.js'：生产由 server/app.js
// 置 NODE_PATH=server 后 Module._initPaths() 解析；测试进程复刻同一机制，必须先于
// 下方插件 controller 的 require 执行（同 test/server/advmock-auth-scope.test.js）。
// 注：「修复前必红 / 三态等价」证据在验证轮经 git-show 探针完成并留档（BUGLOG 2026-10-04、
// TECH_DEBT「四、11」）；常驻套件只钉修复后行为——CI 为浅克隆（fetch-depth 1），不做 git
// 历史回溯，故不入库依赖 git 的对照用例。
const Module = require('module');
const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '../../server');
Module._initPaths();

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');
const userModel = require('../../server/models/user.js');
const wikiController = require('../../exts/yapi-plugin-wiki/controller.js');

const MY_UID = 5;

test.before('挂载真实 commons 到 yapi 单例', () => {
  // wikiConflict 的内层兜底依赖 yapi.commons.log，测试环境手动挂载真实工具模块
  yapi.commons = commons;
});

// 持锁人 uid=42 的文档：① 持锁人存在为 busy 态，② 持锁人账号已删（findById→null）为自愈态。
// project_id=33 是文档真实归属项目：wikiConflict 授权必须以它（而非 ctx.query.id）为鉴权主体。
const LOCKED_DOC = { _id: 7, edit_uid: 42, desc: 'wiki-正文', project_id: 33 };
const BUSY_HOLDER = { _id: 42, username: 'bob' };

/**
 * 构造 wikiController 实例桩：只提供 editorFunc 触达的 this.Model / getUid 与
 * yapi.getInst(userModel) 桩。调用记录用于反恒真断言（参数与次数）。
 * @param {{ uid: number, doc: any, holder: any, Controller?: any }} opts Controller 缺省为工作区版本
 * @returns {{ inst: any, calls: { getInst: any[], findById: any[], upEditUid: any[] } }}
 */
function createHarness(opts) {
  const Controller = opts.Controller || wikiController;
  const calls = { getInst: [], findById: [], upEditUid: [] };
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
    upEditUid: async (id, uid) => {
      calls.upEditUid.push([id, uid]);
    }
  };
  return { inst, calls };
}

/**
 * 装配 wikiConflict 的 ctx 桩：取回 message 处理器与发送帧/写库/鉴权调用记录。
 * wikiConflict 现按文档真实 project_id 走 this.checkAuth——真实 baseController.checkAuth
 * 会级联查 project/group 模型，此处以可编程 decide 桩替位并记录入参；缺省放行，
 * 令锁语义用例聚焦（授权矩阵见下方「编辑锁授权」节）。
 * @param {any} Controller
 * @param {{ holder?: any, doc?: any, decide?: (id: any, type: string, action: string) => any }} [opts]
 *   holder：editorFunc 查 user 表的持锁人（缺省 null=账号已删）；doc：Model.get 返回值
 *   （缺省 LOCKED_DOC，显式传 null 走 407 路径）；decide：checkAuth 判定函数（缺省放行）。
 */
function createConflictHarness(Controller, opts) {
  const frames = [];
  const handlers = {};
  const calls = { upEditUid: [], checkAuth: [] };
  yapi.getInst = () => ({ findById: async () => (opts && opts.holder) || null });
  const inst = Object.create(Controller.prototype);
  inst.$uid = String(MY_UID);
  const decide = (opts && opts.decide) || (() => true);
  inst.checkAuth = async (id, type, action) => {
    calls.checkAuth.push([id, type, action]);
    return decide(id, type, action);
  };
  const doc = opts && 'doc' in opts ? opts.doc : LOCKED_DOC;
  inst.Model = {
    get: async () => doc,
    upEditUid: async (id, uid) => {
      calls.upEditUid.push([id, uid]);
    }
  };
  const ctx = {
    query: { id: String(LOCKED_DOC._id) },
    websocket: {
      on: (event, handler) => {
        handlers[event] = handler;
      },
      send: frame => frames.push(frame)
    }
  };
  return { inst, ctx, handlers, frames, calls };
}

test.serial('editorFunc ① 持锁人存在：busy 返回 errno=edit_uid 与持锁人名，不移交锁', async t => {
  const { inst, calls } = createHarness({ uid: MY_UID, doc: LOCKED_DOC, holder: BUSY_HOLDER });
  const data = await inst.editorFunc(LOCKED_DOC);

  t.deepEqual(data, { errno: 42, data: { uid: 42, username: 'bob' } });
  t.deepEqual(calls.getInst, [userModel], 'userInst 恰经 yapi.getInst(userModel) 取得一次');
  t.deepEqual(calls.findById, [42], 'findById 恰以持锁人 uid 调一次');
  t.deepEqual(calls.upEditUid, [], 'busy 分支不得写 edit_uid');
});

test.serial('editorFunc ② 持锁人账号已删：自愈移交锁给当前打开者并返回 errno 0', async t => {
  const { inst, calls } = createHarness({ uid: MY_UID, doc: LOCKED_DOC, holder: null });
  const data = await inst.editorFunc(LOCKED_DOC);

  t.is(data.errno, 0);
  t.is(data.data, LOCKED_DOC, 'data 为原文档（引用未替换）');
  t.deepEqual(calls.getInst, [userModel], '失效判定必须先查 user 表');
  t.deepEqual(calls.findById, [42], 'findById 以持锁人 uid 调一次并回 null');
  t.deepEqual(calls.upEditUid, [[7, MY_UID]], 'upEditUid(文档id, 我的uid) 参数精确且恰一次');
});

test.serial('editorFunc ③ edit_uid=本人：走 else 不查 user 表，锁写回本人', async t => {
  const doc = { _id: 7, edit_uid: MY_UID, desc: 'wiki-正文' };
  // holder 置为有效用户：若误入查表路径会返回 busy，钉死分支由 getUid 判定
  const { inst, calls } = createHarness({ uid: MY_UID, doc, holder: BUSY_HOLDER });
  const data = await inst.editorFunc(doc);

  t.deepEqual(data, { errno: 0, data: doc });
  t.deepEqual(calls.getInst, [], '本人持锁不查 user 表');
  t.deepEqual(calls.findById, [], '本人持锁不调 findById');
  t.deepEqual(calls.upEditUid, [[7, MY_UID]], '锁写回本人');
});

test.serial('editorFunc ④ edit_uid=0（无锁）：走 else，锁写回本人', async t => {
  const doc = { _id: 7, edit_uid: 0, desc: 'wiki-正文' };
  const { inst, calls } = createHarness({ uid: MY_UID, doc, holder: BUSY_HOLDER });
  const data = await inst.editorFunc(doc);

  t.deepEqual(data, { errno: 0, data: doc });
  t.deepEqual(calls.getInst, []);
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [[7, MY_UID]]);
});

test.serial('editorFunc ⑤ result=null：短路保持 {errno:0,data:null}，零副作用', async t => {
  const { inst, calls } = createHarness({ uid: MY_UID, doc: null, holder: BUSY_HOLDER });
  const data = await inst.editorFunc(null);

  t.deepEqual(data, { errno: 0, data: null });
  t.is(data.data, null);
  t.deepEqual(calls.getInst, [], '空文档不查 user 表');
  t.deepEqual(calls.findById, []);
  t.deepEqual(calls.upEditUid, [], '空文档不写库');
});

test.serial('wikiConflict 消息链路：持锁人账号已删恰 1 帧 errno 0 并移交锁', async t => {
  // 持锁人账号已删 + 授权放行（checkAuth 桩缺省 true）：恰 1 帧 errno 0，且锁移交给
  // 当前打开者（修复前该路径 TypeError 未被捕获 → 零帧 + 未处理拒绝；「修复前必红」
  // 证据见 BUGLOG/TECH_DEBT「四、11」）
  const h = createConflictHarness(wikiController);
  await h.inst.wikiConflict(h.ctx);
  await h.handlers.message('editor');
  t.is(h.frames.length, 1, '恰 1 帧');
  t.deepEqual(JSON.parse(h.frames[0]), { errno: 0, data: LOCKED_DOC });
  t.deepEqual(h.calls.checkAuth, [[33, 'project', 'edit']], 'editor 恰以文档真实 project_id 鉴权一次');
  t.deepEqual(h.calls.upEditUid, [[7, MY_UID]]);
});

// ---------- 编辑锁授权（Wiki WebSocket 鉴权缺口）：均经真实 message handler 驱动 ----------

test.serial('授权① 非成员私库 start 即拒：恰 1 帧 {errno:406,data:null}，不派发、零锁写', async t => {
  const h = createConflictHarness(wikiController, { decide: () => false });
  await h.inst.wikiConflict(h.ctx);
  await h.handlers.message('start');

  t.deepEqual(JSON.parse(h.frames[0]), { errno: 406, data: null, errmsg: '没有权限' });
  t.is(h.frames.length, 1, '拒绝帧之外无任何派发（未触达 websocketMsgMap/startFunc）');
  t.deepEqual(h.calls.checkAuth, [[33, 'project', 'view']], 'start 只读锁状态，按 view 鉴权');
  t.deepEqual(h.calls.upEditUid, [], '无锁写');
});

test.serial('授权② guest：start（view）放行零帧，editor/end（edit）拒绝且不清他人锁', async t => {
  const h = createConflictHarness(wikiController, {
    decide: (id, type, action) => action === 'view'
  });
  await h.inst.wikiConflict(h.ctx);

  await h.handlers.message('start');
  t.is(h.frames.length, 0, 'view 通过：startFunc 无返回帧');
  t.deepEqual(h.calls.upEditUid, [], 'start 对他人持锁文档零锁写（edit_uid 非本人）');

  await h.handlers.message('editor');
  await h.handlers.message('end');
  t.deepEqual(
    h.frames.map(frame => JSON.parse(frame)),
    [
      { errno: 406, data: null, errmsg: '没有权限' },
      { errno: 406, data: null, errmsg: '没有权限' }
    ],
    'editor/end 均以 edit 鉴权拒绝'
  );
  t.deepEqual(h.calls.checkAuth, [
    [33, 'project', 'view'],
    [33, 'project', 'edit'],
    [33, 'project', 'edit']
  ]);
  t.deepEqual(h.calls.upEditUid, [], 'guest 不得取得或清除他人锁');
});

test.serial('授权③ owner/dev：start/editor/end 全通过，锁语义保持（自愈取锁、end 清锁）', async t => {
  const h = createConflictHarness(wikiController, { decide: () => true, holder: null });
  await h.inst.wikiConflict(h.ctx);

  await h.handlers.message('start');
  t.is(h.frames.length, 0, 'start 语义不变：无返回帧');
  t.deepEqual(h.calls.upEditUid, []);

  await h.handlers.message('editor');
  t.is(h.frames.length, 1, '通过 edit 鉴权后走原取锁路径');
  t.deepEqual(JSON.parse(h.frames[0]), { errno: 0, data: LOCKED_DOC });
  t.deepEqual(h.calls.upEditUid, [[7, MY_UID]]);

  await h.handlers.message('end');
  t.is(h.frames.length, 1, 'end 语义不变：清锁无返回帧');
  t.deepEqual(h.calls.upEditUid, [[7, MY_UID], [7, 0]]);
});

test.serial('授权④ 以文档真实 project_id 鉴权：成员判定只认 33，query.id/_id 不得为鉴权主体', async t => {
  // 「项目 33 成员」视角仅在 id===33 时放行；若实现误以 ctx.query.id（7，恰等于 _id）鉴权，必得 406
  const h = createConflictHarness(wikiController, { decide: id => id === 33 });
  await h.inst.wikiConflict(h.ctx);
  await h.handlers.message('editor');

  t.deepEqual(h.calls.checkAuth, [[33, 'project', 'edit']], 'checkAuth 恰以 result.project_id 调用');
  t.is(h.frames.length, 1);
  t.is(JSON.parse(h.frames[0]).errno, 0, '按真实归属项目放行（持锁人已删 → 自愈取锁）');
});

test.serial('授权⑤ wiki 不存在：有编辑权限进入首次创建流程，非成员仍拒绝', async t => {
  const allowed = createConflictHarness(wikiController, { doc: null, decide: id => id === 7 });
  await allowed.inst.wikiConflict(allowed.ctx);
  await allowed.handlers.message('editor');
  t.deepEqual(JSON.parse(allowed.frames[0]), { errno: 0, data: null });
  t.deepEqual(allowed.calls.checkAuth, [[7, 'project', 'edit']]);
  t.deepEqual(allowed.calls.upEditUid, []);

  const denied = createConflictHarness(wikiController, { doc: null, decide: () => false });
  await denied.inst.wikiConflict(denied.ctx);
  await denied.handlers.message('editor');
  t.deepEqual(JSON.parse(denied.frames[0]), { errno: 406, data: null, errmsg: '没有权限' });
  t.deepEqual(denied.calls.upEditUid, []);
});

test.serial('授权⑥ fail closed：false / truthy 非严格 true / 抛错均拒绝且异常不外泄', async t => {
  // false 与 truthy 非严格 true（=== true 严格判定）：均须落到 406 拒绝帧
  for (const verdict of [false, 1]) {
    const h = createConflictHarness(wikiController, { decide: () => verdict });
    await h.inst.wikiConflict(h.ctx);
    await h.handlers.message('editor');
    t.is(h.frames.length, 1, `verdict=${String(verdict)} 恰 1 帧`);
    t.deepEqual(
      JSON.parse(h.frames[0]),
      { errno: 406, data: null, errmsg: '没有权限' },
      `verdict=${String(verdict)} 不得按 truthy 放行`
    );
    t.deepEqual(h.calls.upEditUid, [], `verdict=${String(verdict)} 零锁写`);
  }

  // checkAuth 抛错：内层兜底吸收 → 零帧、一条 error 日志（异常细节不经 websocket 外泄）
  const logs = [];
  const realLog = yapi.commons.log;
  yapi.commons.log = (msg, type) => logs.push([msg, type]);
  t.teardown(() => {
    yapi.commons.log = realLog;
  });
  const h = createConflictHarness(wikiController, {
    decide: () => {
      throw new Error('authz-internal');
    }
  });
  await h.inst.wikiConflict(h.ctx);
  await t.notThrowsAsync(() => h.handlers.message('editor'));
  t.is(h.frames.length, 0, '异常路径零帧：err.message 不外发客户端');
  t.is(logs.length, 1);
  t.is(logs[0][1], 'error');
  t.deepEqual(h.calls.upEditUid, []);
});

test.serial('websocketMsgMap：未知消息返回 undefined 而非抛 TypeError（协议噪音守卫）', async t => {
  const calls = { upEditUid: [] };
  const inst = Object.create(wikiController.prototype);
  inst.$uid = String(MY_UID);
  inst.Model = {
    upEditUid: async (id, uid) => {
      calls.upEditUid.push([id, uid]);
    }
  };

  // 客户端只发 start/end/editor；未知键原实现直接调用 map[msg] 抛 TypeError，
  // 且抛点在异步 handler 内（未处理拒绝面）——现返回 undefined，由调用方跳过发送。
  t.is(inst.websocketMsgMap('unknown-msg', LOCKED_DOC), undefined);
  t.is(inst.websocketMsgMap('__proto__', LOCKED_DOC), undefined, '原型键同样不得命中');
  t.is(
    inst.websocketMsgMap('toString', LOCKED_DOC),
    undefined,
    '继承属性（Object.prototype.toString 是函数）同样不得命中——须用 hasOwnProperty 判定'
  );
  t.deepEqual(calls.upEditUid, [], '未知消息不得触达任何写库');

  // 合法键仍正常路由（end 分支：不查 user 表、仅清锁）
  await inst.websocketMsgMap('end', { _id: 7, edit_uid: 42 });
  t.deepEqual(calls.upEditUid, [[7, 0]], 'end 分支清锁语义不变');
});

test.serial('wikiConflict：handler 内异常被内层兜底吸收（不外泄为未处理拒绝）', async t => {
  const frames = [];
  const handlers = {};
  const logs = [];
  const realLog = yapi.commons.log;
  yapi.commons.log = (msg, type) => logs.push([msg, type]);
  t.teardown(() => {
    yapi.commons.log = realLog;
  });

  const inst = Object.create(wikiController.prototype);
  inst.$uid = String(MY_UID);
  inst.Model = {
    // 模拟 DB 异常：外层 try/catch 覆盖不到异步 handler（回调在 try 块返回后才执行）
    get: async () => {
      throw new Error('db-down');
    }
  };
  const ctx = {
    query: { id: '7' },
    websocket: {
      on: (event, handler) => {
        handlers[event] = handler;
      },
      send: frame => frames.push(frame)
    }
  };

  await inst.wikiConflict(ctx);
  // 内层兜底：handler 调用本身不得 reject（修复前会以未处理拒绝外泄，Node ≥22 杀进程）
  await t.notThrowsAsync(() => handlers.message('editor'));
  t.is(frames.length, 0, '异常路径不发送任何帧');
  t.is(logs.length, 1, '异常被记录为一条 error 日志');
  t.is(logs[0][1], 'error');
});
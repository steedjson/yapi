/**
 * 回归测试：yapi.registerStartupTask 注册表语义。
 *
 * dbReady.test.js 已覆盖"就绪后索引全部存在"的最终状态；本文件补齐注册表
 * 自身的契约（临时探针无法留存的回归保护）：
 * 1. connect() 之前注册的任务由就绪链按注册顺序串行执行；
 * 2. 任务失败（异步 reject / 同步抛错）只记日志，不阻塞 ready resolve；
 * 3. ready 之后注册的任务立即执行且自带 catch（默认 unhandled-rejections=throw
 *    模式下，若注册表漏接 rejection，worker 会崩溃使本轮测试失败）。
 * 串行顺序是 identitycounters 唯一索引先于计数器初始化的依赖前提
 * （见 server/utils/mongoose-auto-increment.js）。
 */
const test = require('ava');
const mongoose = require('mongoose');
const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons');
const db = require('../../server/utils/db.js');

yapi.commons = commons;

// 与 app.js 相同的注册时机：connect() 之前注册（排队路径）
const order = [];
db.registerStartupTask(async () => {
  order.push('a');
});
db.registerStartupTask(() => Promise.reject(new Error('startupTasks.test: async failure')));
db.registerStartupTask(async () => {
  order.push('b');
});
db.registerStartupTask(() => {
  throw new Error('startupTasks.test: sync failure');
});
db.registerStartupTask(async () => {
  order.push('c');
});

const ready = db.connect();

test.serial('registerStartupTask: 就绪前注册的任务按注册顺序串行执行, 失败不阻塞 ready', async t => {
  const resolved = await ready;
  t.truthy(resolved && resolved.connection, '注入失败任务后 ready 仍应 resolve 并透传 mongoose 实例');
  t.deepEqual(order, ['a', 'b', 'c'], '落定任务必须严格按注册顺序串行执行');
});

test.serial('registerStartupTask: ready 之后注册的任务立即执行且失败仅记日志', async t => {
  await ready;
  let ran = false;
  db.registerStartupTask(async () => {
    ran = true;
  });
  db.registerStartupTask(() => Promise.reject(new Error('startupTasks.test: post-ready failure')));
  // 用一次真实 DB 往返代替固定 sleep，给立即执行的任务让出事件循环
  await mongoose.connection.db.command({ ping: 1 });
  t.true(ran, 'post-ready 注册的任务应立即执行');
});

test.after.always('cleanup lingering handles', async () => {
  try {
    await ready;
  } catch (e) {}
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close();
    } catch (e) {}
  }
});

/**
 * AVA server 测试共享收尾 helper。
 *
 * 供触发真实 mongoose 连接的测试文件在 test.after.always 中调用：
 * 1. 取消 node-schedule 常驻定时任务，避免挂住 AVA worker；
 * 2. 等待 yapi.connect 就绪 —— connect() 的 promise 语义为
 *    "连接建立 + ensureQueryIndexes + 全部已注册启动任务（插件集合索引、
 *    identitycounters 唯一索引）落定"（见 server/utils/db.js），就绪后再关闭
 *    连接，杜绝在途 createIndex 被 close 打断产生的
 *    MongoClientClosedError / MongoExpiredSessionError unhandled rejection；
 *    启动期 DB 工作已全部纳入就绪语义，无需额外固定等待；
 * 3. readyState 非 0 时平滑关闭 mongoose 连接。
 */
const mongoose = require('mongoose');
const yapi = require('../../server/yapi.js');

module.exports = async function closeMongoose() {
  try {
    const schedule = require('node-schedule');
    if (schedule.scheduledJobs) {
      Object.keys(schedule.scheduledJobs).forEach(name => {
        schedule.scheduledJobs[name].cancel();
      });
    }
  } catch (e) {}

  try {
    // 连接失败时 db.js 仅记日志并让 promise reject，teardown 不因此报错
    if (yapi.connect) {
      await yapi.connect;
    }
  } catch (e) {}

  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close();
    } catch (e) {}
  }
};

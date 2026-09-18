// @ts-check
const mongoose = require('mongoose');
const yapi = require('../yapi.js');
const autoIncrement = require('./mongoose-auto-increment');

/**
 * 启动任务注册表：require 期（连接建立前后皆可）通过 yapi.registerStartupTask
 * 注册的任务工厂，由 connect() 就绪链在 ensureQueryIndexes 之后统一执行并等待。
 * 插件的 createIndex 等"启动期数据库工作"借此纳入就绪语义，不再以
 * fire-and-forget 方式游离在 yapi.connect 之外。
 * @type {Array<() => any>}
 */
let startupTasks = [];

/**
 * connect() 就绪链是否已经 resolve。resolve 之后注册的任务不再排队，
 * 而是立即执行并自带 catch（见 registerStartupTask 注释）。
 */
let readySettled = false;

/**
 * 执行单个启动任务：同步抛错与 promise rejection 一律记日志吞掉，
 * 不让失败传播到就绪链（与 ensureQueryIndexes 的 per-index catch 语义一致）。
 * @param {() => any} fn 任务工厂函数
 * @returns {Promise<void>} 永不 reject
 */
function runStartupTask(fn) {
  try {
    return Promise.resolve(fn()).catch((/** @type {any} */ err) => {
      yapi.commons.log(`startup task failed: ${(err && err.message) || err}`, 'error');
    });
  } catch (/** @type {any} */ err) {
    yapi.commons.log(`startup task failed: ${(err && err.message) || err}`, 'error');
    return Promise.resolve();
  }
}

/**
 * 按注册顺序串行排空启动任务队列；执行期间新注册的任务（极端时序下嵌套注册）
 * 也会被本轮覆盖。串行保证任务间可依赖（如 identitycounters 唯一索引先于
 * 计数器初始化创建，见 mongoose-auto-increment.js）。
 * @returns {Promise<void>}
 */
async function drainStartupTasks() {
  while (startupTasks.length > 0) {
    const batch = startupTasks.splice(0, startupTasks.length);
    for (const fn of batch) {
      await runStartupTask(fn);
    }
  }
}

/**
 * 注册启动任务：fn 为返回 promise（或 undefined）的工厂函数。
 *
 * 语义说明：
 * - require 期（连接建立前）与 connect() 就绪链执行期间注册的任务都会排队，
 *   在 connect() 就绪链中于 ensureQueryIndexes 之后统一执行，就绪 promise
 *   会等待全部任务落定后才 resolve；
 * - ready 已 resolve 之后才注册的任务立即执行，并自带 catch
 *   （失败仅记日志），不会产生 unhandled rejection。
 * @param {() => any} fn 任务工厂函数
 * @returns {void}
 */
function registerStartupTask(fn) {
  if (typeof fn !== 'function') {
    throw new Error('registerStartupTask 需要一个返回 promise（或 undefined）的工厂函数');
  }
  if (readySettled) {
    // ready 之后再注册：立即执行，失败只记日志，不产生 unhandled rejection。
    runStartupTask(fn);
    return;
  }
  startupTasks.push(fn);
}

/**
 * 注册或复用 Mongoose 模型（集合名与模型名相同），并关闭 autoIndex。
 * @param {string} model 模型名，同时作为集合名
 * @param {any} schema Schema 实例或普通定义对象
 * @returns {import('mongoose').Model<any>} 注册后的 Mongoose 模型
 */
function model(model, schema) {
  if (schema instanceof mongoose.Schema === false) {
    schema = new mongoose.Schema(schema);
  }

  schema.set('autoIndex', false);

  return mongoose.model(model, schema, model);
}

/**
 * 建立 MongoDB 连接；连接与启动期索引建立全部完成后返回的 promise 才 resolve。
 * @param {Function} [callback] 连接就绪（含索引建立完成）后的回调，以连接 promise 为 this
 * @returns {Promise<import('mongoose').Mongoose>} 就绪 promise：resolve 值与
 *   mongoose.connect 的兑现值一致；连接失败时仍以 rejection 结束（仅记日志的语义不变）
 */
function connect(callback) {
  // mongoose 6 起移除 useNewUrlParser/useCreateIndex/useUnifiedTopology 等
  // 连接选项与 useFindAndModify 开关，连接串与认证参数保持原样即可。
  // strictQuery 显式固定为 false（与 5.x 行为一致），避免升级 7 时默认值翻转。
  mongoose.set('strictQuery', false);

  let config = yapi.WEBCONFIG;
  let options = {};

  if (config.db.user) {
    options.user = config.db.user;
    options.pass = config.db.pass;
  }

  options = Object.assign({}, options, config.db.options)

  var connectString = '';

  if(config.db.connectString){
    connectString = config.db.connectString;
  }else{
    connectString = `mongodb://${config.db.servername}:${config.db.port}/${config.db.DATABASE}`;
    if (config.db.authSource) {
      connectString = connectString + `?authSource=${config.db.authSource}`;
    }
  }

  // mongoose 5.11+ 的 connect 只有在不传 callback 时才返回 Promise，
  // 连接失败的日志由下方 then 的第二个函数统一处理。
  let db = mongoose.connect(connectString, options);

  // connect() 的 promise 语义为"启动期数据库工作就绪"：连接成功且
  // ensureQueryIndexes 与全部已注册启动任务落定后才 resolve。调用方（app.js、
  // install.js、插件、测试）await 或 .then 该 promise 时，不会再有在途的
  // 启动期 createIndex 操作（核心索引、identitycounters 唯一索引、插件集合
  // 索引）被后续 close() 打断。
  let ready = db.then(
    function(mongooseInstance) {
      yapi.commons.log('mongodb load success...');
      // 连接成功后补齐查询索引；createIndex 可重复执行，不会改变历史数据。
      // 单条索引失败已在 ensureQueryIndexes 内记日志并吞掉，不会阻塞就绪。
      // 启动任务（插件索引、identitycounters 唯一索引）失败同样只记日志，
      // 不会让 ready reject，也不会产生 unhandled rejection。
      return ensureQueryIndexes()
        .then(drainStartupTasks)
        .then(() => {
          // drainStartupTasks 返回后同步置位：此后注册的任务走
          // registerStartupTask 的"立即执行"分支。
          readySettled = true;
          if (typeof callback === 'function') {
            callback.call(db);
          }
          // 透传 mongoose.connect 的兑现值，保持与原返回 promise 一致。
          return mongooseInstance;
        });
    },
    function(/** @type {any} */ err) {
      yapi.commons.log(err + 'mongodb connect error', 'error');
      // 连接失败仍以 rejection 结束（与原 mongoose.connect promise 一致）。
      throw err;
    }
  );

  // 原实现返回的 db promise 已被上方 then 链接管，失败不会产生
  // unhandledRejection；返回的 ready promise 需要同样的兜底，
  // 连接失败的错误仍由需要它的调用方自行 catch。
  ready.catch(() => {});

  (/** @type {any} */ (autoIncrement)).initialize(db);
  return ready;
}


// 接口菜单和列表是高频查询，索引只优化查询路径，不参与业务数据迁移。
function ensureQueryIndexes() {
  /** @type {Record<string, any[]>} */
  const indexes = {
    interface: [
      // 接口菜单按项目筛选后再按分类和排序号排列，使用联合索引避免全表扫描。
      { project_id: 1, catid: 1, index: 1 },
      { project_id: 1, index: 1 },
      // 分类删除和开放接口列表不带项目条件，保留分类维度的查询索引。
      { catid: 1, index: 1 },
      { catid: 1, api_opened: 1, title: 1 },
      { project_id: 1, title: 1 },
      // 接口路径判重和详情查询都同时带项目、路径、请求方法条件。
      { project_id: 1, path: 1, method: 1 }
    ],
    interface_cat: [{ project_id: 1, index: 1 }],
    // 接口集和测试用例列表、项目删除及接口删除都依赖以下查询条件。
    interface_col: [{ project_id: 1, index: 1 }],
    interface_case: [
      { col_id: 1, index: 1 },
      { project_id: 1 },
      { interface_id: 1 }
    ]
  };

  /** @type {Promise<any>[]} */
  const tasks = [];
  Object.keys(indexes).forEach(collectionName => {
    indexes[collectionName].forEach(key => {
      tasks.push(
        (/** @type {*} */ (mongoose.connection.db))
          .collection(collectionName)
          .createIndex(key)
          .catch((/** @type {any} */ err) => {
            yapi.commons.log(`ensure ${collectionName} index failed: ${err.message}`, 'error');
          })
      );
    });
  });
  return Promise.all(tasks);
}

yapi.db = model;
yapi.registerStartupTask = registerStartupTask;

module.exports = {
  model: model,
  connect: connect,
  registerStartupTask: registerStartupTask
};

const mongoose = require('mongoose');
const yapi = require('../yapi.js');
const autoIncrement = require('./mongoose-auto-increment');

function model(model, schema) {
  if (schema instanceof mongoose.Schema === false) {
    schema = new mongoose.Schema(schema);
  }

  schema.set('autoIndex', false);

  return mongoose.model(model, schema, model);
}

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

  db.then(
    function() {
      yapi.commons.log('mongodb load success...');
      // 连接成功后补齐查询索引；createIndex 可重复执行，不会改变历史数据。
      // 等索引任务完成后再执行回调，避免服务在索引尚未建立时开始处理请求。
      ensureQueryIndexes().then(() => {
        if (typeof callback === 'function') {
          callback.call(db);
        }
      });
    },
    function(err) {
      yapi.commons.log(err + 'mongodb connect error', 'error');
    }
  );

  autoIncrement.initialize(db);
  return db;
}


// 接口菜单和列表是高频查询，索引只优化查询路径，不参与业务数据迁移。
function ensureQueryIndexes() {
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

  const tasks = [];
  Object.keys(indexes).forEach(collectionName => {
    indexes[collectionName].forEach(key => {
      tasks.push(
        mongoose.connection.db.collection(collectionName).createIndex(key).catch(err => {
          yapi.commons.log(
            `ensure ${collectionName} index failed: ${err.message}`,
            'error'
          );
        })
      );
    });
  });
  return Promise.all(tasks);
}

yapi.db = model;

module.exports = {
  model: model,
  connect: connect
};

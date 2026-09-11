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
  mongoose.Promise = global.Promise;
  mongoose.set('useNewUrlParser', true);
  mongoose.set('useFindAndModify', false);
  mongoose.set('useCreateIndex', true);

  let config = yapi.WEBCONFIG;
  let options = {useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true};

  if (config.db.user) {
    options.user = config.db.user;
    options.pass = config.db.pass;
  }

  if (config.db.reconnectTries) {
    options.reconnectTries = config.db.reconnectTries;
  }

  if (config.db.reconnectInterval) {
    options.reconnectInterval = config.db.reconnectInterval;
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

  let db = mongoose.connect(
    connectString,
    options,
    function(err) {
      if (err) {
        yapi.commons.log(err + ', mongodb Authentication failed', 'error');
      }
    }
  );

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

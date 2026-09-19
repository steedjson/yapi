// @ts-check
const yapi = require('yapi.js');
const mongoose = require('mongoose');
const controller = require('./controller');

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  // 启动期集合索引改为注册启动任务：由 connect() 就绪链统一执行并等待，
  // 不再是 yapi.connect 之后的 fire-and-forget 操作（索引键与选项保持不变）。
  yapi.registerStartupTask(function() {
    let Col = (/** @type {*} */ (mongoose.connection.db)).collection('wiki');
    return Col.createIndex({
      project_id: 1
    });
  });

  this.bindHook('add_router', function(/** @type {any} */ addRouter) {
    addRouter({
      // 获取wiki信息
      controller: controller,
      method: 'get',
      path: 'wiki_desc/get',
      action: 'getWikiDesc'
    });

    addRouter({
      // 更新wiki信息
      controller: controller,
      method: 'post',
      path: 'wiki_desc/up',
      action: 'uplodaWikiDesc'
    });
  });

  this.bindHook('add_ws_router', function(/** @type {any} */ wsRouter) {
    wsRouter({
      controller: controller,
      method: 'get',
      path: 'wiki_desc/solve_conflict',
      action: 'wikiConflict'
    });
  });
};

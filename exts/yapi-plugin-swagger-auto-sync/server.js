// @ts-check
const controller = require('./controller/syncController.js');
const yapi =require('yapi.js');
const interfaceSyncUtils = require('./interfaceSyncUtils.js');

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function () {
  yapi.getInst(interfaceSyncUtils);

  this.bindHook('add_router', function (/** @type {any} */ addRouter) {
    addRouter({
      controller: controller,
      method: 'get',
      path: 'autoSync/get',
      action: 'getSync'
    });
    addRouter({
      controller: controller,
      method: 'post',
      path: 'autoSync/save',
      action: 'upSync'
    });
  });

};
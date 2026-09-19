// @ts-check
const controller = require('./controller');

// const mongoose = require('mongoose');
// const _ = require('underscore');

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function(){
  this.bindHook('add_router', function(/** @type {any} */ addRouter){
    // @feat: serives
    addRouter({
      controller: controller,
      method: 'get',
      prefix: '/open',
      path: 'export-full',
      action: 'exportFullData'
    });
  })

}
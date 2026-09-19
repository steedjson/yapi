// @ts-check
import swaggerAutoSync from './swaggerAutoSync/swaggerAutoSync.js'

/**
 * Swagger 自动同步设置页插件（sub_setting_nav 钩子实现）。
 * @param {any} routers
 */
function hander(routers) {
  routers.test = {
    name: 'Swagger自动同步',
    component: swaggerAutoSync
  };
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('sub_setting_nav', hander);
};

// @ts-check
import Services from './Services/Services.js';

/**
 * 生成 ts services 设置页插件（sub_setting_nav 钩子实现）。
 * @param {any} routers
 */
function genServices(routers) {
  routers['services'] = {
    name: '生成 ts services',
    component: Services
  }
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('sub_setting_nav', genServices);
};

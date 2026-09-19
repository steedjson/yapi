// @ts-check
/**
 * 测试插件设置页（sub_setting_nav 钩子实现）。
 * @param {any} routers
 */
function hander(routers) {
  routers.test = {
    name: 'test',
    component: ()=> 'hello world.'
  };
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('sub_setting_nav', hander);
};

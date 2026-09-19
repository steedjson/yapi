// @ts-check
import WikiPage from './wikiPage/index';
// const WikiPage = require('./wikiPage/index')

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('sub_nav', function(/** @type {any} */ app) {
    app.wiki = {
      name: 'Wiki',
      path: '/project/:id/wiki',
      // v6 嵌套路由相对路径：Project.js 以 route 字段注册子路由，缺失会导致导航死链
      route: 'wiki',
      component: WikiPage
    };
  });
};

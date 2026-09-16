import WikiPage from './wikiPage/index';
// const WikiPage = require('./wikiPage/index')

module.exports = function() {
  this.bindHook('sub_nav', function(app) {
    app.wiki = {
      name: 'Wiki',
      path: '/project/:id/wiki',
      // v6 嵌套路由相对路径：Project.js 以 route 字段注册子路由，缺失会导致导航死链
      route: 'wiki',
      component: WikiPage
    };
  });
};

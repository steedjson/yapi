// @ts-check
/**
 * Created by gxl.gao on 2017/10/24.
 */
import StatisticsPage from './statisticsClientPage/index'

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function () {
  this.bindHook('header_menu', function (/** @type {any} */ menu) {
    menu.statisticsPage = {
      path: '/statistic',
      name: '系统信息',
      icon: 'bar-chart',
      adminFlag: true
    }
  })
  this.bindHook('app_route', function (/** @type {any} */ app) {
    app.statisticsPage = {
      path: '/statistic',
      component: StatisticsPage
    }
  })


}

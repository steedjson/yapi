// @ts-check
import React, { lazy, Suspense } from 'react';
import Loading from 'client/components/Loading/Loading';

// 批次1（首屏性能优化，docs/first-paint-perf-plan.md）：统计页组件经 React.lazy 异步化。
// recharts(+d3 系) 仅本页使用，同步 import 会把整链锁进 index 入口模块图、进而被打进
// 首屏 vendor（rspack defaultVendors 对初始/异步引用一视同仁）——异步化后该库随
// /statistic 路由按需加载，首屏不再下载。
// loader 内必须带 webpackChunkName 注释以命名异步 chunk（与 Application.js 路由分包注释规范一致）。
// StatisticsPage 经 app_route 注册后由 Application.js authed() 包装渲染，
// 该链路无内置 Suspense 边界，故此处自带（fallback 与 createAsyncComponent 一致）。
const LazyStatisticsPage = lazy(() =>
  import(/* webpackChunkName: "statistics" */ './statisticsClientPage/index')
);

const StatisticsPage = (/** @type {any} */ props) => (
  <Suspense fallback={<Loading visible />}>
    <LazyStatisticsPage {...props} />
  </Suspense>
);
StatisticsPage.displayName = 'Async(StatisticsPage)';

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
    };
  });
  this.bindHook('app_route', function (/** @type {any} */ app) {
    app.statisticsPage = {
      path: '/statistic',
      component: StatisticsPage
    };
  });
};

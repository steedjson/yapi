// @ts-check
import { createAsyncComponent } from 'client/components/AsyncComponent';

// mockCol reducer 已迁至 Zustand（client/store/mockColStore.js，批次2），本插件原经
// add_reducer 钩子注册的 mockCol 切片（./MockCol/mockColReducer.js）随之注销——
// 全仓唯一状态读取方 MockCol/MockCol.js 已切换为 useMockColStore，注销无行为影响。
// 旧 mockColReducer.js 文件保留在盘上（迁移批次禁止删除旧 reducer 文件）。

// 批次1（首屏性能优化）：高级 Mock 页组件经 React.lazy 异步化。AdvMock 链上挂有
// mockEditor（CodeMirror 6 全家桶），同步 import 会把整链锁进 index 入口模块图、
// 被吸进首屏 vendor——异步化后随接口高级 Mock Tab 按需加载（与 project 路由
// chunk 的编辑器使用面一致）。
// loader 内必须带 webpackChunkName 注释以命名异步 chunk（与 Application.js 路由分包注释规范一致）。
// 批次2（M-1）：ErrorBoundary > Suspense > Lazy 三层；工厂已下沉
// client/components/AsyncComponent，五处统一引用（双源漂移登记项关闭）。
const AdvMockTab = createAsyncComponent(
  () => import(/* webpackChunkName: "adv-mock" */ './AdvMock'),
  'AdvMock'
);

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function(){
  this.bindHook('interface_tab', function(/** @type {any} */ tabs){
    tabs.advMock = {
      name: '高级Mock',
      component: AdvMockTab
    }
  })
}

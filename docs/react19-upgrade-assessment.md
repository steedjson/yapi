# React 19 升级可行性评估（2026-09-27）

> 结论先行：**可行，建议单独立项一个迁移批次，预估 2-3 人日**。
> 代码层零结构性障碍，成本集中在类型层小修与测试基建的 act/异步语义改造。
> 实测状态已固化在 `spike/react19` 分支（commit 35de2ec7），迁移批可直接续跑。

## 一、spike 实测证据（react 19.3.0 + react-dom 19.3.0 + @ant-design/v5-patch-for-react-19@1.0.3）

| 门禁 | 结果 | 说明 |
|---|---|---|
| 静态扫描（8 类 React 19 移除 API） | **零命中** | findDOMNode / 字符串 ref / `this.refs` / defaultProps / legacy context / `react-dom/test-utils` / react-test-renderer / `unstable_batchedUpdates` 全仓均无真实使用（历史命中共 65 处全部为 Hooks 迁移注释） |
| `npm run typecheck`（@types/react 19） | 13 错 | 全部为类型层小修，无结构性问题（见 §三） |
| `npm test`（补丁仅进 client/index.js） | 2 失败 + 1 unhandled | 失败均为 antd 静态 `message` 场景——antd v5 静态方法内部仍走 `ReactDOM.render`，测试环境需与生产同加载官方补丁 |
| `npm test`（补丁进 jsdom-setup） | 34 失败 | 根因见 §四：React 19 并发调度语义 vs 测试基建的固定 sleep 断言模式 |
| `npm run build-client` | **通过** | Rsbuild 产物完整（11 js + css + gz/br），生产 bundle 无障碍 |
| 生态 peer 兼容 | 全绿 | zustand 5.0.15 / react-router-dom 6.30.6 / @dnd-kit 6.3 / @testing-library/react 16.3.3 均支持 19；**recharts 2.15.4 peer 已含 `^19.0.0`**，运行时无需升级 |

## 二、为什么不需要动 antd 6

- antd 官方为 v5 提供兼容路径：`@ant-design/v5-patch-for-react-19`（把 antd 静态方法内部的 `ReactDOM.render` 切换到 React 19 渲染入口），antd 5.29.3 直接可用；
- antd 6 是独立重大升级（token 体系/皮肤系统重构），参照 antd 4→5 为 5-8 人日量级，与 React 19 解耦；
- 顺序建议：**先 React 19 + patch，antd 6 单独立项**；升级 antd 6 后移除 patch。

## 三、类型层 13 错清单与修法（约 0.5-1 人日）

1. **@types/react 19 不再给 `React.FC` 隐式注入 `children`**——如 `Profile.js:400` 向自定义组件传 children 报错。修法：组件 props 显式声明 `children`（或调用处去掉多余 children）。
2. **recharts 2.15.4 自带 typings 基于旧 @types/react 构建**——`StatisChart.js` 的 Line/Legend/Tooltip/XAxis/YAxis 与 `AsyncComponent` 处报 "cannot be used as a JSX component"。peer 已支持 19，运行时无碍；修法二选一：升级 recharts 3.x（一等 React 19 类型，推荐）或局部 `@ts-expect-error`/类型断言。
3. **零散 prop 类型收紧**——`ProjectEnv/index.js:207`（color 接受 `false`）、`ProjectData.js:493`（dangerouslySetInnerHTML `string|null` → 需收窄 `string`）、`Login.js:65`（`e.target` 需收窄为 HTMLInputElement）、`Home.js:114/202`（antd Col span 传字符串）、`CheckCrossInstall.js:36`（`string|null` → `string|undefined`）。逐处小修或断言。

## 四、测试基建改造（约 1-1.5 人日，本评估最大成本项）

- **现象**：补丁进测试环境后 34 例失败（components 25 / containers 4 / visual 3 / group 2），伴随全屏 `An update ... not wrapped in act(...)`；
- **根因**：React 19 下 antd 静态方法经 createRoot 异步调度，且并发渲染改变更新时序；测试基建 `flushEffects` 的 15ms 固定等待、以及"事件后立即断言"模式在异步语义下不可靠；
- **修法**：
  1. `test/helpers/containers.js` 的 `flushEffects` 改造为 waitFor 轮询语义（暴露 `waitFor`/`waitForRemoved` 助手）；
  2. 34 例所在文件的固定 sleep 断言逐个改 waitFor（机械改造，断言语义不变）；
  3. jsdom-setup 已加补丁装载（spike 分支已做）。

## 五、运行时竞态显形（约 0.5 人日，需逐个追）

- `common/postmanLib.js:211 handleCurrDomain` 在 React 19 并发调度下出现 `undefined.find` unhandled rejection（触发链：InterfaceColContent 渲染期 `handleReqHeader` 时 env 数据未就绪）——React 18 同步渲染掩盖的潜在竞态被显形；
- 迁移批需专设一轮「全量测试 + 浏览器回归」专项收集此类时序差异，补数据就绪守卫（而非依赖渲染时序）。

## 六、建议执行顺序（单批次，2-3 人日）

1. 依赖切换：react/react-dom 19.3 + @types/react(-dom) 19 + antd 官方 patch（client/index.js 与 test/helpers/jsdom-setup.js 双装载，spike 分支已就绪）；
2. 类型层 13 错清零（§三）；
3. 测试基建 waitFor 改造 + 34 例修复（§四）；
4. 竞态专项：全量测试冷库跑 + unhandled rejection 清零（§五）；
5. 门禁全绿后浏览器回归（五页 × 三皮肤 + 接口编辑/运行/导入主链路）；
6. static/prd 产物独立提交（惯例）。

回滚：整 commit revert（依赖与代码改动同批，无数据/schema 迁移）。

## 七、spike 分支状态（spike/react19 @ 35de2ec7）

- package.json/package-lock：react 19.3.0 + react-dom 19.3.0 + @ant-design/v5-patch-for-react-19@1.0.3 + @types/react(-dom) 19；
- `client/index.js`：patch 顶部装载（生产入口）；
- `test/helpers/jsdom-setup.js`：patch 装载（测试环境）；
- 已知状态：typecheck 13 错、全量测试 34 例 act 语义待改造——即迁移批的起点清单。

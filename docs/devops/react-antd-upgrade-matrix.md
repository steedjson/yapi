# Phase 16：React / Ant Design 大版本升级可行性矩阵

> 基准：分支 `codex/refactor-foundation`，HEAD `39aedd3c`（2026 年 9 月 13 日），工作区干净。
> 统计范围：`client/`（主口径）与 `exts/`（内置插件，单列）；`server/` 不含 React 运行时，不在矩阵范围内。
> 本报告是 `docs/devops/refactor-plan.md` Phase 16 章节的深化与展开，只做评估，不修改任何源代码、依赖声明、锁文件与既有文档。结论与既有“暂不直接升级 React/Antd 大版本”的决策一致，不推翻。

---

## 一、前提条件核对表

Phase 16 章节列出六项前提（refactor-plan.md「Phase 16：前提」）。逐项核对如下：

| # | 前提 | 状态 | 证据（章节 / 提交 / 命令） |
|---|------|------|---------------------------|
| 1 | 数据库索引和查询优化稳定 | 已满足 | refactor-plan.md Phase 4（补数据库索引）、Phase 5（优化慢查询和重复查询）；批次一验证记录 |
| 2 | 接口保存稳定 | 已满足 | refactor-plan.md Phase 6（修复接口保存异常）及 `test/server/interfaceSave.test.js` 回归（Phase 6.1 章节）；提交 `d7fa1155`（串行执行导入分类路径回归用例） |
| 3 | Node.js 18 可运行 | 已满足（且已超过） | refactor-plan.md Phase 9（过渡验证 Node.js 18）、Phase 11（已切至 Node.js 24.21.0 LTS 并写入 `.nvmrc`；`cat .nvmrc` = `24.21.0`） |
| 4 | 构建工具稳定 | 已满足 | refactor-plan.md Phase 12（替换 YKit/HappyPack）、Phase 13（升级 Webpack 至 4.47.0）；默认 `dev-client` / `build-client` 已切到 standalone 方案（提交 `f8412656` 修复 CommonsChunk 加载顺序；Phase 15 章节记录 build 退出码 0） |
| 5 | 分类树和接口编辑页已经完成局部整理 | 已满足 | Phase 15 提交 `dc692124`（接口分类树 661 行纳入严格检查）、`f418a200`（接口编辑页 Edit.js + InterfaceEditForm.js 1363 行纳入严格检查），AST 级前后等价对比 |
| 6 | 现有页面回归结果完整 | 已满足 | Phase 15 五页（登录页 `1331510f` → 项目列表 `af7ca4cd` → 分类树 `dc692124` → 接口编辑页 `f418a200` → 导入弹窗 `31f5dc55`）全部完成；记录的验证基线：`tsc --noEmit` 0 错误（227 文件）、Node 24.21.0 下 `npm test` 236 pass / 0 fail、`build-client` 退出码 0 |

结论：六项前提全部满足，具备进入本报告评估的条件。

---

## 二、用量基线（可复现）

### 2.1 统计命令与结果（client/，HEAD `39aedd3c`，2026-09-13 实测）

以下每条命令均在本仓库根目录实际执行，读者可逐条复跑。格式：维度 / 命令 / 总次数 / 文件数。

| 维度 | 命令 | 总次数 | 文件数 |
|------|------|-------:|-------:|
| `getFieldDecorator`（antd v3 表单绑定） | `rg -o 'getFieldDecorator' client \| wc -l` | 84 | 10 |
| `Form.create`（antd v3 高阶表单） | `rg -o 'Form\.create' client \| wc -l` | 12 | 12（其中 2 处为 `@Form.create()` 装饰器：`ProjectMock/index.js:37`、`ProjectRequest.js:21`） |
| `<Icon` JSX 开标签 | `rg -o '<Icon\b' client \| wc -l` | 129 | 36 |
| — 其中静态字符串 `type="..."`（单行正则） | `rg -o '<Icon[^>]*\btype="' client \| wc -l` | 85 | — |
| — 其中动态绑定 `type={...}`（单行正则） | `rg -o '<Icon[^>]*\btype=\{' client \| wc -l` | 8 | — |
| — 含 Icon 的行（最宽口径） | `rg -n '\bIcon\b' client \| wc -l` | 164 | — |
| — Icon 从 antd 导入的文件数 | `rg -l "import \{[^}]*\bIcon\b[^}]*\} from 'antd'" client \| wc -l` | 29 | 29 |
| `message.*` 命令式调用（任意方法） | `rg -o 'message\.\w+' client \| wc -l` | 133 | 31 |
| — 方法分布 | `rg -o 'message\.\w+' client \| sort \| uniq -c \| sort -rn` | error 76 / success 55 / warn 1（弃用别名）/ info 1 | — |
| `Modal.confirm` 等静态方法 | `rg -o 'Modal\.(confirm\|info\|warning\|error\|success)\b' client \| wc -l` | 7（全部为 confirm） | 7 |
| `message.*` + `Modal.*` 合计 | 上两行相加 | 140 | — |
| `<Modal` JSX 开标签 | `rg -o '<Modal\b' client \| wc -l` | 23 | — |
| `ReactDOM.render` | `rg -n 'ReactDOM\.render' client` | 2（`client/index.js` 根挂载、`client/Application.js:103` 手动 PopConfirm） | 2 |
| `componentWillReceiveProps` | `rg -n 'componentWillReceiveProps' client \| wc -l` | 22 | — |
| `componentWillMount` | `rg -n 'componentWillMount' client \| wc -l` | 28 | — |
| `componentWillUpdate` / `UNSAFE_*` | `rg -n 'componentWillUpdate\|UNSAFE_' client \| wc -l` | 0 / 0 | — |
| 字符串 ref（`ref="..."`） | `rg -o '\bref="' client \| wc -l` | 0（`\b` 排除了 `href="` 误匹配） | — |
| — 回调 ref `ref={...}` | `rg -o 'ref=\{' client \| wc -l` | 15 | — |
| — `this.refs` 访问 | `rg -o '\bthis\.refs\b' client` | 1（`ProjectMessage.js:111`，为注释行，实际生效 0） | — |
| `findDOMNode` | `rg -n 'findDOMNode' client` | 1（`client/components/EasyDragSort/EasyDragSort.js:88`） | 1 |
| `TabPane`（`<TabPane` 或 `Tabs.TabPane`） | `rg -o '<TabPane\b\|Tabs\.TabPane' client \| wc -l` | 30 | 8 |
| Hooks（`useState\|useEffect\|useContext\|useRef`） | `rg -c 'useState\|useEffect\|useContext\|useRef\b' client \| wc -l` | 0 | 0 |
| react-redux 导入文件 | `rg -o 'from .react-redux.' client \| wc -l` | — | 52 |
| 装饰器分布 | `rg -o '^\s*@[a-zA-Z]+' client -g '*.js' \| sort \| uniq -c \| sort -rn` | `@connect` 51、`@withRouter` 16、`@autobind` 13、`@Form.create` 2、`@DragDropContext` 1，共 83 处 | — |
| 组件导入频次前 5（antd） | `for c in Icon message Button Row Tooltip Input; do rg -l "import \{[^}]*\b$c\b[^}]*\} from 'antd'" client \| wc -l; done` | Icon 29 / message 28 / Button 26 / Row 24 / Tooltip 23 / Input 23 | — |
| Icon `type` 精确口径（含跨行属性，perl 多行正则） | `rg -l '<Icon\b' client \| xargs perl -0777 -ne '$c++ while /<Icon\b[^>]*?\btype=/g; END{print "$c\n"}'` | 128（静态 115 + 动态 11 + 其他引号形式 2；129 个 `<Icon` 中仅 1 个无 `type`） | — |
| `new Function`（业务代码） | `rg -n 'new Function' client common`（排除 `common/tui-editor/dist/` vendored 产物）；`rg -ln 'new Function' server` | 0 / 0（仅第三方打包产物 `tui-editor-*.min.js` 内部存在） | — |

### 2.2 口径说明与 2026-09-12 计划基准差异

refactor-plan.md 记录的基准（2026-09-12 实测）为：`getFieldDecorator` 84、`Icon type="..."` 94、`message.*/Modal.*` 140、组件频次前 5 Icon(29)/message(28)/Button(26)/Row(24)/Tooltip、Input(各 23)。对照说明：

| 指标 | 计划基准 | 本次实测 | 差异说明 |
|------|-------:|-------:|----------|
| `getFieldDecorator` | 84 | 84（10 文件） | 一致 |
| 组件频次前 5 | 29/28/26/24/23/23 | 29/28/26/24/23/23 | 完全一致（口径均为「从 antd 导入该标识符的文件数」） |
| `message.*` + `Modal.*` | 140 | `message.\w+` 133 + `Modal` 静态 7 = 140 | 数值吻合；计划未公布细分，本次口径可完整还原（含 1 处已弃用别名 `message.warn`，见 2.4） |
| `Icon type="..."` | 94 | 单行正则 `<Icon[^>]*type=`（任意 type 属性）= 93；按基准日邻近提交树（`ff465bcb`~`31f5dc55`）同一命令实测 = 95；perl 多行精确口径 = 128 带 type | 计划的 94 无法逐字复现，最接近口径为「`<Icon` 标签内含 type 属性（单行正则）」，当前 HEAD 93、基准日树 95，差异 ≤2，属同一口径的正常波动。注意单行正则会漏掉 type 写在下一行的标签（当前 HEAD 单行 93 vs 多行 128，差 35 处），升级工时应以多行口径 128 为准 |

结论：不硬凑一致；升级工作量估算采用本报告的精确口径（见第三节矩阵），计划基准数字保持原文不动。

### 2.3 exts/ 内置插件用量（升级的隐藏成本）

12 个内置插件中 16 个文件直接 `import ... from 'antd'`。统计命令同 2.1（把 `client` 换成 `exts`）：

| 维度 | 命令 | 总次数 |
|------|------|-------:|
| `getFieldDecorator` | `rg -o 'getFieldDecorator' exts \| wc -l` | 15 |
| `Form.create` | `rg -o 'Form\.create' exts \| wc -l` | 3 |
| `<Icon` | `rg -o '<Icon\b' exts \| wc -l` | 15 |
| `message.\w+` | `rg -o 'message\.\w+' exts \| wc -l` | 20 |

涉及组件清单（`rg -n "from 'antd'" exts/`）：`yapi-plugin-advanced-mock`（Form/Switch/Icon/Table/Popconfirm 等）、`yapi-plugin-swagger-auto-sync`（Form/Switch）、`yapi-plugin-statistics`（Table/Row/Col/Tooltip/Icon/Spin）、`yapi-plugin-wiki`（Button/Checkbox）、`yapi-plugin-import-{har,postman,swagger,yapi-json}`（message）等。**任何 antd 破坏性 API 迁移必须把插件计入同一批工作量，否则插件页面会静默失效。**

### 2.4 插件机制与 antd 内部 API 依赖点

- 插件加载机制（`common/plugin.js` 的 `initPlugins`）：仅 `require` 插件包并透传 `server`/`client` 两个 hook，**不使用 `new Function`/eval，不触碰 antd 内部 API**。`rg -ln 'new Function' server` = 0。
- 插件对 antd 的依赖全部是公共组件 API（Form/Icon/message/Table 等），无内部路径引用（`rg -n "antd/lib/\w+/(es|_util|_components)" exts client` 未命中业务文件）。风险点不在机制，在公共 API 版本：
  - `client/index.js` 使用 `antd/lib/locale-provider/zh_CN` + `LocaleProvider`（v3 特有路径）；
  - `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:508` 使用 `message.warn`——已在 `node_modules/antd/lib/message/index.js:100-103` 核实为 v3 的弃用别名（源码注释 `// Departed usage, please use warning()`），v4/v5 需改为 `warning`；
  - `anujs`（1.2.9，React 兼容实现）已安装但 `ykit.config.js` 中 alias 已注释（`// baseConfig.resolve.alias.react = 'anujs'`），standalone 构建走真实 react，对升级无实际影响，可考虑后续移除。

---

## 三、升级矩阵（核心）

### 3.1 图例

单元格格式：`兼容性 ｜ 工作量 ｜ 风险`。兼容性取值：兼容（可直接运行）、需改造（有弃用警告或需少量适配代码）、不兼容（目标版本已移除该 API）。工作量：小（≤1 天/机械替换）、中（数天/需理解数据流）、大（跨页面数据流重写或体系更换）。风险：低（可静态验证）、中（需全量回归）、高（可能静默失效或需体系更换）。

React 列假设 antd 维持 3.x；antd 列假设 React 维持 16.2.0，违反 peer 约束的组合以 † 标注并交叉引用 3.4 节。

### 3.2 维度 × 目标版本矩阵

| 维度（当前用量） | React 16.3–16.14（线内） | React 17.0.2 | React 18.3.1 | antd 3.x 线内 →3.26.20 | antd 4.24.16 | antd 5.x（5.29 线） |
|---|---|---|---|---|---|---|
| `getFieldDecorator`（84+15） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 需改造｜大｜高†（弃用保留，99 处绑定重写为 rc-field-form 数据流，10+3 文件） | 不兼容｜大｜高†（Form.create/getFieldDecorator 完全移除） |
| `Form.create`（12+3，含 2 处装饰器） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 需改造｜中｜高†（弃用保留；装饰器写法另受 Babel 6 legacy decorators 约束，见 4.2） | 不兼容｜大｜高†（并入上一行迁移） |
| `<Icon type=`（129 处 JSX，128 带 type） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低（3.26 线内 Icon 继续存在） | 需改造｜中｜中†（迁移 @ant-design/icons v4 组件；可用 @ant-design/compatible 过渡映射；129+15 处） | 不兼容（v3 Icon 移除）｜中｜中†（必须独立图标组件，11 处动态 type 需逐一映射） |
| `message.*`（133，含 1 处 `warn` 别名） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜中｜中（v3 内部以独立 ReactDOM.render 实现，legacy 模式可运行，但需回归弹层与主题） | 兼容｜小｜低（线内无 API 变化） | 兼容｜小｜低（`warn` 别名 1 处改为 `warning`） | 兼容｜小｜低（静态方法可用；如需主题/context 须以 `<App>` 包裹，属可选增强） |
| `Modal.confirm` 等静态（7） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜中｜中（同上，antd 3 未声明支持 React 18） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 |
| `<Tabs>` + `TabPane`（30 处/8 文件） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 需改造｜小｜中（v4 弃用 TabPane，推荐 items 数组，保留兼容） | 不兼容｜中｜中（TabPane 移除，必须改 items；官方迁移文档口径，见 3.3 注） |
| `LocaleProvider`（client/index.js 1 处） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低（3.16 起可用 ConfigProvider 平替，可渐进） | 需改造｜小｜低（locale-provider 目录弃用保留，官方建议 ConfigProvider） | 不兼容｜小｜低（locale-provider 路径移除，改 `antd/locale/zh_CN` + ConfigProvider） |
| `componentWillReceiveProps`（22）/ `componentWillMount`（28） | 兼容｜中｜中（16.9 起控制台警告，可加 UNSAFE_ 前缀过渡；真正改造需派生 state/CDU 模式） | 兼容｜中｜中 | 兼容｜中｜中（legacy 模式仍工作；StrictMode 下副作用暴露） | 兼容｜小｜低（与 antd 正交） | 同左 | 同左 |
| 字符串 ref（0）/ `findDOMNode`（1） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低（findDOMNode 在 18 弃用警告、19 才移除；仅 EasyDragSort 1 处） | 兼容｜小｜低 | 同左 | 同左 |
| `ReactDOM.render`（2 处） | 兼容｜小｜低 | 兼容｜小｜低 | 需改造｜小｜中（换 createRoot 本身机械；但整应用进入并发模式需全量回归） | 兼容｜小｜低（与 antd 正交） | 同左 | 同左 |
| react-redux 5（`@connect` 51 处/52 文件） | 兼容｜小｜低（peer 声明支持 ^16） | 需改造｜中｜中（peer 不含 17，须先升 react-redux 7.2.9，peer 支持 ^16.8.3\|\|^17\|\|^18） | 需改造｜中｜中（同左；终态 react-redux 8/9 另计） | 兼容｜小｜低（与 antd 正交） | 同左 | 同左 |
| 生态：react-dnd 2.5.4（1 处）/ recharts 1.0.0-beta.10 / react-router-dom 4（@withRouter 16 处装饰器） | 兼容｜小｜低（现状即此组合） | 待核实｜中｜高（react-dnd 2 使用 legacy context，未声明支持 17） | 待核实｜大｜高（需 react-dnd 5+、router v6（peer ≥16.8 但 API 不兼容 v4，38 处引用重写）） | 兼容｜小｜低（与 antd 正交） | 同左 | 同左 |
| `theme.less`（166 个 less 变量定义） | — | — | — | 兼容｜小｜低（线内升级仅微调） | 需改造｜中｜中（v4 仍是 less 变量体系，但变量名/默认值有变） | 不兼容｜大｜高（CSS-in-JS token 体系替代 less 变量，166 个变量需重新映射） |
| rc-* 直依赖（rc-queue-anim / rc-scroll-anim / rc-tween-one，各 1 文件） | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低 | 兼容｜小｜低（独立包，不随 antd 变化；注意与 antd 内置 rc-* 的去重） | 同左 | 同左 |

†：antd 4/5 的 peerDependencies 要求 `react >=16.9.0`，react 16.2.0 不满足——不是 React 列的兼容性问题，而是组合非法，见 3.4。

### 3.3 矩阵读法与要点

1. **React 单独升级（不动 antd）的破坏面很小**：`getFieldDecorator`/`Icon`/`TabPane`/`LocaleProvider` 等高风险维度全部落在 antd 列；React 列的高风险项集中在生态库（react-redux 5 的 peer、react-dnd 2 的 legacy context）与 2 处 `ReactDOM.render`。
2. **antd 升级的破坏面集中且可枚举**：表单体系（99 处 `getFieldDecorator` + 15 处 `Form.create`）是唯一“大工作量、高风险”项；图标（144 处含 exts）与 TabPane（30 处）是中等工作量机械项；theme.less 体系在 antd 5 才需要推翻。
3. **React 17 没有移除任何本仓库在用的 API**（弃用生命周期、findDOMNode、classic JSX 均保留），单独升 17 的意义有限，主要价值是为 18 与依赖升级铺路。
4. react-router-dom v6 的 peer（`react >=16.8`）虽满足，但其 API 与 v4 不兼容（`@withRouter` 装饰器 16 处、`<Switch>` 23 处均需重写），本报告不将 router 升级纳入 antd/React 升级前置路径，仅列为 S4 独立评估项。
5. `TabPane` 在 v5 移除、`findDOMNode` 在 19 移除、classic JSX runtime 在 17/18 继续支持：这三条为官方文档口径，未在本仓库逐版本实测，已列入「待核实」。

### 3.4 react × antd 允许组合速查（已核实 peer 约束）

| react \ antd | 3.26.20 | 4.24.16 | 5.29 线 |
|---|---|---|---|
| **16.2.0（现状）** | 现状为 3.2.2，同线内升级可行 | peer 要求 ≥16.9.0，组合非法 | peer 要求 ≥16.9.0，组合非法 |
| **16.14（16 线末）** | 可行（推荐 S1 终态） | 可行（推荐 S2 组合） | peer 满足但 v3 表单/图标 API 已移除，实际不可行 |
| **17.0.2** | antd 3 未官方声明支持 17（待核实） | 可行（推荐过渡组合，需 react-redux ≥7） | 同上，不可行 |
| **18.3.1** | 不推荐（antd 3 内部 ReactDOM.render 属 legacy 模式） | 可行 | 可行（推荐终态，需 react-redux ≥7，终态 8/9） |

结论：**「先升 react 到 16.14、再升 antd 到 4.24」是 peer 约束下的唯一低成本顺序；反序（先 antd 4）必须同时动 react，违背一次只升级一个 UI 大组件的原则。**

---

## 四、依赖兼容约束

### 4.1 版本耦合关系（核实方式逐条标注）

| 包 | package.json 声明 | 实际安装 | 关键 peer/依赖约束 | 核实来源 |
|---|---|---|---|---|
| react | ^16.2.0 | 16.2.0 | — | `node_modules/react/package.json` |
| react-dom | ^16.2.0 | 16.2.0 | `react: ^16.0.0` | `node_modules/react-dom/package.json` |
| antd | 3.2.2 | 3.2.2 | peer `react >=16.0.0`、`react-dom >=16.0.0`；依赖 28 个 rc-* 组件（rc-form ^2.1.0、rc-tabs ~9.2.0、rc-tree ~1.7.0 等） | `node_modules/antd/package.json` |
| antd 3 线内最新 | — | — | 3.26.20：peer `react >=16.0.0`（**与 react 16.2 兼容**） | `npm view antd@3.26.20 peerDependencies --json` |
| antd 4 线内最新 | — | — | 4.24.16：peer `react >=16.9.0`、`react-dom >=16.9.0`（**react 16.2.0 不满足**） | `npm view antd@4.24.16 peerDependencies --json` |
| antd 5 线 | — | — | 5.29.3（registry 现存最新）：peer `react >=16.9.0`、`react-dom >=16.9.0` | `npm view antd@5 peerDependencies --json` |
| react-redux | ^5.0.5 | 5.0.7 | peer `react ^0.14 \|\| ^15.0.0-0 \|\| ^16.0.0-0`、`redux ^2 \|\| ^3 \|\| ^4`（**不含 17/18**）；7.2.9 起 peer `react ^16.8.3 \|\| ^17 \|\| ^18`；9 线 peer `react ^18` + `redux ^5` | `node_modules/react-redux/package.json`；`npm view react-redux@7.2.9` / `react-redux@9` |
| react-router-dom | ^4.1.1 | 4.2.2 | 4.2.2 peer `react >=15`（17/18 可装）；6 线 peer `react >=16.8` + `react-dom >=16.8`，但 API 与 v4 不兼容 | `node_modules/react-router-dom/package.json`；`npm view react-router-dom@6 peerDependencies` |
| @ant-design/icons | 未安装 | — | 4.8.0 与 5 线 peer 均为 `react >=16.0.0`（**react 16.2 可共存**，为图标预迁移创造条件） | `npm view @ant-design/icons@4.8.0` / `@ant-design/icons@5 peerDependencies` |
| prop-types | ^15.5.10 | 15.6.1 | — | `node_modules/prop-types/package.json` |
| immer | ^1.1.1 | 1.1.1 | 与 React 无 peer 耦合；client 3 个文件使用（InterfaceColContent/ProjectCard/InterfaceMenu） | `node_modules/immer/package.json` |
| core-decorators | ^0.17.0 | 0.17.0 | 与 React 无 peer 耦合；`@autobind` 13 处 | `node_modules/core-decorators/package.json` |
| redux / react-dnd / recharts / anujs | ^3.7.1 / ^2.5.1 / ^1.0.0-beta.0 / ^1.2.6 | 3.7.2 / 2.5.4 / 1.0.0-beta.10 / 1.2.9 | react-dnd 2 与 recharts beta 对 React 17/18 的兼容性未官方声明 | `node_modules/*/package.json` |
| typescript / webpack / babel-core | 7.0.2 / 4.47.0 / ^6.5.2 | 7.0.2 / 4.47.0 / 6.26.0 | babel-preset-react 6.24.1、babel-loader 6.4.1 | `node_modules/*/package.json` |

### 4.2 Babel 6 / Webpack 4 对 React 17+ 的限制

- **JSX transform**：当前工具链为 babel-core 6.26.0 + babel-preset-react 6.24.1（配置内嵌于 `package.json` 的 `babel` 字段；`build/webpack-standalone.js` 用 5 行 shim 维持 babel-loader@6 兼容 Webpack 4）。preset-react 6 只产 classic `React.createElement`。React 17 引入的 automatic JSX runtime 需要 Babel 7 的 `@babel/preset-react >= 7.9`（`runtime: 'automatic'`）——**但 classic runtime 在 React 17/18 中继续受支持，升级 React 本身不强制升级 Babel**（官方文档口径，列入待核实）。即：S4 升 React 不被 Babel 6 阻塞，只有想借机换 automatic runtime 时才需要先完成 Babel 7 迁移。
- **装饰器**：83 处装饰器（`@connect` 51、`@withRouter` 16、`@autobind` 13、`@Form.create` 2、`@DragDropContext` 1）依赖 `babel-plugin-transform-decorators-legacy` 的 legacy 语法。Babel 7 迁移时必须使用 `@babel/plugin-proposal-decorators` 的 legacy 模式或逐个改写；这也是 antd 4 阶段 `@Form.create()` 装饰器（2 处）建议改为函数式 HOC 包裹的原因之一。
- **Webpack 4.47**：对 React 运行时版本无约束；影响点仅在于 antd 4 的样式引入方式（v4 仍支持 babel-plugin-import 按 less 引入，v5 改 CSS-in-JS 后 less-loader 链路对 antd 不再必需）。

### 4.3 @ant-design/icons 对构建的影响

- peer 允许在 react 16.2 上共存（4.8.0 与 5 线均 `react >=16.0.0`），**图标迁移理论可先于 antd 4 进行**；但为遵守“每次只升级一个 UI 大组件”，本报告仍建议图标迁移放在 antd 4 阶段整体执行，仅在预研阶段做单页试点。
- 包体与按需加载：图标组件为独立 ESM 包，依赖 tree-shaking（Webpack 4 production mode + sideEffects 声明）；`sideEffects` 字段的实际取值与产物体积变化未实测，列入待核实。129 个业务 JSX + 15 个插件 JSX 中 11 处动态 `type={...}`（如 `type={icon}`）需要手工建立字符串到图标组件的映射表，是图标迁移的主要非机械工作量。
- v3 的 iconfont 用法（`static/iconfont`）与 antd Icon 无直接耦合，不受迁移影响。

---

## 五、分阶段路线建议

与既有升级原则对齐：先升级低风险 patch/minor；按页面处理破坏性 API；每次只升级一个 UI 大组件；不与 React 大版本升级同时修改后端；不因为 UI 升级删除原有操作。每阶段单独提交、单独验证、可独立回滚。

### S1：线内低风险升级 + codemod 预备（无破坏性 API 变更）

| 项 | 内容 |
|----|------|
| 前置条件 | 本报告第一节六项前提全部满足；五页回归可复现 |
| 改动面 | 两个独立提交：① `antd 3.2.2 → 3.26.20`（peer 满足 react 16.2，线内仅新增/弃用，无移除）；② `react/react-dom 16.2.0 → 16.14.0`（16 线末，UNSAFE 生命周期警告全量暴露，为 S3 摸底）。package.json + 锁文件 + 因警告暴露所需的少量 `UNSAFE_` 前缀（可选，不加也能运行） |
| 验证命令 | `npx tsc --noEmit`；`npm test`（Node 24.21.0，`.nvmrc`）；`npm run build-client`；`npm run dev-server` + `npm run dev-client` 后浏览器回归五页（登录/项目列表/分类树/接口编辑/导入弹窗）+ advanced-mock、数据导入插件页抽查 |
| 回滚策略 | `git revert` 对应提交并恢复锁文件；不涉及数据库与 API |
| 建议门禁 | 236 用例全过；build 退出码 0；五页 DOM 回归通过；控制台无 antd 相关报错（警告可留待 S2 处理） |
| codemod 预备 | 在独立分支对 `client/` + `exts/` dry-run antd 官方 3→4 codemod，产出改造点清单（预计命中 2.1/2.3 表全部行），评审后作为 S2 工单输入；不合并 |

### S2：antd 3 → 4（Form 迁移与图标迁移为主体，react 需 16.9+，即 S1 之上）

| 项 | 内容 |
|----|------|
| 前置条件 | S1 门禁通过；codemod dry-run 清单评审完成；`@ant-design/icons` 单页试点通过 |
| 改动面 | ① 表单：12 个 client 文件（84 处 `getFieldDecorator`、12 处 `Form.create` 含 2 处装饰器改 HOC）+ 3 个 exts 文件（15+3 处），迁移为 `Form` + `Form.Item name` + `onFinish/onValuesChange` 数据流；② 图标：129+15 处 `<Icon>` 迁移 @ant-design/icons，11 处动态 type 建映射表；③ `TabPane` 30 处暂最小兼容（v4 保留），items 化放本阶段尾批；④ `LocaleProvider` → `ConfigProvider`（1 处）+ `message.warn` → `warning`（1 处）；⑤ theme.less 按官方 v4 变量对照表调整（166 个变量中受影响子集）；⑥ exts 12 个插件文件同步迁移 |
| 页面顺序（对齐 Phase 15 顺序） | 登录（Login/Reg，2 文件）→ 项目/分组表单（AddProject/UpDateModal）→ 设置类（ProjectMessage/ProjectEnvContent/ProjectMock/ProjectRequest）→ 接口编辑表单（InterfaceEditForm/AddInterfaceForm/AddInterfaceCatForm/InterfaceColMenu）→ 插件页 |
| 验证命令 | 每页迁移后：`npx tsc --noEmit` + `npm test` + `npm run build-client` + 浏览器回归该页全部表单提交/校验/回显路径；全量完成后执行五页 + 插件完整回归 |
| 回滚策略 | 页面级：保留旧实现于独立提交，按页 revert；依赖级：`git revert` + 锁文件恢复 |
| 建议门禁 | 单页：tsc 0 错误、用例全过、该页手测清单通过；阶段：全部表单页通过后连续一周观察生产构建与错误上报再进入 S3 |

### S3：React 16.14 生命周期现代化（无大版本变更，为 React 17/18 铺路）

| 项 | 内容 |
|----|------|
| 前置条件 | S2 稳定；S1 已暴露的 UNSAFE 警告清单（50 处 CWRP/CWM 分布） |
| 改动面 | 22 处 `componentWillReceiveProps` + 28 处 `componentWillMount` 改为 `getDerivedStateFromProps`/`componentDidUpdate` 派生模式；**不引入 hooks**（hooks 化与 Phase 14 TypeScript 迁移协同另行安排）；`findDOMNode` 1 处可顺手改回调 ref（非必须） |
| 验证命令 | 同 S1；重点回归分类树（InterfaceMenu 依赖生命周期时序）与接口编辑页 |
| 回滚策略 | 文件级 revert（每文件一提交或小批量提交） |
| 建议门禁 | 控制台 UNSAFE 警告清零；236 用例全过；五页回归通过 |

### S4：React 17 / 18 评估（依赖先行，版本后行）

| 项 | 内容 |
|----|------|
| 前置条件 | S3 完成；react-redux 7 升级验证通过（peer 支持 ^16.8.3/\|^17/\|^18，可与 react 16.14 并存，建议作为 S4 第一步独立提交先行）；react-dnd 2 / recharts beta 在 react 17 下的兼容性验证结论 |
| 改动面 | 分两步：① `react/react-dom → 17.0.2`（无并发特性，API 零破坏；验证事件委托变化对弹层的影响）；② 评估 18.3.1：2 处 `ReactDOM.render` 改 `createRoot`、全应用并发模式回归、react-redux 8/9 与 redux 5 终态评估、react-dnd 5+ / router v6 独立评估（不改则维持） |
| 验证命令 | 同 S1 + 手工并发场景回归（快速连续交互、批量导入、分类树拖拽）；`rg -n 'ReactDOM.render' client` 应为 0（18 步后） |
| 回滚策略 | 依赖级 revert；17 与 18 之间保持独立提交，允许停在 17 |
| 建议门禁 | 17：全量回归通过且弹层/输入无事件丢失；18：仅当 17 稳定一个迭代周期、且 react-dnd/recharts 替换方案定型后再启动；antd 5 迁移作为独立后续阶段（theme.less 体系更换），不与 React 18 混在同一批次 |

---

## 六、结论

1. **当前决策：维持 `react@16.2.0` + `antd@3.2.2` 高可用兼容运行状态。** 与 refactor-plan.md Phase 16 现有结论一致，本报告不推翻、仅细化。
2. **决策依据（量化）**：升级的主要成本不在 React，而在 antd 的表单体系——99 处 `getFieldDecorator`、15 处 `Form.create`（client+exts 合计）是唯一“大工作量、高风险”项，且其中 10 个 client 表单文件目前是全站核心操作路径；图标（144 处）与 TabPane（30 处）虽为机械改造，但 exts 12 个插件文件必须同步迁移，否则插件静默失效。在 Phase 14 类型化尚未覆盖全部表单文件、S1 尚未完成的当前时点启动 antd 4，风险收益比不成立。
3. **顺序约束**：peer 约束决定了唯一低成本顺序是「react 16.14（S1）→ antd 4.24（S2）→ 生命周期现代化（S3）→ react 17/18（S4）」；antd 4/5 与 react 16.2 组合非法，antd 5 与未迁移的 v3 表单代码组合不可运行。
4. **各阶段启动触发条件**：
   - S1：六项前提已满足（本报告第一节），随时可启动；建议安排在无紧急业务窗口期；
   - S2：S1 门禁通过 + codemod dry-run 清单评审完成 + 表单相关文件纳入 TypeScript 严格检查的比例有明显提升（利用 Phase 14 渐进迁移顺路完成）；
   - S3：S2 全量门禁通过并稳定观察一周；
   - S4：S3 完成 + react-redux 7 单独验证通过 + react-dnd/recharts 在 react 17 下的兼容性结论明确；antd 5（theme.less 体系更换）在 S4 之后单独立项。
5. **与计划的衔接**：本报告各节数字均附复跑命令，后续若推进 S1/S2，建议把第二节表格作为迁移工单的核对清单，并按页更新 refactor-plan.md Phase 16 章节进度（由主流程统一维护）。

## 附：遗留待核实项

| # | 事项 | 说明 |
|---|------|------|
| 1 | antd 4 对 `antd/lib/locale-provider/zh_CN` 的存续形态 | 官方迁移文档口径为“弃用保留、建议 ConfigProvider”，未在本仓库实测 v4 包内容 |
| 2 | antd 5 移除 `TabPane` / `LocaleProvider` 的精确版本边界 | 依据官方 5.0 迁移文档，未逐版本实测 |
| 3 | classic JSX runtime 在 React 17/18 的长期支持承诺 | 官方立场为继续支持，但 18 的 automatic runtime 是推荐路径，未实测 |
| 4 | `@ant-design/icons` 的 `sideEffects` 声明与 Webpack 4 下的实际 tree-shaking 产物体积 | 需在 S2 预研时用 build 产物对比实测 |
| 5 | react-dnd 2.5.4、recharts 1.0.0-beta.10 在 React 17/18 下的运行表现 | 两包均早于 React 17 发布且使用 legacy context，需独立验证环境 |
| 6 | react-router-dom 4.2.2 在 React 17/18 下的行为（peer 仅声明 `>=15`） | 升级时需全量路由回归；v6 API 迁移另立项 |
| 7 | `json-schema-editor-visual`、`mockEditor`、`AceEditor`、`tui-editor` 等内部组件对 antd 3 公共 API 的耦合深度 | 建议在 S2 表单迁移时逐文件确认其 import 面 |
| 8 | immer 1.1.1 升级路径（produce 语义在 2+/9+ 的行为差异） | 与 React 升级无耦合，可与 S1~S4 并行评估 |

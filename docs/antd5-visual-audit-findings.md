# antd5 覆盖面视觉巡检 · findings 登记表（批次 1）

> 登记日期：2026-09-21。状态：**批次 1 完成（三层扫描与候选登记），批次 2（修复）未开工**。
> 立项计划：`docs/antd5-visual-audit-plan.md`。数据源：
>
> - 层 A：`node scripts/antd5-candidate-scan.mjs` → `/tmp/yapi-antd5-scan/{candidates.json,report.md}`
> - 层 B：`npx ava test/client/visual/antd5-runtime-diff.test.js` → `/tmp/yapi-antd5-layerb/findings.json`
> - 扫描对象：**static/prd 已提交产物**（提交 `ffe1d253` 工作区，未触碰任何用户进行中改动）

## 1. 候选总数（层 A）

解析规则 5286 条，过滤后**自定义候选 1083 条**：

| 指标 | 数值 |
| --- | --- |
| CSS chunk 数 | 7 |
| 解析规则总数 | 5286 |
| 纯 antd 类规则（排除） | 43 |
| 无类选择器规则（排除） | 325 |
| 无观察属性规则（排除） | 180 |
| json-schema-editor 作用域规则（计划 §6 排除，显式计数） | 6143 |
| **自定义候选（多选择器规则按逗号拆分计入）** | **1083** |

分 chunk（候选数 / 页面域）：

| chunk | 规则数 | 候选数 | 页面域 |
| --- | --- | --- | --- |
| `index@f9604acba625dfd0.css` | 410 | 315 | 全局外壳 / login / home |
| `project@7aa95aed86f6e2cf.css` | 481 | 426 | project 设置/动态/数据/token |
| `group@cef5a7252f9f7e03.css` | 178 | 160 | group 列表/成员/设置/动态 |
| `user@57802eb279f54184.css` | 41 | 45 | user 列表/资料 |
| `i@2d565a27428c9d75.css` | 4032 | 65 | project interface 域（其余为 scoped antd3，已排除） |
| `follows@48b393bc1fbabcdb.css` | 77 | 40 | follow |
| `add-project@70044a72b4501e75.css` | 67 | 32 | add-project |

## 2. 层 B 实测判定汇总

方法：jsdom 挂载可达页面（复用既有容器测试配方）+ **级联仿真**（jsdom 的
`getComputedStyle` 不做样式表层叠，无法直接读样式表声明，故由
`test/client/visual/antd5Cascade.js` 按 `!important > specificity > 来源顺序`
对每条候选的观察属性求胜出规则；`element.matches` 实测共现，非文本猜测）。
dev/prod 双口径：运行时规则同时计算带 `css-dev-only-do-not-override-*` 哈希与
剥离哈希两种特异性。页面命中（候选数 / 实测评估次数）：

| 页面 | 命中候选 | 评估次数 |
| --- | --- | --- |
| login | 15 | 130 |
| home 游客 | 76 | 712 |
| group 列表 | 24 | 252 |
| interface 用例集合 | 9 | 64 |
| interface 运行（Postman） | 21 | 98 |
| statistics | 15 | 116 |

判定分布（去重到候选规则）：

| 状态 | 数量 | 说明 |
| --- | --- | --- |
| **confirmed-override** | **2** | antd 运行时规则获胜且值不同（§3） |
| **ambiguous** | **2** | antd 规则获胜但声明值相同（无视觉差异/继承同值盲区，层 C 复核） |
| not-overridden | 146 | 自定义规则获胜（含 18 条被其他自定义规则以更高特异性接管） |
| **needs-manual** | **933** | 批次 1 jsdom 未挂载页面 / 伪类选择器静态不匹配（§5） |

## 3. confirmed-override 清单（批次 2 修复对象）

### F-1 `.card-login`（login 页，chunk index）— 已知事故位 + 新增 border-radius

选择器观察属性：`border-radius / margin-top / margin-bottom / position`。

| 属性 | 自定义声明 | 获胜 antd 运行时规则 | 获胜值 | specificity 对比 |
| --- | --- | --- | --- | --- |
| margin-top | `1.6rem`（**产物中无 !important**） | `:where(.css-xxx).ant-card` | `margin: 0` | 0,1,0 vs 0,1,0（运行时序决胜） |
| border-radius | `.04rem`（≈4px） | `:where(.css-xxx).ant-card` | `border-radius: 8px` | 0,1,0 vs 0,1,0（运行时序决胜） |
| margin-bottom | `1.6rem` | —（未被 antd 覆盖） | 自定义 `.container div:last-child{margin-bottom:0}`（0,1,1）以更高特异性接管 | — |
| position | `relative` | 同值 `relative` | — | ambiguous，无视觉差异 |

- **重要事实**：源码修复 `979dfa67`（margin-top/margin-bottom 加 `!important`）
  **尚未进入 static/prd 产物**——产物最后一次重建在 `e50cae0b`（早于修复提交）。
  层 B 锚点用例（antd5-runtime-diff.test.js「login 页差分」）当前按产物态断言
  「复现原始事故」；**批次 2 前置动作：重建产物并跑 `npm run build-client` 之后的
  锚点应翻转为 not-overridden（源码态已含 !important）**。border-radius 的覆盖
  在产物重建后仍将存在（源码中该属性无自保），是本巡检**新发现的修复点**。
- 层 B 锚点断言数据：dev/prod 两口径均 `confirmed-override`，获胜规则
  `:where(.css-dev-only-do-not-override-mncuj7).ant-card`。

### F-2 group 搜索按钮前景色（group-list 页，chunk group）

| 属性 | 自定义声明 | 获胜 antd 运行时规则 | 获胜值 | specificity 对比 |
| --- | --- | --- | --- | --- |
| color | `#ffffffd9` | `:where(.css-xxx).ant-input-search >.ant-input-group >.ant-input-group-addon:last-child .ant-input-search-button:not(.ant-btn-color-primary)` | `color: rgba(0,0,0,0.45)` | **0,5,0 vs 0,6,0**（antd `:not()` 计特异性反超） |

- 自定义选择器：`.group-bar .group-operate .ant-input-group-addon .ant-input-search-button`
  深色底白字意图被 antd 浅色 token 覆盖（搜索按钮文字/图标可能退化为低对比）。
- 修复方向（批次 2）：提升特异性（加父级类）优先，`!important` 次之（本文件无先例）。

### ambiguous（层 C 复核，无确定视觉差异）

| 选择器 | 属性 | 双方声明 | 页面 |
| --- | --- | --- | --- |
| `.group-bar .group-list .group-item>span` | overflow | 双方均 `hidden` | group-list |
| `.group-bar .group-list .group-item .ant-menu-title-content` | overflow | 双方均 `hidden` | group-list |

## 4. 引擎观测到的事实修订（对计划 §0）

1. **dev/prod 特异性实测一致**：当前 antd 5.29.3 / @ant-design/cssinjs 1.24.0
   注入的选择器形如 `:where(.css-<hash>).ant-card`——`:where()` 特异性计零，
   dev（css-dev-only-do-not-override-*）与 prod（css-<hash>）口径同为 (0,1,0)。
   计划 §0「dev 0,2,0 / prod 0,1,0」与当前版本实测不符；层 B 双口径机制保留，
   实测两口径判定全部一致（表内 dev/prod 成对出现）。
2. **产物滞后**：static/prd 最后一次重建为 `e50cae0b`，早于 `979dfa67` 修复。
   凡「源码已修、产物未修」的点位，本表按产物态登记（批次 2 重建产物后须复核）。
3. **CSS 分包形态已 CI 化**：`test/build/antd5-css-chunk-fingerprint.test.js`
   登记了 assets.js 各 CSS chunk 文件名、初始 chunk 注入顺序、scoped antd3
   载体 chunk（`i`）及其 scope 标记不泄入 index 的三条门禁（D-1 类事故防复发）。

## 5. needs-manual 登记（933 条）

批次 1 jsdom 可达页面仅 6 个（login/home 游客/group 列表/interface 用例集合/
interface 运行/statistics）。未挂载页面上的候选全部登记 needs-manual，
按 chunk → 页面域分布：

| chunk | needs-manual | 待巡检页面域 |
| --- | --- | --- |
| project | 393 | project setting 六面板、activity/data/token、interface 列表/详情（View） |
| index | 222 | register 页签、home 登录态、全局 Header/Footer 深层结构 |
| group | 136 | group 成员/设置/动态子页 |
| user | 45 | user 列表/资料 |
| follows | 40 | follow 列表 |
| add-project | 32 | add-project |
| i | 65 | interface 编辑（依赖用户 WIP，见 §6）/ wiki 插件域 |

巡检方式：批次 2 前由主 Agent 以 headless 浏览器（层 C 视觉走查）覆盖，
或批次 2 扩充层 B 挂载配方（每页约 20-40 行 axios 桩 + 种子 state）。

## 6. pending 登记（本批不做）

| 事项 | 原因 | 恢复条件 |
| --- | --- | --- |
| InterfaceEditForm 容器快照（序列化器接入） | 依赖 `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js` 用户进行中改动（工作区未提交），接入会与用户 WIP 冲突 | 用户 WIP 合入后，按 `test/helpers/domSnapshot.js` 接入口径单独开批 |
| 皮肤矩阵（enterprise/gov/anime/dark × 页面） | 皮肤只改 CSS 变量不改结构，层 B 级联仿真对变量层不敏感 | 层 C 视觉走查按计划 §1 抽样执行 |
| 计算样式快照用例入库（计划批次 3） | 依赖批次 2 修复点位确定 | 批次 2 完成后对已修复点位断言 computed 值 |

## 7. 批次 1 交付物与验证

| 交付物 | 路径 |
| --- | --- |
| 层 A 扫描 CLI（含共享解析库） | `scripts/antd5-candidate-scan.mjs`、`scripts/antd5-css-lib.cjs` |
| 层 B 级联仿真库 + 差分测试 | `test/client/visual/antd5Cascade.js`、`test/client/visual/antd5-runtime-diff.test.js` |
| 序列化器共享模块 | `test/helpers/domSnapshot.js`（InterfaceColContentContainer / PostmanContainer 两容器测试已接入，基线 diff 仅含 2 处 style 白名单采集增量，逐条核实为 DOM 既有事实） |
| D-1 指纹门禁 | `test/build/antd5-css-chunk-fingerprint.test.js` |
| 登记表（本文件） | `docs/antd5-visual-audit-findings.md` |

验证命令：

```bash
node scripts/antd5-candidate-scan.mjs            # 层 A：1083 候选
npx ava test/client/visual/antd5-runtime-diff.test.js   # 层 B：7 tests passed
npx ava test/client/containers/InterfaceColContentContainer.test.js test/client/components/PostmanContainer.test.js  # 12 tests passed
npx ava test/build/antd5-css-chunk-fingerprint.test.js  # 3 tests passed
```

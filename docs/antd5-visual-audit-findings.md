# antd5 覆盖面视觉巡检 · findings 登记表（批次 2 → 2a+3）

> 登记日期：2026-09-21。状态：**批次 2a+3 完成（8 条 confirmed-override 裁决修复 7 条 +
> hover 提级 + 计算样式快照入库，产物重建、层 A/B 重扫）**；
> 遗留移交层 C：N-2 裁决、3 条 ambiguous 复核、四皮肤抽查（见 §6/§7）。
> 立项计划：`docs/antd5-visual-audit-plan.md`。数据源（均为 `os.tmpdir()` 下的临时目录，
> macOS 实际路径形如 `/var/folders/.../T/...`）：
>
> - 层 A：`node scripts/antd5-candidate-scan.mjs` → `os.tmpdir()/yapi-antd5-scan/{candidates.json,report.md}`
> - 层 B：`npx ava test/client/visual/antd5-runtime-diff.test.js` → `os.tmpdir()/yapi-antd5-layerb/findings.json`
> - 批次 3 快照门禁：`npx ava test/client/visual/antd5-fixpoint.test.js`（修复位 computed 值级断言）
> - 扫描对象：**static/prd 已重建产物**（批次 2a+3 再次前置重建，见 §4.2；未触碰任何用户进行中改动）

## 1. 候选总数（层 A，批次 2 重扫）

解析规则 5421 条，过滤后**自定义候选 1670 条**。计数单位说明：候选以**逗号拆分后的
单选择器规则**为一条（一条多选择器 CSS 规则拆为多条候选），即「条 = 选择器 × 规则块」；
同一选择器在不同 chunk 重复出现时按 chunk 分别计数（下表 §3 的 `.form-item` 双条目即此口径）。

| 指标 | 数值 |
| --- | --- |
| CSS chunk 数 | 7 |
| 解析规则总数 | 5421 |
| 纯 antd 类规则（排除） | 5402 |
| 无类选择器规则（排除） | 325 |
| 无观察属性规则（排除） | 446 |
| json-schema-editor 作用域规则（计划 §6 排除，显式计数） | 6158 |
| **自定义候选（多选择器规则按逗号拆分计入）** | **1670** |

分 chunk（候选数 / 页面域）：

| chunk | 规则数 | 候选数 | 页面域 |
| --- | --- | --- | --- |
| `index@7042c67a98c45f2a.css` | 418 | 326 | 全局外壳 / login / home |
| `project@6033852e01bd4f2c.css` | 491 | 439 | project 设置/动态/数据/token |
| `group@b6dce64e97ccded9.css` | 178 | 160 | group 列表/成员/设置/动态 |
| `user@57802eb279f54184.css` | 41 | 45 | user 列表/资料 |
| `i@05d52c24969994a8.css` | 4133 | 606 | project interface 域（含 21964bbc 起的 antd3 双作用域规则，见 §5） |
| `follows@3f80bd4670cf7f38.css` | 85 | 51 | follow |
| `add-project@f2f41aafd4e87c75.css` | 75 | 43 | add-project |

## 2. 层 B 实测判定汇总（批次 2：16 个挂载页面域）

方法：jsdom 挂载可达页面（复用既有容器测试配方）+ **级联仿真**（jsdom 的
`getComputedStyle` 不做样式表层叠，无法直接读样式表声明，故由
`test/client/visual/antd5Cascade.js` 按 `!important > specificity > 来源顺序`
对每条候选的观察属性求胜出规则；`element.matches` 实测共现，非文本猜测）。
dev/prod 双口径：运行时规则同时计算带 `css-dev-only-do-not-override-*` 哈希与
剥离哈希两种特异性。

页面命中（候选数 / 实测评估次数）：

| 页面域 | 命中候选 | 评估次数 |
| --- | --- | --- |
| login | 15 | 130 |
| register | 15 | 130 |
| home 游客 | 76 | 712 |
| 全局 Header/Footer（登录态外壳） | 43 | 338 |
| group 列表 | 24 | 252 |
| group 成员 | 6 | 38 |
| group 设置 | 8 | 30 |
| group 动态 | 13 | 54 |
| interface 用例集合 | 9 | 64 |
| interface 运行（Postman） | 21 | 98 |
| interface 列表 | 4 | 86 |
| interface 详情（View） | 16 | 148 |
| interface 编辑（Edit→InterfaceEditForm） | 14 | 206 |
| project setting（项目配置面板） | 42 | 204 |
| project token | 9 | 60 |
| project 数据导出 | 21 | 104 |
| project 动态 | 23 | 146 |
| statistics | 15 | 116 |
| user 列表 | 7 | 32 |
| user 资料 | 18 | 212 |
| follows | 38 | 346 |
| add-project | 31 | 176 |

判定分布（去重到候选规则；「批次 2」列保留历史口径，「批次 2a+3」为修复后重扫）：

| 状态 | 批次 2 | 批次 2a+3 | 说明 |
| --- | --- | --- | --- |
| **confirmed-override** | 8 | **1** | 仅剩 N-2（裁决：待层 C 后修，见 §3.4）；其余 7 条已修复翻转（§3.1–§3.3） |
| **ambiguous** | 2 | **3** | 原 2 条不变；`.card-login` 的 position 同值歧义此前被 confirmed 掩盖，修复后浮出（无视觉差异，层 C 口径） |
| not-overridden | 347 | **353** | 自定义规则获胜（含被其他自定义规则接管与自保获胜；候选数 353，双口径判定记录数更多） |
| **needs-manual** | 772 | **772** | 批次 2 仍未挂载页面 / 伪类选择器静态不匹配（§5） |
| antd3-scoped | 541 | **541** | antd3 双作用域守卫规则（`:not([class*=css-])`，21964bbc 引入），按设计不作用于 antd5 元素，属计划 §6 范围外 |

> 候选基数保持 1670 不变（修复全部为「同元素提特异性/加 !important」，未增删规则条数）。

## 3. confirmed-override 清单与修复登记

### 3.1 批次 2a 修复登记（F-1 + N-1~N-7，7 条全部翻转）

修复手法遵循计划 §3 约束（specificity 提升 > 同文件已有 !important 先例 > 结构调整），
产物已随批次 2a+3 前置重建进入 static/prd，层 B 重扫全部翻转为 **not-overridden（self-wins，
dev/prod 双口径一致）**，并由批次 3 快照门禁 `test/client/visual/antd5-fixpoint.test.js`
对 computed 值逐位固化：

| # | 选择器（来源 chunk） | 修复属性 | 原获胜 antd 运行时规则 | 修复手法（文件） | 修复后特异性 |
| --- | --- | --- | --- | --- | --- |
| F-1 | `.card-login`（index） | border-radius | `:where(.css-xxx).ant-card{border-radius:8px}`（0,1,0 运行时序） | 补 `!important`，沿用同文件 margin 先例（`client/containers/Login/Login.scss`） | `.04rem !important`（≈4px @ rem 基准 100px），!important 险胜 |
| N-1 | `.header-box`（index） | line-height | `:where(.css-xxx).ant-layout-header{line-height:64px}`（0,1,0 运行时序） | 声明并入同文件已有 `&.ant-layout-header` + !important 通道（`client/components/Header/Header.scss`） | `.header-box.ant-layout-header{line-height:normal!important}`（0,2,0 + !important） |
| N-3 | `.form-item`（add-project chunk） | margin-bottom | `:where(.css-xxx).ant-form-item{margin:0}`（0,1,0 运行时序） | 同元素联合类提一档：className 经 FormItem 落在 `.ant-form-item` 根上，元素恒同时携带两类，匹配集合不变（`client/containers/AddProject/Addproject.scss`） | `.form-item.ant-form-item`（0,2,0） |
| N-4 | `.form-item`（project chunk，与 N-3 同名异源） | margin-bottom | 同上 | 同模式各自独立修复（`client/containers/Project/Setting/Setting.scss`） | `.form-item.ant-form-item`（0,2,0） |
| N-5 | `.dynamic-delete-button`（**project**，使用点 ProjectEnvContent/ProjectTag/CaseDesModal 三处全在 project chunk 覆盖域） | color | `.anticon{color:inherit}`（0,1,0 运行时序）；另层 C 实测证伪层 B 初判——规则原在 ProjectList.scss（group chunk），使用页根本不加载，从未生效 | 规则**迁移**至 `client/containers/Project/Setting/Setting.scss`（project chunk）+ 联合类提一档 `.dynamic-delete-button.anticon`（0,2,0）；迁移缘由：层 B 引擎不建模「chunk 是否在该页面域加载」，其对跨 chunk 候选的自保判定可能是空真（层 C 实测证伪后迁移，见 §4 尾「引擎结构性盲区」） | `.dynamic-delete-button.anticon`（0,2,0） |
| N-6 | `.caseContainer .ant-table-thead th`（project） | color | `:where(.css-xxx).ant-table-wrapper .ant-table-thead >tr>th{color:rgba(0,0,0,0.88)}`（0,2,2） | 补一段真实祖先 `.ant-table-wrapper`（antd Table 根，表头 th 必在其内），两属性一次修（`client/containers/Project/Interface/InterfaceList/View.scss`） | `.caseContainer .ant-table-wrapper .ant-table-thead th`（0,3,1） |
| N-7 | `.caseContainer .ant-table-thead>tr>th`（project） | background | `:where(.css-xxx).ant-table-wrapper .ant-table-thead >tr>th{background:#fafafa}`（0,2,2 运行时序） | 同上，与 N-6 同一文件一次修 | `.caseContainer .ant-table-wrapper .ant-table-thead>tr>th`（0,3,2） |

### 3.2 F-2/M-1 group 搜索按钮前景色（group-list 页，chunk group）— F-2 批次 2 已修复，M-1 批次 2a hover 提级

| 属性 | 自定义声明 | 原获胜 antd 规则 | 原获胜值 | specificity 对比（修复前） |
| --- | --- | --- | --- | --- |
| color | `#ffffffd9` | `:where(.css-xxx).ant-input-search >.ant-input-group >.ant-input-group-addon:last-child .ant-input-search-button:not(.ant-btn-color-primary)` | `color: rgba(0,0,0,0.45)` | **0,5,0 vs 0,6,0**（antd `:not()` 计特异性反超） |

- F-2 修复手法：**specificity 提升**（该文件无 `!important` 先例）。借
  `.search`（GroupList 真实容器）/`.ant-input-group`/`.ant-input-group-addon`
  真实祖先链，把 `.ant-input-group-addon .ant-input-search-button.ant-btn`（0,5,0）
  提升为 `.group-bar .group-operate .search .ant-input-group .ant-input-group-addon .ant-input-search-button.ant-btn`
  （**0,7,0**）。层 B 实测：color/background/border/border-left/border-radius 全部
  not-overridden（self-wins），dev/prod 双口径一致。
- **计数勘误（批 2 评审，层 B 引擎对运行时选择器实测）**：批 2 注释与登记的
  「hover/focus 态 0,8,0 压过 antd hover 的 0,7,0」有误——antd hover 前景色规则
  （`...:not(.ant-btn-color-primary):not([disabled]):hover`）实测为 **0,8,0**，
  我方修复后 hover/focus 仅 0,8,0 打平、运行时序反被压过（M-1）。
  附带事实句中 border-inline-start-color 规则经引擎实测同为 **0,8,0**
  （`:where(...).ant-input-search .ant-input:not([disabled]):hover +.ant-input-group-addon .ant-input-search-button:not(...):not(...)`，
  两处计数并非颠倒、而是 antd hover 一处低估）；该规则仅声明 border-left-color，
  我方 `border-left: none` 以 0,7,0 决定 border-left-style、无可见载体，无需对抗的结论不变。
- **M-1 修复（批次 2a）**：hover/focus 链追加 `:not([disabled])` 镜像提至
  **0,9,0**（`...ant-btn:hover:not([disabled])` / `...ant-btn:focus:not([disabled])`），
  压过 antd hover 的 0,8,0。jsdom 对 `:hover/:focus` 静态不匹配（层 B 结构性盲区），
  层 B 与批次 3 快照按引擎口径静态固化该特异性关系，动态态留层 C 走查。

### 3.3 ambiguous（层 C 复核，无确定视觉差异）

| 选择器 | 属性 | 双方声明 | 页面 | 层 C 事项 |
| --- | --- | --- | --- | --- |
| `.group-bar .group-list .group-item>span` | overflow、display | 双方均 `hidden` / flex 对齐同值 | group-list | 主 Agent headless 浏览器实测复核（组名溢出截断 + flex 布局视觉走查） |
| `.group-bar .group-list .group-item .ant-menu-title-content` | overflow、display | 双方均 `hidden` / flex 对齐同值 | group-list | 同上（同一视觉区域，可合并一次走查） |
| `.card-login` | position | 双方均 `relative`（antd `:where(.css-xxx).ant-card` 运行时序获胜但同值） | login/register | 批次 2 起即存在、此前被 F-1 的 confirmed 状态掩盖；无视觉差异，随 login 页走查顺带复核 |

### 3.4 N-2 不修（批次 2a 裁决：待层 C 后裁决）

| 选择器（来源 chunk） | 属性 | 自定义值 | 获胜 antd 运行时规则 | 获胜值 | specificity | 页面 |
| --- | --- | --- | --- | --- | --- | --- |
| `.search-wrapper .search-input`（index） | width | `2rem` | `:where(.css-xxx).ant-select-single .ant-select-selector .ant-select-selection-search-input` 族 | `width: 100%` | 0,2,0 vs 0,3,0 | 全局外壳（Header 全局搜索框） |

评审裁决：需层 C 实测后倾向修外壳类而非硬压，**当前保持 confirmed-override 在案**；
层 B 汇总门禁已钉住「confirmed 仅剩 N-2」，若其意外翻转（如 antd 规则变化）需人工复核。


## 4. 引擎观测到的事实修订（对计划 §0）

1. **dev/prod 特异性实测一致**：当前 antd 5.29.3 / @ant-design/cssinjs 1.24.0
   注入的选择器形如 `:where(.css-<hash>).ant-card`——`:where()` 特异性计零，
   dev（css-dev-only-do-not-override-*）与 prod（css-<hash>）口径同为 (0,1,0)。
   计划 §0「dev 0,2,0 / prod 0,1,0」与当前版本实测不符；层 B 双口径机制保留，
   实测两口径判定全部一致（表内 dev/prod 成对出现）。
2. **产物滞后已消除（批次 2/2a+3 两次前置重建）**：批次 1 期间 static/prd 最后一次重建为 `e50cae0b`，
   早于 `979dfa67` 修复；批次 2 前置动作已执行 `npm run build-client` 全量重建
   （同时吸收 979dfa67、21964bbc 的 common.scss 修复与本批 F-2 修复），
   `test/build/antd5-css-chunk-fingerprint.test.js` BASELINE 已按门禁文件头流程
   显式更新（index/project/follows/add-project/i/group 六 chunk 哈希变化，
   initial chunk 顺序不变）。批次 2a+3 再次前置重建以吸收本批七处修复
   （index/group/project/add-project 四 chunk 哈希变化，initial chunk 顺序不变），
   BASELINE 按同一流程显式更新并重扫层 A/层 B。
3. **CSS 分包形态已 CI 化**：`test/build/antd5-css-chunk-fingerprint.test.js`
   登记了 assets.js 各 CSS chunk 文件名、初始 chunk 注入顺序、scoped antd3
   载体 chunk（`i`）及其 scope 标记不泄入 index 的三条门禁（D-1 类事故防复发）。

**引擎结构性盲区（N-5 实证，批次 2a 登记）**：引擎将全部 chunk 规则并入同一索引后按
特异性/源序裁定，**不建模「某 chunk 的 CSS 是否在该页面域实际加载」**——对跨 chunk 候选，
引擎的 self-wins 判定可能是空真（规则从未在该页生效）。实证：N-5 的
`.dynamic-delete-button` 规则原在 ProjectList.scss（group chunk），使用点全在 project
chunk 覆盖域（环境配置/标签/接口编辑），层 B 曾判 self-wins，层 C 实测为继承色（从未
生效）——规则已迁往 Setting.scss。采信边界：引擎 not-overridden 结论对**同 chunk** 候选
可靠；**跨 chunk** 候选须经层 C 或加载关系核对后方可采信。


## 5. needs-manual 剩余登记（772 条，批次 2 收敛后）

批次 1 的 933 条 needs-manual 经批次 2 扩充挂载配方（新增 10 个页面域）后收敛：

| 口径 | 数值 |
| --- | --- |
| 候选基数 | 1083（批次 1）→ **1670**（批次 2 重扫，含 21964bbc 合入后的 antd3 双作用域规则 541 条） |
| needs-manual | 933（批次 1）→ **772**（批次 2） |
| 剥离 antd3 双作用域（范围外） | 541 条（`antd3-scoped`，不再占用人工巡检预算） |
| 在同一候选基数可比口径下 | 批次 1 基数 1083 中 needs-manual 933（86%）；批次 2 剥离范围外后为 772/1670（46%） |

剩余 needs-manual 分 chunk → 页面域：

| chunk | needs-manual | 剩余人工巡检域 |
| --- | --- | --- |
| project | 317 | 环境配置/成员管理面板深层、interface 菜单树展开态、动态/数据页深层交互态 |
| index | 191 | home 登录态深层区块、mock 页、Footer 深层结构 |
| group | 110 | project-list 子页、成员管理弹窗态 |
| follows | 36 | 关注卡片 hover 态等 |
| add-project | 29 | 面板深层区块 |
| i | 65 | interface 编辑深层交互态（schema 编辑器弹层）、wiki 插件域 |
| user | 24 | 资料页深层交互态 |

其中 90 条含 `:hover/:focus/:before` 等伪类（jsdom 静态不匹配，属层 B 结构性盲区），
只有层 C 视觉走查可覆盖；其余 682 条为「深层交互态未挂载」，可随交互配方扩充继续收敛。

## 6. pending 登记

| 事项 | 状态 | 说明 |
| --- | --- | --- |
| InterfaceEditForm 容器快照（序列化器接入） | **批次 2 已完成** | `test/client/containers/InterfaceEditFormContainer.test.js`：经 Edit.js 容器挂载，3 用例（整容器快照等价 / 字段回填钉住 / 序列化器灵敏度）。**基线口径说明**：批次 1 登记时 InterfaceEditForm.js 含用户未提交 WIP；本基线以 **21964bbc 合入后的当前提交态** 重新采集（WIP 已成新基线，口径切换属预期） |
| 计算样式快照用例入库（计划批次 3） | **批次 3 已完成** | `test/client/visual/antd5-fixpoint.test.js`：对全部修复点位（F-1/N-1/N-3/N-4/N-5/N-6/N-7 + F-2 基础态 + M-1 hover 静态裁定）断言 self-wins 与声明值/!important，dev/prod 双口径 |
| N-2（`.search-wrapper .search-input` width） | **待层 C 后裁决** | 批次 2a 裁决不修：需层 C 实测后倾向修外壳类而非硬压；层 B 汇总门禁钉住「confirmed 仅剩 N-2」（§3.4） |
| 皮肤矩阵（enterprise/gov/anime/dark × 页面） | 未开工 | 皮肤只改 CSS 变量不改结构，层 B 级联仿真对变量层不敏感；层 C 视觉走查按计划 §1 抽样执行（含 F-2/M-1 与批次 2a 各修复位的 dark/anime/gov 抽查） |
| 3 条 ambiguous 的层 C 复核 | 待主 Agent | 见 §3.3 ambiguous 表（group-item 溢出/flex 走查 ×2 + card-login position 同值复核） |

## 7. 批次 2/2a+3 交付物与验证

批次 2 交付物（保留历史记录）：

| 交付物 | 路径 |
| --- | --- |
| F-2 修复（specificity 提升 0,7,0） | `client/containers/Group/GroupList/GroupList.scss` |
| 级联仿真缓存硬化（per-index 缓存）+ 单测 | `test/client/visual/antd5Cascade.js`、`test/client/visual/antd5Cascade.test.js` |
| 层 B 扩充至 16 页面域 + 锚点更新 + antd3-scoped 分类 | `test/client/visual/antd5-runtime-diff.test.js` |
| InterfaceEditForm 容器快照门禁 | `test/client/containers/InterfaceEditFormContainer.test.js` |
| 指纹门禁 BASELINE 更新 | `test/build/antd5-css-chunk-fingerprint.test.js` |
| 登记表（本文件） | `docs/antd5-visual-audit-findings.md` |
| 层 B 级联仿真引擎（批次 1 交付，批次 2 硬化） | `test/client/visual/antd5Cascade.js` |

批次 2a+3 交付物：

| 交付物 | 路径 |
| --- | --- |
| F-1 + N-1~N-7 七处覆盖点修复 | `client/containers/Login/Login.scss`、`client/components/Header/Header.scss`、`client/containers/AddProject/Addproject.scss`、`client/containers/Project/Setting/Setting.scss`、`client/containers/Group/ProjectList/ProjectList.scss`、`client/containers/Project/Interface/InterfaceList/View.scss` |
| M-1 hover/focus 提级 0,9,0 + 注释计数勘误 | `client/containers/Group/GroupList/GroupList.scss` |
| 层 B 锚点翻转（F-1/N-1/N-3/N-4/N-5/N-6/N-7）+ M-1 hover 静态判定 + 「confirmed 仅剩 N-2」汇总门禁 | `test/client/visual/antd5-runtime-diff.test.js` |
| 批次 3 计算样式快照门禁（6 页面域挂载，修复位 computed 值级断言） | `test/client/visual/antd5-fixpoint.test.js` |
| 指纹门禁 BASELINE 更新（最终态含 N-5 迁移二次重建：index@39ef29962cd900dd / group@426f689219580b35〔失规则〕/ project@621f61c9be96dc30〔得规则〕/ add-project@80e6a5a4d705c349；中间态 fcdb98cf/9279d6b6 已被覆盖） | `test/build/antd5-css-chunk-fingerprint.test.js` |

验证命令（批次 2a+3 实测结果）：

```bash
npm run build-client                              # 批次 2a+3 前置：产物重建，0 error（指纹门禁按设计熔断）
npx ava test/build/antd5-css-chunk-fingerprint.test.js   # 3 tests passed（BASELINE 更新后全绿）
node scripts/antd5-candidate-scan.mjs             # 层 A：1670 候选（与批次 2 持平）
npx ava test/client/visual/antd5-runtime-diff.test.js    # 层 B：23 tests passed；confirmed-override 8→1（仅剩 N-2）
npx ava test/client/visual/antd5-fixpoint.test.js         # 批次 3 快照：6 tests passed
npx ava test/client/visual/antd5Cascade.test.js   # 3 tests passed（缓存回归）
npm test                                          # 全量 821+新增 全绿
npx tsc --noEmit                                  # typecheck 0 error
npx eslint client/ server/ common/ exts/ test/    # lint 0 error / 0 warning
```

移交主 Agent（层 C）：

1. 批次 2/2a 全部修复位（F-1、F-2/M-1、N-1、N-3/N-4、N-5、N-6/N-7）的四皮肤 + dev/prod 浏览器截图验证（dark/anime/gov 抽查）；其中 M-1 hover/focus 动态态为层 B 结构性盲区，必须实测；
2. §3.3 ambiguous 表 3 条的 headless 实测复核；
3. N-2 的层 C 实测与修复裁决（倾向修外壳类而非硬压，见 §3.4）。

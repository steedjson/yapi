# antd5 覆盖面视觉巡检 · findings 登记表（批次 2）

> 登记日期：2026-09-21。状态：**批次 2 完成（产物重建、覆盖点修复 F-2、层 B 页面域扩充），
> 批次 3（计算样式快照入库 + 新增 confirmed 清单修复裁决）未开工**。
> 立项计划：`docs/antd5-visual-audit-plan.md`。数据源（均为 `os.tmpdir()` 下的临时目录，
> macOS 实际路径形如 `/var/folders/.../T/...`）：
>
> - 层 A：`node scripts/antd5-candidate-scan.mjs` → `os.tmpdir()/yapi-antd5-scan/{candidates.json,report.md}`
> - 层 B：`npx ava test/client/visual/antd5-runtime-diff.test.js` → `os.tmpdir()/yapi-antd5-layerb/findings.json`
> - 扫描对象：**static/prd 已重建产物**（批次 2 前置动作，见 §4.2；未触碰任何用户进行中改动）

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

判定分布（去重到候选规则）：

| 状态 | 数量 | 说明 |
| --- | --- | --- |
| **confirmed-override** | **8** | antd 运行时规则获胜且值不同（§3） |
| **ambiguous** | **2** | antd 规则获胜但声明值相同（无视觉差异/继承同值盲区，层 C 复核） |
| not-overridden | 347 | 自定义规则获胜（含 73 个候选被其他自定义规则以更高特异性接管，对应 530 条判定记录——同一候选跨页/跨属性/双口径重复计数，批次 1 误按记录数表述为「18 条」，实为 10 个候选） |
| **needs-manual** | **772** | 批次 2 仍未挂载页面 / 伪类选择器静态不匹配（§5） |
| antd3-scoped | 541 | antd3 双作用域守卫规则（`:not([class*=css-])`，21964bbc 引入），按设计不作用于 antd5 元素，属计划 §6 范围外，从 needs-manual 剥离 |

## 3. confirmed-override 清单

### F-1 `.card-login`（login 页，chunk index）— margin 已修复，border-radius 待裁决

选择器观察属性：`border-radius / margin-top / margin-bottom / position`。

批次 2 前置重建后（产物 `index@7042c67a98c45f2a.css` 已含 979dfa67 修复）：

| 属性 | 自定义声明 | 当前判定 | 说明 |
| --- | --- | --- | --- |
| margin-top | `1.6rem !important` | **not-overridden（self-wins）** | 979dfa67 修复已进产物，锚点断言已按翻转后口径固化（层 B login 用例） |
| margin-bottom | `1.6rem !important` | **not-overridden（self-wins）** | 同上 |
| border-radius | `.04rem`（≈4px） | **confirmed-override**（`border-radius: 8px` ← `:where(.css-xxx).ant-card`，0,1,0 vs 0,1,0 运行时序决胜） | 源码中该属性无自保，批次 1 新发现修复点；**不在批次 2 修复**（新 confirmed 清单统一裁决，见 §3.4） |
| position | `relative` | ambiguous | 双方同值，无视觉差异 |

### F-2 group 搜索按钮前景色（group-list 页，chunk group）— **批次 2 已修复**

| 属性 | 自定义声明 | 原获胜 antd 规则 | 原获胜值 | specificity 对比（修复前） |
| --- | --- | --- | --- | --- |
| color | `#ffffffd9` | `:where(.css-xxx).ant-input-search >.ant-input-group >.ant-input-group-addon:last-child .ant-input-search-button:not(.ant-btn-color-primary)` | `color: rgba(0,0,0,0.45)` | **0,5,0 vs 0,6,0**（antd `:not()` 计特异性反超） |

- 修复手法：**specificity 提升**（该文件无 `!important` 先例）。借
  `.search`（GroupList 真实容器）/`.ant-input-group`/`.ant-input-group-addon`
  真实祖先链，把
  `.ant-input-group-addon .ant-input-search-button.ant-btn`（0,5,0）
  提升为 `.search .ant-input-group .ant-input-group-addon .ant-input-search-button.ant-btn`
  （**0,7,0**，hover/focus 态 0,8,0 压过 antd hover 的 0,7,0）。
- 层 B 引擎实测（修复后重扫）：color/background/border/border-left/border-radius
  全部 **not-overridden（self-wins）**，dev/prod 双口径一致；层 B group 用例已固化
  F-2 修复锚点（color 必须自保获胜）。
- 附带事实：antd 对「输入框 hover」另有 0,8,0 的 `border-inline-start-color` 规则，
  但我方 `border-left: none`（style:none）以 0,7,0 压过其 border-left-style 声明，
  无可见边框，无需对抗。
- 四皮肤 + 浏览器截图验证：层 C 抽查项，留给主 Agent（见 §7 移交）。

### ambiguous（层 C 复核，无确定视觉差异）— 批次 2 起转层 C 登记

| 选择器 | 属性 | 双方声明 | 页面 | 层 C 事项 |
| --- | --- | --- | --- | --- |
| `.group-bar .group-list .group-item>span` | overflow、display | 双方均 `hidden` / flex 对齐同值 | group-list | 主 Agent headless 浏览器实测复核（组名溢出截断 + flex 布局视觉走查） |
| `.group-bar .group-list .group-item .ant-menu-title-content` | overflow、display | 双方均 `hidden` / flex 对齐同值 | group-list | 同上（同一视觉区域，可合并一次走查） |

### 批次 2 实测新增 confirmed-override（7 条候选，登记在案、本批不修）

> 修复裁决权在主 Agent：修复量评估后决定进批次 2a 或批次 3。

| # | 选择器（来源 chunk） | 属性 | 自定义值 | 获胜 antd 运行时规则 | 获胜值 | specificity | 页面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N-1 | `.header-box`（index） | line-height | `normal` | `:where(.css-xxx).ant-layout-header` | `line-height: 64px` | 0,1,0 vs 0,1,0（运行时序） | 全局外壳 |
| N-2 | `.search-wrapper .search-input`（index） | width | `2rem` | `:where(.css-xxx).ant-select-single .ant-select-selector .ant-select-selection-search-input` 族 | `width: 100%` | 0,2,0 vs 0,3,0 | 全局外壳（Header 全局搜索框） |
| N-3 | `.form-item`（add-project chunk） | margin-bottom | `.16rem` | `:where(.css-xxx).ant-form-item` | `margin: 0` | 0,1,0 vs 0,1,0（运行时序） | add-project、project setting |
| N-4 | `.form-item`（project chunk，与 N-3 同名异源） | margin-bottom | `.16rem` | `:where(.css-xxx).ant-form-item` | `margin: 0` | 0,1,0 vs 0,1,0（运行时序） | project setting、add-project |
| N-5 | `.dynamic-delete-button`（group） | color | `#999` | `.anticon`（运行时） | `color: inherit` | 0,1,0 vs 0,1,0（运行时序） | project setting（动态表单删除图标） |
| N-6 | `.caseContainer .ant-table-thead th`（project） | color | `#6d6c6c` | `:where(.css-xxx).ant-table-wrapper .ant-table-thead >tr>th` | `color: rgba(0,0,0,0.88)` | 0,2,1 vs 0,2,2 | interface 详情（View 参数表头） |
| N-7 | `.caseContainer .ant-table-thead>tr>th`（project） | background | `var(--sk-bg-faint)` | `:where(.css-xxx).ant-table-wrapper .ant-table-thead >tr>th` | `background: #fafafa` | 0,2,2 vs 0,2,2（运行时序） | interface 详情（View 参数表头） |

> F-1 的 border-radius 亦在待裁决之列（§3），合计待裁决 8 处（去重后 7 个视觉位：
> 登录卡片圆角、Header 行高、Header 搜索框宽度、表单行距 ×2 同源、删除图标色、
> 接口详情表头前景/背景 ×2 同区域）。

## 4. 引擎观测到的事实修订（对计划 §0）

1. **dev/prod 特异性实测一致**：当前 antd 5.29.3 / @ant-design/cssinjs 1.24.0
   注入的选择器形如 `:where(.css-<hash>).ant-card`——`:where()` 特异性计零，
   dev（css-dev-only-do-not-override-*）与 prod（css-<hash>）口径同为 (0,1,0)。
   计划 §0「dev 0,2,0 / prod 0,1,0」与当前版本实测不符；层 B 双口径机制保留，
   实测两口径判定全部一致（表内 dev/prod 成对出现）。
2. **产物滞后已消除（批次 2）**：批次 1 期间 static/prd 最后一次重建为 `e50cae0b`，
   早于 `979dfa67` 修复；批次 2 前置动作已执行 `npm run build-client` 全量重建
   （同时吸收 979dfa67、21964bbc 的 common.scss 修复与本批 F-2 修复），
   `test/build/antd5-css-chunk-fingerprint.test.js` BASELINE 已按门禁文件头流程
   显式更新（index/project/follows/add-project/i/group 六 chunk 哈希变化，
   initial chunk 顺序不变）。
3. **CSS 分包形态已 CI 化**：`test/build/antd5-css-chunk-fingerprint.test.js`
   登记了 assets.js 各 CSS chunk 文件名、初始 chunk 注入顺序、scoped antd3
   载体 chunk（`i`）及其 scope 标记不泄入 index 的三条门禁（D-1 类事故防复发）。

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
| 皮肤矩阵（enterprise/gov/anime/dark × 页面） | 未开工 | 皮肤只改 CSS 变量不改结构，层 B 级联仿真对变量层不敏感；层 C 视觉走查按计划 §1 抽样执行（含 F-2 修复位的 dark/anime/gov 抽查） |
| 计算样式快照用例入库（计划批次 3） | 未开工 | 依赖批次 3 对 §3 新增 confirmed 清单的修复裁决；修复后对已修复点位断言 computed 值 |
| 2 条 ambiguous 的层 C 复核 | 待主 Agent | 见 §3 ambiguous 表（group-item 溢出/flex 走查） |

## 7. 批次 2 交付物与验证

| 交付物 | 路径 |
| --- | --- |
| F-2 修复（specificity 提升 0,7,0） | `client/containers/Group/GroupList/GroupList.scss` |
| 级联仿真缓存硬化（per-index 缓存）+ 单测 | `test/client/visual/antd5Cascade.js`、`test/client/visual/antd5Cascade.test.js` |
| 层 B 扩充至 16 页面域 + 锚点更新 + antd3-scoped 分类 | `test/client/visual/antd5-runtime-diff.test.js` |
| InterfaceEditForm 容器快照门禁 | `test/client/containers/InterfaceEditFormContainer.test.js` |
| 指纹门禁 BASELINE 更新 | `test/build/antd5-css-chunk-fingerprint.test.js` |
| 登记表（本文件） | `docs/antd5-visual-audit-findings.md` |
| 层 B 级联仿真引擎（批次 1 交付，批次 2 硬化） | `test/client/visual/antd5Cascade.js` |

验证命令：

```bash
npm run build-client                              # 批次 2 前置：产物重建（指纹门禁按设计熔断）
npx ava test/build/antd5-css-chunk-fingerprint.test.js   # 3 tests passed（BASELINE 更新后全绿）
node scripts/antd5-candidate-scan.mjs             # 层 A：1670 候选
npx ava test/client/visual/antd5-runtime-diff.test.js    # 层 B：23 tests passed
npx ava test/client/visual/antd5Cascade.test.js   # 3 tests passed（缓存回归）
npx ava test/client/containers/InterfaceEditFormContainer.test.js  # 3 tests passed
```

移交主 Agent（层 C）：

1. F-2 修复位的四皮肤 + dev/prod 浏览器截图验证（dark/anime/gov 抽查）；
2. §3 ambiguous 表 2 条的 headless 实测复核；
3. §3 新增 confirmed 清单（N-1~N-7 + F-1 border-radius）的修复裁决（批次 2a 或 3）。

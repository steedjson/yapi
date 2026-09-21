# antd5 覆盖面视觉巡检 立项计划

> 立项日期：2026-09-21。状态：**批次 1 完成（三层扫描与候选登记）、批次 2 完成（产物重建、F-2 修复、页面域扩充）、批次 2a+3 完成（8 条 confirmed 裁决修复 7 条 + N-2 待层 C、hover 提级 0,9,0、计算样式快照门禁入库，confirmed 8→1）**。起因：登录卡片 `.card-login { margin-top: 1.6rem }` 被 antd5 CSS-in-JS 运行时样式静默覆盖（commit 979dfa67 修复），该类问题 DOM 级测试天然测不出，需要专项系统性排查。

## 0. 机制与已知事实

> **修订指针（批次 1/2 实测）**：本表「dev 0,2,0 / prod 0,1,0」系立项时假设，实测当前
> antd 5.29.3 注入形态为 `:where(.css-<hash>)`（`:where()` 计零），dev/prod 特异性一致
> ——修订详情见 `docs/antd5-visual-audit-findings.md` §4.1。

| 事实 | 影响 |
| --- | --- |
| antd 5.29.3 使用 CSS-in-JS：组件样式在**运行时**注入 `<style>`，晚于静态 `<link>` 样式表 | 同 specificity 下运行时样式必胜 |
| **dev 模式**组件同时带 `css-dev-only-do-not-override-<hash>` 类；**prod 模式**单类 | **修订（批次 1 实测推翻）**：antd cssinjs 1.24.0 实际注入 `:where(.css-hash).ant-*`，`:where()` 计零——dev/prod specificity 实测一致 (0,1,0)，dev/prod 差异不在 specificity 而在 dev-only 哈希类的存在；prod 巡检要求维持（发布形态为准） |
| 自定义 SCSS 以单类名（`.card-login`、`.login-form-button`）作用于同时携带 antd 类的元素 | 与 antd 基础规则同 specificity 竞争 |
| 已知先例：`.login-form-button`（历史遗留 !important 自保）、`.card-login`（本次修复） | 修复手法已有先例：specificity 提升或 `!important`（限同文件既有惯例场景） |
| 皮肤系统：`data-skin`（enterprise/gov/anime/dark，client/theme.js）改变 CSS 变量 | 修复须在 4 种皮肤下验证；皮肤本身可能改变变量值但不改变覆盖关系 |
| **引擎结构性盲区（批次 2a 登记，N-5 实证）**：层 B 引擎不建模「chunk CSS 是否在该页面域实际加载」，跨 chunk 候选的 self-wins 判定可能是空真 | 同 chunk 候选判定可靠；跨 chunk 候选须经层 C 或加载关系核对（详见 findings §4） |
| 二次风险源（区分对待）：Rsbuild/LightningCSS 压缩合并相邻规则（阶段一 index.css -29%、阶段三 project.css 等价合并） | 压缩合并属**等价变换**（已逐条定性），不属本专项范围；仅当压缩暴露 antd 覆盖问题时顺带记录 |

## 1. 巡检范围（页面 × 皮肤矩阵）

- **页面清单**（路由容器级）：login/register、group（列表/成员/设置/动态）、home（游客/登录）、project interface（列表/详情/编辑/运行/用例集合）、project setting 六面板、project activity/data/token、user（列表/资料）、follow、add-project、statistics、wiki；
- **皮肤**：enterprise（默认）/ gov / anime / dark；
- 抽样策略：全覆盖页面 × 默认皮肤 + 每个非默认皮肤抽 3 个代表页；发现问题的页面再补全皮肤。

## 2. 三层方法（按成本递增）

### 层 A：静态冲突候选扫描（脚本，一次性全量）

- 输入：`static/prd/*.css`（prod 构建产物）；
- 规则：提取**非 `.ant-*` 开头**的自定义选择器规则，且声明含盒模型/排版属性（margin/padding/width/height/position/top/left/right/bottom/background/border/color/font-size/line-height/display）；
- 候选判定：选择器中的类名与页面元素上的 antd 类**共现**（渲染期实测，非文本猜测）；
- 产出：`docs/antd5-visual-audit-findings.md` 候选登记表（选择器/属性/涉及页面/初判）。

### 层 B：运行时计算样式差分（脚本，页面级）

- 对候选规则逐条实测：渲染目标页面（prod 构建 + jsdom 或 headless 浏览器），找到携带该自定义类的元素，比较 `getComputedStyle(prop)` 与规则声明值；
- `computed ≠ 声明` → 确认被覆盖 → 记入 findings（含 antd 获胜规则的 specificity 对比）；
- 已知盲区声明：computed style 无法区分「被覆盖」与「本就继承同值」——歧义条目转层 C 人工判定。

### 层 C：视觉走查（主 Agent 专属，浏览器截图）

- prod 构建下逐页截图（默认皮肤全页 + 问题页面 × 4 皮肤），与层 A/B 的 findings 交叉确认；
- 参照物：antd3 时代的原版视觉（git 历史截图无存，以设计常识 + 用户验收为准——修复前先给用户看截图确认预期）。

## 3. 修复批次的约束

> **修订指针（批次 2 执行口径）**：约束 1 的「四皮肤 + dev/prod 截图」属层 C（主 Agent
> 专属）；约束 2 的手法优先级已在 F-2 修复中按「specificity 提升」执行（真实祖先链
> 0,7,0，见 findings §3 F-2）；「先修复、后裁决」的批次划分受实际发现量影响，批次 2
> 实测新增 7 条 confirmed（findings §3.4），其修复裁决移交主 Agent 定批次 2a 或 3。
> **修订指针（批次 2a 执行口径）**：7 条 confirmed 已按评审裁决修复（findings §3.1），
> 手法全部为 specificity 提升（同元素联合类 / 真实祖先链段）或同文件既有 !important
> 通道（F-1、N-1），未引入结构调整；N-2 裁决不修、待层 C 后裁决（findings §3.4）；
> M-1 hover/focus 提级至 0,9,0（antd hover 前景色规则实测 0,8,0，批 2 注释计数勘误）。

1. 每处修复须在 **4 皮肤 + dev/prod 双模式**下截图验证（dev 特异性更高，prod 才是发布形态——以 prod 为准，dev 不回退即可）；
2. 修复手法优先级：提升 specificity（加父级类）> `!important`（同文件已有先例时）> 结构调整（最后手段）；
3. **禁止**顺手修复台账在册的 bug-for-bug 遗留行为；视觉修复与行为修复分离；
4. 每处修复登记：选择器、antd 获胜规则、修复方式、四皮肤截图证据。

## 4. 回归保护（批次 3 交付物）

- 将层 B 脚本固化为 `test/client/visual/`（或 scripts/）下的计算样式快照用例：对已修复点位断言 computed 值（如 card margin-top=160px）；
- 不追求全页截图 diff 门禁（维护成本高、噪声大），只锁定修复过的点位；
- 与现有容器级 DOM 快照门禁（InterfaceColContent/Postman/InterfaceEditFormContainer）互补：DOM 管结构、computed 管样式。

## 5. 批次划分（建议）

| 批次 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 层 A 扫描脚本 + 全量候选登记 + 层 B 脚本 | 半天 |
| 2 | 确认覆盖点修复（按页面分 1-2 个子批）+ 四皮肤验证 | 半天~1 天（取决于发现量） |
| 2a | 批次 2 新增 confirmed 裁决修复（7/8 条，N-2 待层 C）+ M-1 hover 提级 | 2 小时 |
| 3 | 计算样式快照用例入库 + 台账收尾 | 2 小时 |

> 批次 2a/3 状态：**已完成**（验证数据见 findings §7；遗留层 C 移交项见 findings §6/§7）。

## 6. 风险与前置

- **前置**：prod 构建产物须为当前源码（当前 static/prd 已同步，rsbuild 3.2s 随时可重建）；
- 风险 1：层 A 候选量可能很大（自定义 SCSS 对 antd 元素设样式的位置多）——以「属性被实际覆盖」为准入门槛，层 B 过滤；
- 风险 2：修复 specificity 可能反向覆盖别处（提升后过强）——每处修复跑全量视觉走查；
- 风险 3：与皮肤变量系统交互（gov/dark 皮肤改的是变量不是结构，理论正交——抽查确认）；
- 关联遗留：`!important` 先例仅 Login.scss；json-schema-editor-visual 内嵌 antd3 的作用域样式（`json-schema-css-scope-loader`）不在本专项范围（编辑器自研立项处理）。

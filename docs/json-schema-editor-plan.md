# JSON Schema 编辑器自研 立项计划

> 立项日期：2026-09-22。状态：**已立项、未开工**（天级工作量）。起因：`json-schema-editor-visual@1.0.23` 内嵌 antd3 全量样式 + `rc-editor-mention → draft-js/immutable/fbjs` 停更链，携带 **7 项 NO-FIX high 漏洞**（audit 存量大头），且其 antd3 样式与 antd5 运行时样式的双作用域问题（`json-schema-css-scope-loader`、D-1 类 import 顺序不变量）是持续性的构建复杂度来源。

## 0. 现状事实（2026-09-22 核查）

| 事实 | 位置 |
| --- | --- |
| 消费点**仅 client 侧一处装配**：`jSchema({lang:'zh_CN', mock: MOCK_SOURCE})` 创建两个单例组件 `ResBodySchema`/`ReqBodySchema` | client/containers/Project/Interface/InterfaceList/InterfaceEditFormParts/schemaEditors.js |
| 数据契约：**进** = JSON Schema 对象字符串（`req_body_other`/`res_body`，json_schema 开启时）；**出** = onChange JSON 字符串。mock 字段下拉复用 `constants.MOCK_SOURCE` | schemaEditors.js + InterfaceEditForm.js handleReq/ResBodySchemaChange |
| 渲染位置：接口编辑页 BODY（请求/响应）两处，Edit.js 容器（高级 Mock 无此编辑器） | RequestBodySetting.js:152、ResponseSetting.js |
| antd3 链：json-schema-editor-visual → antd3/dist/antd.css + rc-editor-mention → draft-js/immutable/fbjs | audit 7 项 NO-FIX high 源头 |
| 构建副作用：scoped antd3 需要 `json-schema-css-scope-loader` + antd.css import 顺序不变量（D-1 事故根源） | build/json-schema-css-scope-loader.js、InterfaceEditForm.js:18-28 |
| jsdom 不兼容：json-schema-editor-visual 主入口为未转译 ESM+JSX，测试须 require.cache 工厂桩 | test/exts/setup.js、InterfaceEditForm.test.js 桩注释 |

## 1. 设计规格（自研组件 JsonSchemaEditor）

**技术栈**：antd5 Table（树形展开）+ antd5 Form 控件 + `constants.MOCK_SOURCE` 下拉；纯 antd5，零新依赖。

**功能对等清单**（对齐 json-schema-editor-visual 现有能力，验收即清单）：
1. 属性树：嵌套 object/array 子属性展开/折叠/增删（含数组 items 编辑）；
2. 字段行编辑：参数名、类型（string/number/boolean/object/array/integer）、必填勾选、默认值、枚举（含枚举说明）、mock（下拉 MOCK_SOURCE + 自定义）、描述；
3. 数据契约：`value`（schema JSON 字符串，非法输入容错为空对象）+ `onChange(schemaString)`；
4. 顶层 `type: object` 固定；`$schema` 等保留字段透传不破坏；
5. 既有数据的兼容读取：历史接口的 schema 可能含 `mock: {mock: '@name'}` 与 `format` 等字段——读取不丢失、编辑不破坏。

**明确不做**（YApi 现有用法未用到）：远程 schema 引用、schema 版本迁移、自定义格式校验 UI。

## 2. 批次划分

| 批次 | 内容 | 验收 |
| --- | --- | --- |
| 1 | 组件骨架：属性树渲染 + 增删改 + 嵌套展开；数据契约单测（合法/非法/历史字段保全） | 组件单测 + 4 皮肤截图 |
| 2 | mock 下拉与描述编辑器接入；与旧编辑器**并挂对照**（同一 schema 双编辑器往返等价——旧改新不丢字段、新改旧不丢字段） | 往返等价测试 |
| 3 | 消费方切换（schemaEditors.js 两单例替换为自研组件；保留旧组件代码一个提交期作回退）+ InterfaceEditForm 容器快照基线更新 | 全量测试 + UI 走查 |
| 4 | 清理：删 json-schema-editor-visual 依赖、json-schema-css-scope-loader、antd.css import 顺序不变量（D-1 类风险根除）、Loading.scss 之外的 sass 遗留复查；audit 基线下调（7 项 NO-FIX high 消除）；指纹 BASELINE 更新 | audit 复测 + CI 全绿 |

## 3. 验收门禁

- 功能对等清单逐项勾验（浏览器 4 皮肤）；
- 新旧往返等价测试全绿（schema 字段级 deepEqual）；
- 全量测试冷库全绿、typecheck 0、lint 0/0；
- `npm audit` 预期 18 → 11 项（7 项 NO-FIX high 消除），audit:ci 通过；
- UI 走查（主 Agent）：接口编辑页 BODY json-schema 开启态全功能操作。

## 4. 风险

| 风险 | 缓解 |
| --- | --- |
| 历史接口 schema 形态多样（手工编辑过的脏数据） | 批次 1 数据契约单测覆盖脏形态；读取容错优先 |
| 用户已习惯旧编辑器交互 | 批次 3 前给用户演示截图确认交互布局 |
| schema2json/表格展示链路依赖 schema 结构 | 该链路只读不写，不受编辑器替换影响（已核） |
| draft-js 移除后 rc-editor-mention 引用残留 | 批次 4 全仓 grep 清理验证 |

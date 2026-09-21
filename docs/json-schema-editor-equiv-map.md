# JSON Schema 编辑器 新旧动作映射与往返等价对照（批次 2）

> 对应 docs/json-schema-editor-plan.md 批次 2（新旧编辑器往返等价）。
> 旧 = json-schema-editor-visual@1.0.23（下称旧编辑器）；新 = client/components/JsonSchemaEditor/schemaUtils.js（下称新实现）。
> 等价性证据：test/client/components/JsonSchemaEditor.equiv.test.js（语料 × 操作矩阵 + 新旧交接往返）。

## 1. 旧编辑器动作层的装载方式（测试基建事实）

- `package/models/schema.js` 为 **CommonJS/ESM 混排但无 JSX**（`require('underscore')` + `import`/`export default`）；
  `package/utils.js`、`package/schema.js`（handleSchema）为纯 CommonJS。
- 测试中以 `@babel/core transformSync`（仅 `@babel/plugin-transform-modules-commonjs`）转译 models/schema.js，
  经 `Module._compile` 以原路径求值（`underscore` 等依赖按包目录 nodeModulePaths 解析），
  再用真实 `moox@1.0.2 + redux + immer@1.x`（moox 自带嵌套 node_modules 的生产版本组合）创建 store，
  以 `store.dispatch({type:'moox/schema/<action>', params})` 驱动——与旧编辑器生产链路完全同构。
- 旧组件（App.js / SchemaJson.js）只负责把 UI 事件翻译成上述 action；等价性关注动作层语义，
  UI 翻译规则（key/prefix 形态）见各映射条目的「调用形态」。

## 2. 动作映射表

路径约定：旧编辑器 action 的 `key`/`prefix` 为 **相对 data 的键数组**（如 `['properties','a']`、`['properties','obj','properties']`）；
新实现的 `nodePath` 同为相对根的键数组（`['properties','a']`，根为 `[]`），两者可直接互换。
`nodePath + 'type'` 这类带字段后缀的旧 key，对应新实现「节点路径 + 字段名」分离参数。

| # | 操作 | 旧编辑器动作（组件调用形态） | 新实现对应 | 等价性 |
| --- | --- | --- | --- | --- |
| 1 | 整树装载 | `changeEditorSchemaAction({value})`（App.componentWillMount / data prop 变化；内部先 `handleSchema(value)` 原地规范化） | `parseSchema(input)`（深拷贝 + normalizeNode 规范化） | 等价（规范化规则一致：缺 type 补 object/string、object 补 properties、array 补 items）。偏离 ⑤：旧组件层空 data 时注入 `title:'empty object'`，新不写（见 §3） |
| 2 | 根级追加字段 | `addChildFieldAction({key:['properties']})` | `addProperty(schema, ['properties'], null)` | 等价（新字段 `{type:'string'}`，默认必填）。字段名生成差异见 §3-N9 |
| 3 | 锚点后插入兄弟 | `addFieldAction({prefix, name})` | `addProperty(schema, parentPropsPath, afterName)` | 等价（插入位置：锚点后 / 末尾追加，一致） |
| 4 | object/array 加子级 | `addChildFieldAction({key:[...nodePath,'properties']})`（items 行：`[...itemsPath,'properties']`） | `addProperty(schema, nodePath.concat(['properties']), null)` | 等价 |
| 5 | 删除字段 | `deleteItemAction({key:nodePath})` **+ 配对** `enableRequireAction({prefix,name,required:false})`（组件 handleDeleteItem 两连发） | `removeProperty(schema, nodePath)`（一步完成删除 + required 清理） | 等价（新实现内置配对语义：required 清空后删键）。注意旧动作若不配对 enableRequire 会留下悬挂 required |
| 6 | 重命名字段 | `changeNameAction({value, prefix, name})`（UI 层另有重名 message.error 前置拦截） | `renameProperty(schema, nodePath, nextName)` | 等价（键序保持原位、required 同步映射、重名拒改）。偏离：空名（§3-N7）、改名 `__proto__`（§3-N6） |
| 7 | 类型切换 | `changeTypeAction({key:[...nodePath,'type'], value})` | `changeNodeType(schema, nodePath, nextType)` | 偏离 ①：旧仅保留 description，结构由 defaultSchema 重建；新保留全部非结构字段（title/mock/enum/enumDesc/default/format/未知键）。新更保守，测试以 N4 归一化。同类型切换两边均为 no-op |
| 8 | 必填勾选/取消 | `enableRequireAction({prefix, name, required})` | `toggleRequired(schema, nodePath, required)` | 等价（required 清空后删键；已存在/缺席时 no-op） |
| 9 | 写 description / default / 通用字段 | `changeValueAction({key:[...nodePath, field], value})`（truthy 写入 / falsy 删键） | `setNodeField(schema, nodePath, field, value)`（''/null/undefined 删键） | 偏离 ③：旧对 falsy 全删（`default:0`/`default:false` 被删）；新仅 ''/null/undefined 删键，false/0 保留。新更保守，测试以 N5 归一化 |
| 10 | 写/清 mock | `changeValueAction({key:[...nodePath,'mock'], value: v ? {mock:v} : ''})`（App.changeValue / SchemaJson.handleChangeMock 对 mock 值包 `{mock: v}`） | `setMock(schema, nodePath, v)`（同形态 `{mock:v}`，'' 删整个 mock 字段） | 等价（YApi 对象形态写入/清空语义一致） |
| 11 | 同级上移/下移 | **无此能力** | `moveProperty(schema, nodePath, 'up'|'down')` | 新增能力（偏离 ④，方向：新扩展）。移动仅重排键序，required 数组不含顺序语义不动。测试断言：内容与旧链（无 move）序无关相等 + 键序实际交换 |
| 12 | 全部必填（根复选框） | `requireAllAction({required, value})`（App.changeCheckBox；cloneObject + handleSchemaRequired 递归全必填/清空） | **无对应**（新 UI 无全选入口） | 旧独有。批次 2 仅记录映射；若批次 3 消费方切换需要该入口再立项（不扩本次范围） |
| 13 | 展开/折叠 | `setOpenValueAction`（写 store.open，纯 UI 态） | 组件内 `collapsedKeys` Set（不进 schema） | 等价（均为 UI 态，不落 schema 数据） |
| 14 | 高级设置弹窗（整节点 JSON 编辑） | `changeValueAction({key:nodePath, value:整节点对象})` | 新组件为逐字段编辑（setNodeField/setMock 等），无整节点 JSON 粘贴 | 数据层等价面：changeValueAction 对对象 value 的「truthy 整体写节点」语义由 setNodeField 覆盖（同字段级写入） |

## 3. 已声明方向性偏离与归一化函数（测试内逐条显式注释）

等价断言全部经过 `normalize()` 归一化后 deepEqual；每条归一化对应一个已声明偏离或旧实现毁数据行为：

| 归一化 | 对应偏离 | 规则 |
| --- | --- | --- |
| N2 stripInitTitle | 偏离 ⑤ | 旧组件空 data 初始态注入 `title:'empty object'`；新 parseSchema 不写。归一化：剥离根上 `title === 'empty object'` |
| N4 keepDescriptionOnly | 偏离 ① | 类型切换：旧仅保留 description；新保留全部非结构字段。归一化：新结果中被切节点仅保留 type/description/properties/items（required 双方均丢弃，天然对齐） |
| N5 falsyWrite | 偏离 ③ | 字段写入 falsy：旧全删，新保留 false/0。归一化：op 为 default=false/0 写入时，新结果删除该字段再比对 |
| N6 renameToProto | 旧实现守卫缺陷 | 改名目标为 `__proto__`：旧读原型链误判「重名」拒改（no-op）；新 hasOwnProperty 判定为空闲名，CreateDataProperty 正常改名。归一化：该格不做 deepEqual，双侧行为显式断言 |
| N7 renameToEmpty | 偏离 ② | 空名改键：旧接受（产生 `''` 键，且 side-effect 写入 `required: []`）；新拒改（原样返回）。归一化：该格显式断言双向差异，不做强制相等 |
| N9 fieldCounter | 实现细节 | 新增字段名：旧为模块级自增计数器（`field_1++` 跨操作累计）；新取首个空闲槽位（确定性）。两者均为 `field_N` 形态。归一化：每个 properties 对象内按出现顺序把 `field_N` 重编号为 field_1..n |
| P1 stripProtoKey | 旧实现毁数据 | **任何 properties 重建类动作**（add/delete/rename 兄弟/requireAll 的 `newObj[key]=value`、`Object.assign` 循环）在旧实现中会把自有数据键 `__proto__` 命中原型存取器：键静默丢失。新实现 CreateDataProperty 全程保全。归一化：对比前双侧递归剥离名为 `__proto__` 的属性键；同时以独立正向测试固化「新实现保全 + 旧实现未触碰时 JSON.stringify 同样保全」（见 equiv 测试 PO 组） |
| P2 danglingRequired | 旧实现毁数据 | 语料 required 含悬挂项（指向不存在属性）时：旧 delete+enableRequire 组合留下悬挂引用；新 removeProperty 过滤全部同名。归一化：剔除 required 中指向不存在属性名的悬挂项 |
| N10 requiredRemove | 旧实现毁数据 | 语料 required 含重复项时：旧 enableRequire(false) 只 splice 首个匹配，第二处同名残留（用户已取消却仍在 required）；新 toggleRequired 按名全量过滤。归一化：双侧 required 全量剔除被取消的名字。新实现取更保守语义 |

字符串形态 mock（`mock:'@raw-string'`）非偏离：两侧均为「未触碰原样保留、写入时才规范化为 `{mock:v}`」，
矩阵直接 deepEqual（无归一化）。

## 4. mock 下拉对齐核对（MOCK_SOURCE 消费）

| 维度 | 旧 MockSelect（antd3 AutoComplete） | 新 schemaTree（antd5 AutoComplete） | 结论 |
| --- | --- | --- | --- |
| 数据源 | `context.Model.__jsonSchemaMock`（= `jSchema({mock: MOCK_SOURCE})` 注入），逐项 `<Option key={item.mock}>{item.mock}</Option>` | `MOCK_OPTIONS = MOCK_SOURCE.map(item => ({value: item.mock}))` | 一致：选项值 = `item.mock` 字符串，`name` 中文说明两侧均未展示为选项文本（旧 Option children 为 mock 值本身） |
| 过滤 | `filterOption={true}`（antd3 默认按 value 大小写不敏感包含匹配） | `filterOption`（antd5 默认大小写不敏感包含匹配） | 一致 |
| 显示值 | `schema.mock ? schema.mock.mock : ''` | `node.mock && typeof node.mock === 'object' ? node.mock.mock : ''` | 一致（字符串形态 mock 旧显示为 `''`——`schema.mock.mock` 对字符串取 undefined；新同样显示 `''`） |
| 自由输入 | AutoComplete 允许任意输入（自定义 mock） | 同 | 一致 |
| 逐键写入 | onChange 每次键入即触发 changeValueAction 写入（部分串也落 schema） | 同（onMockChange → setMock 逐键上抛） | 一致 |
| 下拉宽度 | `dropdownMatchSelectWidth={false}`（下拉随内容宽） | 未设置（antd5 默认跟随触发器宽） | **差异（纯视觉）**：仅下拉浮层宽度策略，数据与选项集一致；批次 3 UI 走查确认 |
| 禁用 | `disabled={schema.type === 'object' \|\| schema.type === 'array'}` | `isMockDisabled(node)` 同判定 | 一致 |
| 提示占位 | `LocaleProvider('mock')`（zh_CN: 「mock」） | `placeholder="mock"` | 一致（zh_CN 文案为小写 mock） |
| 弹窗编辑入口 | Input addonAfter 编辑图标 → showEdit 弹 TextArea 弹窗 | 新为行内 AutoComplete 直接输入，无二次弹窗 | **差异（UI 交互形态）**：数据契约相同（写入 `{mock:v}`），仅多一步弹窗 vs 行内输入；批次 3 UI 走查确认即可 |
| 无 mock 配置回退 | `__jsonSchemaMock \|\| []`（空下拉仍可自由输入） | MOCK_SOURCE 为静态导入常量（总是可用） | 一致（YApi 消费点恒传入 MOCK_SOURCE） |

## 5. 等价性结论（批次 2）

- 语料 × 操作矩阵（9 语料 × 24 操作，含 `__proto__`/`constructor`/`toString`、字符串形态旧 mock、
  数字/布尔 default、`$schema`/`$id`/`$comment`、items 未知键、≥5 层深嵌套、enum+enumDesc、空 properties、
  重名/脏 required）在归一化后**字段级 deepEqual 全绿**；
- 旧→新、新→旧交接往返（多步动作链 + 字段保全断言）全绿；
- **发现并修复一处新实现侧真实等价性破坏**（非声明偏离）：`setMock` 清空（''/null/undefined）时，
  当前值识别只认 `{mock:…}` 对象形态——历史字符串形态 mock（`mock:'@raw-string'`）被当作「无 mock」，
  清空成为 no-op；旧编辑器 `changeValueAction` 对 falsy 值删整个 mock 键。修复：当前值识别兼容字符串形态
  （其字符串值视为当前 mock），清空删除整个 mock 键（client/components/JsonSchemaEditor/schemaUtils.js
  setMock，附注释），矩阵语料 legacyMock × mock-clear 固化该断言；
- 其余全部差异落在 §3 已声明偏离与旧实现毁数据行为内（类型切换丢字段、`__proto__` 重建丢键、
  空名改键、falsy 全删、required 脏清理不彻底），新实现均取更保守语义；
- schemaUtils.js 变更仅上述 setMock 一处（等价性修复），其余零修改。

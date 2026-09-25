# 服务端 ESM 化可行性评估（2026-09-25）

> 结论先行：**全量 ESM 化不建议实施**（成本收益倒挂）；推荐**窄方案**——一个半天小批解锁 json-schema-faker 0.6 升级路线，外加一个可选的插件加载卫生批。本文档基于全仓只读侦察 + 承重点实测（侦察与实测口径见文末），供实施裁决。

## 一、结论摘要

| 方案 | 内容 | 成本 | 收益 | 裁决建议 |
| --- | --- | --- | --- | --- |
| A. 全量 ESM 化 | server/（62 文件 100% CJS）+ common/ 切 `"type":"module"` | **3-5 天+**，最大成本压在测试基建与 common/ 双端层（见三） | 仅「依赖前瞻性」——当前依赖树没有任何包因此跑不了（jsondiffpatch 的 require(esm) 在 Node 24 已验证可用） | **不建议** |
| B. 窄方案 | B1：`schemaToJson` 惰性化解锁 json-schema-faker 0.6（半天小批）；B2：插件加载 createRequire 化 + NODE_PATH 契约收敛（可选独立批） | B1 半天；B2 半天~1 天 | 解锁全部已登记的 ESM-only 依赖升级路线；消除最脆弱的隐性契约 | **推荐 B1，B2 可选** |
| C. 维持现状 | 不动 | 0 | 0.5.9 与 jsondiffpatch 现状健康；风险仅是生态漂移 | 可接受，但 B1 性价比明显更高 |

## 二、事实基础（侦察结论，关键项已实测复核）

### 1. 模块形态

- server/ 62 个 .js **100% CJS**（200 处 require / 53 处 module.exports / 0 处 ESM）；common/ 14 个全 CJS；exts/ 63 个中 21 个含 ESM 语法的文件全部是插件 client 端（rsbuild 打包消费），其中 9 个 client.js 是「ESM 语法 + `module.exports = {server, client}` 元数据」混合体。
- **common/ 双端共享层是全量方案的核心撕裂点**：4 个文件被两端直连消费——`utils.js`、`mock-extra.js`、`createContext.js`、`diff-view.js`（client 经 rspack 别名、server 经相对 require）；`babel.config.js:4-7` 注释锁定前端管线 `modules: 'commonjs'` 正是为兼容 common/ 的混用形态；服务端还反向消费 `client/constants/variable.js`（mockServer.js:12）。

### 2. 依赖面现状（实测）

- **当前依赖树中真正的 require(esm) 包只有 jsondiffpatch 一个**：`server/controllers/interface/upMethods.js:14,16` 以 `requireAny('jsondiffpatch')` 加载，Node ≥22.12 的 require(esm) 原生支持（.nvmrc=24.21 满足），**现状健康**。其余依赖（mongoose/koa 系/axios/markdown-it/ajv 系等）实测全为 CJS 或双入口。
- **json-schema-faker 0.5.9 为双入口且 CJS 正常**（实测：裸名 require 经 exports require 条件返回可调用函数，`jsf(schema)` **同步返回对象**，附带弃用告警提示改用 .generate()/.resolve()）。0.6 ESM-only，是唯一被 ESM 化问题卡住的实际升级。
- 唯一消费点：`server/utils/commons.js:23` 顶层 `require('json-schema-faker')`；`exports.schemaToJson`（commons.js:60-72）为同步契约。**全部 5 个调用点均处于 async 上下文**（mockServer.js:319、interface.js:750、caseQueryMethods.js:175/187、caseAddMethods.js:181）→ 惰性/异步化在调用链上无障碍。

### 3. 启动链与插件

- 启动顺序 app.js:5-21 无静态循环依赖（yapi.js→commons→db→mockServer→plugin→websocket→router 单向；models 不 require commons）；但存在**运行时挂载时序耦合**——`yapi.commons/connect` 是「先 require 后赋值」，`models/base.js:20` 构造期消费 `yapi.commons.rand`、`db.js:33,39` 启动任务消费 `yapi.commons.log`；ESM 的 hoisted 求值会重排该时序。
- 插件加载入口**仅 2 处**（server/plugin.js:257 外部插件 / :276 内置 exts，均启动期同步 `require` + `pluginModule.call(yapi, options)`）→ createRequire 化解可行性好。
- **NODE_PATH 裸 require 是插件生态的隐性契约**：exts/ 约 49 处 `require('yapi.js'|'models/...'|'controllers/...')` 依赖 `server/app.js:2-3` 的 `Module._initPaths()`；ESM `import()` 不支持 NODE_PATH → 插件加载必须永久留在 CJS/createRequire 世界（这也是全量方案的硬伤之一）。

### 4. 测试基建（全量方案的最大成本）

- rewire ×10 个测试文件（`__set__/__get__` 依赖 @babel/register 转译出的 var 形态变量，`babel.config.js` test 分支注释明言此约束）；`require.cache` 桩工厂（test/exts/setup.js、test/helpers/containers.js）；3 处 require(esm) 预热 hack（interfaceSave/customFieldQuery/interfaceController 测试）；Zustand/单例复位的 CJS require 缓存语义。全量 ESM 化将同时作废以上全部机制，波及 1057 个用例的基建层。

### 5. 部署面

- `node server/app.js`（start/pm2/devops 文档）、`install.js` 平行入口、nodemon watch——面小；若顶层切 `"type":"module"` 还会波及根目录 CJS 工具（ydoc.js、scripts/audit-check.js 等，需改名 .cjs）。

## 三、全量方案（A）的成本收益倒挂说明

净收益只剩「依赖前瞻性」：当前**没有任何一个依赖因 CJS 而跑不了**；未来可能 ESM-only 的候选（mongoose/koa 系）目前均为 CJS/双入口，且 ESM 宿主可以正常 import CJS 包——即宿主转 ESM 后旧依赖不会坏，而宿主留在 CJS 时新 ESM-only 包可用 require(esm)（Node ≥22.12）或动态 import() 兜底。成本侧则是三座山：测试基建重写（最大）、common/ 双端层与前端构建契约的撕裂风险、NODE_PATH 插件契约的永久性拆分。**投入 3-5 天换不到当下或可预见期内的问题消除。**

## 四、推荐方案（B）的实施要点

### B1：schemaToJson 惰性化，解锁 json-schema-faker 0.6（推荐，半天小批）→ **已实施（2026-09-25，commit 由主 Agent 填）**

1. ~~`commons.js:23` 顶层 require 改为模块级缓存的惰性加载~~ **已落地**：模块级缓存 Promise 的 `import()`（失败不缓存可重试）；`schemaToJson` 签名改 async，5 个调用点加 await（机械改写）。**实施新增发现**：babel-register（test/ava 管线）会把字面量 `import()` 转译为 require 形态，0.6 无 require 条件即断——经 `new Function('s','return import(s)')` 逃逸 babel 静态转译，生产/测试均走原生动态 import（见 BUGLOG codex-refactor-foundation 条目）。
2. ~~升级 0.5.9 → 0.6 最新，写 API 适配层~~ **已落地（0.6.3）**：`jsf.option()+jsf(schema)` → `generateSync(schema, options)`（选项随调用传入，无全局注册表/复位步骤）；`requiredOnly:true` 由 0.6 兼容 shim 处理，与 0.5.9 的 requiredOnly>alwaysFakeOptionals 优先级语义等价；`failOnInvalidFormat` 在 0.6 无对应物（未知 format 实测不抛，等价）；`extend('mock')` → `define('mock', cb)`（cb 收完整属性值需解包）；**seed 差异**：0.6 缺省 seed=1 输出确定，适配层显式注入随机 seed 保持每调用随机化（探针 ⑩ 守护）。
3. ~~等价性探针~~ **已落地**：`test/server/schemaToJson-equivalence.test.js` 14 用例，0.5.9 基线 12 用例先行全绿，升级终态 14/14×3 轮稳定。登记差异（均为非法/边缘 schema 容错路径）：裸非法 type undefined→null、嵌套 {x:undefined}→{x:null}、无 type schema（42/{}）恒报错字符串/恒 {} → 按 seed 随机选型；调用点影响面已核对（Object.assign/typeof 守卫消化）。
4. 验收：mock 响应全链路 UI 验证由主 Agent 执行；冷库全量测试与 audit 复跑由 csl-tester 承接（本批 audit:ci 0/0/2/0/2 持平，jsonpath-plus 随 0.6 无依赖树彻底出树）。

### B2（可选）：插件加载卫生批

`server/plugin.js:257,276` 改 `createRequire(path.join(WEBROOT, 'package.json'))` 显式加载，并把 exts/ 的 49 处裸 require 收敛为显式相对路径（或保留 NODE_PATH 但在文档把它从「隐性 hack」升格为「显式契约」）。收益：消除最脆弱的隐性契约、为未来任何模块形态变更上保险。无当下行为收益，纯卫生。

### 不做的事

- common/ 不动（双端层被前端管线锁定，动它=撕裂契约）；
- 存量 server/ 文件不批量转 ESM（requireAny 的 25 处字符串常量形态虽可机械改写，但收益为零）；
- 新增服务端文件如确需 ESM 可用 `.mjs` 单文件渐进（策略备注，非本批动作）。

## 五、与既有登记的关系

- 取代 TECH_DEBT.md「四.1」中 json-schema-faker 0.6 的前置条件描述（原为「服务端 ESM 化或全链路动态 import」——本文档裁决为惰性 import 窄方案）；
- jsondiffpatch 0.7 的 require(esm) 预热模式维持现状（Node 24 验证可用，生产部署需确认 Node ≥22.12 的登记继续有效）；
- 全量 ESM 化从「待排期专项」改为「不建议实施（本文档裁决）」。

## 六、侦察与实测口径

- 面上侦察：只读 agent 全仓扫描（2026-09-25，模块形态计数/动态 require 盘点/启动链/插件机制/测试基建/依赖 exports 字段实测/npm scripts）；
- 承重实测（主 Agent 亲核）：commons.js:23 顶层 require 与 schemaToJson 同步契约；0.5.9 经裸名 require 的可调用性与同步返回（含弃用告警）；5 个调用点的 async 上下文；插件加载两入口行号。

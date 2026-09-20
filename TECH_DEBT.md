# 技术债台账（TECH_DEBT）

> 2026-09 技术债清理行动的滚动台账：记录已完成项、评估后暂缓项及其理由、后续推进的具体路径，以及全仓扫描新发现待评估项。
> 分支：`codex/refactor-foundation`。执行流程：主 Agent 划界 → csl-coder 实施 → csl-tester 验证 → csl-reviewer 审查 → 主 Agent 合并提交。

## 一、已完成（本轮清理）

### 第一阶段：高危安全与低成本减负（commit 9c9708c5）

| 项 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| 密码哈希 | `sha1(password + sha1(passsalt))`（npm sha1 包） | `node:crypto` scrypt（`scrypt$N$r$p$saltHex$hashHex`） | `hashPassword`/`verifyPassword` 双格式兼容；旧哈希登录成功后自动升级写回；add/resetPassword 两条路径按裁决暂留 legacy 生成（首次登录自动升级兜底） |
| 服务端哈希收敛 | npm `sha1` 包 | `node:crypto` | 含 exts/yapi-plugin-swagger-auto-sync 的 md5/sha.js |
| 路由 | `koa-router@7`（停更） | `@koa/router@15` | 注意 v15 需 `new` 实例化 |
| Body 解析 | `koa-body@2.5`（formidable v1） | `koa-body@8` | 文件 API：`ctx.request.files` + `filepath`；`parsedMethods` 显式含 DELETE/GET/HEAD |
| 参数校验 | `ajv@5` 每请求重新编译 | `ajv-draft-04`（ajv8 官方 draft-04 实现）+ 模块级编译缓存（上限 500） | 修复了旧代码原地 mutate schemaMap 的 bug；`common/utils.js` schemaValidator 同步升级 |
| underscore（服务端/common） | 16 文件 | 原生 JS | 仅 `common/postmanLib.js` 保留：沙箱脚本 `utils._` 公开 API（YApi 文档承诺），已注释说明 |
| 基础库 | `json5@0.5`、`fs-extra@3` | `json5@^2`、`fs-extra@^11` | API 兼容，调用面已核实 |

**保留项（有意不换）**：`common/power-string.js` 的 `md5`/`sha.js`（浏览器端共用，node:crypto 不可用）；`postmanLib` 的 `CryptoJS`/`jsrsasign`/`underscore`（沙箱用户脚本公开 API，移除即破坏用户脚本兼容）。

### 第二阶段：前端遗留包替换（commit 196c6679）

| 项 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| 代码编辑器 | `brace@0.10`（Ace 包装） | CodeMirror 6（9 个 @codemirror 包） | `mockEditor` 命令式 API 兼容层保持 6 个消费方零语义改动；mock 补全/F9 全屏保留 |
| Markdown 编辑器 | vendored `common/tui-editor`（4MB min.js 提交进仓库） | `@uiw/react-md-editor` + markdown-it | 新共享组件 `client/components/MarkdownEditor`（ref API: getHtml/getValue/getMarkdown）；wiki 插件复用同一组件；desc(HTML)/markdown 双写语义不变 |
| 表格+拖拽 | `reactabular-*@8` + `react-dnd@2.5`（均停更） | antd Table + `@dnd-kit/*` | 行拖拽持久化真正生效（修复原 onDrop 从未触发的缺陷）；`[{id,index}]` payload 不变 |
| 剪贴板 | `copy-to-clipboard@3`（execCommand） | `navigator.clipboard` + execCommand 降级（client/common.js copyText） | |
| underscore（客户端） | 9 文件 | 原生 JS / 局部 debounce | |
| Git hooks | `ghooks` + `validate-commit-msg`（2016 年代） | `simple-git-hooks` + `commitlint` | type-enum 保留自定义 `opti`；header ≤100；postinstall 自动安装钩子 |
| 顺带修复 | `immer@10` 无默认导出但 3 文件仍在 `import produce from` | `import { produce }` | 该缺陷导致用例表格数据从未渲染（旧 UI 静默空白）；环境声明 global.d.ts 同步更正 |

**卸载**：brace、reactabular-table、reactabular-dnd、react-dnd、react-dnd-html5-backend、table-resolver、copy-to-clipboard、ghooks、validate-commit-msg、koa-router、sha1。

### 第三阶段：架构与性能升级（按"逐步推进"策略）

| 项 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| 前端首屏打包 (Code Splitting) | 8.29MB 巨石单包，所有页面静态顶层 import | 路由级动态按需加载（`React.lazy` + `Suspense`） | 主包由 8.29MB 降至 **4.68MB**（瘦身 **43.6%**）；`project`、`group`、`user` 等独立按需分包；修复 Webpack `publicPath: '/prd/'` 支持深度嵌套路由异步加载，剥离 Assets 前缀避免双斜杠 |
| 动态脚本沙箱并发池化 | 每次执行 `child_process.spawn` 全新冷启动（45ms+） | 常驻 Worker 子进程池 + IPC 通信（单次 **0.6ms~1.1ms**） | **稳态吞吐量提升 40~60 倍**！支持 5000ms 硬超时强杀自动补齐自愈、子进程崩溃自愈、Worker 1000 次轮换防泄露，维持严格的 vm 独立进程安全边界 |
| Mongoose 模型业务复合索引 | 各模型无复合索引，慢查询隐患 | 核心模型显式覆盖 `initIndexes()` 并在 `install.js` / `db.js` 同步创建 | 补全 `interface` (`{project_id, path, method}`, `{project_id, catid, index}`, `{project_id, index}`)，`interface_case` (`{col_id, index}`, `{project_id}`)，`interface_cat` 与 `interface_col` 等 |
| Class→Hooks 迁移打样 | Class Component + `@connect` + `@withRouter` | 函数组件 + `useDispatch` / `useSelector` | `GuideBtns.js`、`Breadcrumb.js` 迁移完成，浏览器实测随路由更新零运行时报错；为剩余 61 个组件确立清晰范式 |
| ESLint 门禁与豁免清理 | 无 lint 脚本、29 error 常驻、3 条规则被全局关闭、4 文件豁免 | `npm run lint` + pre-commit 卡点；错误全清零；规则全部重启用 | 顺带修复 `mock-extra.js` 判空恒假的真实 bug（`typeof x === undefined`）；`verifyPath` 等正则改动经 384 + 9131 样本穷举证明等价 |
| 前端组件测试基建 | 前端组件零渲染覆盖（UI 白屏也能全绿） | AVA + jsdom + @testing-library/react；新增 `test/helpers/jsdom-setup.js` 基建与组件单测 | 全量测试 379 → **416** 项。首批覆盖 `copyText`（含 DOM 零残留）、`MarkdownEditor`（ref 契约、onChange 含清空回调空串、`html/linkify/breaks` 选项、className/height/preview、`value` 仅作初始值的钉死契约）、`mockEditor` 兼容层（构造期 readOnly、setMode 真实 language facet、insertCode 精确光标位置、mockData 真实产出、getCursorIndex/setShowGutter/clearSelection）、`GuideBtns`（动作序列）、`Breadcrumb`。**核心断言经变异自检（累计 26 次注入全部击杀）**；仍有未覆盖点见遗留观察项 |
| TypeScript 覆盖扩大（第 1 批） | `common/types/global.d.ts` 手写 Node 垫片（Buffer/process/require/crypto 模块）与 `@types/node@24` 冲突；5 个文件被 `@ts-nocheck` 或未纳入检查 | 显式依赖 `@types/node@^24` + `@types/fs-extra@^11`；移除手写垫片；5 个文件转为 `// @ts-check` 并纳入 `include` | 类型错误 **91 → 0**（`client/common.js` 47、`sandbox.js` 21、`sandbox_child.js` 17、`yapi.js` 4、`messageMiddleware.js` 2），且顺带消除 `token.js` 的 Buffer 泛型冲突错误。**门禁有效性已证明**：向 5 个文件逐个注入类型错误，typecheck 均立即报错，恢复后回 0。改动经审查**全部为编译期注解/断言**（无运行时逻辑变更），416 项测试与沙箱并发/超时自愈实测均正常 |
| TypeScript 覆盖扩大（第 2 批） | `common/` 顶层工具库四件套未纳入检查 | 4 文件加 `// @ts-check` + 纳入 include + JSDoc 注解 | 错误 **82 → 0**（`utils.js` 45、`lib.js` 13、`diff-view.js` 15、`mock-extra.js` 9）。三重独立等价性证明：语义 AST 归纳、HEAD 运行时差分（409+7 例逐字节一致）、**产物级双构建编译结果逐字节相同**；门禁有效性用 6 个自研变异 + 3 项反向对照证实（含"删 pragma/删 include 后同一违规不再可见"）。评审后又收紧 3 处注解强度（`schemaValidatorCache` 注解使核心校验调用**首次进入检查**、`newFilters` 收紧为 `string[]`、`Compare*` 返回 `boolean`），并用反向对照证明收紧确实新增了捕获能力 |
| TypeScript 覆盖扩大（第 3 批） | `common/HandleImportData.js` 与 `common/power-string.js` 未受类型检查 | 加 `// @ts-check` + 纳入 include + 声明补全 | 类型错误 **87 → 0**（`HandleImportData.js` 46、`power-string.js` 41）；`global.d.ts` 补齐 `md5`、`sha.js`、`js-base64`、`axios.post`；AST 语义比对与 86 项差分测试证明零运行时行为变更；复核证实 `power-string.js` 的 `lconcat` 多参数覆盖为历史存量缺陷 |
| TypeScript 覆盖扩大（第 4 批） | `common/` 剩余核心模块（`config`、`plugin`、`schema-transformTo-table`、`markdown`）未受类型检查 | 加 `// @ts-check` + 纳入 include + 补全 JSDoc 与返回类型 | 类型错误 **69 → 0**（`markdown.js` 39、`schema-transformTo-table.js` 25、`plugin.js` 5、`config.js` 0）。独立 acorn/espree 双重 AST 语义比对证明 4/4 STRICT-IDENTICAL，运行时 A/B 7/7 一致；至此除 `postmanLib.js` 外 `common/` 目录下全部公共模块均已处于 `@ts-check` 门禁保护下 |
| 质量与工程化强化 | Webpack JS chunk 用 `[chunkhash]`、ESLint 不覆盖 `test/`、`diff-view`/`timeago` 零测试 | JS chunk 统一为 `[contenthash]`；修复 `test/` 存量问题并纳入 lint 门禁；补齐 `diff-view` (7项)、`timeago` (8项)、`schemaValidator` 负向测试 | 全量测试增至 **431** 项；`npm run lint` 门禁覆盖全仓（含 test/）；彻底消除纯注释改动导致 JS chunk hash 变化的问题 |
| 缺陷修复与路由防御 | `lconcat` 多参数时仅最后一个参数生效；React.lazy 异步 chunk 失败无防御兜底 | 修复 `lconcat`（单参兼容+多参前缀累加，新增 `test/common/power-string.test.js` 24项全覆盖）；实现 `ErrorBoundary` 并接入 `Application.js` 异步路由（新增 `test/client/components/ErrorBoundary.test.js` 5项单测） | 全量测试增至 **460** 项；ChunkLoadError 异常时友好展示刷新卡片，防整树白屏；power-string 全部 16 种 stringHandles 获得完整单测覆盖 |
| 叶子组件 Hooks 现代化 | 7 个组件（Loading, Footer, ErrMsg, Notify, Label, Subnav, MyPopConfirm）使用类组件与废弃的 UNSAFE_cWRP / @withRouter | 全量改为 React 18 函数组件 + Hooks；清除所有 UNSAFE_ 生命周期与 @withRouter；消除 Footer defaultProps 弃用告警 | 彻底消灭 `client/components/` 下全部 UNSAFE_ 生命周期；新增 5 个组件单测（20 项用例），全量测试增至 **480** 项 |
| TypeScript 覆盖扩大（第 5 批） | 数据层 6 个核心基础模型未受类型检查；`common/*` 别名仍靠 `global.d.ts` ambient 存根兜底 | 在 `tsconfig.json` 配置 `paths: {"common/*": ["./common/*"]}` 并彻底移除存根；将 6 个模型（`base`, `avatar`, `token`, `storage`, `interfaceCat`, `interfaceCol`）加 `// @ts-check` 并纳入 include | 35 处类型错误清零；消除别名存根覆盖真实文件导致导出漂移不可见的隐患；数据层基础 CRUD 获得编译期类型保护 |
| TypeScript 覆盖扩大（第 6 批） | 数据层业务模型（`user`, `interfaceCase`, `follow`, `group`）未受类型检查 | 加 `// @ts-check` + 纳入 include + 规范补全带参方法 JSDoc | 64 处类型错误清零；清理 `follow.js` 历史错位 JSDoc；全仓数据模型受检率达 10/13（77%）；全部改动经 AST 核验 100% 零运行时逻辑变更 |
| TypeScript 覆盖扩大（第 7 批） | 数据层剩余 3 个大型模型（`log`, `project`, `interface`）未受类型检查 | 加 `// @ts-check` + 纳入 include + 清理 `log.js` 错位 JSDoc + 补全全部方法注解 | 清零 130 处类型错误；**达成 server/models/ 全仓 13 个数据模型 100% 完整受检里程碑**；全部改动经 AST 归一化比对证实 100% 零运行时逻辑变更 |
| 测试基建防御与 Flake 根治 | jsdom 测试未屏蔽外部网络请求隐患；`httpApp.test.js` 并发偶发 Mongoose 断连异常 | 在 `jsdom-setup.js` 注入 `XMLHttpRequest` 网络拦截器并持续守护；显式等待 `yapi.connect` 与平滑关闭 | 彻底拦截任何意外的外部真实网络请求；根治 MongoDB 连接池提前关闭 flake；补齐 `timeago` 未来时间戳边缘用例；全量测试增至 **482** 项 |
| TypeScript 覆盖扩大（第 8 批） | `server/utils/commons.js` 与 `server/middleware/mockServer.js` 未受类型检查 | 加 `// @ts-check` + 纳入 include + global.d.ts 补齐 `easy-json-schema`/`json-schema-faker` 声明 | 清零约 **118 处**类型错误；服务端核心通用工具库与动态路由 Mock 中间件全面受检，AST 归一化比对证实零业务逻辑变更 |
| 通用核心组件 Hooks 现代化 | 4 个通用核心组件（`ProjectCard`, `TimeLine`, `Header`, `Search`）仍使用类组件与 `@connect` / `@withRouter` 装饰器 | 重构为 React 18 函数组件 + Hooks；消除 `TimeLine` 全部 UNSAFE_ 生命周期；新增 4 个组件单测（27 项用例） | 全量测试增至 **509** 项；彻底清理 4 处 `@connect` 与 `@withRouter` 包装；`add`/`del` 防抖经 useRef+useMemo 消除陈旧闭包；TimeLine 分页与 Diff 弹窗全覆盖 |
| TypeScript 覆盖扩大（第 9 批） | `common/postmanLib.js` 与服务端 4 个核心入口（`app`, `router`, `websocket`, `plugin`）未受类型检查 | 加 `// @ts-check` + 纳入 include + global.d.ts 补齐 `crypto-js`/`jsrsasign`/`koa-*` 声明 | 清零 **129 处**类型错误；**达成 common/ 全部 14 个公共库与 server/ 全仓业务代码 100% 完整受检重大里程碑**！AST 语义比对证实零业务逻辑变更 |
| 前端通用组件 Hooks 现代化（第 2 批） | 5 个通用组件（`Intro`, `MockDoc`, `UsernameAutoComplete`, `CaseEnv`, `EasyDragSort`）仍使用类组件及废弃的字符串 ref 与 `ReactDOM.findDOMNode` | 重构为 React 18 函数组件 + Hooks；淘汰字符串 ref 与 `ReactDOM.findDOMNode` 废弃 API；新增 5 个组件单测（32 项用例） | 全量测试增至 **541** 项！消灭 React 废弃调用；`CaseEnv` 折叠状态与 `EasyDragSort` 拖拽换位逻辑均获严格变异击杀覆盖 |
| TypeScript 覆盖扩大（第 10 批） | 服务端底层与安装脚本（`install.js`, `db.js`, `mongoose-auto-increment.js`, `notice.js`, `ldap.js`）未受类型检查 | 加 `// @ts-check` + 纳入 include + global.d.ts 补齐 `extend`/`ldapjs` 声明 | 清零 **86 处**类型错误；AST 深度比对证明 5 个文件 100% 逐节点一致；至此除孤立未引用的 initConfig.js 外，**server/ 全目录核心生产代码 100% 完整受检**！ |
| ModalPostman 弹窗组 Hooks 现代化 | `ModalPostman` 弹窗组 4 个组件（`index`, `MockList`, `MethodsList`, `VariablesSelect`）仍使用类组件、`@connect` 装饰器与废弃生命周期 | 重构为 React 18 函数组件 + Hooks；消除全部 `@connect` 与 `UNSAFE_componentWillMount`/`ReceiveProps`；新增 5 项单测 | 全量测试增至 **546** 项！参数解析、常量输入、Mock 过滤与变量树异步拉取全覆盖；独立变异测试 100% 精准击杀 |

### 第四阶段：按第四章优先级推进的技术债批次

| 项 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| 非 major 依赖安全批（commit 84cc30a5） | audit 45 项 = 9 critical / 26 high / 8 moderate / 2 low（npmmirror 未实现 audit 接口，此前无可见性） | audit **35 项 = 3 critical / 24 high / 8 moderate / 0 low**；5 个包升级 + audit 脚本入口 + 1 个回归测试 | `swagger-client` 3.5.1→3.38.2（消除其引入的 deep-extend、cross-fetch/node-fetch、cookie、form-data、fast-json-patch、qs@6.5.1 传递链）、`qs` 6.7.0→6.16.0、`sha.js` 2.4.9→2.4.12、`underscore` 1.8.3→1.13.8、`@babel/core` 7.28.4→7.29.7；新增 `scripts.audit`（固定官方 registry）；新增 `test/common/postman-utils-underscore.test.js`（沙箱公开 API `utils._` 回归保护，9 例）。业务代码与 `static/prd` 零改动；`run.js` 契约（`swagger({spec})→res.spec`）实测兼容故未改。门禁：lint 0 error / typecheck 0 错 / **npm test 555** 全绿 / build-client 0 error。三阶段独立评审结论 PASS |
| 最小 CI 四步门禁 + audit 基线差分（commit ff37aebe） | 仓库无任何 CI（`.github/` 仅 ISSUE_TEMPLATE.md），lint/typecheck/test/build 只靠本地 pre-commit；audit 因存量 35 项无法直接做门禁 | 新增 `.github/workflows/ci.yml`（push/PR、单 job、mongo:7 service、四步门禁）、`scripts/audit-check.js`（零依赖基线差分，退出码 0/1/2/3）、`scripts/audit-baseline.json`（3/24/8/0/35）、`test/scripts/audit-check.test.js`（7 例） | CI 步骤：checkout → setup-node(.nvmrc, cache npm) → npm ci → 写 CI 版 config.json（yapi_test、127.0.0.1:27017、mail 关闭）→ lint → typecheck → test → build-client → audit:ci；audit 仅对**新增**漏洞失败（容忍 npm audit 退出码 1）。验证：lint 0 / typecheck 0 / **npm test 562** 全绿（含 mongo:7@27019 的 CI 等价实跑）/ audit:ci 实测 delta 全 0；门禁脚本四条退出码分支均有离线回归测试；独立评审 PASS。**首次真跑（GitHub Actions run 35341995159，3m44s，2026-09-18）全绿**：npm ci（npmmirror 在 runner 可达）、lint、typecheck、test（**567 passed**，mongo:7 service）、build-client（35 warnings / 0 error）、audit:ci（35/35 delta 全 0）全部通过 |
| teardown flake 根治：就绪语义覆盖全部启动期 DB 工作（commit 0d3944c1） | `npm test` 在**冷库**（CI 每次运行的形态）下 exit 1、29 个 unhandled（`MongoClientClosedError`）：`connect()` 只等 `mongoose.connect`，核心索引 / 插件索引 / 计数器索引都在就绪之后 fire-and-forget，测试 close 时打断在途操作 | `yapi.registerStartupTask(fn)` 注册表；`connect()` 就绪链 = connect → `ensureQueryIndexes()` → 全部注册任务（串行）；`IdentityCounter` 关 autoIndex，唯一索引与计数器初始化纳入启动任务；3 个插件 10 处 fire-and-forget createIndex 改为注册任务（索引键逐字未变）；helper 移除 200ms 兜底 | 验证（**冷库**，每轮 drop `yapi_test`）：4 文件合跑 ×3、完整套件 ×3（**567 passed**）、探针 delay=0 全 0 unhandled、就绪契约零 sleep 12/12、4 进程并发写 user 验证计数器唯一；独立评审在冷库复现前次 FAIL 场景并确认已解决。**顺带修复存量缺陷**：冷库多 worker 会在唯一索引建立前并发插入重复计数器文档（E11000）致唯一索引永久建不起来 |
| CI config 形态修复（commit 253d29ab） | CI 写入的 config 只有 `mail:{enable:false}`，tsc 据此推断出 `{enable:boolean}`，`server/yapi.js:19` 的 `nodemailer.createTransport(WEBCONFIG.mail)` 因 TS weak type 检测报 TS2769 → **CI 首跑 Typecheck 必红** | 补全为符合 TransportConfig 的占位形态（`enable:false` + host/port/from/auth），mail 关闭语义不变 | 验证：用 workflow heredoc 的**完全相同内容**写入 config.json 后 `npm run typecheck` exit 0、0 错误；YAML 解析正常；config.json 已还原（sha256 与原始一致） |
| containers 首批 5 组件 Hooks 化 + 测试基建（commit 4b810d53） | `client/containers/` 38 个类组件、**零测试覆盖**；`@connect`/`match.params`/类 state 遍布 | 迁移 GroupLog、LoginContainer、User/User、Activity、NewsList 为函数组件 + Hooks；新增 `test/helpers/containers.js` 基建与 5 个测试文件（12 用例） | `@connect`→`useSelector`/`useDispatch`；`match.params`→`useParams()`（v6 兼容层等价性已核验）；类 state→`useState`；死映射保留裸订阅。**渲染等价性：迁移前后 8/8 用例 HTML 逐字节一致**（独立 worktree 双版本对照）；lint 0 / typecheck 0 / **npm test 579** 全绿（冷库两轮，0 pending/0 unhandled）/ build 0 error。既有缺陷按 bug-for-bug 保留（NewsList 非 FSA → `dispatch(...).then` 抛错），测试显式断言而非掩盖，待单独立项 |
| 短期高收益三项专项（commit d01f06c6） | audit 35项（含3 critical）；日志与静态文件每次同步读盘；NewsList FSA 缺陷致 loading 永不复位 | audit 降至 **34项（critical 3→2）**；日志改异步写入、静态资源（CSS/avatar）内存缓存；NewsList 修复为标准 FSA 并经历 [true, false] 复位 | handlebars 4.7.7→4.7.9 消除 1 项 critical（基线文件下调并同步更新）；commons.log 改 fs.writeFile 消除主事件循环阻塞；interface/user 增加 diffCssCache 与 defaultAvatarBuffer；fetchNewsData/fetchMoreNews 扩展属性收敛至 meta，redux-promise 正常拦截返回 Promise，消除组件端 .then 同步抛错；更新两个测试文件。门禁：lint 0 / typecheck 0 / audit:ci delta 全 0 / npm test 579 全绿 |
| Interface 系列 12 组件 Hooks 现代化（P5，commit 本次） | `client/containers/Project/Interface/` 全部 12 个组件仍为类组件 + `@connect`/`@withRouter`/UNSAFE_ 生命周期（含 1224 行的 InterfaceColContent 与 931 行的 InterfaceMenu） | 12 个组件全部迁移为 React 18 函数组件 + Hooks；新增 2 个容器测试文件（14 用例）；csl-coder 实施 → csl-tester 独立验证 → csl-reviewer 验收三段委派全流程 | `@connect`→`useSelector`/`useDispatch`、`match.params`→`useParams()`、UNSAFE_cWM/cWRP→useEffect+prev-ref、异步回调经 latestRef 镜像；渲染等价性新旧对照 **16/16 逐字节一致**（P5a 6/6 + P5b 10/10）；11 处 HEAD 零调用死代码随迁移移除（逐一 grep 核实）。唯一声明的行为修复：Run 传 open / AddColModal 读 visible 的 prop 名错位致「保存到集合」弹窗旧版永远无法打开，迁移改为 visible 修复（两文件头已注明）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 626** 全绿冷库 0 failed/0 unhandled |
| components 剩余类组件 Hooks 现代化（P6，commit 本次） | `client/components/` 尚余 4 个类组件：Postman（1082 行，HTTP 请求编排核心）、SchemaTable、AceEditor、AuthenticatedComponent | 4 个组件全部迁移为函数组件 + Hooks（ErrorBoundary 按 React 18 限制保持类组件）；新增 4 个测试文件（12 用例）；csl-coder → csl-tester → csl-reviewer 三段委派 | Postman：forwardRef + `useImperativeHandle` 经 getter 暴露实时 state（Run.js/InterfaceCaseContent 的 `postmanRef.current.state` 契约保持）；cWRP 回调链按「最终应用顺序等价」改写（评审逐场景核验成立）；渲染等价性 9/9 逐字节一致。已声明的 2 处行为偏差：① 同批次连点「发送」防双发（旧版读未提交 state 会双发，单测钉住）；② AuthenticatedComponent 不再转发 isAuthenticated/changeMenuItem（全仓零消费方实证）。删除 5 处 HEAD 中类上从未定义的死引用（changePath 等，对应按钮本就 display:none）。已知瞬态差异：UNSAFE_cWRP→useEffect 存在一帧「新 props+旧 state」中间态（最终态等价，P5 模式固有属性）。测试缺口备忘：Postman cWRP 等价 effect（:314-334）待后续批次补回归用例。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| components 全量类型化收口（P7a，commit 22c98e6d） | `client/components/` 33 个 JS 文件无类型检查（checkJs:false 下约 339 处类型错误不可见） | 33 个文件全部加 `// @ts-check` 并修复 339 处错误；global.d.ts 补声明（react hooks、antd 12 组件、markdown-it 等 5 个无类型库，+58 行）；tsconfig include 85→118 条 | **AST 级零运行时变更证明**：@babel/parser 剥离注释/位置/括号标记后逐文件深度比较，33/33 AST-EQUAL；零 @ts-nocheck/@ts-ignore。错误构成：TS7006 隐式 any 228、TS2305 antd 缺导出 19（声明垫片修复）等。3 处历史签名不一致（handleParams/fetchNewsData/handleConstantsInput）以可选形参/any cast 放行并注明（评审确认均为良性调用，定义文件属禁改范围）。后续建议：axios 响应与 redux state 边界升级为共享接口。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| containers 非 Project 部分类型化收口（P7b，commit a9d46df7） | `client/containers/` 除 Project/ 外 17 个文件无类型检查（约 176 处错误不可见），另含 4 处先前批次遗留 @ts-ignore | 17 个文件全部加 `// @ts-check` 并修复 176 处错误；消除 Group.js/ProjectList.js 全部 4 处遗留 @ts-ignore（containers 全范围 @ts-ignore 清零）；global.d.ts 补 Divider/Popconfirm/Space/core-decorators | AST 级零运行时变更证明：16/17 逐文件 AST-EQUAL；Profile.js 2 处已核等价差异（let params→const 无重绑定；useState()→useState(undefined) 实参补齐）。fetchNewsData 4 处少参调用点 any 中转放行（评审逐点核对：limit 走 PAGE_LIMIT 回退、selectValue 由 axios 省略，均为历史既有行为，未掩盖新缺陷）。遗留待查：NewsList.js:37-40 注释与形参语义不符系历史疑点（本批按零变更原则保留）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| Project 容器类型化收口（P7c，commit 0a4b7dbe） | `client/containers/Project/` 23 个文件无类型检查（约 447 处错误不可见） | 23 个文件全部加 `// @ts-check`（首行有效位）并修复 447 处错误；tsconfig include 5→28 条；global.d.ts 补 react 类型别名、antd Badge、5 个 client 别名路径 stub | **client/ 全量类型化完成**（components 33 + containers 非 Project 17 + Project 23）。AST 比较非 3/23 不等文件全部归因声明并核验：SortableContextAny 别名（中和实验还原后 AST 完全相等）、Project.js Route spread（babel 实译产物逐字相同）、Interface.js let C=null（仅异常路径可达，新旧均 invalid element type）。测试角色发现并修复 F-1：2 文件 @ts-check 位于 import 后不生效，已移至首行。stub 边界评审确认无漏检（相对路径导入仍按真实类型受检）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| client 根层收尾与全量达成（P7d，commit 本次） | client/ 根层 7 个文件（plugin/Application/plugin-module/theme/withRouter.jsx/index/v4IconMap）无类型检查（67 处错误） | 7 文件全部首行 `// @ts-check` 并修复 67 处错误；tsconfig include +7（含首个 .jsx 受检文件）；global.d.ts 补 react-redux Provider、antd theme、React.ComponentType、Window.chrome、exts/* 通配、client/plugin-module.js 声明 | **client/ 全量类型化达成（106/106 文件 checkJs:true 0 错误）**。3 处声明等价改写：① plugin.js require 说明符 './plugin-module.js'→'client/plugin-module.js'（生成物被 gitignore，旧写法 fresh checkout 必挂 TS2307——阴性对照精确复现；webpack alias 解析同一文件、plain node 同落 try/catch 兜底）；② Application.js Route→RouteAny 同引用别名（babel 擦除证明）；③ plugin.js let 拆分（纯声明）。theme.js 采用 `@returns {name is string}` 类型守卫避免结构改写。遗留：P8 时须删除/收窄 global.d.ts 的 exts/* 通配（否则形成类型盲区）；build/clientPluginModule.js 生成器待补 @ts-check 头（一行改动，重新构建时生成物头部会丢）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| exts 数据类插件类型化（P8a，commit 本次） | exts/ 7 个数据类插件（import-postman/import-swagger/import-har/import-yapi-json/export-data/export-swagger2-data/gen-services）16 个文件无类型检查（约 264 处错误） | 16 个文件全部首行 `// @ts-check` 并修复 264 处错误；tsconfig include +16；global.d.ts 补 yapi.js/controllers/*/models/* 通配、swagger-client、markdown-it 系声明 | import-swagger/run.js（此前修复过 lconcat 的数据转换核心）原始 AST 与 HEAD 完全一致——纯标注直接证明；2 处 `let a, b` 拆分为仅有的结构差异（规范化 AST 后 16/16 一致）。markdown-it 声明修正为 `export =` 可调用形态（探针验证 default import/new/use/render 全通过，唯一受检消费方 MarkdownEditor 无降级）。评审分级：通配声明均可接受，后续应升级顺序 yapi.js 精确化 > controllers paths 映射 > swagger-client 最小形状 > models/*；顺带发现 generate-schema 为 lockfile 幽灵依赖（非本批引入）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库（swaggerImport.test.js 直接调用 run.js 通过） |
| exts UI 类插件类型化收官（P8b，commit 本次） | exts/ 剩余 5 个插件（advanced-mock/statistics/swagger-auto-sync/wiki/test）33 个文件无类型检查（约 315 处错误） | 33 个文件全部加 @ts-check 并修复 315 处错误；tsconfig include +33、paths 新增 `exts/*`；**删除 global.d.ts 的 exts/* 通配（履行 P7d 遗留义务）** | **exts/ 全量类型化达成（全 63 文件 checkJs:true 0 错误，评审以 canary 反证检查管线非假阴性）**。10 处声明结构差异逐项核验等价：statistics/util.js `this→exports` 中转（文件未重赋 module.exports，行为级等价测试 22/22 全等）、wiki websocket callback 可选化（降级路径与 HEAD 一致）、CaseDesModal 解构改写等；MockCol.js 的 `this.saveFormRef` 未定义遗留缺陷如实保留未修。通配删除后新增插件由「fail loud 强同步」取代「fail silent 遮蔽」——新插件接入须同步登记 tsconfig include（已记入台账义务）。测试阶段发现并修复 wiki/controller.js @ts-check 位于首个语句后失效（移至首行）。注意事项：5 个 statistics 文件 @ts-check 位于前导注释后（TS 7.0.2 实测有效，TS 升级时需回归）；勿用窄 include 的 checkJs 配置做验收（程序组成依赖会现 TS2786 假阳性）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 638** 全绿冷库 |
| XSS 深度审计加固 + 同步 I/O 收尾（P9a，commit 本次） | reportHtml（自动化测试报告 HTML）11 处用户可控插值零转义；Postman 响应预览 iframe 无 sandbox；downloadCrx 每请求同步读盘；test.js writeFileSync 假回调（错误处理从未生效，失败实为 uncaughtException 崩溃风险） | reportHtml 自建 escapeHtml 全部转义（属性位仅数字索引经复核免引号转义）；Postman iframe 加 `sandbox=""`（全仓唯一 iframe）；downloadCrx 模块级 zip 缓存；test.js 改 fs.promises.writeFile 恢复「写入失败 402」意图 + readableEnded 兜底；新增 5 个测试用例（对抗注入断言 + 写入路径） | 五类 sink 系统性审计：href/window.open/scheme 拼接（静态常量或 origin 起头，无法注入 javascript:）、eval（postmanLib 沙箱执行用户脚本为产品设计）、邮件/下载件（豁免但登记遗留）；dangerouslySetInnerHTML 5 处复核均已接 DOMPurify。测试升级确认：原缺陷比声明更严重（流事件回调内同步 throw）。豁免面遗留台账：① 邮件 HTML 注入面（interface.js:891 裸插值 username/title/path，特权门槛缓解，后续统一转义）；② export-data/gen-services 的 api.html 下载件内容注入（file:// 源无会话窃取，后续可复用 escapeHtml）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 643** 全绿冷库 |
| interface 控制器 God file 拆分试点（P9b，commit 本次） | server/controllers/interface.js 1549 行（server 端最大控制器） | **766 行**（≤900 达标）；新增 interface/ 子目录 5 个单一职责模块（cacheHelper 22/saveMethods 213/upMethods 275/categoryMethods 181/listMethods 220）；10 个类方法经 Object.assign 原型合并迁出 + clearProjectCategoryCache 纯函数迁出；测试角色新增 interfacePrototype.test.js（3 用例：原型面快照回归 + rewire 三绑定固化） | 拆分纪律沉淀（可推广）：① 拆分前侦察三件套——grep 测试 rewire 契约（本文件 3 个测试依赖模块作用域 yapi mock 与 interfaceController/clearProjectCategoryCache/handleHeaders 三绑定，留守满足）、grep `^let` 模块级可变状态（与唯一消费者同模块迁）、grep 外部 require 面；② 函数体逐字节搬移 + 独立 AST 证明（104/104）；③ 原型面运行时 HEAD worktree 对比 24 项一致。已知语义边界（非缺陷）：原型合并方法为 enumerable（类方法 non-enumerable，全仓无 for-in 消费）、Object.assign 后行类方法同名会被静默覆盖（推广批次建议加 5 行开发期交集防护）、rewire mock 不穿透方法组模块作用域（新测试须用实例级覆写模式）。**模式推广裁决（评审）**：project.js/interfaceCol.js/user.js 适用原型合并（user.js 的 defaultAvatarBuffer 缓存须与消费方法同模块）；客户端 3 个 god file 禁用原型合并，改纯函数抽取。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 646** 全绿冷库 |
| 服务端 God file 拆分收官（P9c，commit 本次） | project.js 1272 行、interfaceCol.js 1027 行、user.js 1150 行 | **588 / 49（组装器形态）/ 418**；新增 10 个单一职责模块（project: member/envToken/query；interfaceCol: col/caseQuery/caseAdd/caseUpdate；user: auth/admin/avatar）；Object.assign 遮蔽防护（交集非空 throw，Module._load 注入实验确认触发）；新增 3 个原型面快照测试（6 用例） | **服务端 4 个 God file 全部拆分完成**（interface 766/project 588/interfaceCol 49/user 418），三轮拆分沿用同一已验证模式。独立证明：68/68 方法生成码等价（仅 2 处 require 深度调整 + 1 行互调指向注释）；58 个路由 action 全可解析（含 interfaceCol 组装器无缺口）；defaultAvatarBuffer 缓存与 avatar 方法同迁，两次请求 1 次读盘行为不变。已知边界：合并方法为 enumerable（类方法 non-enumerable，全仓无消费方，P9b 已裁决接受）；组装器形态导航依赖快照测试头注归属清单。**剩余 3 个客户端 God file（InterfaceEditForm 1458/InterfaceColContent 1304/Postman 1222）登记为后续可选独立批次**（纯函数抽取模式、中-高风险，Postman 建议最后做——被 InterfaceColContent 消费）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 652** 全绿冷库 |
| 台账遗留定向修复批（commit 本次） | P9a 登记的邮件 HTML 注入面与导出件注入、P7d 登记的生成器缺头、P9a Nitpick 调试残留、P7b 登记的 NewsList 历史疑点、P6 登记的 Postman cWRP 测试缺口 | 新增共享 server/utils/escapeHtml.js（7 消费点：reportHtml/upMethods/open/authMethods×2/wiki/export-data/gen-services）；导出插件非变异克隆转义（良性输出逐字节一致、恶意注入差分验证中和）；生成器产出 @ts-check 头（重生成逐字节一致）；删 test.js 调试监听器块；NewsList 定性为签名演进孤儿（358459d9 时 `(uid,page,limit)` 语义下正确，签名演进未迁移，仅修注释不改行为）；Postman +4 cWRP 用例（含 type=case「旧 case_env 最后应用」的 bug-for-bug 钉死） | exts 可经 NODE_PATH 共享 server/utils（app.js _initPaths 先例）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 656** 全绿冷库。**新登记残留面（测试角色发现，批外既存）**：① common/markdown.js:351 锚点属性位引号注入（新旧管线均可注入 onerror——escapeHtml 不转义引号且 markdown.js 未转义，**已修复见下行**）；② 导出 api.html 表格单元格纯文本字段未转义（**已修复见下行**）；③ interface.js saveLog content 插值（upMethods.js:179/interface.js:359/440）**已评估关闭**：操作日志经 TimeLine 组件渲染，该组件已接 DOMPurify（sanitizeHtml），服务端转义反而双重转义破坏富文本展示，客户端消毒即正确防线；④ toPlain/escapeListPlainFields 在两导出插件中双份重复约 35 行（可抽共享，插件独立边界下接受） |
| markdown.js 注入面专项修复（commit 本次） | common/markdown.js 锚点 `id=${title}${catid}` 无引号属性位可逃逸注入事件处理器；管道表/schema 表纯文本单元格（name/example/default 等）零转义直通 html:true 管线；schema 子项 null 值触发 .toString() 抛错致导出 502 | 新增局部 escapeHtml/escapeHtmlAttr（与 server/utils 规则对齐、注释互引）；锚点改引号包裹 + 属性转义；管道表与 schema 表纯文本位全量转义（desc 等创作面保留）；golden 基线差分证明良性数据除锚点引号外逐字节一致；gen-services 的 `<title>` 补转义（与 export-data 同位对齐）；新增 9 用例 + 2 个 golden 文件 | 独立验证：12 探针注入 HEAD 18 处活事件处理器 → 工作区 0；golden 经 HEAD 版重生成溯源确认真实基线锚定；null 崩溃实证（HEAD `value.toString()` TypeError）→ 现渲染 "null" 文本改善。残留登记：Form 表 type 列**已修复**（评审 Minor：服务端 API 可写任意值，本批补 escapeHtml 纵深转义并验证对枚举显示零影响）；saveLog content 已评估关闭（客户端 DOMPurify 即正确防线）；markdown-it-anchor 自动 slug 行为未纳入。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 665** 全绿冷库 |
| 客户端 God file 拆分：InterfaceEditForm（commit 本次） | InterfaceEditForm.js 1458 行（client 最大 God file） | **1121 行**（纯逻辑抽取 337 行/-23%：checkIsJsonSchema/validJson/initState + 常量组迁 formDefaults.js 196 行；4 个行模板迁 paramTemplates.js 204 行，delParams 改形参注入）；新增 11 用例组件测试 | 纯函数抽取模式首批。独立验证：AST 17/17（8 项逐字节+AST 双真、4 模板缩进平移+AST）、渲染等价 **4 场景逐字节一致**（含 nomethod 崩溃等价性——该崩溃为改动前即存在的既有缺陷，新旧一致）。**1121>1000 未强行达标**：JSX 557 行 + 闭包 handlers 470 行为字节级等价红线的数学上限，如实申报。**评审裁决（后两批处置依据）**：InterfaceColContent（预估仅可抽 2-6%）/Postman（5-11%）纯函数收益天然有限；handlers 依赖注入工厂会脱离逐字节等价模型（不建议）；render 子组件化是正确治理路径但属组件树变更（验证模型降级为功能等价+主 Agent UI 验证），**单独立项、不混入纯函数批次**。既有缺陷登记：curdata 无 method 时组件初始化崩溃（Edit.js 恒传合法数据掩盖）。门禁（三方独立复跑）：lint 0/0、typecheck 0 错、**npm test 676** 全绿冷库 |
| containers 第二批 4 组件 Hooks 化（commit 本次） | `Follows`, `NewsTimeline`, `MemberList`, `User/List` 使用类组件与 `@connect`/`@autobind` 装饰器 | 重构为 React 18 函数组件 + Hooks；新增 4 个容器单测（11 项用例） | 全量测试增至 **590** 项；渲染等价性 11/11 场景逐字节一致；变异击杀覆盖关键路径（Follows/NewsTimeline/MemberList 三组件已验证）；MemberList 分组切换重拉分支覆盖缺口登记为后续跟进 |

## 二、评估后暂缓（含推进路径）

### 1. 构建工具 Webpack5 → Rsbuild（已立项，见 docs/rsbuild-migration-plan.md）

- 立项计划已产出（2026-09-20，基于构建链事实核查）：分四阶段可执行计划，含产物契约（window.WEBPACK_ASSETS 形状/服务端 .gz 预压缩链）、验证矩阵与回滚预案，见 [docs/rsbuild-migration-plan.md](docs/rsbuild-migration-plan.md)。
- 关键事实（已核查）：`assets.js` 清单**仅浏览器端消费**（static/index.html document.write 注入，server/app.js 只做静态与预压缩 .gz 服务），迁移面为「构建器替换 + 模板注入改造」，无服务端代码契约。

### 2. 剩余 Class 组件 → Hooks（持续进行；containers 已开工）

- 累计已完成 27 个组件迁移：**components 22 个**（GuideBtns、Breadcrumb、Loading、Footer、ErrMsg、Notify、Label、Subnav、MyPopConfirm、ProjectCard、TimeLine、Header、Search、Intro、MockDoc、UsernameAutoComplete、CaseEnv、EasyDragSort、ModalPostman/index、MockList、MethodsList、VariablesSelect）+ **containers 首批 5 个**（GroupLog、LoginContainer、User/User、Activity、NewsList，commit 4b810d53），消灭了全部 UNSAFE_ 生命周期与 `ReactDOM.findDOMNode`/字符串 ref 废弃 API。
- 目前 `client/components/` 下仅存 4 个业务类组件（`Postman.js`, `SchemaTable.js`, `AceEditor.js`, `AuthenticatedComponent.js`，注：`ErrorBoundary.js` 按 React 18 规范必须保持为类组件）；`client/containers/` 下 38 个类组件中已迁移 5 个，**剩 33 个**（含 InterfaceColContent 1224 行、InterfaceMenu 931 行等大件）。
- **containers 测试基建已建立**（commit 4b810d53）：`test/helpers/containers.js`（makeStore / renderWithProviders（Provider+MemoryRouter，复刻 Application.js 挂载语义）/ flushEffects / stubDefaultExport / cleanupDom），可支撑后续批次；containers 测试覆盖从 0 → 12 用例。
- 迁移范式（本批确立并复用）：`@connect` → `useSelector`/`useDispatch`；`this.props.match.params` → `useParams()`（应用 v6 经 [client/withRouter.jsx](client/withRouter.jsx) 兼容层注入，等价性已核验）；类 state → `useState`；未使用的 connect 映射保留为裸 `useSelector` 订阅（先例：ProjectCard）；`propTypes` 改为函数属性赋值。
- **每批硬要求**：零行为变更（迁移前后同上下文渲染 HTML 逐字节一致）+ 同步补该批组件的测试。
- 迁移中顺带清理 `core-decorators` 的 `@autobind`（改箭头函数属性）与 `@connect`（改 hooks）。

### 3. TypeScript 健全化（持续进行）

- 现状：`tsconfig.json` 按文件白名单 + `checkJs: false`（**仅有 `// @ts-check` 指令的文件被检查**）。白名单 + 5 个新纳入文件已全量绿，`npm run typecheck` 0 错误。
- 已完成的现代化：Node API 类型改由显式 `@types/node@^24`（与 .nvmrc 一致）提供，删除了 `global.d.ts` 中手写且与真实类型冲突的 Buffer/process/require/crypto 垫片。
- 推进路径：每次触碰旧文件顺手加 `// @ts-check` 并清零其错误。**实测剩余工作量基线**（开启 `checkJs` 后的错误数）：`client/containers` 1183、`client/components` 550 等（`server/` 全仓业务代码与全部核心入口、`common/` 全部 14 个模块已全部达成 0 错误受检，受检率达 100%）。
- 遗留技术细节：① `json5@2` 自带类型只导出 `{parse, stringify}` 无 default，而项目内 CJS/ESM 两种用法并存，故仍保留等价声明——若统一改命名导入即可删除；② `mockjs` 与 `json-schema-editor-visual` 无自带类型，仍需声明；③ `common/lib.js` 的 `Compare*` 三个函数 `@param {*} flag` 尚可收紧为 `boolean`（本次只收紧了 `@returns`）。

### 4. 状态管理 Redux+redux-promise → 轻量方案（暂缓）

- 建议：迭代到对应 reducer 模块时以 Zustand（或 RTK）重写该模块，不整体大爆炸迁移。`redux-promise` 停更，但当前 15 个 reducer 模块均为薄封装，风险可控。

### 5. 文档系统 ydoc → VitePress（暂缓，低优先）

- `docs/` 为独立产物，不影响运行时；ydoc 在高版本 Node 下的兼容问题未阻塞开发。

## 三、遗留观察项（MINOR，不阻塞）

- **构建产物与提交策略**：`static/prd/` 受 Git 跟踪且构建会清空重建。纯注解/配置类改动**不必提交产物**（评审实测：其编译结果与已提交产物的编译结果逐字节相同），否则产生 ~19-33 条文件级噪声 diff；但仓库存在相反先例（`8d8ee461` 提交过产物），若发布流程要求产物始终对应一次全新构建，应另开 `chore(build)` 提交。
- **测试缺口（存量）**：`common/HandleImportData.js` 缺少 3 处 axios 异常 catch 分支、`dataSync !== 'normal'` 分支及 BasePath 更新分支测试。
- `common/utils.js` 的 `schemaValidator` catch 分支声明 `message: string`，但抛出非 Error 时实为 `undefined`（已在源码注释说明；收紧需改运行时，未做）。
- `common/lib.js` 的 `Compare*` 三个函数 `@param {*} flag` 尚可收紧为 `boolean`（本批只收紧了 `@returns`，`return flag` 一句因 `flag` 为 `*` 仍不受检）。
- 测试覆盖仍有空白（评审实测存活变异点）：`mockEditor` 的 `wordList` 与 F9 全屏交互、`fullScreen` 选项。
- `MarkdownEditor` 的 `value` 为「仅初始值」语义（已由测试钉死，依据调用方 `InterfaceContent.js:173-174` 的 `key={actionId}` 重挂载）。但 **wiki 插件调用方**（`exts/yapi-plugin-wiki/wikiPage/Editor.js:32` 的 `value={desc}`）存在挂载后 prop 变更路径（websocket 冲突消息、上传后写 desc），这些场景编辑区不跟随更新，需浏览器验证后决定是否补 prop 同步。
- 新增测试文件存在超 100 列行（约 11 行/文件，高于既有测试基线），仓库无 format 门禁；修正时**勿**运行 `prettier --write`（会把 `function(` 改成 `function (`，与仓库主流风格相反）。
- `mockEditor.js` 模块级 wordList 多实例累积重复项 —— 忠实移植的既有瑕疵。
- 历史接口无 `markdown` 字段时，编辑页备注以 HTML 原文形态呈现，重新保存后完成迁移（设计取舍）。
- 动画库 `rc-queue-anim`/`rc-scroll-anim`/`rc-tween-one`（停更）—— 未列入本轮范围，建议随组件 Hooks 化顺带替换为 CSS/Framer Motion。
- `json-schema-editor-visual@1.0.23`（内嵌 antd3 样式 + brace 传递依赖）—— 替换需自定义 JSON Schema 编辑器，工作量单独评估。
- 登录路径 scryptSync 同步阻塞约几十毫秒；`verifyPassword` 尊重 storedHash 自述参数但受 Node maxmem 兜底 —— 观察即可。
- old 兼容：`add`/`resetPassword` 生成 legacy 密码格式（首次登录自动升级）—— 如后续可改既有测试，可一并 scrypt 化。
- 沙箱进程池边界收窄观察项：常驻 Worker 下恶意脚本可篡改注入的 assert/Random 模块对象（影响同 Worker 后续任务直至 1000 次轮换）；任务队列无背压上限；context 不可序列化时误判为崩溃换 Worker —— 均为低风险设计取舍，知悉即可。
- ~~**NewsList 既有缺陷**~~ → **已修复（commit 本次）**：扩展属性收敛至 meta，遵循标准 FSA，dispatch 返回真实 Promise，loading 状态正常经历 [true, false] 复位，对应单测断言已更新。
- **containers 迁移批次的跟踪项（来自 commit 4b810d53 评审）**：① 本批 5 个迁移文件中 4 个（GroupLog/Activity/NewsList/User）不在 tsconfig 白名单，不受 typecheck 覆盖（白名单策略现状，风险低）；② `test/helpers/containers.js` 的 `makeStore` 对非 FSA action 会重复记录 2 次（当前断言不受影响）；③ `flushEffects` 的 15ms 固定等待在当前用例下确定，但对接真实定时器桩时会脆弱；④ helper 暂不支持 `navigate` 跳转辅助与活 store 更新驱动断言。
- **本机环境备注**：`config.json` 指向 27018，但用户的 `yapi-mongodb-8`（mongo:8.0 @27018）容器已停止（仅 `yapi-mongodb` mongo:4.4 @27017 在运行）——本地直跑 `npm test` 会有 5 个连库测试（dbReady×3、startupTasks×2）因 mongoose 选主 30s > AVA 超时而 pending；CI 自带 mongo service 不受影响。另：本地全量测试需要 DB（本批前端改动也如此）。
- ~~`npm test` 偶发 unhandled rejection（teardown 与在途 DB 操作竞态）~~ → **已根治（commit 0d3944c1）**：`connect()` 就绪语义现覆盖全部启动期 DB 工作（核心索引 + 插件索引 + 计数器索引与初始化，串行），冷库 17 次启动零复现。**残余观察项（不阻塞，多进程形态才可命中）**：① 多 worker 共享冷库时，计数器初始化竞争败者进程的插件闭包 `ready` 保持 false，其后续对该模型的 save 会进入 5ms 重试循环（旧实现同位置同样如此，且旧实现还伴随数据损坏 + 索引坏死）；② 脏库若已被旧缺陷写入重复计数器文档，唯一索引任务每次启动会失败日志一次（不阻塞、不加重损坏），需一次性清洗脚本；③ `drainStartupTasks` 无单任务超时保护（依赖驱动 socket 超时兜底）；④ `dbReady.test.js` 的"索引缺失"断言在热库上效力弱化（CI 冷库形态不受影响）。

## 四、新发现技术债（2026-09-18 全仓扫描，待评估排期）

> 来源：对依赖安全、CI、目录结构、同步 I/O 的补充扫描；均未纳入此前各批次范围。优先级建议见本节末。

### 1. 依赖安全（npm audit；首批已修复，见「一、第四阶段」）

- **扫描方法**：`npm audit --registry=https://registry.npmjs.org`（已固化为 `npm run audit`）。默认 npmmirror 源未实现 audit 接口（`NOT_IMPLEMENTED`），此前安全扫描实际处于盲区。
- **进展**：非 major 依赖安全治理持续推进，漏洞从 45 → 35 → **34 项**（critical 9→3→**2**、high 26→24、moderate 8→8、low 2→0）；通过升级 `handlebars@4.7.9` 消除了 1 项 critical。
- **仍保留的 2 个 critical（均需后续批次）**：
  - `jsrsasign@8.0.12`：根直接依赖，advisory 覆盖 `<=11.1.0`、**无可用修复版本**，且同时是沙箱公开 API（`utils.jsrsasign`）——需专项评估替换方案；
  - `loader-utils`：`style-loader@0.18.2` 嵌套 1.1.0（critical）+ babel-loader 下 2.0.4（已是修复版）；修复需 style-loader major，随构建迁移处理。
  - ~~`handlebars@4.7.7`~~ → **已修复（4.7.9，commit 本次）**。
- **其余待处理**：`jsonpath@1.1.1` 自带嵌套 `underscore@1.12.1`（high，来自 `json-schema-faker 0.5.0-rc16`，需升级该包才能消除）；`markdown-it@8`→15、`jsondiffpatch@0.3.11`→0.7.6、`koa-websocket@4`→7、`react-router@6.30.6`（moderate 开放重定向）、`style-loader` 构建链等 major 项，随对应模块改造排期。
- **新增观察项**：`@scarf/scarf@1.4.0` 随 swagger-client 3.38.2 进入依赖树（默认在 install 时上报安装遥测，可用 `SCARF_ANALYTICS=false` 关闭）——建议在 CI/构建环境评估禁用。
- **门禁建议（评审提出）**：当前 35 项未清零，`npm run audit` 有漏洞时退出码为 1；接入 CI 前应改为**基线差分门禁**（仅对新增漏洞失败，如 audit-ci allowlist 或入库基线文件）或仅作报告用途，避免误报"构建损坏"。
- **无修复路径 / 需结构性替换**：`json-schema-editor-visual@1.0.23` 内嵌 antd3→rc-editor-mention→draft-js/immutable/fbjs（与遗留观察项「需自研 JSON Schema 编辑器」同一项）。
- **dev/build 链**：`style-loader@0.18.2`→loader-utils@1.1.0→json5@0.5.1（critical/high，随构建迁移处理）；conventional-changelog-cli→handlebars（见上）；ava→@vercel/nft→node-fetch（dev-only）。
- 推进路径：非 major 批已做完；剩余项按「可低成本修复（handlebars）→ 需升级依赖树（jsonpath/json-schema-faker）→ 需 major 改造（markdown-it/jsondiffpatch/koa-websocket/style-loader/jsrsasign）」三档排期。

### 2. 无 CI（门禁仅本地生效）→ 已完成（commit ff37aebe）

- 原现状：`.github/` 仅 ISSUE_TEMPLATE.md，无任何 workflow；`lint`/`typecheck`/`test`/`build-client` 四道门禁只挂在本地 pre-commit 与人工执行，push/PR 无强制。
- 已落地：`.github/workflows/ci.yml`（push + pull_request，单 job，ubuntu-latest，30min 超时，mongo:7 service 含 mongosh 健康检查）；CI 中现场写 config.json（该文件被 gitignore，测试依赖它连库）。
- audit 门禁：按评审建议改为**基线差分**（`npm run audit:ci` → `scripts/audit-check.js`，仅对新增漏洞失败，退出码 0/1/2/3 有离线回归测试）；基线 `scripts/audit-baseline.json` 记录当前 35 项。
- **后续跟踪项（非阻塞，来自评审）**：
  1. ~~server 测试 teardown flake 会让 CI 的 Test 步骤偶发变红~~ → **已根治（commit 0d3944c1）**，残余观察项见「三、遗留观察项」；
  2. ~~CI config 的 `mail:{enable:false}` 形态导致 Typecheck 必红~~ → **已修（commit 253d29ab）**；
  3. ~~`npm run build-client` 的 CI 首次真跑未验证~~ → **已验证**：run 35341995159 的 Build client 步骤通过（35 warnings / 0 error）；
  4. ~~CI 拉包走 npmmirror 的 runner 侧可达性未验证~~ → **已验证**：run 35341995159 的 `npm ci` 通过（npmmirror 在 GitHub runner 可达）；如后续出现不稳定再改 `npm ci --registry=https://registry.npmjs.org --replace-registry-host=always`；
  5. `scripts/` 未纳入 `npm run lint` 范围（新脚本目前只被手工 lint）；
  6. `audit-check.js:135` 在 `metadata.total` 为 null 时按 0 处理（severity 仍各自比对，不漏报新增）；
  7. 官方 action 目前用主版本 tag（`@v4`），如需供应链加固可改 SHA 固定；
  8. ~~真实 CI runner 尚未实跑~~ → **已实跑且全绿（run 35341995159）**；
  9. **CI 平台告警（新增，来自首次真跑 annotations）**：① `actions/checkout@v4` / `actions/setup-node@v4` 面向 Node 20 已被 GitHub 弃用（runner 强制用 Node 24 运行），后续可升到新版本 action；② `ubuntu-latest` 将于 2026-10-19 迁移到 Ubuntu 26，届时需复核构建与 mongo service 行为。

### 3. 结构债（god files）

- `server/controllers/interface.js` 1533 行、`client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js` 1458、`server/controllers/project.js` 1272、`client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js` 1224、`server/controllers/user.js` 1143、`client/components/Postman/Postman.js` 1082、`server/controllers/interfaceCol.js` 1027。
- 推进路径：随对应模块的功能改造/Hooks 化渐进拆分（如 controller 按导入导出、用例、CRUD 拆 service），不做大爆炸重构。

### 4. 测试盲区：containers 零覆盖

- 现状：66 个测试文件中 **0 个覆盖 `client/containers/`**，而剩余 44 个类组件中的 39 个与 1183 处类型错误正集中于此。
- 推进路径：类组件迁移时同步补首批 containers 测试（沿用 jsdom + @testing-library/react 基建）。

### 5. exts/ 插件完全未现代化

- 现状：11 个插件 63 个 JS 文件，0 个 `@ts-check`、7 个类组件、16 个文件直接引 antd；既不在类型门禁也不在 Hooks 迁移范围。
- 推进路径：单独批次评估（插件可能被外部用户以源码/构建方式引用，需先确认兼容边界）。

### 6. 请求路径同步 I/O（部分已优化，见第四阶段）

- ~~`server/utils/commons.js:133` 每次日志 `writeFileSync`~~ → **已改为异步 `fs.writeFile` 非阻塞写入（commit 本次）**；
- ~~`server/controllers/interface.js:857/864` 每请求重复 `readFileSync` 差异 CSS 静态资源~~ → **已增加 `diffCssCache` 内存缓存（commit 本次）**；
- ~~`server/controllers/user.js:953` 头像兜底重复读盘~~ → **已增加 `defaultAvatarBuffer` 内存缓存（commit 本次）**；
- 剩余项：`server/controllers/interface.js:580` 插件包下载等边缘文件读取，随对应业务模块优化。

### 7. 其他遗留依赖与待审查项

- 停更/弃用：`url@0.11.0`（官方弃用）、`webpack-node-externals@1.6.0`、`rewire@2.5.2`、`core-decorators@0.17.0`（仍有 3 文件使用）、`mockjs 1.0.1-beta3`、`easy-json-schema 0.0.2-beta`、`mime@2`、`compare-versions@3`；`prop-types` 仍被 73 个文件使用（React 18 已非必需）。
- 7 处 `dangerouslySetInnerHTML`（markdown/HTML 备注渲染链路）建议做一次 XSS 专项审查。

### 建议优先级（供裁决）

1. ~~非 major 依赖安全批（swagger-client / qs / sha.js / underscore / @babel/core）+ audit 纳入门禁~~ → **已完成（commit 84cc30a5）**；audit 门禁接入方式待定（见第 1 节门禁建议）；
2. ~~最小 CI 四步门禁~~ → **已完成（commit ff37aebe）**，含 audit 基线差分门禁；后续跟踪项见第 2 节；
3. 类组件迁移优先 containers 并同步补 containers 测试；
4. 同步 I/O 收口与 god file 拆分随改造进行；
5. major 升级（markdown-it / jsondiffpatch / koa-websocket / react-router / antd6 / react19）单独排期。

## 五、验证基线

- Node：`.nvmrc` 24.21.0（engines `>=18 <25`）。
- 门禁：`npm run lint`（覆盖全仓含 test/，0 error 0 warning，pre-commit 卡点）、`npm test`（**579**）、`npm run typecheck`（0 错）、`npm run build-client`（0 error）、`npm run audit`（官方 registry 安全扫描，当前 34 项）、`npm run audit:ci`（基线差分门禁，仅对新增漏洞失败）。
- CI：`.github/workflows/ci.yml`（push/PR 触发；mongo:7 service + 上述门禁全跑）。**首次真跑全绿：run 35341995159（3m44s）**，可用 `gh run list --repo steedjson/yapi` 查看（注意本仓库有两个 remote，`gh` 需显式 `--repo steedjson/yapi`，否则会解析到 upstream）。本地等价验证方式：`docker run -d --rm -p <空闲端口>:27017 mongo:7` + 按 workflow heredoc 写 config.json（改端口）+ `npm test`。
- **测试验证必须用冷库**（每轮前 drop `yapi_test`）：温库会掩盖启动期 DB 工作的时序问题（冷库 teardown flake 曾在温库下"通过"、在冷库必现）。
- **临时替换 config.json 的纪律**：先 `cp config.json /tmp/<name>.bak` 并记录 sha256（原始值 `6dc9b4c27137702233d03a4d1cdb619a622dd4180ab4044b16316114ed4864a9`），结束前恢复并校验；用户容器 27017（mongo:4.4）/27018（mongo:8.0）禁止触碰。
- 浏览器冒烟（本轮）：注册/登录（scrypt + legacy 自动升级）、接口编辑页编辑器、用例表格拖拽持久化、Markdown 双写、Wiki 编辑器、面包屑、路由分包按需加载，全部通过。

| 类组件 Hooks 化收官（commit 本次） | client/ 最后 5 个类组件：Home 409、ProjectList 233（全仓最后 1 处 @autobind）、Project 197、LoginWrap 52、Application 214（全仓最后 1 处 @connect） | 5 个全部迁移为函数组件 + Hooks（新增 4 测试文件 12 用例）；**client/ 全仓类组件清零**（仅 ErrorBoundary 按 React 18 规范保留），@connect/@autobind/UNSAFE_ 装饰器与废弃生命周期全仓归零 | 独立验证 13/13 场景渲染逐字节等价（Application 全外壳含真实 lazy chunk 3 场景）；checkLoginState cDM→useEffect 时序逐帧推演成立（首帧全 LOADING、route(0) 提前 return 无旧值消费者）；ProjectList 页码怪癖实证保留；5 处死代码 HEAD 零调用点核实。**主 Agent 浏览器 UI 验证（UI_VERIFIED，dev:4000 真实环境）**：游客/登录态首页、分组页（585 接口真实项目）、项目子导航、接口列表分页、接口详情 View、退出→登录→注册→自动登录→重登全链路正常。已知时序面：隔离挂载下 cWM→useEffect 请求顺序可观察差异（最终渲染等价、无数据竞争，声明内语义）。测试缺口备忘：Project id 变化重拉与 ProjectList 切组重拉两个分支待补路由内导航用例。门禁（三方独立复跑 + UI 实测）：lint 0/0、typecheck 0 错、**npm test 689** 全绿冷库 |

| 依赖安全中档升级批（commit 本次） | audit 34 项（2 critical/24 high/8 moderate）：jsrsasign critical（14 条签名/密码学 advisory）、markdown-it 系 5 项 high、koa-websocket/ws 2 项 high、jsondiffpatch high、jsonpath 链 high | markdown-it 8.4→15.0.2、anchor 4→10、toc 0.3.2→1.2.0；koa-websocket 4→7（新增 ws 集成测试 3 用例）；jsondiffpatch 0.3.11→0.7.6（formatters 子路径适配、存量日志为快照非持久 delta——0.3 delta→0.7 formatter 兼容探针 12/12）；json-schema-faker rc16→0.5.9（requiredOnly 适配对齐 rc16 语义，7 形态探针一致；**拒绝最新 rc 因其 jsonpath-plus@5 有 critical RCE**）；**jsrsasign 8→11.1.5（critical 消除，项目仅透传沙箱零 API 调用，KJUR/KEYUTIL 面实测齐全）**；新增 anchorSlugify 安全 slug（防 anchor v10 encodeURIComponent 被 unescape 复活成属性注入，反证成立）+ 落库回归测试 4 用例 | audit **34→23**（critical 2→1 剩 loader-utils 构建链、high 24→14），基线已下调 audit:ci 零差；golden 3 处空行差异逐条对应 markdown.js 适配；构建产物重建 assets.js 16/16 chunk 完整。**浏览器 UI 验证（UI_VERIFIED）**：真实环境 TimeLine 日志渲染 + 改动详情弹窗 jsondiffpatch 0.7 客户端 diff（integer→string 差异正确显示）、Project loadError 分支。决策记录：react-router v7 不做（32 文件依赖 v6 API 面，moderate 在基线受控，单独立项）；json-schema-faker 0.6 可另行立项。注意：jsondiffpatch 0.7 ESM-only 需 Node ≥22.12（.nvmrc=24 满足，生产部署需确认）。门禁（三方独立复跑 + UI 实测）：lint 0/0、typecheck 0 错、**npm test 692** 全绿冷库、build-client 0 error |

| Rsbuild 阶段一：生产构建切换（commit 本次） | build-client 走 webpack5 手工 dependOn 链（构建 18s+），35 条 NODE_ENV 双重定义警告，CSS 无压缩器 | `npm run build-client` 切换为 @rsbuild/core@2.2.8 链（rspack），旧链保留 `build-client:webpack` 单 commit 可回滚；新增 rsbuild.config.mjs + build/rsbuild-standalone.mjs（编排）+ build/rsbuild-assets.js（WEBPACK_ASSETS 适配 + zlib gzip）+ 5 用例纯函数测试；**index.html 注入面零改动**（rspack 原生支持 dependOn，vendor 链保留，5 段 script 原样成立） | 产物拓扑与 webpack 完全一致（11 js+6 css+5 LICENSE+11 gz）；总量 -3.0%（index.css -29%，lib2 +6.59% 唯一回退项已登记）；构建 18s+→3.2s、可重复构建 SHA-256 一致、回滚链实跑通过；NODE_ENV 警告归零、ErrorBoundary 补 rspack css chunk 文案匹配。**主 Agent 浏览器全功能冒烟（UI_VERIFIED，生产模式）**：登录/分组/接口详情/编辑Tab(json-schema编辑器)/运行Tab(CodeMirror)/动态diff弹窗/懒加载路由三连/深色皮肤截图全部正常；server/app.js 与 .gz 消费逻辑零改动。依赖 +3 devDeps、lock 零漂移、audit 23 持平。遗留登记：sass slash-div 存量警告 2 条（Dart Sass 2.0 前需修）、适配器键序白名单阶段三需同步演进（已注释）。门禁（三方独立复跑 + UI 实测）：build 0 error、lint 0/0、typecheck 0 错、**npm test 701** 全绿冷库、audit:ci 23 持平 |

| Rsbuild 阶段二：dev 链路替换（commit 本次） | dev-client 走手工 http 服务器 + webpack-dev-middleware + webpack-hot-middleware（176 行 build/webpack-dev-standalone.js） | `dev-client` 切换为 Rsbuild dev server（build/rsbuild-dev.mjs 编排 + rsbuild-dev-server.js 语义平移层 + rsbuild-dev.html 模板化 HTML）；`dev-client:webpack` 回滚链保留；新增 17 个测试用例（dev server 13 + config 守护 4） | 语义逐项平移并实测：/api 反代（502 JSON 含 headersSent 分支）、/iconfont /image 静态 + CORS、SPA 回退（复用旧链 isHtmlFallbackCandidate 单一事实来源，关闭 Rsbuild 内置回退避免 dot 规则吞资源 404）、HMR（React Fast Refresh，能力超集）、生产链路零污染（产物 SHA 与阶段一逐字节一致，runtime 双分支 loadConfig 逐键 diff 生产独有键为空集）。**流水线含一次 BLOCKED 打回**：dev 分支 tools 键覆盖顶层 tools.rspack 致五项改写静默失效——修复为顶层合并 + 新增 yapi:dev-html-tag-order 插件钉死 5 段注入顺序（manifest 最先）+ 4 用例双分支守护测试锁死本缺陷回归。行为偏离 7 项均 dev-only 且无功能损害（HMR 端点/404 文案/favicon 204/dev gzip/defer script 等，评审逐项核可）。已知边界：冲突检测 WS 新旧链均不代理（旧链即如此，客户端有轮询兜底）。门禁（三方独立复跑 + UI 实测）：lint 0/0、typecheck 0 错、**npm test 718** 全绿冷库、audit:ci 23 持平 |

| Rsbuild 阶段三：分包策略交还工具（commit 本次） | rsbuild 保留 lib/lib2/lib3 手工 dependOn vendor 链（产物对齐期），assets.js 固定键序白名单（新键静默忽略），index.html 硬编码 5 段 script | entry 仅剩 index；分包交工具（顶层 `splitChunks: { preset: 'default' }`——计划原述 performance.chunkSplit 在 Rsbuild 2.2.8 已 deprecated，接替 API 等价替换）；适配器动态枚举（键序约定+新键字典序追加+三路硬校验抛错）+ 新增 `window.WEBPACK_INITIAL_CHUNKS`；index.html 数据驱动注入（零字面量 chunk 键，document.write 同步语义经论证保留是正确取舍）；dev 链路同步（钉序插件删除，html-rspack-plugin 单入口自动注入） | **首屏请求 7→5、gz 传输 -8.27%**（独立核算 1,944,189→1,783,302B）、全量 -4.8%/-6.0%；长期缓存粒度改善（app 变更只失效 40KB gz，vendor 变更只失效 p chunk——旧版 1.5MB 混装整体失效）；适配器硬校验 4 场景实测抛错；连续构建 SHA 一致；单字母 chunk 名（p/i/l/q）为 rspack 确定性 id 派生、功能无影响。**回滚链语义变化已 3 处落档**：新 index.html 依赖 WEBPACK_INITIAL_CHUNKS，部分回滚构建脚本不回退 index.html 会白屏（整 commit revert 原子，评审接受）。主 Agent 浏览器冒烟 8/8（登录/详情/编辑/运行/diff 弹窗/懒路由/深路由直开）。遗留登记至阶段四：适配器同名 chunk 静默覆盖防御、extractInitialChunkFiles 抛错路径测试、index.html 缺 WEBPACK_ASSETS 时无诊断告警、assets.js cache-bust Math.random() 残留。门禁（三方独立复跑 + UI 实测）：build 0 error、lint 0/0、typecheck 0 错、**npm test 724** 全绿冷库、audit:ci 23 持平 |

| Rsbuild 阶段四：webpack 依赖清理（commit 本次） | webpack 系 13 个 devDeps + 3 个回滚脚本仅服务于已退役的回滚链；style-loader@0.18 链携带最后 1 个 audit critical（loader-utils） | 删除 13 个 webpack 系 devDeps（逐项消费方 grep 证据）+ 3 个回滚脚本 + 4 个 build 旧文件；engines 收紧 `>=20.11`；登记小项全闭环：collectChunks 同名冲突防御、extractInitialChunkFiles 迁移导出+3 测试、index.html 缺 WEBPACK_ASSETS 诊断、cache-bust 移除、Loading.scss slash-div→math.div（产物 1803B 逐字节一致+警告归零）、config 陈旧注释清理；**主 Agent 补充 server/app.js 缓存修复**：assets.js（URL 固定内容随部署变）从 /prd 无差别 max-age=8640000000 中豁免为 no-cache——消除「部署后回访用户拿过期清单白屏」风险，实测三种缓存头各自正确（assets.js no-cache/hash chunk 长缓存/index max-age=0） | **audit 23→18：critical 清零**（1→0）、high 14→13、moderate 8→5，基线已下调 audit:ci 通过；产物 34 文件 SHA-256 与阶段三逐字节一致（清理零产物漂移，math.div 等价实证）；测试 724−9+7=722 闭合、冷库全绿；保留项（empty-module/loader/clientPluginModule/paths/clientBuildConfig/@babel 系/sass）逐一 node 加载验证。回滚点语义变化已落档：本批后回滚=git revert 本批之前提交（需连同 static/index.html）。dev 代理透传保真度移交 @rsbuild/core 内置 proxy（库维护），502 语义由 2 用例守护。遗留：paths.js/global.d.ts 注释指向已删文件（纯注释）；clientBuildConfig.js 因 rsbuild.config require 存活而保留（计划猜测不成立，证据驱动偏离）。门禁（三方独立复跑 + UI 实测）：build 0 error、lint 0/0、typecheck 0 错、**npm test 722** 全绿冷库 |

| exts 插件 7 类组件 Hooks 化（commit 本次） | exts/ 插件层最后 7 个 React 类组件：MockCol 280、wikiPage/index 271（WebSocket 协同）、statistics index 223、AdvMock 159、StatisChart 81、Services 76、Editor 61 | 全部迁移为函数组件 + Hooks（AdvMock 导出由 withRouter 包装改裸组件 + useParams，与 client 侧范式一致）；新增 test/exts/ 测试基建（setup.js 共享桩：别名/axios 可编程桩/编辑器桩/FakeWebSocket）+ 8 用例，后补 Services 2 例 + WikiEditor 3 例 + AdvMock 读取时机断言（共 13 用例） | **exts 插件代码层现代化完成**（类型化 + Hooks 化双达成）。渲染等价独立重做 14/14 场景逐字节一致（含 ws 收发/action 副作用对比）；3 项 bug-for-bug 遗留行为逐项 HEAD 实证钉住未修复（AdvMock mockEditor 读取时机、wiki endWebSocket TypeError 静默吞、statistics interfactCaseCount 拼写遗留）；2 项已知缺陷保持（MockCol saveFormRef 未定义、CaseDesModal 收 open 非 visible）。**主 Agent 浏览器实测（UI_VERIFIED）**：高级Mock Tab（AdvMock+MockCol 面板）、statistics 页、wiki 页真实环境全部正常。挂载期独立 GET 顺序差异为 cWM→useEffect 固有语义（良性）。门禁（三方独立复跑 + UI 实测）：lint 0/0、typecheck 0 错、**npm test 735** 全绿冷库 |

| json-schema-faker 0.6 升级评估（commit 本次） | json-schema-faker 0.5.9（依赖升级批选定的稳定线） | **评估结论：暂不升级，维持 0.5.9**。0.6.3（官方 latest，2026-08，零运行时依赖）为 ESM-only（exports 无 CJS 条件），`require('json-schema-faker')` 直接 ERR_PACKAGE_PATH_NOT_EXPORTED——项目的 commons.js/sandbox 链为 CJS（含 rewire 测试链），改造成动态 import 属重构范畴 | 实测记录：升 0.6.3 后 mockServer/sandbox/commons 测试即现加载断裂；回退 0.5.9 后 735 全绿、audit:ci 通过（0.5.9 本就无 advisory）。后续触发条件：服务端/沙箱链迁 ESM 时一并升级。门禁：lint 0/0、typecheck 0、**npm test 735** 全绿 |

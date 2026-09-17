# 技术债台账（TECH_DEBT）

> 2026-09 技术债清理行动的滚动台账：记录已完成项、评估后暂缓项及其理由、后续推进的具体路径。
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

## 二、评估后暂缓（含推进路径）

### 1. 构建工具 Webpack5 → Vite/Rsbuild（暂缓，工作量数天级）

- 现状风险：`build/webpack.standalone.config.js` 手工维护 lib/lib2/lib3 dependOn 链 + `static/index.html` 用 `document.write` 注入 5 段 script（阻断预解析）；dev 走 webpack-dev-middleware 挂在 Koa 内。
- 推进路径（建议独立分支分四步）：
  1. 引 Rsbuild 替代生产构建，产物文件名/`assets.js` 清单格式对齐，`static/index.html` 改模板注入（同时消除 document.write）；
  2. dev 链路替换 webpack-dev-middleware/HMR；
  3. 分包策略交给工具（删手工 dependOn 链），验证 `assets.js` 消费方（`server/app.js` 的 gzip 逻辑）；
  4. 观察期后删除 webpack 相关依赖与 build/ 旧脚本。
- 暂缓理由：构建迁移无法靠测试套件充分验证（需全功能回归），本会话以浏览器冒烟覆盖不到该风险面。

### 2. 剩余 61 个 Class 组件 → Hooks（持续进行）

- 模板已建立（GuideBtns/Breadcrumb）。优先顺序建议：叶子组件（TimeLine、ProjectCard 等）→ 容器组件（配合状态层选型）。
- 迁移中顺带清理 `core-decorators` 的 `@autobind`（改箭头函数属性）与 `@connect`（改 hooks）。

### 3. TypeScript 健全化（持续进行）

- 现状：`tsconfig.json` 按文件白名单 + `allowJs/checkJs`。已全量绿。
- 推进路径：新文件一律 `.ts/.tsx`；每次触碰旧文件顺手纳入 include 并清零其类型错误；优先 server/utils、common（前后端共享 DTO）。

### 4. 状态管理 Redux+redux-promise → 轻量方案（暂缓）

- 建议：迭代到对应 reducer 模块时以 Zustand（或 RTK）重写该模块，不整体大爆炸迁移。`redux-promise` 停更，但当前 15 个 reducer 模块均为薄封装，风险可控。

### 5. 文档系统 ydoc → VitePress（暂缓，低优先）

- `docs/` 为独立产物，不影响运行时；ydoc 在高版本 Node 下的兼容问题未阻塞开发。

## 三、遗留观察项（MINOR，不阻塞）

- 测试覆盖仍有空白（评审实测存活变异点）：`mockEditor` 的 `wordList` 与 F9 全屏交互、`fullScreen` 选项；`jsdom-setup` 未注入 `XMLHttpRequest`，故 axios 在测试中走 Node http adapter，**未来渲染未 stub axios 的组件会真实联网**（建议基建默认禁网或注入 XHR）。
- `MarkdownEditor` 的 `value` 为「仅初始值」语义（已由测试钉死，依据调用方 `InterfaceContent.js:173-174` 的 `key={actionId}` 重挂载）。但 **wiki 插件调用方**（`exts/yapi-plugin-wiki/wikiPage/Editor.js:32` 的 `value={desc}`）存在挂载后 prop 变更路径（websocket 冲突消息、上传后写 desc），这些场景编辑区不跟随更新，需浏览器验证后决定是否补 prop 同步。
- `test/server/httpApp.test.js` 既有 flake：人为 CPU 争抢下偶发 mongoose `MongoClientClosedError`（其 `after.always` 200ms 宽限不足），与本轮改动无关，建议单独修复。
- 新增测试文件存在超 100 列行（约 11 行/文件，高于既有测试基线），仓库无 format 门禁；修正时**勿**运行 `prettier --write`（会把 `function(` 改成 `function (`，与仓库主流风格相反）。
- lint 脚本范围尚未包含 `test/`：test/server/userManage.test.js 等存在 4 个基线 unused-vars，修复后应把 test/ 纳入 lint 门禁范围。
- pre-commit 无 ErrorBoundary：React.lazy 异步 chunk 下载失败（网络抖动/发版后旧 hash 失效）会整树卸载白屏，应用根补 ErrorBoundary 并做 chunk 重载兜底。
- `mockEditor.js` 模块级 wordList 多实例累积重复项 —— 忠实移植的既有瑕疵。
- 历史接口无 `markdown` 字段时，编辑页备注以 HTML 原文形态呈现，重新保存后完成迁移（设计取舍）。
- 动画库 `rc-queue-anim`/`rc-scroll-anim`/`rc-tween-one`（停更）—— 未列入本轮范围，建议随组件 Hooks 化顺带替换为 CSS/Framer Motion。
- `json-schema-editor-visual@1.0.23`（内嵌 antd3 样式 + brace 传递依赖）—— 替换需自定义 JSON Schema 编辑器，工作量单独评估。
- 登录路径 scryptSync 同步阻塞约几十毫秒；`verifyPassword` 尊重 storedHash 自述参数但受 Node maxmem 兜底 —— 观察即可。
- old 兼容：`add`/`resetPassword` 生成 legacy 密码格式（首次登录自动升级）—— 如后续可改既有测试，可一并 scrypt 化。
- 沙箱进程池边界收窄观察项：常驻 Worker 下恶意脚本可篡改注入的 assert/Random 模块对象（影响同 Worker 后续任务直至 1000 次轮换）；任务队列无背压上限；context 不可序列化时误判为崩溃换 Worker —— 均为低风险设计取舍，知悉即可。

## 四、验证基线

- Node：`.nvmrc` 24.21.0（engines `>=18 <25`）。
- 门禁：`npm run lint`（0 error 0 warning，pre-commit 卡点）、`npm test`（**416**）、`npm run typecheck`（0 错）、`npm run build-client`（0 error）。
- 浏览器冒烟（本轮）：注册/登录（scrypt + legacy 自动升级）、接口编辑页编辑器、用例表格拖拽持久化、Markdown 双写、Wiki 编辑器、面包屑、路由分包按需加载，全部通过。

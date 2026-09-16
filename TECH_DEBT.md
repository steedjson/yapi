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

### 第三阶段：架构升级切片（按"逐步推进"策略，本轮为首个切片）

- Class→Hooks 迁移切片：`GuideBtns.js`（connect→useDispatch）、`Breadcrumb.js`（connect+withRouter→useSelector，移除不必要的 withRouter 包装）。已浏览器实测面包屑随路由更新、零运行时错误。其余 61 个类组件按此模板随业务迭代逐个迁移。

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

- `server/utils/commons.js:11` 未使用 `followModel`、`:336` no-useless-catch —— 既有 eslint error（HEAD 比对确认非本轮引入）。
- `exts/yapi-plugin-wiki/wikiModel.js:1` eslint 未使用变量 —— 既有。
- `mockEditor.js` 模块级 wordList 多实例累积重复项 —— 忠实移植的既有瑕疵。
- 历史接口无 `markdown` 字段时，编辑页备注以 HTML 原文形态呈现，重新保存后完成迁移（设计取舍）。
- 动画库 `rc-queue-anim`/`rc-scroll-anim`/`rc-tween-one`（停更）—— 未列入本轮范围，建议随组件 Hooks 化顺带替换为 CSS/Framer Motion。
- `json-schema-editor-visual@1.0.23`（内嵌 antd3 样式 + brace 传递依赖）—— 替换需自定义 JSON Schema 编辑器，工作量单独评估。
- 登录路径 scryptSync 同步阻塞约几十毫秒；`verifyPassword` 尊重 storedHash 自述参数但受 Node maxmem 兜底 —— 观察即可。
- old 兼容：`add`/`resetPassword` 生成 legacy 密码格式（首次登录自动升级）—— 如后续可改既有测试，可一并 scrypt 化。

## 四、验证基线

- Node：`.nvmrc` 24.21.0（engines `>=18 <25`）。
- 门禁：`npm test`（378）、`npm run typecheck`（0 错）、`npm run build-client`（0 error）。
- 浏览器冒烟（本轮）：注册/登录（scrypt + legacy 自动升级）、接口编辑页编辑器、用例表格拖拽持久化、Markdown 双写、Wiki 编辑器、面包屑，全部通过。

# Rsbuild 迁移立项计划（Webpack5 → Rsbuild）

> 立项日期：2026-09-20。状态：**四阶段全部完成**（阶段一 c9cbb369 / 阶段二 8068d615 / 阶段三 9a448877 / 阶段四 83da75e6，均走完整「实施→测试→验收」流水线）。本计划正文保留立项时口径，各阶段实施结果与偏差见对应小节。

## 0. 现状事实（已核查，2026-09-20）

| 事实 | 位置 | 迁移影响 |
| --- | --- | --- |
| 产物清单 `static/prd/assets.js` 仅**浏览器端**消费：`static/index.html` 用 `document.write` 注入并读 `window.WEBPACK_ASSETS['index.js'].css` | static/index.html:21-26 | 只需保证清单形状或改模板注入；无服务端契约 |
| 服务端不做清单消费：`server/app.js` 仅做静态服务 + 预压缩 `.gz` 路径改写（含 Content-Type 修正） | server/app.js:60-72 | 产物需继续生成 `.gz` 配对文件（Rsbuild 可用插件或构建后脚本补） |
| 手工分包：entry `lib ← lib2 ← lib3 ← index` dependOn 链 + `project/user/follows/add-project` 四个懒加载入口 | build/webpack.standalone.config.js:40-75 | Rsbuild 用 `splitChunks`/`codeSplitting` 自动分包，删除手工链 |
| 文件名契约：生产 `[name]@[contenthash].js`、开发 `[name]@dev.js`；CSS 同名 `.css` | 同上 :76-78 | 保持 `[name]@[contenthash]` 命名模板，减少下游感知 |
| dev 链路：webpack-dev-middleware 挂在 Koa 内 | server/app.js dev 分支 | 阶段 2 单独替换 |
| scss 全局样式 + CSS 内联图片（`[path][name][ext]`） | 同上 :144 | Rsbuild 内置 sass 支持；静态资源规则对齐 |
| DefinePlugin 冲突警告 34 条（遗留） | 构建日志 | 迁移时清理 `process.env.NODE_ENV` 双重定义 |

## 1. 阶段一：生产构建切换（核心交付，可独立合并）

**目标**：`npm run build-client` 由 Rsbuild 执行，产物落 `static/prd/`，`npm start` 可正常运行。

1. 引入 `@rsbuild/core`（devDependencies），新增 `rsbuild.config.mjs`：
   - `source.entry`：`index` + `project/user/follows/add-project`（先保留 lib 手工分包的对齐产物也可——第一阶段**以产物对齐为优先**，不急着删 dependOn，见阶段三）；
   - `output.filename`：`[name]@[contenthash]`；`output.assetsRetry`/`html` 关闭（index.html 不由构建器生成，保持手写模板）；
   - 产物清单：Rsbuild 原生产出 `dist/` 清单 JSON，需要**适配器脚本**转译为 `window.WEBPACK_ASSETS` 兼容形状的 `assets.js`（沿用现有键：`{[name]: {js, css}}`，并保留 `.gz` 生成步骤——现有构建脚本里查 gzip 生成位置并平移）；
   - `static/index.html`：`document.write` 改为静态 `<script src="/prd/assets.js">`（去掉 Math.random cache-bust，`assets.js` 内容本身含 hash 文件名）+ 直接内联 index 入口的 CSS link（由适配器脚本渲染生成 index.html 或保留运行时读 WEBPACK_ASSETS）。
2. 兼容性清单（逐一核对 rsbuild 对现有 webpack 配置点的等价物）：
   - alias：`client` → `client/`；`common` → 仓库根 `common/`；
   - babel 配置继承现有 `.babelrc.js`（React/ESM 转译目标）；`@babel/register` 的服务端路径不受影响；
   - `webpackChunkName` 注释：Rsbuild 不识别——懒加载 chunk 名会变（仅影响文件名美观，不影响功能），台账记录；
   - ErrorBoundary 的 ChunkLoadError 检测文案（client/components/ErrorBoundary）——Rsbuild 的加载失败报错文案不同，需补充匹配规则；
   - `process.env.NODE_ENV` 双重定义清理。
3. 验证矩阵（每项必过）：
   - `npm run build-client` 0 error；产物 chunk 数量/大小与 webpack 版本对比表（允许合理差异，逐条解释）；
   - `assets.js` 形状 diff（旧 vs 新适配器输出）；.gz 配对完整（实测 11 份）；
   - `npm start` 起服务：浏览器全功能冒烟（登录/项目/接口 CRUD/运行 Tab/动态 diff/导出下载）；
   - `npm test` 全量绿 + `npm run audit:ci` 不新增。
4. 回滚预案：`build:client` 脚本切换保留旧 webpack 脚本为 `build:client:webpack`，一个 commit 可回退。
   （阶段三后约束：新 index.html 依赖 `WEBPACK_INITIAL_CHUNKS`，旧链 assets.js 无该全局——
    部分回滚构建脚本而不回退 index.html 会白屏；整 commit revert 则天然原子。）

## 2. 阶段二：dev 链路替换

> **阶段一实施结果（2026-09-20，已合并）**：产物拓扑与 webpack 完全一致（11 js + 6 css + 5 LICENSE + 11 gz，33 文件）；总量 15.40MB → 14.94MB（-3.0%，gz -2.2%）；index.css -29%/project.css -25%（LightningCSS 压缩）；**lib2 +6.59%**（codemirror 系，swc helper 与 jsx-runtime 注入形态，唯一回退项）；构建 18s+ → 3.2s；rspack contenthash 实际 16 位 hex（模板 [contenthash:20] 受 digest 熵上限，内部文件名无消费方依赖）；NODE_ENV 双重定义 34 条警告归零；sass slash-div 弃用警告 2 条为存量债（Loading.scss:22，Dart Sass 2.0 前需修）。依赖 +3 devDeps（@rsbuild/core/plugin-babel/plugin-sass），lock 零漂移。

- 用 Rsbuild dev server（自带 HMR）替代 `webpack-dev-middleware` 挂载；`server/app.js` dev 分支删除挂载逻辑，`npm run dev-client` 改指 Rsbuild；
- `/api` 代理配置平移（proxy 到后端端口）；验证 HMR、懒加载分包在 dev 下的行为、移动端适配代理（历史 commit 151f92dd 的 `/api` proxy + SPA 回退语义）。

## 3. 阶段三：分包策略交还工具

- 删 `lib/lib2/lib3` 手工 entry 与 dependOn 链，改 Rsbuild 分包（计划原述 `performance.chunkSplit`；实施时该 API 在 Rsbuild 2.2.8 已 deprecated，经批准改用其接替 API 顶层 `splitChunks: { preset: 'default' }`，语义等价）；
- 对比首屏加载的请求数/传输体积（webpack 3-chunk 基线 vs 自动分包），若明显回退则微调 strategy 参数；
- 删除 dependOn 相关注释与配置。

## 4. 阶段四：清理

- 移除 webpack/webpack-dev-middleware/style-loader@0.18（**顺带消除最后 1 个 critical：loader-utils 链**）及相关 build 脚本；
- `npm run audit` 复测预期降至 22 项以内；audit-baseline.json 下调；
- 观察期一个迭代后移除回滚脚本。
- engines 选型：`>=20.11`（`import.meta.dirname` 需 Node ≥20.11；babel-loader@10 引擎约束 `^20.10 || >=22`；.nvmrc 钉 24.21.0 满足）。

## 5. 风险登记

| 风险 | 缓解 |
| --- | --- |
| Rsbuild 与 `@babel/register` 的服务端转译无冲突（服务端不走构建器） | 无冲突面，确认即可 |
| `json-schema-editor-visual` 等 antd3 遗留包的样式处理差异 | 阶段一产物对比时重点看 css 体积与选择器 |
| `ws`/`webpack` dev HMR 行为差异 | 阶段二独立验证 |
| 无法靠 npm test 验证构建正确性 | 阶段一验证矩阵强制浏览器全功能冒烟（主 Agent 亲自执行） |

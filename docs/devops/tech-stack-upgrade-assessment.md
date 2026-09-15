# 技术栈平缓升级评估与落地计划（批次五）

> 基准：分支 `codex/refactor-foundation`，HEAD `d59d9c28`（2026 年 9 月 15 日），Node 24.21.0，
> 全量测试基线 298 passed / 0 failed，`tsc --noEmit` 0 错误，`build-client` 退出码 0。
> 目标版本号为 2026-09-15 经 `npm view`（registry.npmmirror.com）实测钉死；执行各阶段时须重新核实。

## 一、前提与既有成果核对

前四批次（refactor-plan.md）已完成：业务稳定性/性能、Node 24.21.0 LTS + MongoDB 8.0、
YKit 移除 + Webpack 4.47、TypeScript 7.0.2 opt-in 检查（227 文件）。Phase 16 矩阵的 S1 阶段与
Babel 7 迁移已由后续提交完成：

| 已完成项 | 证据（提交号 / 实测） |
|---|---|
| antd 3.2.2 → 3.26.20（S1） | `node -p "require('antd/package.json').version"` = 3.26.20 |
| react / react-dom 16.2 → 16.14.0（S1） | 同上 = 16.14.0 |
| Babel 6 → 7 全量迁移 | `@babel/core` 7.28.4 + babel-loader 8.4.1 + babel.config.js 单一来源；旧 loaderContext shim 已随 `877f001c` 删除 |
| react-redux 5 → 7.2.9 | `c3060555` |
| react-router(-dom) 4.2.2 → 5.3.4 | 同上 |
| @ant-design/icons 4.8.1 引入 | 30 个 client 文件 + 5 个 exts 文件已迁移，`client/constants/v4IconMap.js` 映射表在位 |
| 生命周期 UNSAFE_ 前缀 | `70190ce9` |
| AVA 6.4.1 + babel7 测试管线统一 | `877f001c`，ava.config.cjs + @babel/register |
| 测试基线 298 passed | `npm test`（Node 24.21.0） |
| node-sass 已被 dart-sass 替代；ykit/anujs 已清零 | Phase 8/12；`rg anujs client` 无命中 |

## 二、当前基线清单（实装版本，可复跑）

```bash
node -p "require('./node_modules/<pkg>/package.json').version"
```

**服务端**：koa **2.0.0**（2017 年版本）、koa-websocket 4.0.0、koa-router 7.4.0、koa-body 2.5.0 /
koa-bodyparser 3.2.0 / koa-multer 1.0.2（三者并存）、koa-static 3.0.0 / koa-send 3.2.0、
mongoose **6.13.11**、mongoose-auto-increment 5.0.1（vendored 适配层）、jsonwebtoken 9.0.2、
nodemailer **4.0.1**、ldapjs **1.0.2**、node-schedule 1.3.2、axios 1.20.0、underscore 1.8.3。

**客户端**：react / react-dom 16.14.0、antd 3.26.20、react-redux 7.2.9、redux 3.7.2、
redux-promise 0.5.3、react-router(-dom) 5.3.4、react-dnd 2.5.4（仅 InterfaceColContent 1 文件）、
recharts 1.0.0-beta.10（仅 statistics 插件）、immer 1.1.1（3 文件）、moment 2.30.1（仅 client/common.js）、
brace 0.10.0、mockjs 1.0.1-beta3、json5 0.5.1、qs 6.7.0、reactabular 8.12 + table-resolver 3.2。

**工具链**：webpack 4.47.0 / webpack-cli 3.3.12、webpack-dev-middleware 3.7.3、
mini-css-extract-plugin 0.9.0、compression-webpack-plugin 1.1.12、assets-webpack-plugin 3.9、
css-loader 0.28.10 / style-loader 0.18.2、less 2.7.3 / less-loader 4.0.6、sass 1.22.10 /
sass-loader 7.2.0、eslint 3.19.0 + babel-eslint 7.2.3（Babel6 系 parser 残留）、**prettier 未安装**
（.prettierrc.js 死配置）、nodemon 1.17.1、typescript 7.0.2、ava 6.4.1。

**依赖卫生**：幽灵依赖 `mime`（server/app.js:18）与 `extend`（mongoose-auto-increment.js:3）未声明被
引用；疑似僵尸依赖 `os`/`deep-extend`/`moox`/`tslib@1.8`/`koa-send`/`koa-multer`/`eslint-loader`/
`copy-webpack-plugin`/`string-replace-webpack-plugin`（P0 逐个 rg 核实后裁剪）；`.npmrc` 含
`legacy-peer-deps=true`（会掩蔽 peer 冲突）；无 CI 配置；无 Dockerfile。

**exts/ 插件**：12 个内置插件（无独立 package.json，依赖随根），16 文件 import antd，5 文件已迁
@ant-design/icons；getFieldDecorator 现存 90 行（client 75 + exts 15）、Form.create 15 处。

## 三、升级矩阵（当前 → 目标；目标版本 2026-09-15 npm view 钉死）

| 维度 | 当前 | 本轮目标 | 兼容性 | 工作量 | 风险 | 阶段 |
|---|---|---|---|---|---|---|
| koa | 2.0.0 | 2.16.4（koa@2 线内最新） | 同 2.x 大版本内无破坏 | 小 | 低 | P1 |
| koa-websocket | 4.0.0 | 保持（koa@3 观察项） | koa@3 兼容未验证 | — | — | 观察 |
| koa-body/bodyparser/multer | 2.5/3.2/1.0 | 合并决策（koa-body@6 或保留 bodyparser） | 上传路径必须回归 | 中 | 中 | P1 |
| koa-static/send | 3.0/3.2 | 5.x | 无破坏 | 小 | 低 | P1 |
| nodemailer | 4.0.1 | 10.0.10（engines node≥20 ✓） | createTransport/sendMail API 稳定 | 小 | 低 | P1 |
| ldapjs | 1.0.2 | 3.0.7 | client API promise 化适配 | 中 | 中 | P1 |
| node-schedule | 1.3.2 | 2.1.1 | scheduleJob 签名不变 | 小 | 低 | P1 |
| mongoose | 6.13.11 | 8.24.4（9.10.0 列观察） | remove/count 回调等移除 | 中 | 中高 | P2 |
| mongoose-auto-increment | vendored | 适配 mongoose 8 | 自增 ID 关键路径 | 中 | 中高 | P2 |
| antd | 3.26.20 | 4.24.16（P3）→ 5.29.3（P6）；6.6.4 观察 | Form/TabPane/LocaleProvider/主题体系 | 大 | 高 | P3/P6 |
| react/react-dom | 16.14.0 | 18.3.1（19.3.0 观察） | createRoot、并发批处理 | 中 | 中 | P5 |
| react-redux | 7.2.9 | 8.1.3（9.3.0 随 React19 评估） | connect API 不变 | 小 | 低 | P5 |
| redux | 3.7.2 | 4.x（5.x 观察：ESM/CJS） | legacy createStore 保留 | 小 | 低 | P5 |
| redux-promise | 0.5.3 | 兼容验证，不兼容自研替代 | 中间件签名 | 小 | 中 | P5 |
| react-dnd | 2.5.4 | React18 验证→失败则 16 或移除 | legacy context | 中 | 中 | P5/P7 |
| recharts | 1.0.0-beta.10 | 2.15.4 | statistics 图表 | 中 | 低 | P7 |
| moment | 2.30.1 | dayjs 1.11.23 | antd5 前置 | 小 | 低 | P6 |
| immer | 1.1.1 | 10.2.0（11 观察） | produce API 不变 | 小 | 低 | P7 |
| react-router(-dom) | 5.3.4 | 6.30.6（7/8 观察） | Switch/useHistory/withRouter | 中 | 中 | P7 |
| webpack | 4.47.0 | 5.111.0 | dev-middleware/loader 链/fallback | 大 | 中 | P4 |
| css/style/less/less-loader/sass-loader | 0.28/0.18/2.7/4/7 | 7.x/3.x/4.9/13/17 | 语义变化逐项验证 | 中 | 中 | P3/P4 |
| mini-css-extract-plugin | 0.9.0 | 2.10.2（filename 函数→删 ThemeCssFixedNamePlugin） | 输出名对齐 assets.js | 中 | 中 | P4 |
| compression-webpack-plugin | 1.1.12 | 12.0.0 | 新 options 格式 | 小 | 低 | P4 |
| eslint + babel-eslint | 3.19 + 7.2.3 | eslint 9.x + @babel/eslint-parser | flat config | 中 | 低 | P7 |
| prettier | 未安装 | 3.9.6（仅增量使用） | 无 | 小 | 低 | P0 |
| nodemon | 1.17.1 | 3.1.14 | 配置兼容 | 小 | 低 | P7 |
| underscore | 1.8.3 | 原生/lodash 评估 | 21+8 文件机械替换 | 中 | 低 | P7 评估 |
| brace / tui-editor / mockEditor | 0.10 | **保留不升级**（编辑器核心，替换风险远大于收益） | — | — | — | 不动 |
| jsonwebtoken | 9.0.2 | ✓ 已最新 | — | — | — | — |
| Node / MongoDB | 24.21.0 / 8.0 | ✓ 已就绪 | — | — | — | — |

**替代技术栈专项结论**：
- **构建**：Webpack 5 为主线（保留 7 entry/皮肤固定名/assets.js 机制，仅平移）；Rspack 生态兼容且
  速度数倍但自定义插件兼容需专项验证，列观察项；Vite 需重写 4000 端口 dev 管线与多 entry 拆分，
  改动面最大，不采纳。
- **mongoose**：8.24.4 为本轮目标（9.10.0 已发布但过新，观察一季）；peer 无 react 耦合，
  MongoDB 8.0 服务端就绪。
- **antd 5 / React 19**：antd 5.29.3 peer `react >=16.9.0`（已实测核实）→ 与 React 18.3 组合合法；
  React 19 需 `@ant-design/v5-patch-for-react-19`，列 P7 评估。

## 四、分期落地计划

> 顺序强约束 P0→P1→…→P7。每阶段：独立提交可回滚、门禁全绿、P2/P3/P4/P6 后留 3-5 天观察期。
> 通用门禁：`npx tsc --noEmit` 0 错误（Node 24.21.0）+ `npm test` 298+ passed + `npm run build-client`
> 退出码 0 + 浏览器五页（登录/项目列表/分类树/接口编辑/导入弹窗）+ 三皮肤 + 拖拽排序 + 插件抽查
> （advanced-mock、statistics、wiki、import）。触及客户端时 static/prd 产物按惯例独立提交。

### P0 清障与基线固化（1 人日，4 个独立提交）
1. 幽灵依赖显式化：mime@1.6、extend@3 入 dependencies（mime 升 2.x 改 API 列 P7）；僵尸依赖
   逐个 rg 核实后裁剪（os/deep-extend/moox/tslib@1.8/eslint-loader/string-replace-webpack-plugin/
   copy-webpack-plugin/koa-send/koa-multer 中确认未用者）；
2. 安装 prettier@3.9.6——仅增量使用，**严禁全仓 reformat**；
3. 最小 CI：.github/workflows/test.yml（Node 24 + npm ci + typecheck + test）；
4. `npm audit` 基线记录入本文档；engines 校对；legacy-peer-deps 现状记录。
门禁同通用；不触及客户端产物。

### P1 服务端栈升级（2-4 人日，每步独立提交）
1. koa 2.0.0 → 2.16.4；koa-static/koa-send → 5.x；koa-websocket 兼容验证（ws 路由冒烟）；
2. body 解析合并：先 `rg` 三包实际分工再定 koa-body@6 合并或保留 bodyparser；**头像上传**
   （upload_avatar，koa-multer 路径）必须实测；
3. nodemailer 4 → 10：`transporter.verify()` 冒烟 + 注册验证码路径；
4. ldapjs 1 → 3：client bind/search 适配；LDAP 关闭态回归（未启环境）+ 单测；
5. node-schedule 1 → 2：swagger-auto-sync 定时同步回归。

### P2 mongoose 6→8（2-3 人日）
破坏面（执行前 rg 确认）：`model.remove()`→deleteOne/deleteMany（storage.js del() 已知命中）、
`.count()`→countDocuments、findAndModify→findOneAndUpdate、`strictQuery` 显式化、
**vendored mongoose-auto-increment 适配**（接口自增 ID 关键路径，含 extend 处置）、连接死选项清理。
**验证关键**：298 测试全 mock 了 mongoose 不覆盖真实驱动——必须连 27018 容器真实端到端
（登录→建项目→建分类→建接口验证自增 ID→编辑→删除→列表分页）+ 全量单测。
回滚：锁文件还原（无 schema/数据迁移）。

### P3 antd 4 完成迁移（spike 1 人日 + 4-6 人日）
前置 Spike（阻塞）：独立分支验证 json-schema-editor-visual@1.0.23（接口编辑核心，vendored antd3）
在 antd4 可用性；不可用则 fork 入仓库打补丁（参照 v4IconMap 先例）。
迁移面：90 行 getFieldDecorator→Form（9 client + 2 exts 文件；类组件以 antd4 Form.create() HOC
平缓过渡，v5 前二次转 useForm 已计入 P6）；15 处 Form.create（含 2 装饰器）；TabPane 30→items；
LocaleProvider→ConfigProvider；less 2.7→3.13（antd4 下限，less4 留 P4）；
theme.less/baseline.less + 三套主题变量按 antd4 对照调整。
参考：antd4-codemod-dryrun.md（18 个装饰器+export 同行文件需手工）。

### P4 webpack 4→5 + loader 链现代化（3-5 人日）
webpack 5.111 + webpack-cli 5；webpack-dev-middleware 3.7→6 + hot-middleware 最新（4000 端口
管线整体升级）；css-loader 0.28→7 / less-loader 4→11 + less 3.13→4.x（验证 antd4 兼容）/
sass-loader 7→17；MCEP 0.9→2.10（filename 函数→ThemeCssFixedNamePlugin 简化删除）；
compression-webpack-plugin 1.1→12（新 options）；`resolve.fallback` 显式化（url/os npm shim）；
assets-webpack-plugin 3→7 或自研 emit；**static/index.html 与 dev.html 产物命名/加载顺序同步**；
terser 最新（parallel:false 规避项重测）。

### P5 React 18.3 + 依赖链（2-3 人日）
redux 3.7→4.x（5.x 列观察：ESM/CJS）；**redux-promise 0.5.3 兼容验证**（不兼容则以 20 行自研
中间件替代）；react-redux 7→8.1.3（connect 装饰器 API 不变，51 处零改动）；
react/react-dom→18.3.1（createRoot 仅 client/index.js + Application.js 2 处）。
已知风险预案：react-dnd 2.5（InterfaceColContent 用例拖拽，legacy context）React 18 兼容验证，
失败则该单文件迁移 react-dnd@16；recharts beta 异常则 pinned 至 P7。
回归重点：自动批处理行为变化（高频表单交互/连续拖拽）。

### P6 antd 5 + 皮肤系统重构（5-8 人日，最大 UI 阶段）
- antd 5.29.3：**三套预编译 less 主题（theme-gov/anime/dark entry + ThemeCssFixedNamePlugin）
  整体失效，重构为 ConfigProvider theme token 包**——gov/anime 映射 token
  （colorPrimary/borderRadius/colorBgLayout 等），dark 用 theme.algorithm 暗色算法（增强现有
  半成品）；页面层 skins.scss CSS 变量机制保留；webpack entries 收缩回 index/lib/lib2/lib3，
  ThemeCssFixedNamePlugin 删除；
- dayjs 1.11 替换 moment（业务仅 client/common.js 1 文件；ContextReplacementPlugin 删除）；
- v5 Form 收尾：P3 若走 Form.create HOC 则转 useForm/函数组件；message/Modal 静态方法初期
  接受无主题上下文（133 处不全改）；
- 插件 16 个 antd 文件同步迁移；`message.warn` 等弃用别名清零。

### P7 现代化收尾（3-5 人日，可拆散穿插）
eslint 3→9 flat config + @babel/eslint-parser（peer 需 eslint≥7.5，故在此阶段）；
husky+commitlint 替换 ghooks/validate-commit-msg；react-router 5→6（withRouter 16 处/Switch/
Redirect 机械迁移；7.18/8.3 列评估）；immer 1→10；recharts 1beta→2；react-dnd 处置决策；
React 19 评估（@ant-design/v5-patch-for-react-19）；nodemon 1→3；mime 升 2.x；
underscore→原生/lodash 评估；redux 5 评估；mongoose 9 评估；antd 6 评估。

## 五、风险登记与全局约定

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 幽灵依赖（mime/extend）在 npm 重装后失效 | P0 显式声明 |
| 2 | vendored 三件套：json-schema-editor-visual、tui-editor、mongoose-auto-increment | P3 Spike 先行；P2 专项适配；tui-editor 本轮不动 |
| 3 | legacy-peer-deps=true 掩蔽 peer 冲突 | 每阶段结束临时移除验证真实依赖图 |
| 4 | 主题 CSS 后注入级联（皮肤系统） | P3/P6 皮肤切换链路完整重测 |
| 5 | 298 测试 mock 了 mongoose，不覆盖真实驱动 | P2 强制真实 DB 端到端 |
| 6 | npmmirror 镜像版本滞后 | 执行时点 `npm view` 重新核实 |
| 7 | 无 CI，门禁依赖手工 | P0 建最小 CI |

**总周期：23-36 人日有效工作，日历约 7-11 周（含 P2/P3/P4/P6 后各 3-5 天观察窗口）。**
每阶段完成后更新本文档状态表与 refactor-plan.md 批次五进度。

## 六、执行进度记录

| 阶段 | 状态 | 提交 | 备注 |
|---|---|---|---|
| 交付物 1 评估文档 + 批次五挂接 | ✅ | d05fa73b | 目标版本 npm view 实测钉死 |
| P0.1 幽灵依赖显式化 + 僵尸依赖裁剪 | ✅ | 5decfd01 | 移除 44 包；mime/extend 入 dependencies；测试基线 307 passed |
| P0.2 prettier 3.9.6 安装 | ✅ | 887e767b | 仅增量使用 |
| P0.3 最小 CI（typecheck + test） | ✅ | 472a7963 | .github/workflows/test.yml |
| P0.4 npm audit 基线 | ✅ | （记录于本节） | **174 漏洞（3 low / 60 moderate / 78 high / 33 critical）**，registry.npmjs.org 实测；各阶段结束复测对比 |
| P1 服务端栈升级 | ✅ | 2ee5038f / 00f40cc3 / 40a939af / c3c7a71a / 6e9065de | koa 2.16.4、koa-static 5、nodemailer 10、ldapjs 3（含 v3 适配与超时路径修复）、node-schedule 2；评审 PASS；遗留：真实 SMTP/LDAP 目录未测（环境受限） |
| P2 mongoose 6→8 | ✅ | 78a53a82 / d525db58 | mongoose 8.24.4 + driver 6.20；14 处插件模型 remove/update 适配（机械等价替换，主 Agent 批准的边界偏离）；真实 DB E2E 含自增 ID 递增证据；评审 PASS；观察项 mongoose 9.10 |
| P3 antd 4 完成 | ✅ | a5168c40 / 75b6b0ae / 9ca352a5 / a630d8ea / 8e6bf420 / 84e12582 | Spike 绿色（json-schema-editor-visual 嵌套 antd3 零改动，双实例共存）；14 文件 105 处 Form 迁移 useForm、TabPane→items、ConfigProvider、less 3.13.1 + less-loader 补丁；首轮评审 2P0+1P1 已修复并复验 PASS；浏览器回归：编辑表单/动态行/保存持久化/添加分类/登录真实提交/gov 皮肤渲染 |
| P4 webpack 5 | ✅ | d956daba / f529b1a1 / 0f51f771 | webpack 5.111 + 全套 loader/插件现代化；entry dependOn 链替代同名 cacheGroups（webpack5 强制）；ThemeCssFixedNamePlugin 删除（MCEP filename 函数）；less 4.9 + less-loader 13（补丁删除）；评审 PASS，4 项 P2 备忘 |
| P5 React 18.3 | ✅ | cc618b23 / 11d244a6 | react 18.3.1 + react-redux 8.1.3 + redux 4.2.1；createRoot 2 处；redux-promise 实测兼容保留；react-dnd 2.5.4 实测兼容保留（React19 前需迁）；顺带修复生产 CSS Content-Type 缺陷与测试进程退出码；E2E 五页 10/10；评审 PASS |
| P6 antd 5 + 皮肤重构 | ✅ | 0fc7914c / cb6def63 / 7fcbdde1 / 428a41a0 / 680a414a / a31e99e4 | antd 5.29.3 + icons 5.6.1；皮肤重构为 ConfigProvider token（gov/anime token 映射 + dark darkAlgorithm）+ StyleProvider hashPriority high 解决嵌套 antd3 CSS 级联冲突；dayjs 替换 moment；36 处 visible→open 等 v5 适配；评审 2P1（产物滞后/CI 提交授权）已处置；四皮肤浏览器截图核验 |
| P7 现代化收尾 | ✅（一项已知问题） | 74987006 / 11c1e005 / efae4a86 / ed811941 / ec939f15 | nodemon 3.1.14 / mime 2.6（getType 适配）/ immer 10.2；eslint 9.39 flat config + @babel/eslint-parser（babel-eslint 移除）；react-router 6.30.6（32 文件，withRouter 兼容 HOC 保 16 类组件零改动，离开确认以 history.block+Popconfirm 等价保留）；recharts 2.15.4；已知问题：cat_ 深链的分类树选中态待修（页面与数据正常） |

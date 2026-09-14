# UI 皮肤系统（T1 多主题预编译方案）

> 2026 年 9 月 14 日，分支 `codex/refactor-foundation`。前置：令牌层收敛（`00f89cf0`，119 处
> 硬编码颜色 → 21 个语义令牌）。测试基线：Node 24.21.0，全量 297 passed，tsc 0 错误，
> build 退出码 0（三套主题 CSS 产物各约 430KiB / gz 约 52KiB）。

## 一、机制（两层）

1. **antd 组件层（预编译）**：`client/styles/theme.less`（企业默认，编译进 index.css，零额外请求）
   + 三套独立主题 `client/styles/themes/{gov,anime,dark}.less`，各自 `@import '~antd/dist/antd.less'`
   后覆盖变量并重算 colorPalette 色阶。webpack 新增 3 个 theme 入口，生产经
   `ThemeCssFixedNamePlugin` 输出固定名 `/prd/theme-*@prd.css`（mini-css-extract-plugin 0.9
   不支持 filename 函数，故用 emit 钩子重命名；开发模式产物本身即 `theme-*@dev.css`）。
2. **页面层（CSS 变量）**：`client/styles/tokens.scss` 定义 `:root` 语义令牌（默认值 = 原硬编码色，
   企业风像素级不变）；`client/styles/skins.scss` 按 `:root[data-skin=...]` 成对覆盖令牌。

运行时切换 = 设置 `html[data-skin]`（同步生效）+ 按需注入对应主题 `<link>`（antd 层）。

**关键陷阱**（实现时踩过/评审发现的 antd 变量联动，新增主题必须逐项显式设置）：
- **必须继承基线**：三套主题文件均 `@import './baseline.less'`（从 theme.less 抽取的全量
  变量，约 150 项：布局尺寸/输入框/表格/气泡/圆角等）。遗漏会导致皮肤回落 antd 默认值，
  已实际踩坑的联动项：`@layout-header-height`（默认 64px，企业 56px，漏掉使顶栏变高、
  工具栏垂直偏移）、`@layout-sider-background`（默认跟随 header 背景）、`@menu-dark-bg`
  （默认跟随 header 背景，anime 浅粉顶栏曾致下拉白字粉底不可读）、`@layout-body-background`
  （antd 默认 #f0f2f5 且不跟随 `@body-background`）；
- **主题 CSS 是后注入的独立样式表**：其中 antd 全局元素规则（如 `ul, dl { margin-bottom: 1em }`）
  会晚于 index.css 中的页面级重置生效。受影响的选择器需在页面 scss 用更高特异性显式钉住
  （实例：`.user-toolbar ul { margin: 0 }`，否则工具栏 flex 垂直居中偏移 6px）；
- `@font-size-base: 13px` 与 `@icon-url: "/iconfont/iconfont"` 必须与 theme.less 保持一致，
  否则会出现与默认皮肤字号/图标不一致。

## 二、四套皮肤

| 皮肤 | data-skin | 入口 | 特征 |
|---|---|---|---|
| 默认（原企业风） | 不设置 | 显示 | 现状配色，零额外加载 |
| 政务风 | `gov` | 隐藏 | 主色 #1e4f9c、深蓝顶栏 #16325c、冷灰底 #f0f2f5、圆角 2px |
| 二次元风 | `anime` | 显示 | 主色 #a05ce6、浅粉顶栏 #f8c8dc + 深玫瑰文字、粉底 #fff7fb、圆角 12px、深玫瑰下拉浮层 |
| 暗色 | `dark` | 隐藏 | 底 #1f1f1f / 组件 #2a2a2a / 文字 #d9d9d9（尽力而为半成品，见边界） |

入口可见性（2026 年 9 月 14 日调整）：`client/theme.js` SKINS 数组以 `hidden: true` 标记
政务风/暗色，Header 菜单仅展示「默认 / 二次元」；「全局默认皮肤」管理入口同步隐藏
（后端 `/api/user/skin_config` 与 `theme.setGlobalSkin` 保留，可随时恢复入口）。
隐藏皮肤的白名单校验、主题编译、已选用户的 localStorage 偏好均保持有效；当前正激活的
隐藏皮肤仍会在菜单中列出，避免用户无法切回。

## 三、切换入口与配置

- **个人偏好**：Header 用户下拉「界面皮肤」SubMenu（四选项勾选态），写入 `localStorage('yapi-skin')`；
- **全局默认**（admin）：同下拉「全局默认皮肤」SubMenu；
  - `GET /api/user/skin_config`（需登录）→ `{skin: 值 || 'enterprise'}`；
  - `POST /api/user/skin_config`（仅 admin，白名单 enterprise|gov|anime|dark，非法 400）；
  - 存储复用 `server/utils/storage.js` KV（storage id `skin_config`，键 `default`），无新集合无迁移；
- **防闪烁**：`static/index.html` 与 `static/dev.html` head 内联脚本在样式加载前同步恢复 data-skin。

## 四、运行时 URL 推导（dev 双端口）

dev 模式页面由后端（:3000）提供、资源在 webpack dev server（:4000），相对路径按页面 origin
解析会 404。`client/theme.js getThemeHref` 从已加载样式表链接推导资源基址（取首个含 `/prd/`
的 link 的前缀）；生产同源时推导结果即当前站点 `/prd/`，无 link 时回落站内相对路径（仅 antd
层静默缺失，令牌层仍生效，降级安全）。若未来走 CDN 前缀需同步调整此函数。

## 五、已知边界与备忘

1. **暗色为半成品**：antd 组件层只覆盖皮肤敏感变量，低频组件（日期/级联/传输等）与页面层残留
   字面色（链接蓝 #4eaef3、状态色、Home/Login 营销渐变）仍为浅色取值；antd Tabs 非激活页签
   在暗色下有浅色块。
2. **antd 层切换有短暂 FOUC**：主题 CSS 按需注入，首次切换/刷新时 antd 组件短暂显示企业风
   （页面层令牌已被内联脚本防住）。彻底消除需预载全部主题或等 antd 5 CSS-in-JS（Phase 16 矩阵 T3）。
3. Header 勾选态在挂载时取一次 `getSkin()`；异步应用全局默认时勾选态可能与实际皮肤短暂不一致（P2）。
4. 每个 theme 入口有约 94B 的空 JS stub 产物（无人引用，可后续构建优化清理）（P2）。
5. `assets.js` 不记录 theme CSS（emit 重命名晚于 assets 插件），运行时为确定性 URL，部署路径
   变更时需同步 `getThemeHref`（P2 知会）。
6. 二次元风为「轻二次元」（色板/圆角/字体观感），插画类重设计超出皮肤机制，需单独立项。
7. **ykit 回退构建路径不含皮肤产物**：`ykit.config.js` 未配置 theme 入口与
   `ThemeCssFixedNamePlugin`，走 `build-client-ykit`/`dev-client-ykit` 的包不存在 theme-*.css，
   运行时注入 link 404 后静默回落企业默认（页面层令牌随 `data-skin` 仍生效，降级安全）。
   皮肤特性仅在 standalone webpack 构建下完整支持。

## 六、验证

- `test/server/skinConfig.test.js`（16 用例）：GET 默认回落/透传/缺键/非 admin 可读/读失败、
  POST admin 成功（插入 vs 更新）/非法 400/缺参 400/非 admin 402/白名单四值边界、路由注册冒烟、
  真实 app.js 未登录冒烟；
- 全量 `npm test`：297 passed / 0 failed；`tsc --noEmit` 0 错误；`build-client` 退出码 0；
- 浏览器实测（真实登录态）：企业风与基线一致；gov/anime/dark 逐套截图核验（含真实菜单切换、
  下拉对比度、令牌持久化、主题 link 注入）；评审 P1（anime 下拉对比度）修复后复验通过。

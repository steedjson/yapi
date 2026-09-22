# 首屏性能优化 立项计划

> 立项日期：2026-09-22。状态：**开工**（用户指令「立即执行」）。起因：接口编辑页加载慢审查（2026-09-22）实证——首屏瓶颈为 `5@*.js` vendor 包 5.6MB（gz 1.7MB），antd5 全量 + CodeMirror + recharts 混装；缓存命中后热加载 1.8s 正常，首次访问感知慢。

## 0. 实测基线（2026-09-22）

| 指标 | 数值 |
| --- | --- |
| 首屏 JS 总量（decoded） | ~6.8MB（vendor 5.6MB 占 82%） |
| vendor gz | 1.7MB |
| 生产 DCL（缓存命中） | 210ms；完全可用 ~1.8s |
| dev 完全可用 | 775ms |
| API/服务器 | 全部 <30ms，非瓶颈 |
| 编辑 Tab 切换 | 256ms，非瓶颈 |

## 1. 批次 1：vendor 拆分 + 路由懒加载（核心）

- `rsbuild.config.mjs` 的 `splitChunks` 从 `preset: 'default'` 升级为自定义 strategy：
  - **antd5 独立 chunk**（最大头，版本升级时单独失效）；
  - **CodeMirror 系独立 chunk**（仅编辑/运行 Tab 用——但现状是同步打进首屏？需实测确认使用面）；
  - **recharts 独立 chunk**（仅 statistics 页用——若首屏不需要应转异步 import）；
  - markdown 系（markdown-it 系，仅编辑备注用）同理评估；
  - 其余 node_modules → 通用 vendor；
- `static/index.html` 注入为数据驱动（WEBPACK_INITIAL_CHUNKS），新 chunk 自动纳入——需验证初始清单语义（首屏必需 vs 懒加载）；
- 关键不变量：指纹门禁 BASELINE 更新走显式流程；层 A/B 重扫。

## 2. 批次 2：brotli 预压缩

- `build/rsbuild-assets.js` 的 gzip 步骤扩展 brotli（node zlib 内置 brotli，零依赖）；阈值决策：size≥10KB（与 gzip 同档，保守——9095B 的 statistics chunk 因此未获 .br，损失 2-3KB/次，换取压缩开销比合理）；
- `server/app.js` 静态中间件：Accept-Encoding 含 br 时优先 `.br`（比 gzip 再省 15-20%）；
- assets.js 不受影响（清单只记原始文件名）。

## 3. 批次 3：antd5 引入面实测与收缩

- rollup-plugin-visualizer 或 rsbuild `performance.profile` 实测 bundle 构成；
- `@ant-design/icons` 引入面核查（全量 vs 按需）；
- 清理实测发现的引入浪费。

## 4. 验收门禁

- 首屏（/login 页）gz 传输量对比：基线 1.78MB → 目标 ≤1MB；
- 冷加载（清缓存）完全可用时间对比；
- 功能零回归：`npm test` 冷库全绿、typecheck 0、lint 0/0、audit:ci 通过；
- 指纹 BASELINE 显式更新（chunk 构成变化为预期）；
- 层 C：主 Agent 浏览器走查（登录/分组/接口列表/编辑/运行全链）。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| chunk 边界划分导致循环初始化（CSS 变量/主题在多 chunk 重复） | 构建后实测 CSS 重复率 |
| 懒加载改造引入首屏闪烁 | 仅对「非首屏必需」模块做异步化，逐个验证 |
| brotli 与既有 .gz 双方案并存的服务端兼容 | Accept-Encoding 协商，gzip 永远兜底 |

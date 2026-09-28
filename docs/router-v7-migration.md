# react-router v7 迁移记录（2026-09-28）

> 结论：**已完成迁移**（6.30.6 → 7.18.4，单批次当日落地）。
> 此前「暂缓」裁决所依据的"32 文件 v6 API 面"经实证**不构成 v7 障碍**——v7 对 SPA 场景
> （BrowserRouter/Routes/Route/useNavigate/useParams/Link/matchPath）完全向后兼容，
> 本仓 112 处 API 调用零改动即通过。

## 一、spike 实测证据

| 门禁 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 0 错 | v7 类型与全仓零冲突 |
| `npm test` | 1095/1096（迁移前）；适配后 **1101 全绿** | 唯一失败 = DOM 快照 6 行属性漂移（见下） |
| `npm run build-client` | 通过 | 依赖图变化使异步 vendor 'yu' 重编号 'u'（LICENSE sidecar 纯子集） |
| v6 时代 future flag 警告 ×2 | **消失** | v7 原生行为，v6.30 的 v7 迁移提示旗标不再打印 |

## 二、实际破坏面（远小于预期）

1. **Link 渲染的 `<a>` 新增 `data-discover="true"`**：v7 SPA 预取发现模式的标记，纯属性新增。
   唯一受影响测试 = InterfaceColContentContainer 快照 6 行（`<a href=` → `<a data-discover="true" href=`）。
2. **初始 chunk 顺序漂移**：vendor 依赖图变化使异步 vendor chunk `yu` 重编号为 `u`
   （manifest/antd/u/index.js），D-1 指纹基线按官方流程重登记（层 A 1181 / 层 B confirmed-override 0，
   CSS chunk 哈希零漂移）。
3. **双版本隐患清理**：package.json 里遗留的直依赖 `react-router@^6.30.6` 一并升级，
   避免 rr-dom@7 与顶层 react-router@6 双版本并存。

## 三、为什么不破坏：v7 对 SPA 的兼容性

v7 的破坏性变更集中在 **framework mode / SSR / loader-action 数据 API**（本仓未使用）；
SPA 声明式路由面（BrowserRouter、Routes、Route、useNavigate、useParams、useLocation、
Link、matchPath、Navigate）在 v7 中与 v6 语义一致——本质是「v6.x + future flag 默认化」。
此前评估把"32 文件 v6 API 面"误读为迁移面，实证后该 API 面无需任何改动。

## 四、顺带收益

- v6.30 每次渲染打印的 2 条 v7 future flag 警告消失（控制台更干净）；
- 路由栈回到当前主版本，后续 Patch 版本可持续跟进；
- `react-router` 直依赖与 `react-router-dom` 版本对齐（7.18.4 单一版本树）。

## 五、回滚

整 commit revert（package.json/lock + 2 测试文件 + 产物），无数据迁移。

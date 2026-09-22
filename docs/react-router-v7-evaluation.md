# react-router v7 迁移可行性评估（决策文档）

> 评估日期：2026-09-23。状态：**评估完成，建议暂缓**。审计 moderate 受控（audit:ci 基线差分覆盖），不构成安全紧迫性。

## 1. 版本约束

| 约束 | 当前 | 目标 | 可行 |
| --- | --- | --- | --- |
| React 版本 | 18.3.1 | v7 需 ≥18（满足）；v8 需 ≥19.2.7（**不满足**） | v7 可行，v8 不可行 |
| react-router-dom | 6.30.6 | v7 需 react-router-dom@7（v7 合并了 dom 包） | 需改 import 路径 |

**结论**：v7 可行（React 18.3.1 满足 peer），v8 需 React 19 先行。

## 2. 使用面盘点（32 文件，120 使用点）

| API | 使用文件数 | v7 兼容性 |
| --- | --- | --- |
| `<Routes>/<Route>` | Application.js、Project.js、User.js | v7 保留（可选 future flag 启用 v7_startTransition） |
| `<Link>` | Subnav/Breadcrumb/TimeLine/Header/ProjectList/MemberList/UserList | v7 保留 |
| `useNavigate` | ErrMsg/Header/Search/ProjectCard/GroupList/Interface | v7 保留 |
| `useParams` | Profile/GroupList/Project/Interface/InterfaceContent | v7 保留 |
| `useLocation` | Project/Interface | v7 保留 |
| `<Navigate>` | AuthenticatedComponent/Home | v7 保留 |
| `matchPath` | Project.js/Interface.js | v7 保留 |
| `unstable_HistoryRouter` | Application.js | **v7 改名 `unstable_HistoryRouter` → 已 GA** |
| withRouter 兼容层 | client/withRouter.jsx（自定义 shim） | v7 无 HOC，需改 hook |

**结论**：全部使用的 API 在 v7 中保留（`unstable_HistoryRouter` 转正、withRouter shim 需适配）。

## 3. 迁移工作量评估

| 项 | 工作量 | 说明 |
| --- | --- | --- |
| import 路径 | 小 | `react-router-dom` → `react-router`（v7 合并包） |
| `unstable_HistoryRouter` → 稳定 API | 小 | 去掉 unstable 前缀 |
| withRouter shim 适配 | 中 | client/withRouter.jsx 是自定义 HOC shim（v6 兼容层），v7 的 useNavigate/useParams 签名有变化 |
| 32 文件 API 调用适配 | 小-中 | v6→v7 大部分 API 向后兼容（future flag 模式） |
| 测试适配 | 中 | 32 文件的 MemoryRouter/Route 桩需适配 |
| 回归测试 | 大 | 120 使用点全链路浏览器走查（主 Agent） |

**总计**：约 1-2 天（含回归测试）。

## 4. audit moderate 风险评估

| CVE | 影响 | 实际风险 |
| --- | --- | --- |
| CVE-2025-68470：Link/useNavigate 反斜杠开放重定向 | 恶意 URL 可跳转站外 | **低**——YApi 为内网 API 管理工具，Link 目标均为站内路由（grep 确认无用户可控的外部 URL） |
| GHSA-337j-9hxr-rhxg：SSR deserializeErrors 构造器注入 | 仅影响 SSR 模式 | **不适用**——YApi 为 SPA，不使用 SSR |

**结论**：两个 moderate 对 YApi 内网工具场景的实际安全风险极低，不构成紧迫升级理由。

## 5. 决策

| 选项 | 建议 |
| --- | --- |
| **A. 暂缓 v7 迁移** | **推荐**。moderate 实际风险低（内网工具 + 无 SSR）；audit:ci 基线差分门禁覆盖（不新增即可）；等 React 19 升级时一并跳 v8（避免两次 breaking migration） |
| B. 立即迁移 v7 | 可行但收益低（仅消除 moderate audit 告警），成本 1-2 天 |
| C. 直接 v8 | 不可行（需 React 19） |

**建议**：**暂缓，等 React 19 升级时一并跳 react-router v8**（一个 breaking migration 周期解决两个依赖升级）。audit moderate 已由 audit:ci 基线门禁覆盖。

## 6. 前置条件（未来启动时）

1. React 18 → 19 升级（v8 peer 要求）
2. `client/withRouter.jsx` shim 适配 v7 API
3. 32 文件的 MemoryRouter/Route 桩适配
4. 全量回归测试 + 浏览器走查

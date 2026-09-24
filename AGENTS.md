# Repository Guidelines

## Project Structure & Module Organization

YApi combines a React client with a Koa server and MongoDB persistence.

- `client/`: components, containers, Redux reducers, styles, and images.
- `server/`: application entrypoint, controllers, models, middleware, and utilities.
- `common/`: shared utilities and editor-related code.
- `exts/yapi-plugin-*/`: bundled plugins.
- `test/common/` and `test/server/`: automated tests.
- `static/`: public assets and production bundles; `docs/`: documentation.

Reuse existing utilities and keep changes within the owning module. This checkout uses the root npm project, not a `next/` workspace.

## Build, Test, and Development Commands

Run from the repository root after installing dependencies with `npm install`:

- `npm run dev`: start backend and frontend development servers.
- `npm run dev-server`: run the backend with nodemon.
- `npm run dev-client`: copy icon assets and serve the client on port 4000.
- `npm run build-client`: build the production client bundle.
- `npm start`: start the production server.
- `npm run install-server`: initialize installation data in the configured database; use only for setup.
- `npm test`: run AVA tests.
- `npm run docs`: build documentation with ydoc.

## Coding Style & Naming Conventions

Follow neighboring code and `.eslintrc.js` / `.prettierrc.js`. Prefer two-space indentation, semicolons, single quotes, and no trailing commas; Prettier specifies a 100-character print width. Use camelCase for JavaScript identifiers and PascalCase for component classes. ESLint includes React rules; no dedicated npm lint or format script exists. Avoid unrelated formatting changes.

## Testing Guidelines

AVA loads `test/**/*.js` through `babel-register`. Follow the existing `*.test.js` naming, for example `test/common/mergeJsonSchema.test.js`. Run a focused file with `npm test -- test/common/mergeJsonSchema.test.js`. Add regression coverage for changed behavior and run relevant tests before submission. No numeric coverage threshold is configured. Report unavailable services or failing tests rather than claiming verification.

## Commit & Pull Request Guidelines

Use `type: description`, such as `fix: handle missing project tags`. The commit validator allows `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, and `opti`, with a 100-character subject limit.

Keep commits focused. PR descriptions should explain the problem, link relevant issues, list verification commands and results, and include screenshots for UI changes. State configuration or compatibility impacts.

## Configuration & Local Files

Consult `config_example.json` and `docs/devops/` for setup. Never commit credentials or production connection details. Preserve local backups and caches. `AGENTS.md` is currently ignored by Git; changing that policy requires an explicit request.

## 委派流程

只在存在真正独立的工作流，且委派能节省时间或提升质量时才使用子 Agent。共享状态、连续决策和简单任务由当前主 Agent 直接完成。默认由主 Agent 直接编排各子 Agent 并承担编排角色（原 csl-orchestrator 子 Agent 已删除，其纪律由本章节与 `/csl-开发流水线` 命令继承）；标准「计划→编码→测试→验收」流水线可直接用 `/csl-开发流水线` 命令执行。

### 角色与职责分工

- **主 Agent（全局调度与终审裁决）**：负责全局阶段规划、方案与边界划定、实施计划产出、终审决策、代码合并与提交。不再亲自承担冗长的测试运行与报错排查（UI 浏览器验证除外——该环节为主 Agent 专属，见状态门禁）。
- **csl-coder（实施）**：在主 Agent 派发明确的实施计划（Implementation Plan）后调用；严格按计划逐项编码，仅做轻量级构建与单步自测，不扩大范围、不自行扩充依赖、不修改设计架构。
- **csl-tester（验证）**：在实施完成后调用；运行相关测试套件、编译/类型检查与静态代码分析，分析报错堆栈与根因，按项目测试规范补充边界及异常测试用例（只允许新增/修改测试文件，严禁修改业务代码）；输出带 VERIFIED / BLOCKED 状态的结构化测试报告。
- **csl-reviewer（审查）**：在测试报告呈 VERIFIED 状态后调用；只评审不修改任何文件，对照实施计划逐条核验需求落实、审查代码质量与安全边界，核验测试报告覆盖是否充分，输出结构化 PASS/FAIL 结论与问题清单。
- **（历史注记）csl-orchestrator 已于 2026-09 删除**：实测其无子 Agent 派发工具，编排闭环无法自主运转；调度纪律由本章节状态门禁与 `/csl-开发流水线` 命令继承，交付报告格式已并入命令的「汇报要求」。

### 状态门禁

实施完成 →（csl-tester）→ VERIFIED / BLOCKED；VERIFIED 后，若变更文件清单含 UI 相关改动（如 `client/**`、页面渲染/交互逻辑），先由主 Agent 亲自执行 UI 验证（浏览器自动化为主 Agent 专属，不派子 Agent），产出 UI_VERIFIED / UI_BLOCKED；随后进入 csl-reviewer 审查 → PASS / FAIL；PASS 后主 Agent 终审、合并、提交。csl-coder 报告计划与实际代码冲突（CONFLICT）时暂停流水线，回主 Agent 重新裁决。BLOCKED/UI_BLOCKED/FAIL 须附缺陷定位与根因（或 Blocker 清单）打回 csl-coder 定向修复、不得扩大范围，修复后重过 tester、（如涉及）UI 验证及 reviewer；打回修复总轮次上限 3 轮（UI_BLOCKED 计入同一计数器），达到即熔断挂起、升级人工裁决。

### 委派前必须先完成

主 Agent 必须先给出可执行边界，再委派：

- 目标与非目标；
- 允许修改的文件范围；
- 禁止修改的文件、命令、数据和分支；
- 完成判据和验证命令；
- 失败时如何停止，不得自行扩大范围。

未完成上述边界时，不得委派。子 Agent 每次调用均为全新会话、不共享上下文，委派 prompt 必须自包含（携带实施计划、改动位置、测试报告等必要材料）。

### 禁止

- 不得让子 Agent 决定整体重构方向、阶段顺序或兼容策略；编排权归主 Agent，且只限于已批准计划内的修复迭代。
- 不得把未经验证的子 Agent 结果直接合入工作区或提交。
- 不得并行委派会改同一批文件的任务。
- 不得把规划、实现、测试、验收交给同一个子 Agent 自产自销。

### 回收与合并

子 Agent 只返回 diff、测试报告、审查意见或交付结论。主 Agent 审阅 PASS 结论与 VERIFIED 测试报告（或 csl-orchestrator 的交付结论），确认无越界与遗留风险后，执行最终提交并推进下一阶段。

## BUGLOG — 已知坑与修法(跨 agent 共享)

- 位置:`docs/BUGLOG/<当前分支>.md`(按分支一文件;分支名 `/`→`-`;无 git 用 `default.md`)
- **读的时机**:修改函数签名/对外行为前;审查 diff 前;fix 类提交前。通读最近 30 条及命中模块条目
- **写的时机**:修复缺陷并确认根因后,立即追加一条(最新在上):

  ```md
  ## [YYYY-MM-DD][模块] 简述
  - 现象: / - 根因: / - 修法: / - 关联: commit 或 文件:行号
  - 复发: N 次 · 最近 日期(可选) / - 教训: 一句话
  ```

- **脱敏红线**:禁止客户名/真实姓名/内网地址/凭证,用 `<占位符>` 替代
- 文件不存在则先创建标准头;条目只追加不删改

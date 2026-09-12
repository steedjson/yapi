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

只在存在真正独立的工作流，且委派能节省时间或提升质量时才使用子 Agent。共享状态、连续决策和简单任务由当前主 Agent 直接完成。

### 角色与职责分工

- **主 Agent（全局调度与裁决）**：负责全局阶段规划、方案与边界划定、终审决策、代码合并与提交。不再亲自承担冗长的测试运行与报错排查。
- **实施角色（Coder / 编码工程师）**：严格按照已批准的实施计划修改代码并做基础语法验证，不扩大范围、不擅自重构。
- **验证角色（Tester / 测试与质量工程师）**：负责运行相关测试套件、编译/类型检查与静态代码分析；负责分析报错堆栈与根因；检查覆盖率并主动补全测试用例；输出结构化测试报告。
- **审查角色（Reviewer / 验收评审员）**：只评审不修改代码。负责对照计划逐条核验需求落实、审查代码质量与安全边界，核验测试角色的测试报告是否充分覆盖，输出 PASS/FAIL。

### 委派前必须先完成

主 Agent 必须先给出可执行边界，再委派：

- 目标与非目标；
- 允许修改的文件范围；
- 禁止修改的文件、命令、数据和分支；
- 完成判据和验证命令；
- 失败时如何停止，不得自行扩大范围。

未完成上述边界时，不得委派。

### 禁止

- 不得让子 Agent 决定整体重构方向、阶段顺序或兼容策略。
- 不得把未经验证的子 Agent 结果直接合入工作区或提交。
- 不得并行委派会改同一批文件的任务。
- 不得把规划、实现、测试、验收交给同一个模型自产自销。

### 回收与合并

子 Agent 只返回 diff、测试报告或审查意见。主 Agent 审阅审查角色的 PASS 结论与验证角色的测试报告，确认无越界与遗留风险后，执行最终提交并推进下一阶段。

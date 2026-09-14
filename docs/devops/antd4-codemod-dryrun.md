# antd 3→4 codemod dry-run 改造点清单（S2 工单输入）

> 2026-09-14，基于 `e3df8163`（S1 线内升级 antd 3.26.20 + react 16.14.0 之后）。
> 本文档只记录 antd 官方 codemod（`@ant-design/codemod-v4@1.1.0`）dry-run 实测结果与
> 人工核对的改造点，**不包含任何已合并的 codemod 改动**。dry-run 在临时 worktree
> 中执行并已清理。

## 一、dry-run 实测命令（可复现）

```bash
git worktree add /tmp/antd-codemod HEAD -b codemod-dryrun
cd /tmp/antd-codemod
npx -y -p jscodeshift jscodeshift \
  -t ~/.npm/_npx/8eb2aec556a71243/node_modules/@ant-design/codemod-v4/transforms/<transform>.js \
  --extensions js --parser babel --run-in-band client exts
# --dry 只统计；正式跑加 --print 查看 diff；结束后 git checkout -- . 还原
```

注意：`--parser flow` 会因 79 个文件里的 class properties（`PropertyDefinition`）
报错，必须用 `--parser babel`。带 `@connect` 装饰器 + export 同行的文件在
babel parser 下仍有 18 个解析错误（decoratorsBeforeExport 配置冲突），这些文件
codemod 覆盖不到，需人工迁移。

## 二、实测命中统计（client + exts）

| transform | ok | 说明 |
|---|---:|---|
| v3-Icon-to-v4-Icon | 28 | Icon 迁移到 `@ant-design/compatible` 的 `LegacyIcon`（25 文件 +144/-126 行） |
| v3-Component-to-compatible | 10 | `Form`/`Mention` 迁出 antd（`@ant-design/compatible`） |
| v3-component-with-string-icon-props-to-v4 | 10 | 字符串 icon props（Button shape 等） |
| v3-LocaleProvider-to-v4-ConfigProvider | 1 | LocaleProvider → ConfigProvider |
| v3-Modal-method-with-icon-to-v4 | 0 | Modal.confirm 带 icon 场景本项目未命中 |

## 三、S2 改造点清单（按优先级）

### 1. Icon 全量迁移（机械，codemod 可覆盖 ~80%）

- 129+15 处 `<Icon>`，29 个 client 文件 + 16 个 exts 文件从 antd 导入 Icon；
- codemod 产出为 `LegacyIcon`（兼容层）。正式 S2 建议直接映射到
  `@ant-design/icons` 具名图标（如 `QuestionCircleOutlined`），11 处动态
  `type={...}` 需建映射表（Header 菜单 `item.icon`、ErrMsg `icon` prop 等）；
- 皮肤系统关联：`theme-*.less` 中若有针对 `.anticon` 的覆盖选择器需同步核对。

### 2. Form 系统迁移（最大工作量，必须人工）

`getFieldDecorator` 84 处 / 9 个 client 文件 + 15+3 处 / 2 个 exts 文件：

| 文件 | 处数 |
|---|---:|
| client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js | 32 |
| exts/yapi-plugin-advanced-mock/MockCol/CaseDesModal.js | 11 |
| client/containers/Project/Setting/ProjectMessage/ProjectMessage.js | 9 |
| client/containers/Project/Setting/ProjectEnv/ProjectEnvContent.js | 8 |
| client/containers/AddProject/AddProject.js | 6 |
| client/containers/Project/Interface/InterfaceList/AddInterfaceForm.js | 5 |
| client/containers/Login/Reg.js | 5 |
| client/containers/Project/Interface/InterfaceList/AddInterfaceCatForm.js | 4 |
| exts/yapi-plugin-swagger-auto-sync/swaggerAutoSync/swaggerAutoSync.js | 4 |
| client/containers/Project/Interface/InterfaceCol/InterfaceColMenu.js | 3 |
| client/containers/Login/Login.js | 3 |

迁移模式：`Form.create` HOC（12 处，含 2 处 `@Form.create()` 装饰器）→
`Form` + `Form.Item name` + `onFinish/onValuesChange`；装饰器用法建议顺势去
装饰器化（class properties + HOC 包裹），与 S3 生命周期现代化同批。

### 3. 人工迁移文件（codemod 解析失败）

18 个文件因装饰器语法 codemod 报错（`@connect`/`@withRouter` + export 同行），
Icon 部分需人工改，代表：Application.js、Group.js、LoginWrap.js、Project.js、
Header.js（Header 含 4 处 Icon 含 1 处动态 type）。

### 4. 小项

- `LocaleProvider` → `ConfigProvider`：1 处（codemod 可自动）；
- `message.warn` → `message.warning`：1 处（弃用别名）；
- `TabPane` 30 处：v4 保留兼容，`items` 化放尾批；
- `@ant-design/compatible`、`@ant-design/icons` 需新增依赖（v4 配套）。

## 四、门禁（与矩阵 S2 一致）

单页：`tsc --noEmit` 0 错误 + `npm test` 全过（当前基线 307）+ 该页手测清单；
全量：五页回归（登录/项目列表/分类树/接口编辑/导入弹窗）+ advanced-mock 与
swagger-auto-sync 插件页抽查 + 皮肤四套（enterprise/gov/anime/dark）截图对比。

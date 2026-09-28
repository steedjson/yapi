# BUGLOG — codex/message-app-context 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-27][test/containers] renderWithProviders 增挂 AntdApp 后,既有用例手工复刻包裹结构的 rerender 退化为重挂载
- 现象: ProjectInterface「AddColModal 父级 props 变化时默认选中首集合并回填用例名」失败——rerender 后 `.col-item[0]` 不含 `selected`
- 根因: 该用例 rerender 手工复刻 renderWithProviders 的包裹结构(StyleProvider>MemoryRouter>Routes)以原位复用实例;helper 内嵌 AntdApp 后两树形状不一致,React 卸载重建 AddColModal,而其 cWRP 迁移 effect 在挂载期刻意不执行(`if (!prev) return`),props 变化回填逻辑被跳过
- 修法: AntdApp+MessageBridgeRegistrar 改为 StyleProvider 下「兄弟节点」挂载——message-bridge 是模块级全局注册,无需包裹被测子树;element 子树形状零变化,手工复刻的 rerender 重新同形
- 关联: test/helpers/containers.js、test/client/containers/ProjectInterface.test.js:319、client/containers/Project/Interface/InterfaceList/Run/AddColModal.js
- 复发: 0 次 · 教训: 测试 helper 改包裹结构前,先全仓搜 `rerender(`——凡手工复刻 helper 结构的用例都会被树形状漂移击穿

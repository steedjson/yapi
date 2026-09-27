# BUGLOG — codex/antd6 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-28][style/layerB] antd3 时代死规则映射到 antd6 新类名后被"激活",反向破坏视觉门禁
- 现象: antd6 迁移批把 Edit.scss 的 `.ant-select-selection__rendered{line-height:34px}` 等价改写为 `.ant-select-content` 后,层 B 差分汇总出现 1 条 confirmed-override:单选行高被抬高、多选被 antd 运行时 `.ant-select-multiple .ant-select-content{line-height:1}` 以 0,3,0 反压
- 根因: 该规则自 antd4 起就没有精确同名类,在 antd5 下是死规则、从未命中 DOM;「等价改写」实为把死规则激活,偏离了 antd5 的真实渲染基线
- 修法: 按 Search.scss N-2 先例删除死声明并留裁决注释;裁决口径统一为「与 antd5 真实行为等价」,不是「与新类名字面等价」
- 关联: client/containers/Project/Interface/InterfaceList/Edit.scss、test/client/visual/antd5-runtime-diff.test.js(汇总 sanity 断言)
- 复发: 0 次 · 教训: 迁移旧样式前先确认规则在当前版本是否真的生效;死规则的正解是删除,不是翻译

## [2026-09-28][antd6-Select/test] 多选 Select 选中后下拉立即关闭,jsdom 冻结离场动画致旧选项滞留 DOM
- 现象: UsernameAutoComplete「选中后清空候选项」断言在 antd5 下数 `.ant-select-item-option` 为 0 通过;antd6 下同样的组件行为(onChange 清 dataSource)却仍查到 2 个旧选项
- 根因: antd6 起多选选中后下拉 immediate 关闭(antd5 保持展开、列表原地重渲为空);jsdom 不派发 transitionend,rc-motion 离场相位永不结束,关闭前的选项列表被冻结滞留在 DOM 中,querySelector 仍可命中
- 修法: 改断言下拉容器的实时空态标记 `.ant-select-dropdown-empty`(由 live options 派生,不受冻结残留影响);「标签回显」断言从 `screen.getByText`(会被冻结旧选项命中多次)改为容器内 `.ant-select-content-item` 精确匹配
- 关联: test/client/components/UsernameAutoComplete.test.js、client/components/UsernameAutoComplete/UsernameAutoComplete.js
- 复发: 0 次 · 教训: antd6 凡涉及「选中后」的 DOM 断言,先确认下拉是展开原地重渲还是关闭冻结,后者只能断言实时状态类或重开后的 DOM

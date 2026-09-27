# BUGLOG — codex/antd-deprecated-cleanup 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-27][test/domSnapshot] 快照常量回填时模板字面量吞反斜杠,快照门禁假失败
- 现象: antd 弃用 API 清扫批按官方迁移改造 addon/InputGroup 后,用临时插桩把 `snapshot(container)` 实际输出回填进 `EXPECTED_*_SNAPSHOT` 模板字面量常量,重跑仍 7 例失败;diff 显示 textarea 的 `value` 一侧为 `{\"a\":1}`、另一侧为 `{"a":1}`
- 根因: domSnapshot 序列化器用 `JSON.stringify` 渲染属性值,含引号的值(如 `{"a":1}`)在序列化文本中带 `\"`;直接把该文本嵌入 JS 模板字面量,`\"` 被字符串转义解析成 `"`,常量运行时值比实际 DOM 少一层反斜杠。旧常量手写时写的是 `\\"`(源码双写),回填脚本未做同样翻倍
- 修法: 回填前对转储文本做 `content.replace(/\\/g, '\\\\')` 再嵌入模板字面量;修后 PostmanContainer 10 例 + InterfaceEditFormContainer 3 例全绿
- 关联: test/helpers/domSnapshot.js(normalizeAttr→JSON.stringify)、test/client/components/PostmanContainer.test.js 的 EXPECTED_*_SNAPSHOT、test/client/containers/InterfaceEditFormContainer.test.js EXPECTED_EDITFORM_SNAPSHOT
- 复发: 0 次 · 教训: 任何「把序列化输出回填进源码字面量」的操作,先盘点文本中的 `\` `` ` `` `${` 三类字符并按目标字面量语法转义;快照类常量更新后必须重跑对应测试验证,不能只看 diff 面积小就假定等价

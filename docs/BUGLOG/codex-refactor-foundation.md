# BUGLOG — codex/refactor-foundation 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-25][server/utils/commons] babel-register 把字面量 import() 转译为 require,ESM-only 包在测试环境断链
- 现象: json-schema-faker 0.6.3 升级后,生产路径(纯 node require 链)schemaToJson 正常,ava 测试内经 commons.js 的动态 import 全部失败:`No "exports" main defined in node_modules/json-schema-faker/package.json`,探针 12/14 红
- 根因: ava 经 @babel/register 以 test 分支 babel 配置(modules:'commonjs',未 exclude dynamic-import)转译 server/** 源码,字面量 `import()` 被改写为 require 形态;0.6 exports 仅含 import 条件(无 require/default),require 解析必败。此前验证为假阴性:用 0.5.9 做同款 scratch 实测"通过",但 0.5.9 有 require 条件,证明不了原生 import 存活
- 修法: `const dynamicImport = new Function('specifier', 'return import(specifier);')` 把 import() 藏出 babel 静态转译视野(commons.js:31-33),生产/测试统一走原生动态 import
- 关联: server/utils/commons.js:31-33;test/server/schemaToJson-equivalence.test.js;TECH_DEBT.md B1 批次行
- 复发: 0 次 · 教训: 验证"babel 是否保留某语法"必须用会触发差异的真实目标(ESM-only 包),兼容目标(双入口包)通过≠机制存在;凡 server 源码里的动态 import,在 ava 管线下都会被转译,需 Function 构造器逃逸

## [2026-09-25][exts/import-swagger] swagger-client 双入口互操作:浏览器 bundle 下 URL 导入必现"解析数据为空"
- 现象: 浏览器端「数据管理 → swagger URL 导入」恒报「解析数据为空」,console `TypeError: i is not a function`(swagger-import chunk 内 `swagger({spec})` 调用点);Node 环境同代码正常(单测/脚本验证从未暴露)
- 根因: `run.js` 的 CJS `require('swagger-client')`。swagger-client@3.38.2 双入口(main=CJS 可调用函数体 / module=ES default 导出):Node require 走 main 得函数;浏览器构建优先 module 字段得 ES 命名空间对象,直接调用报 not a function。`handleSwaggerData` 的 Promise 无 catch,空 spec 静默走 showConfirm 空数组守卫,进一步掩盖了真实错误
- 修法: `const swaggerModule = require('swagger-client'); const swagger = swaggerModule.default || swaggerModule;`(run.js:2-5),重建后 bundle 内编译为 `i.default||i`
- 关联: exts/yapi-plugin-import-swagger/run.js:2-5;chunk 哈希 bbd18ad0→280ebb4a(修复批,收尾批验证期间发现)
- 复发: 0 次 · 教训: 双入口依赖(main/module 形态不同)在"Node 单测通过 ≠ 浏览器可用",凡 require 双入口包必须在浏览器 bundle 实测;无 catch 的 Promise 包装会把崩溃静默成下游守卫提示
## [2026-09-28][测试环境/IAB] 遮挡窗口渲染冻结导致 toast「不可见且不消失」假象(非产品缺陷)
- 现象: antd6 迁移批 UI 验证时发现 message toast 完全不可见且 DOM 永不清理——notice 卡在 `ant-message-fade-appear-start`(opacity 0),`-appear-active` 永不添加;曾误判为 P1 产品缺陷并立项热修(rc-motion rAF 看门狗 shim),后经 A/B 与深层取证推翻
- 根因: 验证所在 IAB 窗口被遮挡(hasFocus=false 但 visibilityState=visible),Chromium 冻结该窗口渲染管线——rAF 永不触发、transitionend 不派发、**transition 属性的 computed style 冻结在动画初值**(内联改 opacity=1 后计算值仍 0);非过渡属性(display/hover)与 JS/DOM 操作照常,形成「页面活着但动画全死」的假象。rc-motion 出场动画等待的 transitionend 在此状态下永不到来,toast 冻结在初值;窗口恢复可见后动画补完、toast 正常显示并消失(无持续伤害)。正常用户窗口可见时一切正常(CDP 真实 Chrome 逐帧实验:appear +200ms/opacity 动画/3.4s 移除)
- 修法: 非缺陷,不修。热修分支 codex/toast-motion-hotfix(rAF 看门狗 shim)已裁决废弃不合并——遮挡场景下 setTimeout 同被节流、样式管线冻结,shim 无法真正生效,属零用户收益的幻影修复
- 关联: docs/BUGLOG/codex-toast-motion-hotfix.md(分支已删,调查过程记录);codex/message-app-context 批 UI 验证
- 复发: 0 次 · 教训: 验证动画/过渡类行为前先探测 rAF 存活(`requestAnimationFrame` 500ms 探针)与 `document.hasFocus()`;遮挡窗口下「computed style 冻结在过渡初值」会让任何依赖 CSS 过渡的组件看起来像卡死,此类现象优先怀疑环境而非代码

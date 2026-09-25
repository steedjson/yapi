# BUGLOG — codex/refactor-foundation 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-25][exts/import-swagger] swagger-client 双入口互操作:浏览器 bundle 下 URL 导入必现"解析数据为空"
- 现象: 浏览器端「数据管理 → swagger URL 导入」恒报「解析数据为空」,console `TypeError: i is not a function`(swagger-import chunk 内 `swagger({spec})` 调用点);Node 环境同代码正常(单测/脚本验证从未暴露)
- 根因: `run.js` 的 CJS `require('swagger-client')`。swagger-client@3.38.2 双入口(main=CJS 可调用函数体 / module=ES default 导出):Node require 走 main 得函数;浏览器构建优先 module 字段得 ES 命名空间对象,直接调用报 not a function。`handleSwaggerData` 的 Promise 无 catch,空 spec 静默走 showConfirm 空数组守卫,进一步掩盖了真实错误
- 修法: `const swaggerModule = require('swagger-client'); const swagger = swaggerModule.default || swaggerModule;`(run.js:2-5),重建后 bundle 内编译为 `i.default||i`
- 关联: exts/yapi-plugin-import-swagger/run.js:2-5;chunk 哈希 bbd18ad0→280ebb4a(修复批,收尾批验证期间发现)
- 复发: 0 次 · 教训: 双入口依赖(main/module 形态不同)在"Node 单测通过 ≠ 浏览器可用",凡 require 双入口包必须在浏览器 bundle 实测;无 catch 的 Promise 包装会把崩溃静默成下游守卫提示
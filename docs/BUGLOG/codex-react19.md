# BUGLOG — codex/react19 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-26][test/jsdom-setup] react-dom 19.3 模块级常量探测在 jsdom 全局前固化,受控输入 onChange 全灭(34 例)
- 现象: React 19 迁移批次全量测试 34 例失败(components 25/containers 4/visual 3/group 2),凡「fireEvent.change/input → 断言 onChange 副作用」类用例全部死亡,onClick 正常;无论等多久 onChange 都不触发,表现酷似「React 19 并发调度 vs 固定 sleep 断言」,实际与等待方式无关
- 根因: jsdom-setup.js 原第 22 行 `require('@ant-design/v5-patch-for-react-19')`(内部连带 require antd 与 react-dom/client)先于 setupDom() 执行;react-dom 19.3 以模块级常量探测环境——`canUseDOM`、`isInputEventSupported = isEventSupported("input") && ...` 在 bundle 加载时一次性固化,此时 typeof document === 'undefined',isInputEventSupported 永久为 false;ChangeEventPlugin 对文本输入(per isTextInputElement 分支)从此只走 IE 时代 focusin/propertychange polyfill,jsdom 下彻底死路。React 18 时代无该补丁 require,react-dom 在 jsdom 全局就位后才首次加载,故无此问题
- 修法: 补丁 require 下移至 setupDom() 之后(仍在模块初始化路径内、先于任何 antd/生产代码装载,jsdom-setup 是所有 client 测试首个 import 的时序不变量不变);修后全量 1085/1085 绿
- 关联: test/helpers/jsdom-setup.js:24-28 与文件底部;node_modules/react-dom/cjs/react-dom-client.development.js 的 isInputEventSupported/getTargetInstForInputOrChangeEvent;@ant-design/v5-patch-for-react-19@1.0.3 lib/index.js
- 复发: 0 次 · 教训: 凡「模块级常量探测环境」的库(react-dom 的 canUseDOM/isInputEventSupported 等),require 顺序必须保证探测目标已就位;首个 import 里的 require 同样参与模块加载竞争;疑似"调度时序"类失败,先用最小探针验证回调是否触达,再谈等待方式

## [2026-09-26][postmanLib/InterfaceColContent] handleCurrDomain 在 env 列表未就绪时崩溃
- 现象: React 19 并发调度下 InterfaceColContent 渲染期调 handleReqHeader,在 common/postmanLib.js 的 handleCurrDomain 抛 `Cannot read properties of undefined (reading 'find')`;全量测试伴 1 个 unhandled rejection(visual/antd5-runtime-diff)
- 根因: React 18 同步渲染掩盖了 envList 异步加载与渲染期消费之间的时序竞态;React 19 并发调度让渲染先于数据到达,`envItem && envItem.env` 为 undefined 时 `domains.find` 直接崩
- 修法: handleCurrDomain 增加 `Array.isArray(domains)` 就绪守卫(未就绪返回 undefined,等价"无 env 命中"既有语义);消费点 InterfaceColContent 改 `(currDomain && currDomain.header) || []` 未就绪时不注入 header;新增回归 test/common/postman-lib-curr-domain.test.js(6 例)。修后全量测试 unhandled rejection 归零
- 关联: common/postmanLib.js:210;client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:188;test/common/postman-lib-curr-domain.test.js
- 复发: 0 次 · 教训: 渲染期取数链上每个 `.find`/属性访问点都需数据就绪守卫;同步渲染下的"恰好可用"不是契约,升级并发渲染前应先审计异步数据消费点

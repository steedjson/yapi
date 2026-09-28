# BUGLOG — codex/refactor-foundation 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-09-29][exts/advanced-mock] 期望编辑弹窗 antd Row gutter 负边距造成 4px 幽灵横向滚动条
- 现象: 「添加期望」弹窗(CaseDesModal)底部出现近满宽横向滚动条,弹窗体 scrollWidth 比 clientWidth 宽 4px
- 根因: 弹窗内参数行用 antd Row gutter 布局,gutter 会让行容器带 -4px 左右外边距,在受限父容器(col-19)内右侧溢出 4px,把 body 撑出滚动条
- 修法: CaseDesModal.scss `.case-des-modal .ant-modal-body` 追加 `overflow-x: hidden`(该处本有 overflow-y: scroll);判定滚动条要用 offsetHeight>clientHeight,scrollWidth>clientWidth 在 overflow hidden 下不代表有滚动条
- 关联: exts/yapi-plugin-advanced-mock/MockCol/CaseDesModal.scss:5
- 复发: 0 次 · 教训: antd Row gutter 负边距在非全宽父容器内必然溢出 gutter/2,受限容器需主动收敛 overflow

## [2026-09-29][client/UI] CodeMirror6 迁移后编辑器容器 min-height 语义塌缩等 5 类 UI 规范缺陷(审查批 14 处编辑器位点)
- 现象: 设置-全局mock脚本/接口高级Mock-脚本等编辑器渲染为一行细条、容器剩余 300~500px 空白; 生成ts services 页卡片丢失且 pre 长 token 行溢出裁切; 关注页空态贴左; 公开项目成员页头像渲染为 710px 巨图挤毁表格; site-admin 打开他人私有分组项目的设置时「所属分组」显示原始 id"9"
- 根因: ①ace→CodeMirror6 迁移把主题定为 `.cm-editor{height:100%}`, 父容器仅 min-height(高度 auto)时百分比解析为内容高度→塌缩, 而 ace 时代容器写 min-height 即可撑起(全仓共 14 处此写法) ②`.m-panel` 只定义在 group chunk 两个 scss(ProjectList/MemberList), 却被设置页/插件页当全局类用, 整页直载时样式不加载 ③ProjectMember 表格头像尺寸样式只存在于 Group MemberList.scss, 设置页作用域无约束 ④Follows 把 ErrMsg 直接放 antd Row(flex), .err-msg 无宽度声明收缩贴左 ⑤所属分组 Select 选项取自当前用户 groupList, 不含项目实际分组时显示原始 value
- 修法: 编辑器容器一律显式 height(14 处, min-height 全部清除); `.m-panel` 提升到 client/styles/common.scss 全局唯一并删两处本地定义; Setting.scss `.setting-project-member` 补 .m-user-img 32px(px 不用 rem); ErrMsg.scss 补 width:100%; ProjectMessage.js 构造 groupOptions 缺项时追加 currGroup; CaseScriptModal 的 Modal 补 className="common-setting-modal" 使 Portal 场景命中高度规则
- 关联: client/components/AceEditor/mockEditor.js(xcodeTheme height:100%); client/styles/common.scss; client/containers/Project/Setting/ProjectMock/index.js:110; exts/yapi-plugin-advanced-mock/AdvMock.js:149; client/containers/Project/Setting/ProjectMessage/ProjectMessage.js:292-302 等 19 文件
- 复发: 0 次 · 教训: 编辑器引擎迁移时百分比高度语义随宿主变化, 容器 min-height 旧惯例必须全量 rg 排查; chunk 局部 scss 类被跨 chunk 当全局类用是整页直载丢样式的典型来源; 组件复用到新容器布局(flex/Portal)时要核对宽度与作用域选择器是否仍命中

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

## [2026-09-29][exts/yapi-plugin-wiki] jsondiffpatch 0.7 样式路径迁移漏改兄弟位点,wiki「通知相关人员」更新整体失败
- 现象: wiki 页编辑后勾选「通知相关人员」点「更新」,toast 报「更新失败: ENOENT: no such file or directory, open '.../node_modules/jsondiffpatch/dist/formatters-styles/annotated.css'」;且内容实际已入库但响应被覆盖为失败、通知邮件与变更日志双双丢失
- 根因: jsondiffpatch 0.3.11→0.7.6 升级批把包内样式目录 dist/formatters-styles 迁移到 lib/formatters/styles,当时只修了 server/controllers/interface/upMethods.js(接口更新路径,带模块级缓存),**漏改同构的 exts/yapi-plugin-wiki/controller.js**(wiki 更新路径)——同类位点迁移时未做全仓 rg 兜底
- 修法: wiki controller 两处路径改 lib/formatters/styles/{annotated,html}.css,并沿用 upMethods 的模块级缓存模式(wikiDiffCssCache)消除每次更新的同步读盘;附带发现并保留原有时序语义: 通知块在 DB 保存之后,通知失败会覆盖已成功的保存响应(本次根因即为覆盖为失败)——路径修复后该风险面消除,未额外改时序
- 关联: exts/yapi-plugin-wiki/controller.js:23-31(缓存)/128-146(读取);server/controllers/interface/upMethods.js:206-216(先例);真机闭环: 同操作路径修复前必现 ENOENT、修复后「修改于刚刚」无报错
- 复发: 0 次 · 教训: 依赖升级迁移内部路径时,对「同构消费位点」必须 rg 全仓兜底(当时只修了报错的那个,兄弟位点静默待爆);「已入库但响应报失败」的时序错位会让缺陷看起来像保存失败,排查时先分清写库与响应覆盖

## [2026-09-29][样式] 在 legacy rem 基准(1rem=100px)下新写 12rem 被解析为 1200px,接口页左栏被撑到离谱高度
- 现象: 接口页左右两栏高达 1312px(右栏仅 1 行接口数据),用户反馈"太高了";实测 .tree-wrappper computed min-height = 1200px
- 根因: 本次 flex 对齐改造在新规则里写了 `min-height: 12rem`,而本仓 common.scss:8 有 `html { font-size: 100px }`(老式 rem 换算基准,1rem=100px,注释明确"仅作换算基准")——12rem 被解析为 1200px,树容器被强制最小高 1200,连带把右栏拉伸
- 修法: 两处 min-height 改显式 `200px`;本仓新增样式一律用 px 或 --sk-* 令牌,禁用 rem(除非刻意以 100px 基准换算)
- 关联: client/containers/Project/Interface/InterfaceList/interfaceMenu.scss;InterfaceCol/InterfaceColMenu.scss;client/styles/common.scss:8
- 复发: 0 次 · 教训: 老代码库里写新 CSS 前先查根字号基准;本仓 rem 语义与浏览器默认(16px)完全不同,rem 是地雷单位

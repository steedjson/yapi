# BUGLOG — dev 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-10-01][client/store] 孤儿 store 删除前的验证方法:产物侧交叉对照比全仓 grep 更能定性
- 现象: 处置 `client/store/addInterfaceStore.js`(带 @ts-check 却未被检查的孤儿 store)时,全仓检索只命中它自己与其单测——但「grep 零命中」不足以定案:该文件若被某条间接 import 链(barrel 导出、动态 import、插件机制)引入,文本检索同样可能漏判
- 根因: 本次对象是「从未被消费」而非「消费方被删」,故必须排除「有隐藏可达路径」的可能。深层原因是它 1:1 承接自旧 Redux reducer,而那个 reducer 虽注册进 combineReducers 却从无组件读取——迁移把既有孤儿换了实现形态,掩盖了它一直没被用的事实
- 修法: 删除前做三重独立验证——① 全仓任意形式检索(含动态 import/字符串/barrel,并确认 client/store 无 index.js 聚合)仅命中自身与自身测试;② **产物侧交叉对照**:该 store 独有的动作名(pushInterfaceName/seqGroup 等)在 static/prd 全量 chunk 中零命中,而同法检索对照组(userStore 的 changeMenuItem)可命中——证明检索方法有效,且该文件确实不在任何 import 链上;③ 删除后 typecheck 0 错、测试数 1209→1203(恰为该文件 6 个用例),数量对齐即交叉印证。文件(133 行)+单测(111 行)+tsconfig 条目一并移除
- 关联: client/store/addInterfaceStore.js(已删)、test/client/store/addInterfaceStore.test.js(已删)、tsconfig.json、docs/zustand-migration-pattern.md(补后续变更说明)、TECH_DEBT.md §四.8
- 复发: 0 次 · 教训: 判定「死文件」时,产物侧交叉对照是比源码 grep 更硬的证据——bundle 是真实可达性的物化结果,grep 只证明文本无引用;检索必须配对照组(拿一个已知可达的同类标识去检),否则「零命中」可能只是检索方法本身失效;删除后核对测试数减少量是否等于该文件用例数,是最省事的一致性自检

## [2026-10-01][依赖安全/dompurify] XSS 防护库命中新 advisory,且修复必须重建前端产物才算落地
- 现象: 例行跑 `npm run audit` 时发现 1 项 low(GHSA-p98j-92pf-mc4p,DOMPurify IN_PLACE 模式下 afterSanitize 钩子移除节点后残留子树的事件处理器仍armed,可致 DOM XSS),影响 3.4.13–3.4.15,本仓实装恰为 3.4.15;而 `scripts/audit-baseline.json` 是 0/0/0/0/0 的真全零基线——按门禁设计,任何新增漏洞都会让 CI 的 `audit:ci` 变红
- 根因: 上游新披露 advisory,非本仓改动引入。关键在于影响面判断:`dompurify` 是本仓 XSS 防护的**实际执行者**(`client/utils/sanitize.js` 唯一消费方,白名单清洗接口备注等富文本,属生产 dependencies),不是无关传递依赖;且它被打进前端产物 `static/prd`——只改 package.json 不重建产物,线上跑的仍是含漏洞的旧 bundle
- 修法: `3.4.15 → 3.4.16`(补丁级,沿用仓库 caret 惯例声明 `^3.4.16`,lock 实装精确 3.4.16);① 8 例行为探针(script 标签/onerror/onclick/javascript: URL/data-* 属性/iframe 全拦截 + 白名单 b/a 保留)全通过;② `npm audit` 与 `npm run audit:ci` 双双归零;③ **`npm run build-client` 重建产物**——产物内版本标记实测 3.4.15→3.4.16,变动面仅 t9 chunk + manifest + assets.js,manifest 39 项资产与 WEBPACK_INITIAL_CHUNKS 逐项核对无缺失;④ 浏览器实测首页正常渲染、无 JS 错误、旧 chunk 正确 404
- 关联: package.json(dompurify 3.4.16)/package-lock.json、static/prd/(t9 chunk 与 manifest 换名)、client/utils/sanitize.js、scripts/audit-baseline.json(维持 0 不变)、TECH_DEBT.md §四.1
- 复发: 0 次 · 教训: 依赖含前端代码时,「升版本」不等于「修复上线」——必须连带重建并提交 `static/prd`,否则线上仍跑旧 bundle(本仓 static/prd 受 Git 跟踪,提交产物即为发布动作);此外零基线安全门禁的价值正在于此:基线为零时任何新 advisory 都会显式暴露,处置时先判断该包是「本仓功能的关键执行者」还是「无关传递依赖」,前者(如 XSS 防护库)应当立即处置而非按低危搁置

## [2026-10-01][TECH_DEBT] 台账多处状态滞后于代码,且「类型门禁零遗漏」口径不成立
- 现象: 排查剩余技术债时逐条对代码核实,发现台账 9 处描述与实况不符:① §三「Compare* flag 尚可收紧」与 §二.3「K 批已收紧」自相矛盾(实况已收紧,§三 未同步);② §四.2 item7 称 CI action「SHA 固定属低优先开放项」(实况 0d8b4f0a 已完成,ci.yml 两处 uses 均为 40 位 SHA);③ §四.2 audit 基线残留 0/0/5/0/5(实况 0/0/0/0/0,与同节 §四.1 冲突);④ P6「Postman cWRP 等价 effect 待补回归用例」(实况 a8715839 已补 4 条);⑤ P7b「NewsList.js:37-40 遗留待查」(文件已随孤儿 News 组件群删除);⑥ P7d「exts/* 通配待删 / 生成器待补 @ts-check 头」(两项均已落地);⑦ §二.3 白名单条数 133/64/61/16(实况 260 条,分布 121/63/61/15);⑧ §三超 100 列「约 11 行/文件」(实况全 test/ 2324 行,集中分布);⑨ §二.3 交叉引用「InterfaceEditForm 永久门禁见§三」指向不存在的条目(悬空引用)
- 根因: 台账为滚动追加式(append-only 语义下的批次行只增不改),批次完成后未回头同步早前条目;而 §三/§四 是「现状描述」区,与「一、已完成」的批次表性质不同——批次表可以只追加,现状区必须随代码更新,两者混用同一文件时缺少「改完代码回写现状区」的固定动作
- 修法: 9 处逐条订正并附提交出处与实测依据(不含糊其辞);另新增 §四.8 登记两项实测新发现——tsconfig 有 4 条指向已删文件的失效白名单条目(干跑验证纯删 4 行后 tsc files 集合与 typecheck 结果均不变),以及 `client/store/addInterfaceStore.js` 带 @ts-check 却实际未受检(生产消费方被后续批次移除后成孤儿 store,仅测试引用);「建议优先级」新增第 6 项给出两项一行级收尾建议
- 关联: TECH_DEBT.md §二.3/§三/§四.2/§四.7/§四.8/建议优先级、tsconfig.json:include(4 条失效条目待清理)
- 复发: 0 次 · 教训: 追加式台账的「现状描述区」必须与批次表分治——改完代码要回写现状区,否则台账会从「索引」退化成「误导源」;核实台账条目真伪的最低成本手段是「拿条目里的可验证断言(条数/文件路径/commit hash/行号)直接对代码复测」,而非通读全文;判断某文件是否真受类型检查,不能只看有无 @ts-check 头,要用注入负向对照(塞一个必然报错的类型赋值,看 typecheck 是否真的红)——本次即靠此发现 1 个带 pragma 却未被检查的孤儿 store

## [2026-09-30][docs/devops] 部署文档宣称「engines 强制校验 Node 版本」,实测 npm 只告警不拦截
- 现象: 迁移指南与部署文档把 Node >= 22.12 写成「engines 已强制」「npm install 会强制校验」;按此理解,运维会以为装依赖失败即等于版本不合格,而实际现象是安装成功、启动时才崩
- 根因: npm 默认不对 `engines` 字段做硬拦截(无 `.npmrc` 的 `engine-strict=true`),仅打 `EBADENGINE` warn。实测:把 engines 改成不可能的 `>=99.0.0` 后 `npm ci` 仍 `added 349 packages` 且退出码 0;真正卡点是插件 wiki 启动期 `require('jsondiffpatch')`(该包 0.7 起 `type: module` 且 exports 只给 ESM 入口),低版本 Node 启动即 `ERR_REQUIRE_ESM`,v18.20.8 实测复现、v22.22.0 实测正常
- 修法: 文档三处改为「npm 只告警不拦截,启动前自行核对 `node -v`」并注明真正的失败现象是启动期 ERR_REQUIRE_ESM;`scripts/migrate-precheck.js` 的低版本警告文案与函数注释同步订正(脚本自身低版本仍可运行,仅告警不阻断的行为不变)
- 关联: docs/devops/upgrade-migration-guide.md、docs/devops/index.md、scripts/migrate-precheck.js:123/454
- 复发: 0 次 · 教训: 环境要求类文档不得替工具链「代言」——凡是写「强制/拦截」,必须实测该工具在违例输入下的真实行为(退出码 + 输出),否则给出的是错误的失败预期

## [2026-09-30][docs/devops] v2.0.0 无全新部署文档,老文档仍教 yapi-cli/vendors 老流程
- 现象: 问「新版本部署文档」时,`docs/devops/index.md` 的环境要求已更新到 v2.0.0,但安装/升级章节仍是 `yapi-cli` + `vendors/` 嵌套目录的老包时代写法;README 甚至写 nodejs 7.6+/mongodb 2.6+,`yapi update` 与 `ykit pack -m` 均不可用于本仓(本仓是根目录 npm 工程,前端产物 static/prd 随仓库提供)
- 根因: 大版本重构把部署形态从「yapi-cli 下载到 vendors/」换成「直接 checkout 根目录工程」,但没有对应的部署文档分册;旧文档只改了环境要求段,流程主体未同步
- 修法: 新增「v2.0.0 全新部署」正文(环境要求/准备代码/安装依赖/初始化数据库/启动服务/部署验证/服务管理/升级与迁移/本地开发启动),清理 yapi-cli 与 vendors 遗留章节;迁移指南(R v1.x→v2.0.0)移入 devops 书并由 SUMMARY 收录,与 `interface-category-migration.md` 并列;README 部署段与 `redev.md` 同步改写。全流程在 git archive 出的干净目录 + 空库实测(install-server/启动/管理员登录/mock/pm2 全通),非纸面推导
- 关联: docs/devops/index.md、docs/devops/SUMMARY.md、docs/devops/upgrade-migration-guide.md、README.md、docs/documents/redev.md
- 复发: 0 次 · 教训: 部署流程变更后要一并核对「文档站是否收录」——本次迁移指南原在 docs/ 根目录,不在任何书的 SUMMARY 里,站内文档站根本读不到;写文档时同步 `npm run docs` 验证章节与锚点真实可达

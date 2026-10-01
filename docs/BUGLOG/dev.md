# BUGLOG — dev 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

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

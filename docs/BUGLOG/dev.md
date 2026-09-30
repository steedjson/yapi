# BUGLOG — dev 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

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

# BUGLOG — dev 已知坑与修法(append-only,最新在上)

条目由 /csl-buglog 或人工维护,供 coder/reviewer 动手前核对

## [2026-10-08][已裁决·勿改] swagger_url 服务端抓取任意 URL(SSRF 面):产品裁定维持现状,仅登记风险
- 现象: `GET /api/project/swagger_url?url=<任意>` 让服务端 `axios.get(url)` 抓取任意地址（同类面另有 `exts/yapi-plugin-swagger-auto-sync` 的 `getSwaggerContent`）;全仓无 SSRF 防护（无协议白名单/内网黑名单）
- 根因: 该端点的功能本质就是「用户给地址、服务端代抓 swagger 文档」——内网部署场景下抓内网地址是**功能诉求**而非缺陷;故不存在「漏加校验」的根因,属功能边界与安全边界的权衡
- 裁决: **用户裁定（2026-10-08）：维持现状、仅登记风险、零代码改动**。依据:本仓库为内网部署形态（`docs/devops/` 部署文档面向内网自建）,端点可达前提是已过登录态鉴权（非匿名可达）,实际暴露面限于「已登录用户探测内网」,风险等级低;加限制会改变功能边界
- 关联: server/controllers/project.js(swaggerUrl)、exts/yapi-plugin-swagger-auto-sync/interfaceSyncUtils.js(getSwaggerContent)、TECH_DEBT.md「四、13」
- 复发: 0 次 · 教训: ①**这是已裁决的接受风险,后续审计/评审不得再按缺陷上报或"顺手加固"**——安全审计发现的问题需先区分「缺陷」与「功能边界的权衡」,后者属产品决策;②若未来安全需求升级,候选方案已评估留档（限协议 http/https、内网网段黑名单配置化开关）,届时按新需求重新裁决

## [2026-10-04][鉴权] 全端点授权面审计:log 两端点越权读(自报 typeid 无域判定),同类漏洞须一次扫净
- 现象: 承接 get_env 教训做全端点授权面系统审计（router.js 枚举 + 逐控制器核对项目/分组域判定），发现 `server/controllers/log.js` 两端点同型缺陷——`list`(GET /api/log/list) 与 `listByUpdate`(POST /api/log/list_by_update) 均按请求方**自报的 typeid** 直接查询，无任何域判定：任意登录用户可读他人项目/分组的操作日志（含项目名/操作内容/用户名）与接口变更记录（含路径与方法）
- 根因: 与 get_env 同源——端点被当作「按 id 查数据」的纯查询实现，未把「id 属于谁的域」纳入；且 `listByUpdate` 的窄投影只取 `basepath`，即便想判定也取不到 `project_type`（投影面与判定需求不匹配）
- 修法: 对齐同资源既有 view 级口径——分组按 `checkAuth(typeid,'group','view')`、项目按「private → `checkAuth(typeid,'project','view')`，公开放行」（与 project.get/interface.list 一致）；`listByUpdate` 投影扩为 `'basepath project_type'`；拒绝态**先判后查**（不触达日志查询，防先查后判的信息泄露窗口）。验证：`test/server/log-authz.test.js` 10 例（项目/分组域 × 非成员 406 且不触达查询/公开放行不调 checkAuth/成员放行/缺参回归/反恒真域参数可区分）
- 关联: server/controllers/log.js、test/server/log-authz.test.js、TECH_DEBT.md「四、13」
- 复发: 0 次 · 教训: ①**同类漏洞必须一次扫净**——get_env 是评审旁注偶然命中，本次改为「枚举全部端点 × 逐个核对域判定」的系统审计，同轮又抓到 2 处；②判定「端点是否需要域判定」看它是否**按请求方自报的资源 id 访问数据**（自报 id + 无域判定 = 越权读候选）；③窄投影（`select`）与判定需求必须匹配——`listByUpdate` 只取 basepath 导致即便想判定也拿不到 project_type，扩投影是修复的必要部分；④拒绝必须**先判后查**，先查后判会留下信息泄露窗口（即便最终返回 406，查询本身已发生）

## [2026-10-08][静默失败] 空 catch 与「只吞不记」:三分法处置(用户可见的错误响应不算静默)
- 现象: 承接未处理拒绝面收口,换维度扫静默失败——全仓空 catch 2 处（`server/controllers/open.js:108` 兼容层、`server/utils/token.js:84` token 解码）、「catch 内无 log/console/throw」176 处（前端 69 + 服务端 107）
- 根因: 三类形态性质完全不同,不能一刀切——① **错误响应已回给用户**（`resReturn(null, 4xx, e.message)` 约 80 处）:非静默,用户可见;② **有意的降级**（前端 JSON 解析失败给默认值、`mockEditor` 解析失败返回原文、`sandbox` worker 死亡走崩溃路径）:设计如此,仅缺说明;③ **真静默**（吞掉错误且调用方无从得知）
- 修法: 三分法处置——① 不动（用户可见）;② 补一行说明其「有意」语义（`open.js` 兼容层、`token.js` 的解码失败=无效凭据 fail-closed）;③ **实际修复 1 处**:`exts/yapi-plugin-swagger-auto-sync/interfaceSyncUtils.js` 的 `getProjectToken` catch 原为裸 `return ""`（取 token 失败 → 空 token 传给导入接口鉴权 → 失败无迹可查），改为记录 error 日志后仍返回空串（保持调用方契约、让失败可见）
- 关联: server/utils/token.js、server/controllers/open.js、exts/yapi-plugin-swagger-auto-sync/interfaceSyncUtils.js
- 复发: 0 次 · 教训: ①「静默失败」审计必须先做**三分法**再动手——把「错误响应已回给用户」当静默会造出大量假阳性（本轮 176 处里约 80 处属此类）;②空 catch 若确为有意,必须写一行说明其语义（`// 有意静默: …`）,否则下一个读者（或下一个 agent）会把它当缺陷反复上报;③真静默的判据是「失败后调用方无从得知且行为可能出错」——本轮仅 1 处命中,即取 token 失败却继续以空 token 请求

## [2026-10-08][依赖审计] 新披露 advisory 分两条路:有修复版的 overrides 消除,无修复版的基线登记
- 现象: 未处理拒绝面批次推送后 CI 的 audit 门禁变红（high 9→10、moderate 0→4、total 9→14）——上批（2026-10-04）登记后新披露 5 项:source-map-js high（事件循环 DoS，1.0.0–1.2.1）+ sprintf-js moderate（无界精度 DoS）+ argparse/js-yaml/supertap（sprintf-js 传递链，均 ava 系）
- 根因: 上游新披露，与本批改动无关（窗口期新 advisory）。两类性质不同:source-map-js **有修复版**（1.2.2）；sprintf-js 系**无修复版**（npm 给出的唯一 fix 是把 ava 从 6.x 降级到 1.4.1，major 降级，拒绝）
- 修法: 分两条路处置——① **有修复版即修**：`overrides` 增 `"source-map-js@1": "1.2.2"` → npm install → 实测 high 10→9；该包在 rsbuild/jsdom/sass 的 devDeps 链、不进客户端 bundle，验证含 build-client 产物聚合哈希逐字节不变（cbf3a1e7…）；② **无修复版即登记**：基线由 0/9/0/0/9 更新为 0/9/4/0/13（附完整链传导与逃逸核查备注），audit:ci 实测 delta 全 0 通过，离线回归 8 例全绿
- 关联: package.json(overrides)、package-lock.json、scripts/audit-baseline.json、TECH_DEBT.md 四.1、CI run 37738161950
- 复发: 0 次 · 教训: ①CI audit 变红先分类「有无修复版」——有修复版（哪怕在 devDeps 链）就 overrides 精确升级消除，别直接登记基线；无修复版才走登记+复核触发条件；②overrides 升依赖后必须实测「构建产物零漂移」（构建链上的包版本变化可能改产物），本次 cbf3a1e7… 不变即证；③窗口期新披露会让「已登记基线」的批次照样变红——这是门禁按设计工作（对新增项失败），不是回归

## [2026-10-04][未处理拒绝] 20 处 fire-and-forget 裸 .then() + ws 异步 handler 无内层兜底:全仓无进程级兜底,后台失败即杀进程
- 现象: 全仓 20 处「操作后顺带写库/触发钩子」写作 `.then();`（无 catch）;`emitHook` 会把插件监听器异常以拒绝形式透出,而全仓无 `unhandledRejection`/`uncaughtException` 兜底——Node ≥22 默认未处理拒绝即终止进程（实测:仅一个被拒绝的 promise 就让进程 exit=1）。另两处 ws 缺陷:interface `solveConflict` 在 `Model.get` 返回 null（接口已删）时 `result.edit_uid` 抛错被 catch 吞掉 → websocket 一帧不发、前端只能等 3 秒超时降级;wiki `wikiConflict` 的异步 message handler 抛错会外泄为未处理拒绝（外层 try 覆盖不到异步回调）
- 根因: ①「顺带做」的副作用被当作可忽略——作者本意是不阻塞主流程,但用 `.then();` 表达等于把失败升级为进程级事故;②ws 处理器把 try/catch 写在了注册处（同步段）而业务逻辑在异步回调里,防护错位;③`websocketMsgMap` 用 `map[msg]` 直接调用,未知消息 TypeError
- 修法: ① 新增 `commons.fireAndForget(promise, label)` 单一出处（不改变调用时序、拒绝转 error 日志）,20 处站点全量改造,并加**「server/ 与 exts/ 下无裸 `.then();`」不变量锁测**（含检索面非空反恒真守卫）;②interface null 分支回错误帧 `{errno:0,data:null,errmsg:'接口不存在，已取消编辑锁'}`（前端立即进入可编辑态,不再等超时）;③wiki 异步 handler 补内层 try/catch + 未知消息守卫——**守卫必须用 `Object.prototype.hasOwnProperty.call(map, msg)`**:仅查 `typeof map[msg] !== 'function'` 会被继承属性穿透（`'toString'` 是 Object.prototype 的函数,`map['toString']` 返回函数、`__proto__` 同理）,该缺口由本批测试实测发现并修正
- 关联: server/utils/commons.js(fireAndForget)、server/controllers/{interface.js,interfaceCol/*,project.js,project/queryMethods.js,interface/*}、exts/yapi-plugin-statistics/server.js、exts/yapi-plugin-wiki/controller.js、test/server/fire-and-forget.test.js、TECH_DEBT.md「四、11」
- 复发: 0 次 · 教训: ①「后台失败不该影响主流程」的正确表达是**显式吸收**（`.catch` 或统一助手）,不是 `.then();` 裸奔——尤其在全仓无进程级兜底时,一行裸 then 等于一个进程级隐患;②用不变量测试把「不得再出现裸 `.then();`」锁死（比逐处 review 可靠,新增站点即报红）;③ws/异步回调的 try/catch 必须写在**回调内部**,写在注册处等于没写（防护错位）;④对象字面量的成员守卫必须用 `hasOwnProperty` 判定,`typeof obj[key] === 'function'` 会被 `toString`/`__proto__` 等继承键穿透——这是本轮测试抓到、肉眼 review 会漏的真实缺口

## [2026-10-04][编辑锁] 持锁人账号被删:websocket 编辑锁崩溃 + 滞留(两处同形隐雷一并收口)
- 现象: wiki `editorFunc` 与 interface `solveConflict`(两处 websocket 编辑冲突处理器)同形缺陷——持锁人 `edit_uid` 指向的账号被删除后,`findById` 返回 null → `userinfo.username` 崩溃;且锁滞留:interface 侧 TypeError 被 catch 吞掉 → websocket 零发送(前端 3 秒降级为可编辑,锁语义失效)、wiki 侧为**未处理拒绝**(async 消息监听器无内层兜底,Node ≥22 无全局 handler → 进程级风险);wiki 的 close 回调为空实现,锁滞留无自愈
- 根因: 代码假设「edit_uid 指向的账号必然存在」,而账号删除与编辑锁的生命周期未对齐——已删账号无法通过 checkLogin 发起任何保存(checkLogin 对已删 uid 一律拒绝),其锁不保护任何真实编辑者
- 修法: 两处同构——busy 判定改以「findById 解出的 userinfo 是否存在」为准;持有者不存在 → 走 else 分支移交锁(`upEditUid(文档id, 当前uid)` + errno 0)自愈;持有者存在/edit_uid=0/本人三态与修复前逐位一致(探针逐字节比对)。验证:10 例常驻回归(两处四态 + wiki null 短路 + 消息链路恰 1 帧断言,findById/upEditUid 调用记录反恒真)+「修复前必红」对照探针(wiki 抛 TypeError、interface 零发送);全量 1272 绿、产物零漂移
- 关联: exts/yapi-plugin-wiki/controller.js、server/controllers/interface.js、test/exts/wikiEditorLockOrphan.test.js、test/server/interfaceSolveConflictOrphan.test.js、TECH_DEBT.md「四、11」
- 复发: 0 次 · 教训: ①协作锁的持有者生命周期必须与账号生命周期对齐——「持有者账号已删 = 锁失效」,否则崩溃 + 文档永久只读双重缺陷;②同一隐雷实例成组出现(advanced-mock/list、wiki/editorFunc、interface/solveConflict 三处同形),一处发现后必须全仓扫同形一次清完;③「修复前必红」对照不得做成依赖 git 历史的常驻用例(CI 为浅克隆 fetch-depth 1,`git log/show` 回溯必失效)——以探针完成并留档,常驻套件只钉修复后行为;④websocket 处理链的未处理拒绝面(未知消息、Model.get null、fire-and-forget 写库无 catch)为既有同类面,已登记待专项批

## [2026-10-04][高级Mock] 「守卫被写成注释」的历史 fix 会留隐雷:list 的 userinfo 空值崩溃路径
- 现象: `exts/yapi-plugin-advanced-mock/controller.js` 的 list 对每条用例执行 `result[i].username = userinfo.username` 且无守卫;用例创建者账号被删除后再访问该接口 → TypeError → 外层 catch 兜 400,整个期望列表不可读
- 根因: git 史实——2018-06-26 的 `f986eb40`「fix: 用户从用户列表中删除后访问高级mock报错」把守卫写成**注释态**(`// if (userinfo) {` + `// }`)同时加了 try/catch,即以「崩溃转 400」冒充修复;守卫从未以活代码存在过;2026-10 注释清理批删除注释态残留后行为不变(守卫本就未执行),但文件内线索消失、隐雷仍活
- 修法: 恢复为活守卫 `if (userinfo) { result[i].username = userinfo.username; }`,对齐 `server/controllers/interface.js:287-289` 的同形活口径(同「创建者可能已被删」场景);失配路径由「整请求 400」改为「errcode 0 + 该项无 username」;3 例回归用例(失配/命中/混合 + findById 调用记录反恒真)并以 HEAD 内存编译对照证「修复前必红」(HEAD 实测 400,工作区 0);全量 1262 绿
- 关联: exts/yapi-plugin-advanced-mock/controller.js、test/server/advmock-auth-scope.test.js、历史 commit f986eb40、TECH_DEBT.md「四、11」
- 复发: 0 次 · 教训: ①**把守卫写成注释、再用 try/catch 兜崩溃,不是修复**——「整请求失败」比「跳过缺失字段」更糟,且注释里的意图永远不会执行(2018 年那笔 fix 把它当修法,埋了 8 年);②清理注释残留时,凡「注释态 if / 守卫 / 包裹括号」形态要单独判定:它可能是「作者意图未落地」的信号(应恢复为活代码或至少上报),不能当普通残留删;③判定「该恢复成什么形态」的最快依据是找同场景先例(interface.js 的活守卫)

## [2026-10-04][鉴权] 注释态权限校验是历史欠账的线索:get_env 跨项目越权读(任意登录用户可读任意私有项目 env)
- 现象: 注释 triage 批的评审随批指出——`server/controllers/project/envTokenMethods.js` 的 getEnv 仅校验 project_id 非空,随后直接 `Model.getByEnv` 返回;任意登录用户凭 project_id 可读任意项目(含私有)的 env,`env[].header` 可能含目标 API 密钥 → 跨项目信息泄露(同资源 project.get 守私有、getEnv 裸奔 = 可见性口径分裂)
- 根因: 该检查曾被移除、只留注释态痕迹(注释态 checkAuth 与散文「去掉权限判断」);注释批把痕迹删掉后线索才被评审当成「现状线索」上报——本质是「被注释掉的安全校验从未被当作既存暴露面审计过」:读类端点的项目域可见性判定整体缺失
- 修法: 对齐同资源既有口径(queryMethods.get)——私有项目需 `checkAuth(id,'project','view')`(项目成员,含 guest),否则 406「没有权限」;公开项目维持现状;payload 形状不变;`Model.getByEnv` 未动(open.js token 域路径零影响)。验证:24 例负向单测(HEAD 对照证非恒真、拒绝态未触达 env 查询、id 双形态、角色矩阵)、reviewer 逐入口核对 PASS、主 Agent 对抗性 HTTP 矩阵 **14/14**(真实服务/两账号/三项目:A 凭证打 B 资源 406、禁用账号 401、无效凭据 40011、token 无旁路、回归三连,406 响应体实测无 env 内容)
- 关联: server/controllers/project/envTokenMethods.js、test/server/getenv-authz.test.js、TECH_DEBT.md「四、12」
- 复发: 0 次 · 教训: ①读类端点同样要做「项目域可见性判定」——只做登录态不等于授权;同资源的可见性口径必须在全端点对齐(先例:project.get 守私有 vs get_env 裸奔);②被注释掉的安全校验是历史欠账的高危线索——清理注释时凡命中 checkAuth/权限/校验语义的注释态代码,一律先当「既存暴露面」审计再删,不得当普通残留处理;③判定口诀增补:在「白名单放行 ≠ 端点可用」「资源域判定先于全局角色早退」之外,新增「**登录态 ≠ 项目域授权**」

## [2026-10-04][工具通道/清理] git grep -E 不支持 \s 与 \b 却静默失配:清洁度审计曾据此得出「注释掉的语句=0」假阴性
- 现象: 清洁度扫尾审计首轮用 `git grep -nE '^[[:space:]]*//[[:space:]]*(const|let|var|...)\b'` 得「注释掉的语句=0」并写入台账;扩大扫样式复核时发现 `// const projectId = this.props...` 明明存在——该模式因 `\b` 未被支持而整体失配(同类先例:上一批 tester 报告 `git grep -E` 不支持 `\s`,单次假阴性 0 命中)
- 根因: 本机 git 的 ERE 引擎不支持 PCRE 的 `\s`/`\b` 等转义类,不报错、静默失配;审计若只看「零命中」就下「干净」结论,会把「工具不会查」误当「仓库没有」
- 修法: 全部改用 POSIX 字符类(`[[:space:]]`)或 rg 双通道交叉复核;台账「四、11」的假阴性结论已订正;triage 批据此重扫得 **112 处真实候选**(首轮仅 40+ 且漏掉整类 require/import 残留)并全部 triage(删 169 行/54 文件)
- 关联: TECH_DEBT.md「四、11」、注释历史代码 triage 批(本次提交)
- 复发: 2 次(上批 tester 同类 + 本轮)· 最近 2026-10-04 · 教训: ①审计类「零命中」先当通道可疑处理,第二通道(rg/换引擎)复算后才可下结论;②`git grep -E` 只按 POSIX ERE 写,禁用 `\s`/`\b`/`\d`;③把「工具不支持某语法却不报错」列为本仓审计高危陷阱,凡正则驱动的审计结论都要写清引擎与模式

## [2026-10-04][清理批] 注释批的验收必须以非注释 token 等价兜底:目检 diff 会漏掉「保留注释却删掉 if 行」的锚定替换事故
- 现象: 清理注释态调试残留(16 文件 29 行)时,其中一处 Edit 的锚定替换写反——server/controllers/base.js 的 checkRegister 保留了注释行、却删掉了 `if (yapi.WEBCONFIG.closeRegister) {` 行(余下 `return false; } else {` 成语法破坏);当批自查(逐文件读改后状态)发现并修复,交付态 16 文件非注释 token 流与 HEAD 全等
- 根因: 批量删注释常用「old=注释行+下一行 / new=下一行」的锚定替换,行首缩进是否参与匹配的语义容易写反(写反即保留注释、删掉代码);而 31 行删除的 diff 里混入 1 行代码删除,在局部窗口目检时并不显眼,语法错误还可能延后到运行期才暴露
- 修法: ① 交付前机械核验——新增行数=0、删除行全部匹配 `^\s*//` 或空行、逐文件对照;② 独立验证以 **AST + 非注释 token 流等价** 为第一优先(tester 复跑 16/16 等价、28,392 token 零差异,并以「复刻该事故形态」的负向对照证明手法能检出);③ 事故与修复过程如实留痕(台账 §四.11)
- 关联: server/controllers/base.js、16 文件注释残留清理批、TECH_DEBT.md「四、11」
- 复发: 1 次(当批自查并修复) · 教训: ①「纯删除注释」改动的正确性判据是「非注释 token 流不变」,不是目检 diff;②批量的机械编辑必须配机械核验(新增 0 行/删除行全为注释/逐文件对照),再叠加独立 AST 等价证明;③负向对照要复刻已知事故形态(而非泛泛变异),证明验证手法抓得住它

## [2026-10-04][门禁机械] 门禁自己的解析器也会静默误读:尾随逗号正则改写字符串值、未闭合注释静默截断配置
- 现象: 批 C 评审发现门禁测试共享辅助 readJsonc(test/build/gate-helpers.js)有两处继承自 HEAD 的静默失败——① 去尾随逗号的全局正则 `,(\s*[\]}])` 作用于整段文本,字符串字面量内的 `,}`/`,]` 被静默改写(实测 `{"glob": "a,}b"}` → `a}b`);② 块注释未闭合且其后无有效文本时输出前缀,若前缀恰可解析即静默返回残缺配置(实测 `{"include":["x"]}\n/* unclosed` → `{"include":["x"]}`)——门禁读 tsconfig 时等于可能读到假配置(假绿)
- 根因: 容错逻辑是「先整体剥注释 + 后全局正则」两段式,两步都不感知字符串边界与未闭合状态;而这类「门禁机械自身」的静默失败没有下游断言兜底——它的输出就是断言的输入
- 修法: readJsonc 重写为单遍状态机——注释剥离与尾随逗号剥除同遍,逗号仅在字符串外且其后(跳过空白/注释)紧邻 `]`/`}` 时删除;块注释/字符串未闭合显式抛错(消息含文件路径);新增 14 例直测(两条旧缺陷回归钉经在旧实现上复跑确证非恒真);两份真实 tsconfig 解析 sha256 与 HEAD 逐字节一致;全量 1232 全绿
- 关联: test/build/gate-helpers.js、test/build/gate-helpers.test.js、TECH_DEBT.md「四、10」⑦
- 复发: 0 次 · 教训: 门禁与工具链自己的解析/预处理要和被检对象同等对待——它的静默误读会让整条门禁读到假事实(输出即下游断言的输入);「容错解析」必须显式处理字符串边界与未闭合状态,并把「解析不出」变成响亮失败而非尽力而为;回归钉要拿旧实现复跑一遍证明它真会红,否则钉可能恒真

## [2026-10-04][类型门禁/TS] catch 的类型注解被 TS 硬约束限定 any|unknown;「实测对齐」必须写清对齐的是哪一面
- 现象: 批 B 吸收上批评审观察项时,P4「`catch (/** @type {Error} */ err)`」被 TS 7.0.2 直接拒绝(**TS1196: catch 子句变量类型注解只能是 any 或 unknown**);另 marker 识别器沿用注释写「与 TS 探针实测逐条对齐」,而实测 TS 还容忍 `///@ts-check`、大小写变体、`// @ts-check:` 等拼写(识别器不认)——方向安全(只响亮误报)但声明强于事实
- 根因: ① TS 对 catch 子句类型标注面有硬约束,仓库 20+ 处旧写法是 `@type {any}`(合法但关闭检查);② 「探针实测对齐」容易被写成「等价」,而实测只覆盖样本集:位置面(shebang 后/前导注释块后/代码后/块注释内)对齐 ≠ 拼写面等价(TS 匹配器比探针样本宽)
- 修法: ① catch 落 `@type {unknown}`(TS 7 裸 catch 的默认语义,显式化)+ 使用点 `/** @type {Error} */ (err).message` 断言——探针证实断言承重(去掉即 TS18046),三处抛出源(fs.readFileSync/JSON.parse)均为 Error 系;② 识别器注释改为「位置面逐条对齐、拼写面为 TS 的保守子集(宁窄不宽)」并写明方向安全性,识别器本体按 TS 探针语义重写(唯一识别器 hasTsCheckMarker + 8 正例 9 反例自证);③ 根级配置 6 文件 + visual 工具链 2 文件纳入(marker + 27 处纯注解,AST 6/6 独立等价),全量 1217 全绿、static/docs 沙箱 diff 逐字节一致
- 关联: scripts/audit-check.js、scripts/build-docs-site.js、test/build/build-tscheck-coverage.test.js、rsbuild.config.mjs、tsconfig.json(264)、TECH_DEBT.md「四、10」
- 复发: 0 次 · 教训: ①TS 的 catch 类型注解只接受 any|unknown(TS1196)——要收紧 catch 只能靠使用点断言,别在 catch 位置写具体类型;②凡「实测对齐」的声明必须写清覆盖的是哪一面(位置/拼写/语义),把样本集外推成「等价」就是声明失真;保守子集的正确表述是「宁窄不宽 + 方向安全(只误报不漏检)」并附探针证据

## [2026-10-04][类型门禁] 「受检 = marker ∧ 在 include 内」:锁单腿必留静默脱检;并发 QA 探针勿落进被枚举的共享目录
- 现象: 全仓门禁面审计发现 scripts/ 5 个脚本(文档站构建/审计门禁实现/迁移工具/antd5 扫描器)整体不在任何 tsc 工程内,根级构建配置(rsbuild.config.mjs 等 6 个)同样游离;另有 2 处装饰性 marker(scripts/build-docs-site.js、test/client/visual/prdRules.js 带 @ts-check 却不在 program 内)
- 根因: 门禁为「白名单 + marker」双开关,白名单逐文件维护(scripts/ 从未纳入);而 marker 判定的两条腿(marker 本身 + 在 program 内)此前没有任何测试同时锁住——带 marker 但未入 include 的文件,marker 断言全绿而 tsc 根本不加载它(负向对照实测成立);另发现 TS 对 marker 的位置容差(shebang 后/前导注释块后均识别),测试正则口径想当然会把真实受检文件误报为未受检
- 修法: scripts/ 5 文件纳入(marker + 114 处纯注解;AST 5/5 等价 + token 流实证除 +5 对断言括号外零 token 变化)+ tsconfig.json 白名单 253→257 + tsconfig.build.json include 增 scripts/**/*.mjs;两条腿各锁一个测试(既有 marker 不变量 + 新增 include 覆盖不变量,含反恒真守卫与负向对照实测);零产物变更实证(static/docs 重建 71 文件 sha256 一致、antd5 扫描输出等价、static/prd 聚合哈希不变);门禁 1215 全绿
- 关联: scripts/{audit-check,build-docs-site,migrate-precheck,antd5-css-lib.cjs,antd5-candidate-scan.mjs}、tsconfig.json、tsconfig.build.json、test/build/{build-tscheck-coverage,scripts-tscheck-include-coverage}.test.js、TECH_DEBT.md「四、10」
- 复发: 0 次 · 教训: ①门禁是「逐文件 opt-in(白名单/marker)」结构时,必须同时锁「有 marker」与「在 program 内」两条腿——单腿断言下,删 include 条目或漏加白名单都会静默脱检且测试全绿;②TS pragma 的位置容差(shebang 后、前导注释块后都算)必须实测,测试正则要与 TS 行为对齐;③并行 QA 时负向对照探针不要放进被测试枚举的共享目录——本轮 reviewer 的 AVA 运行曾把 tester 在 scripts/ 里瞬时创建又删除的探针当成真实文件报出(输出与工作区不符),双方独立复核后确认为并发外部残留、非工具伪造;探针应在 /tmp 或 try/finally 保证清理

## [2026-10-04][build/死文件] 「有人 require」≠「有人消费」:require 本身可能是死导入;lint 枚举目录会让根文件整片游离
- 现象: 收口 §四.9 尾巴时复核 build/clientBuildConfig.js——唯一存活依据是 rsbuild.config.mjs:31 的 require,而它是**未使用导入**(全仓仅此一处引用 + 一个测试文件)。三个导出逐一溯源全部无消费方:getPluginExclude(webpack 时代 module.rules 排除项,webpack 已退役)、getDefineValues(被 rsbuild.config.mjs:43-49 就地重实现)、normalizeAssets(被 collectChunks/buildWebpackAssets live 重实现)
- 根因: 三层近似判据叠加——① 迁移期批次记录写的是「因 rsbuild.config require 存活而保留」,只看了 require 存在、未验证该导入是否被使用;② lint 脚本枚举目录(client/ server/ common/ exts/ test/ scripts/…)不含仓库根,rsbuild.config.mjs 等 8 个根文件整片游离,no-unused-vars 对死导入形同虚设;③ eslint 9 平铺配置只给 files 命中的块挂规则,.mjs/.cjs 未显式并入时是「被 lint 但 0 规则」(实测 --print-config 规则数 0→85)
- 修法: ① 删除死模块 + 孤儿测试(static/index.html 页面契约断言迁入 test/build/rsbuild-assets.test.js)+ 去死导入 + 注释去悬挂引用,重建 static/prd 聚合哈希逐字节一致(0 文件变动);② lint 改全仓 `eslint .`(config ignores 收敛),files 扩到 .js/.jsx/.mjs/.cjs,根级 8 文件与 build//scripts/ 的 .mjs/.cjs 一并受检(450 文件 0/0);③ 把「build 必须在 lint 范围、四类扩展名必须有规则、ignores 不得排除 build」锁进 test/build/build-tscheck-coverage.test.js。测试数 1211→1213
- 关联: build/clientBuildConfig.js(已删)、test/common/clientBuildConfig.test.js(已删)、rsbuild.config.mjs:31、eslint.config.js、package.json(lint 脚本)、TECH_DEBT.md「四、9」与批次表 Rsbuild 阶段四行订正
- 复发: 0 次 · 教训: 判活模块要看**导出面是否被调用**,而不是「有没有 require 它」——require 可能正是未被使用的死导入(尤其构建配置里 require 纯函数模块无副作用,删了也不报错);门禁广度同理:枚举目录的 lint 范围必然随时间漏掉新目录与根文件,能全仓就别枚举;平铺配置下「文件被 lint」不等于「规则生效」,纳入新扩展名后必须用 --print-config 看规则数,而不是看退出码

## [2026-10-04][依赖审计] 新 advisory 无修复版:门禁报红不可用 --force 降级换绿,「基线登记+复核触发条件」才是出口
- 现象: 推送 build/ 类型门禁批次(be582ca4)后 CI 变红,失败步是 audit 基线差分门禁(high 0→9 / total 0→9,run 37179327896);9 项全部同源于单条 advisory——braces 栈耗尽 DoS(GHSA-vfj7-8cjw-p6xm,CWE-674,CVSS 7.5,深嵌套模式致栈溢出),影响 <=3.0.3(全部已发布版本),advisory 标注无 patched version
- 根因: 上游新披露 advisory,与本批改动无关(上一轮 CI 2026-10-01 绿且 0 漏洞,窗口期新披露)。传导链三条全在 devDependencies:ava→globby→fast-glob→micromatch→braces、nodemon→chokidar→braces、patch-package→find-yarn-workspace-root→micromatch→braces。逃逸核查全灭:chokidar@4 移除 braces 但 nodemon 硬依赖 ^3.5.2;micromatch@4.0.8 仍依赖 braces ^3.0.3;生产链 npm audit --omit=dev 实测 0 项
- 修法: 仓库既定流程「npm audit fix 或 overrides 修复 → 实测归零 → 下调基线」的前提是上游有修复版;本例无 patch 版本、三条链均无逃逸,故走设计内第二出口:scripts/audit-baseline.json 由 0/0/0/0/0 登记为 0/9/0/0/9(附风险面核查与复核触发条件备注),门禁对新漏洞的拦截能力不变;TECH_DEBT §四.1 同步留痕。拒绝的选项:npm audit fix --force(仅提议 nodemon 降级到 1.14.10,2017 年版)与删除/放宽门禁
- 关联: scripts/audit-baseline.json、TECH_DEBT.md §四.1、CI run 37179327896、commit be582ca4
- 复发: 0 次 · 教训: 安全门禁报红先分「有修复版」与「无修复版」两条路——有则升级归零后下调基线;无则做三件事:①实测真实暴露面(生产链 --omit=dev 单独跑、确认传导链是否攻击者可控),②基线登记并写清复核触发条件(如 braces 发布 >3.0.3 后升级回落),③留痕出处(台账+BUGLOG)。绝不用 --force 把工具链降级九年换 CI 变绿——那是负收益交易

## [2026-10-01][build/类型门禁] 给客户端模块图内的空垫片加 @ts-check 会改产物 manifest 名;纯注解批次必须以「重建零 diff」验收
- 现象: build/ 目录纳入类型门禁时,给 build/empty-module.js(5 行空垫片,module.exports = {})加 `// @ts-check` 后重建,static/prd 的 manifest chunk 名从 `manifest@08fdc614f9362e05.js` 变为 `manifest@5538fe94…`——内容仅 37 处单字符 c↔f 互换(压缩器局部变量名 swap),语义等价但字节不等价;删除后又复原。该文件经 resolve.fallback(rsbuild.config.mjs 的 https/vm)进入客户端模块图
- 根因: 未完全定位。实测表明其源码内容参与客户端压缩器的命名 tie-break,且**不可预判**:加 @ts-check 确定性触发(三方独立复现);另加一段多行说明注释触发为第三个名字(f3b7dd8e…);而一行短中性注释未触发(仍 08fdc614…)。对照组:同批 build/shims/setImmediate.js 加 @ts-check + JSDoc 后产物 0 变动——说明敏感性是「文件相关」而非常态,不能推广为「模块图内文件加注解都会漂移」
- 修法: 该文件裁决为**有意免检**并保持与 HEAD 逐字节一致(它是空垫片、零类型错误,纳入门禁零收益;而守住「注解批次零产物变更」不变量价值更高);豁免理由与实测记录登记在 tsconfig.build.json 的 JSONC 注释;新增 test/build/build-tscheck-coverage.test.js 用「sha256+字节数钉死豁免文件、受检集合≡build/ 下除豁免清单外全部」把不变量锁住(防后人顺手加 marker 再触发漂移)
- 关联: tsconfig.build.json(豁免注释)、build/empty-module.js、test/build/build-tscheck-coverage.test.js、rsbuild.config.mjs:119-120、TECH_DEBT.md「四、9」
- 复发: 0 次 · 教训: ①「纯注解/配置类改动不产生产物 diff」是仓库的重要不变量,但**不是免费的**——必须先重建验证(本轮 57 处注解全部零产物变更,唯 empty-module 一例例外,靠逐文件隔离回滚法定位到单文件);②分层判据:先「整体重建是否 clean」,不 clean 时用「除 X 外全部改动」二分定位;③给**模块图内**文件加任何内容(marker/注释都算)前,先想清楚它会不会进产物哈希链——空垫片这类文件宁可免检也不要冒险;④门禁是逐文件 opt-in(`checkJs:false` + marker)时,漏写 marker 会**静默脱检**,必须用测试锁「受检集合」(本轮已落地)

## [2026-10-01][全仓] 死文件扫描:静态构图只出候选,判死须叠产物对照;「文件名词干命中」判据会把注释当引用
- 现象: 清理孤儿 store 后顺势做全仓死文件扫描。第一版判据是「文件名词干是否出现在全仓语料」——只报出 1 个候选(且是误报:被文档/测试头注释提及即命中),几乎全漏。改用「真实 import/require 语句构图 + 从入口 BFS 求可达」后报出 14 个候选
- 根因: 两个反向的判据缺陷——① 词干匹配过宽:注释、文档、日志文本里的文件名都算「被引用」,把死文件洗白成活的;② 静态构图过窄:漏掉 `path.resolve(WEBROOT,'common/lib.js')` 拼接、webpack 别名(`client/`/`common/`/`exts/`)、`requireAny` 等间接加载形式,把活文件误判为死。14 个候选里 11 个属后者(lib.js/plugin-module.js/ldap.js/sandbox_child.js/build 侧 shim 等逐个复核后确认都在用)
- 修法: 确立三段式判定——① 构图出候选(BFS 可达性,允许误报);② **产物侧交叉对照**(用该模块独有字符串在 static/prd 全量 chunk 检索,并配对照组:同法检一个已知可达的同类标识,零命中才算证据);③ 删除后重建产物,看是否 0 文件变动(逐字节一致即从构建侧独立佐证不在 import 链上)。本轮据此删除 3 个真死文件:`client/containers/index.js`(barrel,零 import)、`common/formats.js`(26 项 format 数据,原消费者 Postman/interfaceCol/commons 现均已无引用)、`exts/yapi-plugin-statistics/test.js`(2017 上游遗留造数脚本,且调用 driver 6.x 已移除的 `collection.insert()`,实测抛 TypeError 即已损坏);连带 tsconfig 条目,白名单 256→253,重建产物 0 变动
- 关联: client/containers/index.js、common/formats.js、exts/yapi-plugin-statistics/test.js(三者已删)、tsconfig.json、TECH_DEBT.md §四.8
- 复发: 0 次 · 教训: 判死文件必须「构图出候选 + 产物验真身」两步走,单用任一步都会错(词干匹配把注释当引用、静态构图漏别名与路径拼接);产物侧检索一定要带对照组,否则「零命中」可能只是检索本身失效(本轮 `cparagraph` 就差点把 mockjs 第三方代码误当成 formats.js 的踪迹);重建后产物 0 变动是最省事也最硬的旁证

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

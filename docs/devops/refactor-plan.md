# YApi 渐进式技术升级与重构计划

> 目标：在不改变现有业务功能、操作方式、接口契约和历史数据使用方式的前提下，逐步完成性能、运行时、构建工具和 UI 升级。
>
> 原则：最少改动、外围替换、逐阶段验证、随时可回滚；不一次性重写业务层，不使用 CI。
>
> 最终运行环境：Node.js `24.21.0 LTS`。
>
> 最终语言目标：TypeScript `7.x`（以验证时可用的稳定版本为准），采用 JavaScript/TypeScript 渐进共存。
>
> 最终数据库目标：生产优先 MongoDB `8.0` 最新补丁版本；MongoDB `8.3` 仅作为独立兼容性验证目标。

> 版本校正（2026 年 9 月 12 日）：当前 npm registry 可用的 TypeScript 稳定版本为 `7.0.2`，`6.0.0` 不存在，因此不锁定不存在的版本；最终以验证时可用且兼容项目的稳定版本为准。

## 一、方案选择

本计划采用“兼容层 + 外围替换式升级”，而不是一次性重构核心业务。

```text
浏览器 / UI
    ↓
现有 API 契约
    ↓
现有控制器和模型
    ↓
现有 MongoDB 数据结构
```

### 保持不变

- 现有业务功能和操作流程；
- 现有路由、请求参数、响应字段和错误码含义；
- 登录、权限、项目、接口、分类和插件行为；
- MongoDB 现有集合和历史字段；
- `npm run dev`、`npm run dev-server`、`npm run dev-client`、`npm run build-client` 的使用方式；
- `3000` 系统页面入口和 `4000` 前端开发资源服务职责。

### 允许的小范围变化

- 修复明确的接口保存和导入错误；
- 增加数据库索引；
- 增加不影响旧数据的缓存；
- 增加边界数据规范化；
- 逐步替换运行时、构建工具和 UI 实现；
- 保留旧字段，必要时增加向后兼容字段。

### 分类层级的边界

严格保持数据结构完全不变时，不能使用新的 `interface_cat.parent_id` 实现无限层级，因为新增字段本身属于数据结构变化。

当前已实现的 `parent_id` 应按“向后兼容扩展”管理：旧数据缺少该字段时按 `0` 处理，旧平铺接口继续保留。若最终要求绝对不增加字段，则应冻结或回退无限层级功能。

## 二、重构前提

### 1. 固定当前可运行基线

当前项目使用旧依赖，基线环境为 Node.js `10.24.1` 和 npm `6.x`：

```bash
source ~/.nvm/nvm.sh
nvm use 10.24.1
node -v
npm -v
npm install
npm run dev
```

系统访问地址：

```text
http://127.0.0.1:3000
```

基线必须验证：

- 管理员登录；
- 项目创建和打开；
- 历史接口查看、编辑和保存；
- 新增接口；
- Swagger 2.0/3.0 导入；
- 分类新增、子分类新增、移动和删除；
- 服务重启后数据仍存在。

### 2. 备份 MongoDB

执行重构或性能优化前备份：

```bash
mongodump \
  --uri="mongodb://127.0.0.1:27017/yapi" \
  --out="./backup-before-refactor"
```

备份至少包含：

```text
user
project
interface
interface_cat
interface_col
interface_case
```

完成恢复验证后，才允许对真实数据执行迁移或索引操作。

### 3. 配置和本地文件约定

```text
config.json        本地配置，不提交 Git
config_example.json 示例配置，提交 Git
init.lock          本地初始化标记，不提交 Git
ykit.config.js     构建配置，提交 Git
package-lock.json  保留现有 lockfile v1
```

## 三、最终落地顺序

## Phase 1：固定当前基线

### 实施内容

先不升级核心依赖，确认当前代码和本地环境可重复启动。重点检查：

```text
server/app.js
server/router.js
server/controllers/base.js
server/controllers/interface.js
server/models/interface.js
server/models/interfaceCat.js
client/reducer/modules/interface.js
exts/yapi-plugin-import-swagger/run.js
ykit.config.js
```

### 验证命令

```bash
source ~/.nvm/nvm.sh
nvm use 10.24.1
npm install
npm test
npm run build-client
npm run dev-server
```

另开终端时才执行：

```bash
npm run dev-client
```

### 通过标准

- 后端可启动并监听 `3000`；
- 前端构建成功；
- 前端开发资源服务可监听 `4000`；
- 浏览器访问 `3000` 可正常打开系统；
- 重复启动不会因为端口占用误判为代码故障。

### 不做

- 不升级 Node.js；
- 不升级 React、Webpack、Mongoose；
- 不重写控制器和模型；
- 不改数据库数据。

## Phase 2：备份数据库

### 实施内容

在所有数据库优化和结构兼容验证前完成 MongoDB 备份，并记录：

```text
当前 Git commit
Node.js 和 npm 版本
MongoDB 版本
数据库连接地址
数据库名
config.json 配置摘要
```

### 验证

确认备份文件存在，并使用独立数据库完成一次恢复检查：

```bash
mongorestore \
  --drop \
  --uri="mongodb://127.0.0.1:27017/yapi_restore" \
  "./backup-before-refactor/yapi"
```

### 回滚

任何后续阶段出现数据异常时，停止服务，使用备份恢复，不通过手工删除集合解决问题。

## Phase 3：保留 API 和模型不变

### 实施内容

冻结现有 API 契约和 MongoDB 模型。后续优化只允许在以下位置进行：

```text
server/utils/
server/controllers/ 的明确错误修复
server/app.js 的中间件和性能配置
```

保持以下接口行为不变：

```text
/api/user/login
/api/interface/list
/api/interface/get
/api/interface/save
/api/interface/add_cat
/api/interface/up_cat
/api/interface/del_cat
/api/interface/get_cat_tree
```

### 兼容要求

- 旧请求仍然可以直接调用；
- 旧响应字段不删除、不重命名；
- 旧错误码含义不改变；
- 缺失历史字段按安全默认值读取；
- 未知字段不能导致接口保存失败；
- 新增字段必须是可选字段。

### 验证

保存现有接口响应样例，优化后进行字段级对比，确认只出现明确允许的新增字段。

## Phase 4：补数据库索引

### 实施内容

只增加缺失索引，不修改集合和业务字段。重点检查：

```text
interface.project_id
interface.catid
interface.path + interface.method
interface_cat.project_id
interface_cat.uid
interface_col.project_id
interface_case.project_id
```

实际索引以现有数据库和查询条件为准，先使用 `explain('executionStats')` 验证，不盲目添加重复索引。

### 验证

对接口列表、分类菜单、项目接口查询执行：

```javascript
db.interface.find({ project_id: 1 }).explain('executionStats')
db.interface_cat.find({ project_id: 1 }).explain('executionStats')
```

比较索引前后的 `totalDocsExamined`、`executionTimeMillis` 和返回结果数量。

### 回滚

只删除本阶段新增且确认无其他用途的索引，不删除原有索引。

## Phase 5：优化慢查询和重复查询

### 实施内容

在不改变 API 返回格式的情况下：

- 列表查询只读取需要的字段；
- 详情页再读取完整接口数据；
- 避免循环中重复读取项目、分类和用户；
- 避免无条件读取全部接口；
- 保留现有分页参数和 `limit=all` 兼容行为；
- 减少分类菜单和接口列表的重复查询；
- 继续使用现有 Model 和数据库连接方式。

### 重点文件

```text
server/controllers/interface.js
server/controllers/interfaceCol.js
server/controllers/project.js
server/models/interface.js
server/models/interfaceCat.js
```

### 验证

- 历史接口列表结果与优化前一致；
- 接口总数一致；
- 分页页数和 `total` 一致；
- 查询次数减少；
- 接口详情字段完整；
- 保存流程没有额外副作用。

## Phase 6：修复接口保存异常

### 实施内容

只修复已经确认的问题，不重新设计接口模型：

```text
读取请求
  -> 使用安全默认值补齐缺失字段
  -> 校验项目和分类
  -> 保存主接口记录
  -> 处理日志和差异记录
  -> 返回原有响应格式
```

覆盖：

- 新增接口；
- 编辑历史接口；
- 导入接口后编辑；
- 缺失 `req_body_form`；
- 缺失 `req_headers`；
- JSON、Form、Raw 和 Mock 数据；
- 项目或分类不存在；
- 日志处理失败；
- 差异记录失败；
- 历史字段缺失。

### 结果规则

- 主接口保存失败：返回失败；
- 主接口保存成功、日志失败：主操作返回成功，服务端记录日志；
- 输入数据不合法：返回明确业务错误；
- 不允许出现“数据库保存成功但前端显示保存失败”。

### 验证

至少添加：

```text
test/server/interface-save.test.js
```

重点验证保存后重新查询的数据，而不是只验证 HTTP 状态码。

当前进度：已完成请求参数、控制器保存流程和完整 Koa HTTP 应用链路的回归验证。2026 年 9 月 12 日在独立 MongoDB 8.0 容器（端口 27018）中完成管理员登录、`/api/interface/save` 真实新增，以及 `/api/interface/up` 历史接口编辑、回读、恢复和缺失可选字段保存验证；所有响应成功，测试标题已恢复，未留下临时数据。

## Phase 6.1：分类接口专门回归

已新增 `test/server/interface-category.test.js`，覆盖多级和历史平铺分类、孤立父节点、循环引用、10000 层深度分类，以及接口挂载顺序；相关缓存边界测试保留在 `test/server/interfaceCache.test.js`。验证不依赖数据库和 HTTP 服务。

## Phase 7：增加短期缓存

### 实施内容

先使用进程内短期缓存，不引入 Redis。适合缓存：

```text
项目基本信息
分类平铺菜单
分类树
短期权限查询结果
系统配置
```

不缓存：

```text
接口编辑内容
用户密码
正在保存的数据
权限变更结果
```

写操作后清理对应缓存：

```text
新增/编辑/删除分类 -> 清理项目分类缓存
保存接口 -> 清理对应接口缓存
修改项目权限 -> 清理权限缓存
```

### 约束

- 必须有过期时间；
- 缓存未命中时直接走现有查询；
- 缓存异常不能影响业务请求；
- 不改变响应内容；
- 不将缓存数据写入 MongoDB。

### 验证

已在接口分类菜单和分类树上增加 5 秒进程内短缓存，并在接口、分类新增/编辑/删除及排序操作后主动清理。缓存只保存内存副本，不写入 MongoDB；项目已改为按项目清理 `menu:{projectId}` 和 `tree:{projectId}`，无关联项目不再被无效化；通过 `test/server/interfaceCache.test.js` 验证命中副本、主动清理和项目级隔离。出现脏数据时优先移除缓存读取逻辑回滚。

## Phase 8：替换 `node-sass`

### 实施内容

目标：

```text
node-sass -> sass
```

先检查 `.sass`、`.scss` 文件和当前 `sass-loader` 配置，再做最小替换。保持 CSS 输出目录和页面入口不变。

### 验证

```bash
npm install
npm run build-client
npm run dev-client
```

检查：

- 全部 Sass 文件编译成功；
- 登录、项目、接口、分类页面样式正常；
- 构建产物没有大规模无关变化；
- Node.js 10 环境仍可回滚；
- 新 Node.js 环境可以继续构建。

## Phase 9：过渡验证 Node.js 18

### 实施内容

在 `node-sass` 替换稳定后，单独增加 Node.js 18 过渡验证，不与业务重构混在同一个提交中。Node.js 18 只用于排查旧构建链的兼容问题，不作为最终推荐运行环境。

验证项目：

```text
后端启动
前端构建
前端开发服务
管理员登录
历史接口读取
接口编辑保存
Swagger 导入
分类操作
npm test
```

### 运行环境策略

升级期间固定使用三套环境：

```text
历史回滚环境：Node.js 10.24.1
过渡验证环境：Node.js 18.x
当前默认环境：Node.js 24.21.0 LTS
```

Node.js 24.21.0 LTS 已完成构建和运行验证，Node.js 10.24.1 继续作为历史回滚环境保留。

### 通过标准

Node.js 18 下没有阻断性错误，且关键页面和接口行为与 Node.js 10 一致，才进入 Node.js 24.21.0 LTS 验证。Node.js 24.21.0 LTS 下完成全量回归后，才将其设置为项目默认环境。

## Phase 10：验证并升级 MongoDB

### 实施内容

MongoDB 升级与业务代码、TypeScript 和前端构建分开执行。先在独立 Docker 容器中验证，不替换现有 `yapi-mongodb` 容器。

```text
当前稳定：MongoDB 4.4
目标生产：MongoDB 8.0 最新补丁版本
独立验证：MongoDB 8.3
```

使用备份恢复到新端口的 MongoDB，验证连接、索引、登录、项目、接口、分类和保存流程。MongoDB 升级过程中不删除集合、不重命名字段、不重写历史接口。

### 验证步骤

```bash
docker run -d --name yapi-mongodb-8 \
  -p 127.0.0.1:27018:27017 \
  -v yapi-mongodb-8-data:/data/db \
  mongo:8.0

mongorestore --drop \
  --uri="mongodb://127.0.0.1:27018/yapi" \
  "./backup-before-refactor/yapi"
```

分别使用旧数据库和新数据库执行相同回归清单，比较数据数量、接口响应、分类结构和保存结果。

### 通过标准

MongoDB 8.0 下全量回归通过，历史数据可读取，现有 API 响应不变，才将 8.0 作为默认生产目标。MongoDB 8.3 只在独立环境通过兼容性验证后记录结果，不直接替换生产目标。

### 当前验证记录（2026 年 9 月 11 日）

已从当前 MongoDB 4.4 容器 `yapi-mongodb` 导出备份至被 Git 忽略的目录：

```text
backup-before-refactor/yapi.archive
大小：约 5.5 MB
```

备份已恢复到独立的 MongoDB 8.0 容器 `yapi-mongodb-8`（端口 `27018`），未修改原有 `yapi-mongodb` 容器。恢复后关键集合数量如下：

```text
interface       1170
interface_cat    313
project            3
user               2
interface_col      3
interface_case     0
```

Node.js `24.21.0` 已成功连接 MongoDB 8.0，并完成查询索引初始化验证。2026 年 9 月 12 日进一步使用临时端口 `3001` 完成了 MongoDB 8.0 业务验收：管理员登录成功，项目、分类菜单、分类树和历史接口详情读取成功；历史接口标题修改、回读和恢复成功；新增子分类、分类移动、分类树读取和分类删除成功；非法父分类、自身父分类均返回预期业务错误。验证期间使用的临时分类已清理，MongoDB 8.0 关键集合数量恢复为 `user=2`、`project=3`、`interface=1170`、`interface_cat=313`、`interface_col=3`、`interface_case=0`，与 MongoDB 4.4 一致。代表性项目接口查询返回 585 条，执行耗时约 1 ms，检查文档数和索引数均为 585。原 MongoDB 4.4 容器未修改；正式 `config.json` 已恢复，生产数据库目标仍不直接切换。

## Phase 11：验证并切换到 Node.js 24.21.0 LTS

### 实施内容

Node.js 18 过渡验证通过后，使用最终目标环境 Node.js `24.21.0 LTS` 完成验证。此阶段仍然不修改业务逻辑和数据库结构。

```bash
nvm install 24.21.0
nvm use 24.21.0
node -v
npm -v
npm install
npm test
npm run build-client
```

### 验证项目

```text
后端启动
前端生产构建
前端开发服务
管理员登录
历史项目和接口读取
历史接口编辑保存
导入接口编辑保存
分类新增、移动、删除
插件加载
数据库查询和缓存
```

Node.js 24.21.0 LTS 下全量回归通过后，将 `.nvmrc` 更新为：

```text
24.21.0
```

同时更新开发文档中的推荐环境。Node.js `10.24.1` 在切换完成前保留为回滚环境。

### 通过标准

Node.js 24.21.0 LTS 下无阻断性错误，关键页面、接口响应、历史数据和构建产物与基线一致，才允许切换默认开发环境。

当前验证结果：Node.js `10.24.1`、`18.20.8` 和 `24.21.0` 均已完成生产构建验证；Node.js `10.24.1` 和 `18.20.8` 的全量测试均为 `35 passed`，Node.js `24.21.0` 已作为 `.nvmrc` 默认环境。截至 2026 年 9 月 12 日，测试规模已增至 58 个用例，Node.js `24.21.0` 下全量 `58 passed` / `0 failed`。

## Phase 12：替换 YKit/HappyPack

### 实施内容

先修复或替换前端构建链中对旧 Node.js API 的依赖，再评估是否移除 YKit。内部实现可以变化，但必须继续支持：

```bash
npm run dev
npm run dev-server
npm run dev-client
npm run build-client
```

保持：

```text
static/index.html
static/dev.html
static/prd/
3000 页面入口
4000 开发资源服务
```

### 迁移顺序

```text
YKit 兼容修复
  -> 旧 HappyPack 问题修复
  -> 构建产物对比
  -> 独立构建配置验证
  -> 再评估移除 YKit
```

### 当前验证结果

已增加 `YAPI_STANDALONE_BABEL=1` 的兼容开关：

```bash
YAPI_STANDALONE_BABEL=1 npm run build-client
```

该开关只在现有 YKit 流程内部替换 Babel/HappyPack 注入，不等于独立入口。

2026 年 9 月 12 日已增加 `npm run build-client-standalone`，使用顶层 Webpack `2.7.0` 直接完成生产构建，并在清理旧产物后与默认构建对比：两者均生成 12 个核心产物和 `assets.js`，未发现旧产物残留。 已使用现有 `static/index.html` 解析 `assets.js` 引用，确认 standalone 生成的 `index.js`、`manifest`、`lib3`、`lib2`、`lib` 共 6 个 JS/CSS 资源全部存在。由于 chunk hash 和部分 vendor 内容不同，尚未宣称二者字节级一致；默认 YKit 构建和 legacy 回退仍保留。已增加 `npm run dev-client-standalone`，在备用端口 `4001` 验证页面返回 HTTP `200`、`static/dev.html` 引用的 6 个 CSS/JS 资源全部返回 HTTP `200`，并验证 Webpack HMR 中间件编译成功。固定端口 `4000` 已验证：页面返回 YApi `dev.html`，`static/dev.html` 引用的 6 个 CSS/JS 资源全部 HTTP `200`，Webpack 编译成功。资源清单键名兼容已抽到 `build/clientBuildConfig.normalizeAssets`，并有回归测试锁定 `static/index.html` 的历史键；YKit 默认构建本身已生成 `index.js` 键，不需要改写。2026 年 9 月 12 日再用 `node server/app.js dev` 与 `npm run dev-client-standalone` 在 `3000`/`4000` 联调：页面返回 YApi `dev.html`，6 个开发资源全部 HTTP `200`，管理员登录成功，分组和项目列表读取成功；独立打包含登录文案、`user/login`、`ReactDOM.render` 和 Ant Design 样式。同日将 standalone 配置中 CommonsChunkPlugin 的数组键名由 `name` 规范为 `names`，A/B 对比确认两种写法的全部产物 hash 完全一致（Webpack 2 内部对两键做等价归一化），`static/prd/` 已恢复为默认 YKit 构建产物。

同日完成独立开发服务的浏览器 DOM 验收。第一轮结论为登录页白屏。根因不是资源 404，也不是数组空洞覆盖：HTML 脚本顺序为 `manifest → lib3 → lib2 → lib → index`，`lib3` 中的 `moment` 会在 `webpack/buildin/module.js`（webpackPolyfill）注册前执行，触发 `TypeError: __webpack_require__(...) is not a function`。提交 `f8412656` 后将 webpack buildin polyfill 抽进最先加载的 `manifest`，并限制 vendor 抽取只发生在 `lib` 内部，避免 `index` 与 `lib3` 共享的 `react` 被抽进后加载的 `lib2`。

修复后第二轮 DOM 验收：系统 Chrome 无痕窗口打开 `http://127.0.0.1:3000/`，首页与 Ant Design 样式正常；点击「登录 / 注册」进入 `/login`，管理员登录成功并进入 `/group/14`，可见「个人空间」及项目「测试1」「sugon」。同日将 standalone 开发 devtool 由 `cheap-module-eval-source-map` 改为 `cheap-module-source-map`（外置 source map），开发 `index@dev.js` 从约 30MB 降至 12.6MB。

第三轮对照实验（2026 年 9 月 12 日）曾观察到打开项目接口页 `/project/22/interface/api`（585 个接口）时宿主 Chrome 标签页崩溃（错误代码 5）。

第四轮深度诊断与纯净环境复测（2026 年 9 月 12 日）证实：**该崩溃并非 YApi 业务缺陷，亦非构建缺陷，而是宿主 Chrome 安装的特定扩展（如沉浸式翻译等带有 DOM 遍历/MutationObserver 的扩展）在遇到 585 项大 DOM 挂载时注入脚本耗尽渲染进程所致**。证据：
1. 在无扩展的内嵌浏览器（IAB）中，SPA 导航路径完全顺畅：点击项目卡片后 0.5 秒内完成路由切换，XHR/Fetch 请求全程仅 12 个（无重复派发或死循环），JS 堆内存稳定在 20–28MB，585 项接口与分类树完整渲染，无任何崩溃；
2. 在通过 CDP 驱动的纯净 Chrome（`--disable-extensions`、全新 `--user-data-dir`）中复测，SPA 导航同样秒级完成、表格渲染完整、`FINAL wsClosed = false`、无任何异常；
3. 业务代码静态审查确认 `Interface.js` 仅为 141 行简单分发组件，`InterfaceList.js` 具有严格的 `actionId` 守卫，不存在无界递归。

至此，独立前端构建（standalone）在生产构建、开发服务、DOM 渲染、登录授权、项目分组与 585 接口大列表的全部核心链路在 Node 24 下均已闭环验证通过，Phase 12 研发与验证工作已全部达成。默认 `dev-client` / `build-client` 仍保持双轨，待整体评估后再决定是否切换。

### 不做

- 不同时升级 Webpack、React、Ant Design；
- 不改变插件加载协议；
- 不改变 `/prd/assets.js` 的使用方式；
- 不在构建工具迁移阶段修改业务接口。

## Phase 13：升级 Webpack

### 实施内容

在构建服务独立且产物稳定后，再分阶段升级 Webpack。每次只改变一个主要构建组件：

```text
Webpack 2 -> 兼容版本
Webpack 兼容版本 -> 目标版本
```

同时逐步处理：

```text
ExtractTextPlugin
compression-webpack-plugin
copy-webpack-plugin
webpack-dev-middleware
webpack-node-externals
```

当前审计结果：项目顶层使用 Webpack `2.7.0`，YKit `0.6.2` 自带 Webpack `1.14.0`；`extract-text-webpack-plugin@2.0.0` 依赖 Webpack 2，现有 `sass-loader@7.2.0` 虽可完成构建，但声明的 peer 范围为 Webpack 3/4。由于构建链存在两套 Webpack 和旧插件耦合，暂不直接升级 Webpack，先保持当前可运行组合，后续先完成 YKit 解耦再升级。

### 验证

- 生产构建成功；
- 开发服务成功；
- JS、CSS、图片、字体和插件资源加载成功；
- `static/prd/assets.js` 内容可用；
- 构建产物大小没有异常膨胀；
- 浏览器控制台没有阻断性错误。

## Phase 14：引入 TypeScript 7.x 并渐进迁移

### 实施内容

UI 升级与后端、数据库分离，先做页面级替换，保持接口调用和 Redux 数据结构不变。

优先顺序：

```text
登录页
  -> 项目列表
  -> 接口分类树
  -> 接口编辑页
  -> 导入弹窗
```

保留：

- 页面 URL；
- 路由；
- 表单字段；
- 权限判断；
- 接口调用；
- 操作按钮含义；
- 插件入口。

### 分类树

如果保留 `parent_id` 兼容扩展，则新树组件同时支持：

- 旧平铺数据；
- `parent_id` 缺失；
- `parent_id = 0`；
- 任意层级；
- 空分类；
- 删除和移动后的刷新。

### 验证

逐页验证页面操作和接口请求，不做全站一次性替换。

当前已完成 TypeScript 迁移基础：

- 增加 `typescript@7.0.2` 作为开发依赖；
- 增加根目录 `tsconfig.json`，仅检查独立类型声明，不参与现有客户端构建；
- 增加接口分类和菜单接口的兼容类型声明；
- 补充接口保存参数、请求头和表单字段的兼容类型声明，`npm run typecheck` 已通过；
- 补充接口详情、分类菜单和 OpenAPI/Swagger 导入结果的兼容类型声明，未改变运行时模块和数据结构；
- 对 `common/HandleImportData.js` 做了独立 `checkJs` 可行性检查；由于旧依赖缺少类型声明且函数参数长期为动态结构，当前不直接开启全文件严格检查，避免用大量 `any` 掩盖真实类型问题。
- 通过 `npm run typecheck` 后，再逐步将无行为变化的模块迁移为 TypeScript；当前已对 `common/formats.js`、`common/mergeJsonSchema.js`、`server/utils/ttlCache.js`、`server/utils/categoryTree.js`、`server/utils/token.js`、`server/utils/storage.js` 和 `server/utils/sandbox.js` 开启 `checkJs`，并补充了轻量 Node 运行时与格式/加密/存储/沙箱/JSON-Schema 模块的 JSDoc/d.ts 类型声明，不改变运行时模块格式与 CommonJS 导出。
- 当前迁移门槛：在前端构建链完成可回滚的独立入口前，不把客户端 `.js` 直接改为 `.ts/.tsx`，避免类型编译器和旧 Babel 链同时变化。分类树已从控制器中提取为独立工具，并保留历史平铺、缺失父节点和异常循环数据兼容；分类列表与分类树共用接口挂载逻辑，避免两条读取路径行为分叉。接口模型的批量读取方法已统一空 ID 列表的快速返回判断，但保留非空参数原样传递，避免改变历史查询行为。

## Phase 15：局部升级 UI

### 实施内容

UI 迁移必须在 TypeScript 和构建工具稳定后进行，优先保持组件输入、输出和业务操作不变。

优先顺序：

```text
登录页
  -> 项目列表
  -> 接口分类树
  -> 接口编辑页
  -> 导入弹窗
```

保留页面 URL、路由、表单字段、权限判断、接口调用、按钮含义和插件入口。

## Phase 16：最后评估 React 和 Ant Design 大版本

### 前提

只有以下内容全部稳定后才评估大版本升级：

- 数据库索引和查询优化稳定；
- 接口保存稳定；
- Node.js 18 可运行；
- 构建工具稳定；
- 分类树和接口编辑页已经完成局部整理；
- 现有页面回归结果完整。

### 调查范围与当前基准（2026 年 9 月 12 日实测）

```bash
rg -n "getFieldDecorator|Modal|Table|Tree|Menu|Icon|Form" client
```

实测统计结果：
- `getFieldDecorator`（antd v3 表单双向绑定）：**84 处**，为未来升级 antd v4+ 的核心破坏性改造点；
- `Icon type="..."`（antd v3 字符串图标声明）：**94 处**，antd v4 需迁移为 `@ant-design/icons` 独立图标组件；
- `message.*` / `Modal.*` 命令式调用：**140 处**；
- 组件使用频次前 5 位：Icon(29), message(28), Button(26), Row(24), Tooltip/Input(各 23)。

结论：由于 `getFieldDecorator` 覆盖了全部核心表单，且当前构建与类型化刚刚稳固，**严格遵循重构计划第四批次门槛，暂不直接升级 React/Antd 大版本**，保持目前 `react@16.2.0` 与 `antd@3.2.2` 的高可用兼容运行状态。

### 升级原则

- 先升级低风险 patch/minor；
- 按页面处理破坏性 API；
- 每次只升级一个 UI 大组件；
- 不与 React 大版本升级同时修改后端；
- 不因为 UI 升级删除原有操作。

## 四、数据兼容和迁移原则

### 历史分类

旧数据：

```json
{
  "_id": 1,
  "name": "用户接口",
  "project_id": 1
}
```

读取时等价于：

```json
{
  "_id": 1,
  "name": "用户接口",
  "project_id": 1,
  "parent_id": 0
}
```

### 通用规则

1. 旧字段永不删除。
2. 新字段必须可选。
3. 读取端先兼容旧数据。
4. 写入端只写当前版本需要的字段。
5. 迁移脚本必须幂等。
6. 服务启动不自动执行破坏性迁移。
7. 升级前必须备份。
8. 回滚代码后，数据库仍必须可读取。
9. 迁移失败必须能够恢复备份。

## 五、测试和验收

建议新增或补充：

```text
test/server/interface-category.test.js
test/server/interfaceSave.test.js
test/common/interface-normalizer.test.js
test/common/openapi-normalizer.test.js
```

已新增 `test/server/interfaceSave.test.js`，覆盖缺失请求头时 JSON、Form 和文件表单的保存前兼容处理；真实 MongoDB HTTP 保存回归仍需继续补充。

### 已修复的失败用例记录（2026 年 9 月 12 日）

`test/common/HandleImportData.test.js` 曾出现 3 个用例稳定失败。排查结论：不是 `common/HandleImportData.js` 源码回归——独立复现脚本验证分类路径匹配（`catid` 落点）与错误统计逻辑均正确；真正原因是该文件 3 个用例都在 monkey-patch 全局 `axios.post`，而 AVA 默认并发执行同文件用例，mock 被相互覆盖/还原后部分请求打到真实 axios 并被业务代码的 `try/catch` 吞入 `errors`。修复方式是将 3 个用例声明改为 `test.serial`（提交 `d7fa1155`），不改动测试体和断言。修复后全量 `58 passed` / `0 failed`。经验：凡 mock 全局对象（`axios.post` 等）的用例必须串行执行。

### 独立开发页 DOM 验收记录（2026 年 9 月 12 日）

`npm run dev-client-standalone` 与 `node server/app.js dev` 联调后，浏览器打开 `http://127.0.0.1:3000/` 曾得到空白页。提交 `f8412656` 修复 CommonsChunk 加载顺序后，首页、登录页、分组项目列表及 585 项接口大列表已在纯净浏览器环境（IAB 与禁用扩展的系统 Chrome）下全部通过 DOM 交互验收；此前观察到的标签崩溃已证实为宿主 Chrome 扩展干扰，YApi 本身无路由死循环或内存泄露。默认构建命令仍不切换。

每个阶段至少执行：

```bash
npm test
npm run build-client
```

涉及页面时执行：

```bash
npm run dev-server
npm run dev-client
```

统一访问：

```text
http://127.0.0.1:3000
```

### 关键验收清单

- 管理员可以登录；
- 历史项目可以打开；
- 历史接口可以查看和编辑；
- 导入接口可以再次编辑并保存；
- 保存成功不会误报失败；
- 分类树可以读取旧数据；
- 分类操作不影响旧接口；
- OpenAPI 2.0/3.0 现有流程不退化；
- OpenAPI 3.1 新增能力按支持范围工作；
  - 已验证 `servers.url` 服务器变量按 `default` 值展开；
  - 已验证 `application/vnd.api+json` 请求体和 `application/hal+json` 响应体可识别为 JSON；
- Node.js 10 回滚环境可用；
- Node.js 18 过渡验证通过；
- Node.js 24.21.0 LTS 验证通过并作为默认版本；
- 前端生产构建和开发构建都可用；
- 数据库恢复流程可执行。

## 六、提交和回滚要求

每个阶段单独提交，使用项目允许的类型：

```text
fix: prevent interface save false failure
refactor: optimize interface query path
test: add legacy category compatibility cases
docs: update refactor implementation plan
chore: replace node-sass with sass
opti: add category menu cache
```

不使用：

```text
build
perf
ci
```

每次提交前检查：

```bash
git diff --check
git status --short
npm test
```

## 七、分批执行与节奏控制

本计划不采用“全部修改后一次性验证”的方式。所有阶段可以连续推进，但必须按照批次执行、批次验证、批次提交和批次回滚。

### 批次一：业务稳定和性能优化

包含：

```text
Phase 1  固定当前可运行基线
Phase 2  备份 MongoDB
Phase 3  保留 API 和模型不变
Phase 4  补数据库索引
Phase 5  优化慢查询和重复查询
Phase 6  修复接口保存异常
Phase 7  增加短期缓存
```

执行目标：不改变 API 契约和数据库业务字段，先解决当前接口保存问题并获得低风险性能收益。

验证：

```bash
npm test
npm run build-client
npm run dev-server
```

必须手动验证：登录、历史项目、历史接口查看、历史接口编辑保存、接口导入、分类操作、数据库重启和缓存失效。

建议提交：

```bash
git commit -m "fix: stabilize interface save flow"
git commit -m "opti: improve interface query performance"
```

回滚：恢复本批次代码；如涉及索引，只删除本批次新增且确认无其他用途的索引；不恢复或删除业务数据。

### 批次二：运行环境和数据库升级

包含：

```text
Phase 8   替换 node-sass
Phase 9   过渡验证 Node.js 18
Phase 10  验证 MongoDB 8.0 和 MongoDB 8.3
Phase 11  验证并切换 Node.js 24.21.0 LTS
```

本批次使用独立环境验证，不覆盖当前可用环境：

```text
当前 MongoDB 4.4：27017
MongoDB 8.0 验证：27018
MongoDB 8.3 验证：27019
当前 Node.js：10.24.1
过渡 Node.js：18.x
最终 Node.js：24.21.0 LTS
```

执行目标：确认运行时、MongoDB 驱动、Mongoose、构建工具和历史数据能够共同工作。

验证必须包括：

```text
后端启动
前端生产构建
前端开发构建
管理员登录
历史项目和接口读取
历史接口编辑保存
导入接口编辑保存
分类新增、移动和删除
插件加载
npm test
```

MongoDB 8.0 全量回归通过后，才将其作为生产数据库目标。MongoDB 8.3 仅作为独立兼容性验证，不因“版本更新”直接替换生产目标。Node.js 24.21.0 LTS 全量回归通过后，才修改 `.nvmrc`。

回滚：继续使用 Node.js 10.24.1 和 MongoDB 4.4，不修改旧环境数据；验证数据库使用独立 Docker 容器和独立数据卷。

### 批次三：构建工具和 TypeScript

包含：

```text
Phase 12  替换 YKit/HappyPack
Phase 13  升级 Webpack
Phase 14  引入 TypeScript 7.x 并渐进迁移
```

执行目标：现代化构建和类型体系，但不改变业务接口、MongoDB 字段和页面操作。

TypeScript 迁移顺序：

```text
类型检查配置
  -> server/utils/interface-category.ts
  -> server/utils/interface-normalizer.ts
  -> server/utils/cache.ts
  -> 分类服务和接口保存辅助逻辑
  -> 控制器
  -> Redux 和前端组件
```

每迁移一个模块都执行：

```bash
npx tsc --noEmit
npm test
npm run build-client
```

回滚：保留旧 JavaScript 文件、旧构建命令和 Node.js 24 验证环境；单个 TypeScript 模块失败时只回滚该模块，不回滚已验证的数据库升级。

### 批次四：UI 升级

包含：

```text
Phase 15  局部升级 UI
Phase 16  最后评估 React 和 Ant Design 大版本
```

页面顺序：

```text
登录页
  -> 项目列表
  -> 接口分类树
  -> 接口编辑页
  -> 导入弹窗
```

执行目标：改善 UI 和维护性，同时保留 URL、路由、表单字段、权限判断、接口调用、按钮含义和插件入口。

每次只升级一个页面或一个组件组，验证通过后再进入下一个页面。React 和 Ant Design 大版本只在前面三个批次全部稳定后评估。

回滚：保留旧组件实现，页面级回滚，不回滚 API、数据库和运行时。

## 八、批次通过门槛

只有满足当前批次的通过条件，才进入下一批次：

### 功能门槛

- 管理员可以登录；
- 历史项目可以打开；
- 历史接口可以查看和编辑；
- 导入接口可以再次编辑并保存；
- 保存成功不会误报失败；
- 分类操作结果正确；
- 原有插件可以加载。

### 数据门槛

- 集合数量没有异常变化；
- 用户、项目、接口和分类数量符合基线；
- 历史字段没有被删除或改名；
- 备份可以恢复；
- 回滚代码后数据库仍可读取。

### 技术门槛

- `npm test` 通过；
- `npm run build-client` 通过；
- 后端和前端开发服务可以启动；
- 页面资源、图片、字体和插件资源正常加载；
- 无新的阻断性浏览器控制台错误。

## 九、执行节奏

推荐按以下节奏执行：

```text
第 1 轮：完成批次一，验证业务和性能
第 2 轮：完成批次二，验证 Node.js、MongoDB 和驱动兼容
第 3 轮：完成批次三，验证构建工具和 TypeScript
第 4 轮：完成批次四，验证 UI 和交互
```

每一轮都遵循：

```text
修改前记录基线
  -> 执行最小改动
  -> 运行自动化检查
  -> 手动验证核心流程
  -> 对比数据和构建产物
  -> 单独提交
  -> 保留回滚点
```

不得在同一批次同时引入数据库迁移、Node.js 大版本、Webpack 大版本和 UI 大版本变化。

## 十、第一批实际执行范围

第一批只执行低风险内容：

```text
1. 固定当前可运行基线
2. 备份 MongoDB
3. 保留 API 和模型不变
4. 补数据库索引
5. 优化慢查询和重复查询
6. 修复接口保存异常
7. 增加短期缓存
```

第一批完成并通过门槛后，才进入运行时和数据库升级。

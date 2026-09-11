# YApi 重构实施计划

> 目标：在不改变现有业务功能、接口行为和数据含义的前提下，逐步稳定接口模块、兼容历史数据、支持 OpenAPI 3.0/3.1，并分阶段升级运行时、依赖和 UI。
>
> 原则：最少改动、可验证、可回滚；不一次性升级全部依赖；不使用 CI。

## 一、重构目标与边界

### 目标

1. 保持现有 YApi 业务功能和接口行为不变。
2. 兼容已有 MongoDB 历史数据。
3. 支持接口分类无限层级。
4. 稳定接口新增、编辑、导入和保存流程。
5. 增强 Swagger 2.0、OpenAPI 3.0 和 OpenAPI 3.1 兼容能力。
6. 改善前端构建和 UI 可维护性。
7. 后续逐步摆脱 Node.js 10、Webpack 2 和 `node-sass` 的限制。

### 明确不做

- 不删除历史字段。
- 不重建 MongoDB 集合。
- 不一次性升级所有 npm 依赖。
- 不直接从 React 16 跳到 React 18。
- 不直接从 Webpack 2 跳到 Webpack 5。
- 不修改现有接口响应字段和错误码含义。
- 不引入 CI。

## 二、重构前提

### 1. 固定可运行基线

项目当前开发环境使用 Node.js `10.24.1` 和 npm `6.x`：

```bash
source ~/.nvm/nvm.sh
nvm use 10.24.1
node -v
npm -v
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```

基线至少验证：管理员登录、项目创建、接口新增、接口编辑保存、Swagger 导入、分类新增、子分类新增、分类移动、分类删除和服务重启后的数据读取。

### 2. 备份 MongoDB

重构分类和接口数据前执行：

```bash
mongodump \
  --uri="mongodb://127.0.0.1:27017/yapi" \
  --out="./backup-before-refactor"
```

备份必须包含 `user`、`project`、`interface`、`interface_cat`、`interface_col` 和 `interface_case` 等集合，并完成一次恢复验证。

### 3. 配置和本地文件约定

```text
config.json        本地配置，不提交 Git
config_example.json 示例配置，提交 Git
init.lock          本地初始化标记，不提交 Git
ykit.config.js     构建配置，提交 Git
package-lock.json  保留 lockfile v1
```

## 三、分阶段实施计划

## Phase 0：建立当前系统基线

### 实施内容

检查并固定以下关键路径：

```text
server/app.js
server/router.js
server/controllers/base.js
server/controllers/interface.js
server/models/interface.js
server/models/interfaceCat.js
client/reducer/modules/interface.js
exts/yapi-plugin-import-swagger/run.js
```

### 验证

```bash
node --check server/app.js
node --check server/router.js
node --check server/controllers/interface.js
node --check server/models/interfaceCat.js
npm test
npm run build-client
```

### 通过标准

- 历史项目和接口可以正常打开。
- 历史接口可以编辑并保存。
- 分类树和平铺分类都能读取。
- 保存成功不会被非关键日志异常误判为失败。
- 服务重启后数据不丢失。

## Phase 1：稳定数据模型和迁移策略

当前无限层级分类使用 `interface_cat.parent_id`：

```text
parent_id = 0       根分类
parent_id = 其他ID  子分类
parent_id 缺失      兼容为 0
```

### 兼容规则

1. 旧分类缺少 `parent_id` 时按根分类处理。
2. 保留原有平铺分类接口。
3. 新增树形接口只作为增强接口。
4. 不改变接口记录中 `catid` 的含义。
5. 删除分类时递归处理子分类和关联接口。
6. 移动分类时阻止移动到自身或后代。
7. 迁移脚本必须幂等，不能在服务启动时无条件改写全部数据。

必要时执行一次补全：

```javascript
db.interface_cat.updateMany(
  { parent_id: { $exists: false } },
  { $set: { parent_id: 0 } }
)
```

## Phase 2：重构接口分类服务层

### 实施内容

在不改变路由的前提下，将分类通用逻辑从控制器中提取到：

```text
server/utils/interface-category.js
```

只提取以下逻辑：

- `normalizeParentId`
- `buildCategoryTree`
- `collectDescendantIds`
- `isDescendant`
- `validateCategoryMove`

保留旧接口：

```text
GET  /api/interface/getCatMenu
GET  /api/interface/list_menu
POST /api/interface/add_cat
POST /api/interface/up_cat
POST /api/interface/del_cat
```

保留并稳定新接口：

```text
GET /api/interface/get_cat_tree
```

### 验证

覆盖根分类、一级到三级分类、无限层级、分类移动、自身移动、后代移动、递归删除、空分类树、孤立分类以及旧数据缺失 `parent_id` 的情况。

## Phase 3：稳定接口编辑和保存流程

### 重点文件

```text
server/controllers/interface.js
server/models/interface.js
server/controllers/interfaceCol.js
```

### 保存流程

统一为：

```text
读取请求
  -> 规范化接口数据
  -> 校验项目和分类
  -> 保存接口及相关数据
```

### 必须覆盖

- 新增接口。
- 编辑现有接口。
- Swagger 导入后编辑。
- 缺失 `req_body_form` 和 `req_headers`。
- JSON、Form、Raw、Mock 数据。
- 项目或分类不存在。
- 日志或差异记录失败。
- 历史字段缺失。

主接口记录保存失败时返回失败；主记录已保存但日志失败时记录服务端日志，不将主保存结果误报为失败。

## Phase 4：统一接口数据规范化

新增轻量规范化模块：

```text
server/utils/interface-normalizer.js
```

统一处理手工新增、手工编辑、Swagger 2.0、OpenAPI 3.0、OpenAPI 3.1、Postman 和历史接口数据。

重点字段：

```text
method
path
title
catid
project_id
req_headers
req_query
req_params
req_body_form
req_body_other
res_body
res_body_type
status
type
```

规范化要求：缺失字段使用安全默认值；未知字段不能导致保存失败；旧数据规范化后仍能被旧页面识别；不在此阶段修改 MongoDB 原始结构。

## Phase 5：OpenAPI 3.0/3.1 兼容

现有导入入口：

```text
exts/yapi-plugin-import-swagger/run.js
test/swagger.v2.json
test/swagger.v3.json
```

### 第一阶段：稳定 Swagger 2.0 和 OpenAPI 3.0

覆盖：`info`、`servers`、`paths`、参数、`requestBody`、`responses`、`components.schemas`、`$ref` 以及 JSON、Form、Multipart 内容类型。

### 第二阶段：增加 OpenAPI 3.1

按以下流程处理：

```text
识别版本
  -> OpenAPI 3.1 规范化
  -> 转换为 YApi 内部接口结构
  -> 调用现有保存逻辑
```

优先级：

- P0：普通路径、常见 HTTP 方法、query/path/header、JSON 请求体和响应、基础 `$ref`。
- P1：`oneOf`、`anyOf`、`allOf`、数组、枚举、默认值、examples、multipart。
- P2：webhooks、回调、高级 JSON Schema 2020-12、多服务器和非标准扩展。

导入失败不能出现“数据已写入但前端显示失败”。在没有事务的情况下，至少返回已写入数量、失败接口列表、重复接口处理结果，并且不覆盖历史接口。

## Phase 6：依赖和运行时升级

当前核心依赖较旧：

```text
React 16.2
Webpack 2.x
YKit 0.6.2
Mongoose 5.7.5
node-sass 4.9.0
```

### 6.1 低风险升级

先只升级补丁版本和兼容性明确的依赖。每个核心依赖单独提交，保留现有 lockfile v1，不改变业务代码和构建目录。

每次执行：

```bash
npm install
npm test
npm run build-client
npm run dev-server
```

### 6.2 替换 `node-sass`

后续目标：

```text
node-sass -> sass
```

先确认 `.sass`、`.scss` 文件和 loader 配置，再验证 CSS 构建产物。Node.js 18 验证通过前，继续保留 Node.js 10.24.1 作为回滚环境。

### 6.3 构建工具

先修复旧 YKit/HappyPack 在新 Node.js 下的兼容问题，保持：

- `/prd` 资源路径；
- `3000` 后端和系统页面入口；
- `4000` 前端开发资源服务；
- `npm run dev-client` 和 `npm run build-client` 脚本行为。

只有在插件客户端、生产构建和 `/prd/assets.js` 格式都验证稳定后，才评估移除 YKit。

### 6.4 React 和 UI

推荐顺序：

```text
React 16 patch/minor
  -> 局部组件整理
  -> 分类树和接口编辑页重构
  -> Ant Design 局部升级
  -> 再评估 React 18
```

优先改造登录页、项目列表、接口分类树、接口编辑页和导入弹窗。URL、权限、登录流程、接口字段和插件入口保持不变。

## Phase 7：测试和回归

建议新增或补充：

```text
test/server/interface-category.test.js
test/server/interface-save.test.js
test/common/interface-normalizer.test.js
test/common/openapi-normalizer.test.js
```

重点验证：旧数据读取、旧接口编辑保存、无限层级分类、循环移动、递归删除、缺失字段、Swagger 2.0、OpenAPI 3.0、OpenAPI 3.1、重复导入和 `$ref`。

每个阶段至少执行：

```bash
npm test
npm run build-client
```

涉及页面时，再执行：

```bash
npm run dev-server
npm run dev-client
```

访问：

```text
http://127.0.0.1:3000
```

## Phase 8：发布和升级

每个阶段单独提交并可回滚。推荐提交类型：

```text
feat: support nested interface categories
fix: prevent interface save false failure
fix: normalize imported interface fields
test: add legacy category compatibility cases
docs: add local development setup
chore: update npm registry configuration
refactor: extract interface category helpers
opti: reduce interface tree rendering overhead
```

不使用项目不允许的 `build`、`perf` 和 `ci` 类型。

升级前：备份数据库、记录版本和配置、停止旧服务、确认回滚方式。升级后：执行依赖安装、数据库迁移、启动服务、验证管理员登录、历史项目、历史接口、接口编辑保存、导入和分类树。

## 四、推荐实际执行顺序

```text
1. 固定当前可运行基线
2. 备份 MongoDB
3. 补齐接口分类回归测试
4. 补齐接口保存回归测试
5. 抽取分类工具函数
6. 抽取接口数据规范化函数
7. 稳定 Swagger 2.0/OpenAPI 3.0 导入
8. 增加 OpenAPI 3.1 核心兼容
9. 替换 node-sass
10. 验证 Node.js 18
11. 升级构建工具
12. 重构分类树 UI
13. 重构接口编辑页 UI
14. 最后评估 React 和 Ant Design 大版本升级
```

## 五、第一批执行范围

第一批不升级核心 npm 依赖，只完成：

```text
接口分类兼容性测试
接口保存回归测试
接口数据规范化
OpenAPI 2.0/3.0 导入回归
历史数据读取验证
迁移文档补充
```

完成上述内容后，再处理 `node-sass`、Node.js 18、Webpack/YKit、React 和 UI 升级。

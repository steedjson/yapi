# v1.x（老版本）→ v2.0.0 数据迁移指南

> 适用：现网运行老版本（master 老代码，含 585+ 接口的真实项目数据）升级到 v2.0.0（production 分支打标基线）。
> 结论先行：**老库可以直接被 v2.0.0 挂载**——schema 层面全部变更向后兼容，索引等迁移工作由启动任务自动完成，密码由首次登录自动升级。唯一的回滚陷阱见第三节，务必先读。

## 一、兼容性结论（models diff 实证）

对 `git diff master..production -- server/models/` 逐行核对：13 个模型文件的 842 行差异**全部为类型注解 / JSDoc / 索引声明 / 基础设施**，真正的 schema 变更仅 3 处，且全部向后兼容：

| 变更 | 模型 | 老数据影响 |
| --- | --- | --- |
| 新增 `parent_id: Number, default 0` | interfaceCat | 无字段读取侧归一为 0 = 顶级分类（categoryMethods.js `cate.parent_id \|\| 0`），老分类在多级分类 UI 中正常显示为顶层 |
| `key: Number → String` | storage | 无存量影响：该集合唯一消费方是皮肤配置，key 一直按字符串命名空间写入（utils/storage.js） |
| 新增 `disabled: Boolean, default false` | user | 老用户无字段视为启用（登录守卫只在 `disabled === true` 时拦截） |

- **无集合重命名、无字段删除、无破坏性格式变更**：jsondiffpatch 升级（存量日志是快照非 delta）、json-schema-faker 0.6（只影响运行时生成，存量的 schema 数据不变）、markdown 管线升级（desc 双写语义保持，老接口无 markdown 字段时以 HTML 呈现、重新保存即迁移——既有设计取舍）。
- **索引层自动迁移**：v2.0.0 启动任务（`connect()` 就绪链，db.js registerStartupTask 机制）幂等创建业务复合索引（interface/interface_cat/interface_col/interface_case 等）与 identitycounters 唯一索引，**无需手工执行**。

## 二、密码自动升级（无需迁移，但关系到回滚）

老格式 `sha1(password + sha1(passsalt))` 在 v2.0.0 登录时验证通过后**自动升级**为 scrypt 自描述格式（passsalt 不变，cookie 依赖它）。含义：

- 迁移本身不碰密码数据，所有老用户按原密码登录；
- 但每有一个用户在 v2.0.0 登录成功，其 password 字段就永久变为 scrypt 格式——**回滚影响见第三节**。

## 三、迁移步骤（原地升级，推荐）

```bash
# 0. 备份（回滚锚点）
mongodump --uri="mongodb://<host>:<port>" --out=/backup/$(date +%F)
cp config.json /backup/config.json.bak

# 1. 停掉所有老版本实例（多实例并行 + 新版本启动建唯一索引会竞争，见第四节）

# 2. 部署 v2.0.0 代码（git checkout v2.0.0 或对应部署包）
npm install --production   # engines 会强制校验 Node >= 22.12

# 3. 启动（勿跑 install-server —— 那是全新安装用的，会初始化管理员账号）
node server/app.js
```

**前置检查清单**：
- Node ≥ 22.12（jsondiffpatch 0.7 为 ESM-only，低于此版本启动即 ERR_REQUIRE_ESM——engines 已强制）；
- config.json 与老版本同形态即可（db 连接/端口/adminAccount/mail；mail 若启用需含 host/port/from/auth 完整形态）；
- MongoDB 4.4+（本地实测 4.4 与 8.0 均正常，CI 使用 mongo:7）。

## 四、两个必须人工处理的点

### 1. identitycounters 重复文档清洗（条件执行）

老版本**多实例**运行过的话，计数器集合可能存在 `{model, field}` 重复文档（老代码多 worker 冷启动竞态的存量缺陷）。v2.0.0 启动时给该集合建唯一索引会因重复而失败（每次启动日志一次、不阻塞业务、不加重损坏），清洗一次即根治：

```js
// mongosh 连接业务库后执行
// ① 检查：有输出则需清洗
db.identitycounters.aggregate([
  { $group: { _id: { model: "$model", field: "$field" }, n: { $sum: 1 }, max: { $max: "$count" } } },
  { $match: { n: { $gt: 1 } } }
])
// ② 清洗：每组保留 count 最大的一条（自增计数取最大保证不回退）
db.identitycounters.aggregate([
  { $sort: { count: -1 } },
  { $group: { _id: { model: "$model", field: "$field" }, keepId: { $first: "$_id" } } }
]).forEach(g => db.identitycounters.deleteMany({
  model: g._id.model, field: g._id.field, _id: { $ne: g.keepId }
}))
```

### 2. 全停旧实例后再启动新版本

新版本启动任务会给 identitycounters 建唯一索引；若旧实例仍在运行并继续写入计数器文档，存在索引建立与写入的竞争。切换窗口内先全停旧版本。

## 五、验证清单（切换后逐项过）

- 老账号原密码登录（触发 scrypt 自动升级）；
- 接口列表 / 详情 / 编辑保存；
- mock 请求返回生成数据（`/mock/<projectId>/<path>`，注意前缀无 /api）；
- wiki 页渲染、测试集合运行、数据管理导入导出；
- 用户管理 / 皮肤设置。

## 六、回滚方案（master 逃生舱）与关键陷阱

代码与索引回滚无障碍：切回 master 老代码重启即可——新增字段老代码读不到即忽略，新增索引老代码照样受益，**数据无需回滚**。

**⚠ 密码陷阱（必读）**：老版本只认 sha1 格式（master user.js:48 为纯字符串比较）。任何用户在 v2.0.0 登录过一次，其 password 已升级为 scrypt——**回滚后这些用户将无法登录**。两个处置选项：

1. 迁移前已做 mongodump，回滚时恢复 `user` 集合（`mongorestore --nsInclude=<db>.users`）；
2. 接受回滚后由管理员对已登录过的账号批量重置密码。

因此建议：先灰度（少数账号登录验证一至数天），确认稳定后再放开全员登录；灰度期内的回滚代价最小。

## 七、全新部署路径（可选）

适用于想同时升级 MongoDB 大版本：新机部署 v2.0.0（`install-server` 初始化）→ 老库 `mongodump` → 新库 `mongorestore` 导入业务集合 → 启动（老库 → 新版 mongod 的 dump/restore 单向兼容）。后续步骤与验证清单同上。

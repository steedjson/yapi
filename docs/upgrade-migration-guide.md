# v1.x（老版本）→ v2.0.0 数据迁移指南

> 适用：现网运行老版本（master 老代码，含 585+ 接口的真实项目数据）升级到 v2.0.0（production 分支打标基线）。
> 结论先行：**老库可以直接被 v2.0.0 挂载**——schema 层面全部变更向后兼容，索引等迁移工作由启动任务自动完成，密码由首次登录自动升级。有两条迁移路径：
>
> - **主线路径（第三节，推荐）：MongoDB 大版本升级 + 换库迁移**——老库 mongodump → 新 mongod（7/8）mongorestore → `scripts/migrate-precheck.js` 检查/清洗 → 部署启动 v2.0.0。适合想同时升级 MongoDB 大版本的场景；
> - **次路径（第四节）：原地升级（不换库）**——MongoDB 不动，直接把 v2.0.0 代码挂到老库上。
>
> 唯一的回滚陷阱见第七节，务必先读。

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
- 但每有一个用户在 v2.0.0 登录成功，其 password 字段就永久变为 scrypt 格式——**回滚影响见第七节**。

## 三、主线路径：MongoDB 大版本升级 + 换库迁移（推荐）

适用于想同时升级 MongoDB 大版本（如 3.x/4.x → 7/8）的场景：新机/新容器部署新版 mongod，业务数据经 dump/restore 迁入，再挂载 v2.0.0。

| 步骤 | 操作 | 说明 |
| --- | --- | --- |
| ① | 老库全量备份：`mongodump` | 工具版本**不低于目标新库版本**（官方工具向前兼容老版本服务器：新版本 mongodump/mongorestore 可以对老版本 mongod 操作，同一套工具就能完成 dump 与 restore）。同时备份 `config.json`。这是回滚锚点 |
| ② | 部署新 mongod（7/8）+ `mongorestore` | 恢复**业务集合**即可。身份认证数据（admin/system 的用户与角色）默认不在业务 dump 中，**不要依赖 restore 迁移账号体系**，见下方注意事项；restore 会按 dump 里的规格重建索引，YApi 的索引均为简单复合索引，跨版本规格无风险 |
| ③ | 迁移前检查/修复：`node scripts/migrate-precheck.js` | 只读报告四项检查；发现 identitycounters 重复时 `--fix` 一次性清洗（详见第五节）。必须在首次启动 v2.0.0 之前完成 |
| ④ | 部署 v2.0.0 代码（git checkout v2.0.0 或对应部署包） | `npm install --production`——engines 强制校验 Node >= 22.12（jsondiffpatch 0.7 为 ESM-only，低于此版本启动即 ERR_REQUIRE_ESM） |
| ⑤ | 启动：`node server/app.js` | 启动任务自动创建业务复合索引与 identitycounters 唯一索引（幂等，重复执行无副作用）。**勿跑 install-server**——那是全新安装用的，会初始化管理员账号 |
| ⑥ | 验证 | 按第六节验证清单逐项过 |

新库就绪后，`config.json` 的 db 节点指向新 mongod 即可（`servername`/`port`/`DATABASE`，或直接给 `connectString`），形态与老版本一致。

### 大版本升级注意事项

- **mongorestore 跨大版本是单向兼容**：老版本 mongod 的 dump 恢复到同版本或更高版本的 mongod 是官方支持的升级路径；反向（新 dump → 老 mongod）不受支持，也不要尝试把新版本 server 的数据导回老版本。
- **Feature Compatibility Version（FCV）**：控制 mongod 持久化数据格式的兼容特性集。restore 出来的数据按新 server 的 FCV 落地，正常升级场景无需手工干预；仅在需要**降级 mongod 版本**时，官方要求先把 FCV 调整到旧版本再降级——换库升级路径正常不涉及。
- **身份认证不随 restore 迁移**：用户与角色存放在 admin/system 集合中，官方建议不通过 restore 迁移账号体系，而是在新库上手工重建管理员与应用账号。若走内网无鉴权环境，则 `config.json` 不带 `user`/`pass` 即可（与老版本同形态）。
- **restore 后必须跑 identitycounters 重复检查（步骤③）**：老版本**多实例**运行过的话，计数器集合可能存在 `{model, field}` 重复文档（老代码多 worker 冷启动竞态的存量缺陷），restore 会把它们原样带回新库。v2.0.0 启动时给该集合建唯一索引会因重复而失败（每次启动日志一次、不阻塞业务、不加重损坏），`scripts/migrate-precheck.js --fix` 一次清洗即根治，详见第五节。

## 四、次路径：原地升级（不换库）

MongoDB 版本保持不动，直接把 v2.0.0 挂到老库上：

```bash
# 0. 备份（回滚锚点）
mongodump --uri="mongodb://<host>:<port>" --out=/backup/$(date +%F)   # 时点快照：宜在停写/切换窗口内执行，或 dump 后至切换前旧库不再接新写入
cp config.json /backup/config.json.bak

# 1. 停掉所有老版本实例（多实例并行 + 新版本启动建唯一索引会竞争，见第五节）

# 2. 部署 v2.0.0 代码（git checkout v2.0.0 或对应部署包）
npm install --production   # engines 会强制校验 Node >= 22.12

# 3. 启动（勿跑 install-server —— 那是全新安装用的，会初始化管理员账号）
node server/app.js
```

**前置检查清单**：

- Node ≥ 22.12（jsondiffpatch 0.7 为 ESM-only，低于此版本启动即 ERR_REQUIRE_ESM——engines 已强制）；
- config.json 与老版本同形态即可（db 连接/端口/adminAccount/mail；mail 若启用需含 host/port/from/auth 完整形态）；
- MongoDB 4.4+（本地实测 4.4 与 8.0 均正常，CI 使用 mongo:7）。

原地升级同样建议在首次启动前跑一遍 `node scripts/migrate-precheck.js`（老库多实例竞态的 identitycounters 重复与「回滚陷阱暴露面」普查对两条路径都有意义）。

## 五、identitycounters 清洗与前置检查（脚本化）

### 1. 首选：migrate-precheck 脚本

`scripts/migrate-precheck.js` 在 mongorestore 之后、首次启动 v2.0.0 之前运行，读取仓库根 config.json 连接目标库（连接串逻辑与 server/utils/db.js 一致），默认**只读报告**：

```bash
node scripts/migrate-precheck.js          # 只读检查，发现需处理项时退出码 1
node scripts/migrate-precheck.js --fix    # 执行 identitycounters 重复清洗
node scripts/migrate-precheck.js --db <name>   # 覆盖 DATABASE（测试/演练用）
node scripts/migrate-precheck.js --json   # 机器可读输出
```

四项检查：

1. **identitycounters 重复文档**：按 `{model, field}` 分组报告重复组；`--fix` 时每组保留 count 最大的一条（自增计数取最大保证不回退），输出删除明细并复查残留；
2. **user 密码格式普查**：legacy sha1 与 scrypt$ 计数——scrypt 计数即「回滚陷阱暴露面」（已升级=无法回退老版本登录的账号量，见第七节）；
3. **interface_cat 的 parent_id 缺失计数**：信息性（读取侧归一为顶级分类，无需处理）；
4. **storage 集合普查**：文档数与 key 类型分布，信息性（Number key 存量文档不影响 v2.0.0）。

退出码：`0` 无需处理/处理成功；`1` 发现需处理项（未带 --fix 时，或 --fix 后仍有残留）；`2` 连接或参数错误。

### 2. 替代：mongosh 手工片段（无脚本环境时）

无 Node 环境跑脚本时，可直接用 mongosh 完成检查与清洗（语义与脚本一致）：

```js
// mongosh 连接业务库后执行
// ① 检查：有输出则需清洗
db.identitycounters.aggregate([
  { $group: { _id: { model: "$model", field: "$field" }, n: { $sum: 1 }, max: { $max: "$count" } } },
  { $match: { n: { $gt: 1 } } }
])
// ② 清洗：每组保留 count 最大的一条（自增计数取最大保证不回退）；
//    注意 count 并列时 $group/$first 的取舍在 mongosh 下不确定——需要确定性取舍（并列保 _id 串序最小）请改用脚本 node scripts/migrate-precheck.js --fix
db.identitycounters.aggregate([
  { $sort: { count: -1 } },
  { $group: { _id: { model: "$model", field: "$field" }, keepId: { $first: "$_id" } } }
]).forEach(g => db.identitycounters.deleteMany({
  model: g._id.model, field: g._id.field, _id: { $ne: g.keepId }
}))
```

### 3. 全停旧实例后再启动新版本

新版本启动任务会给 identitycounters 建唯一索引；若旧实例仍在运行并继续写入计数器文档，存在索引建立与写入的竞争。切换窗口内先全停旧版本。

## 六、验证清单（切换后逐项过）

- 老账号原密码登录（触发 scrypt 自动升级）；
- 接口列表 / 详情 / 编辑保存；
- mock 请求返回生成数据（`/mock/<projectId>/<path>`，注意前缀无 /api）；
- wiki 页渲染、测试集合运行、数据管理导入导出；
- 用户管理 / 皮肤设置。

## 七、回滚方案（master 逃生舱）与关键陷阱

代码与索引回滚无障碍：切回 master 老代码重启即可——新增字段老代码读不到即忽略，新增索引老代码照样受益，**数据无需回滚**。

**⚠ 密码陷阱（必读）**：老版本只认 sha1 格式（master user.js:48 为纯字符串比较）。任何用户在 v2.0.0 登录过一次，其 password 已升级为 scrypt——**回滚后这些用户将无法登录**。两个处置选项：

1. 迁移前已做 mongodump，回滚时恢复 `user` 集合（`mongorestore --nsInclude=<db>.user`）；
2. 接受回滚后由管理员对已登录过的账号批量重置密码。

因此建议：先灰度（少数账号登录验证一至数天），确认稳定后再放开全员登录；灰度期内的回滚代价最小。迁移前可用 `node scripts/migrate-precheck.js` 的 user 密码普查项量化当前暴露面。

# 接口分类层级升级迁移

适用于支持接口分类无限层级的版本。升级后分类新增 `parent_id` 字段：

- `parent_id: 0`：顶级分类
- `parent_id: <分类ID>`：子分类

历史接口的 `catid` 不变，历史分类没有 `parent_id` 时会按顶级分类兼容。迁移脚本不是必需的，但建议在升级窗口执行，以便将历史数据显式补齐。

## 升级前准备

1. 确认当前 YApi 已停止写入，至少停止应用进程或安排维护窗口。
2. 备份 YApi 使用的 MongoDB 数据库。备份必须能够恢复 `interface_cat` 和 `interface` 两个集合。
3. 记录当前版本、MongoDB 连接地址、数据库名和应用配置。
4. 先在测试环境完成一次升级和页面验证，再处理生产环境。

示例备份命令（请替换连接地址和数据库名）：

```bash
mongodump --uri="mongodb://127.0.0.1:27017/yapi" --out="./backup-before-category-migration"
```

## 发布新版本

```bash
git pull
npm install --production
```

如果使用 `yapi-cli` 管理安装目录，请先使用原来的发布方式同步新版本，不要删除现有数据库或运行目录。

## 执行分类数据迁移

将下面命令中的 `yapi` 替换为实际数据库名。`updateMany` 是幂等操作，重复执行不会改变已经存在的 `parent_id`。

```bash
mongosh "mongodb://127.0.0.1:27017/yapi" --eval '
  db.interface_cat.updateMany(
    { parent_id: { $exists: false } },
    { $set: { parent_id: 0 } }
  );
  db.interface_cat.createIndex({ project_id: 1, parent_id: 1 });
'
```

旧版 MongoDB 没有 `mongosh` 时使用 `mongo`，命令内容相同。

## 启动和验证

```bash
npm start
```

验证以下内容：

1. 原有项目可以打开，原有接口数量和接口详情不变。
2. `/api/interface/getCatMenu?project_id=<项目ID>` 仍返回扁平分类数组，旧插件和旧导入流程可继续使用。
3. `/api/interface/list_menu?project_id=<项目ID>` 仍返回原有分类及接口列表结构。
4. `/api/interface/get_cat_tree?project_id=<项目ID>` 返回 `children` 树形结构。
5. 在已有分类下新增子分类，再新增接口，确认接口出现在子分类中。
6. 新建三级及以上分类，刷新页面后层级仍然存在。
7. 删除包含子分类的父分类，确认子分类、接口和接口测试用例按预期删除。
8. 使用历史 Swagger/OpenAPI 或 YApi JSON 导入一次，确认导入分类和接口正常。

## 回滚

如果升级后出现问题：

1. 停止新版本应用。
2. 恢复升级前代码和依赖。
3. 如果只执行了本迁移脚本，旧版本通常会忽略 `parent_id` 字段，无需恢复数据库。
4. 如果已经创建了子分类，旧版本不会展示层级关系；需要恢复完整数据库备份才能撤销这些分类关系和新增数据。
5. 启动旧版本并验证原有接口访问。

```bash
mongorestore --drop --uri="mongodb://127.0.0.1:27017/yapi" "./backup-before-category-migration/yapi"
```

## 注意事项

不要直接把旧版 `/api/interface/getCatMenu` 的返回值改成树形结构。该接口保持扁平返回，树形菜单使用新增的 `/api/interface/get_cat_tree`，这样可以兼容历史数据、旧客户端和已有导入插件。

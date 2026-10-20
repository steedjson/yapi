// 空库首次初始化时由 mongo 官方镜像自动执行一次：在业务库中创建应用账号。
// 变量来自 docker-compose.yml 传入的容器环境（mongosh 支持 process.env）；
// 应用账号建在业务库内，仅授予该库 readWrite，权限最小化。
/* global db */
db.createUser({
  user: process.env.YAPI_DB_USER,
  pwd: process.env.YAPI_DB_PASS,
  roles: [{ role: 'readWrite', db: process.env.MONGO_INITDB_DATABASE }]
});

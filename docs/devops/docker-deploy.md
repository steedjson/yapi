# Docker 部署

本文面向用 Docker 一条命令起全套（YApi + MongoDB）的部署场景，对应仓库自带的 `Dockerfile` 与 `docker-compose.yml`。裸机 / pm2 部署见 [v2.0.0 全新部署](index.md)；老版本（v1.x）数据升级见[迁移指南](upgrade-migration-guide.md)。

以下流程已在 Docker Engine 29.x + Compose v5.5 实测：镜像构建、首装初始化、管理员登录、容器重建后不重复初始化，全部通过。

## 前置要求

* Docker Engine（含 Compose v2，`docker compose` 子命令可用）
* 无需在宿主机安装 Node.js 与 MongoDB：Node 版本由镜像保证（默认 `node:24-alpine`，满足 **>= 22.12 硬性下限**），MongoDB 使用 `mongo:8.0`（满足 4.2+ 要求）

## 快速开始

```bash
git clone --depth=1 <仓库地址> yapi && cd yapi
docker compose up -d
```

首次启动流程全自动：MongoDB 建库与应用账号 → 生成 `config.json` → 初始化管理员账号（`YAPI_AUTO_INSTALL=1` 时）→ 拉起服务。看到两个服务 `healthy` 即就绪：

```bash
docker compose ps
```

验证（与[裸机部署验证](index.md#部署验证)同一套判定）：

```bash
curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/            # 200
curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/prd/assets.js  # 200
curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/docs/index.html # 200
```

默认管理员账号与裸机部署一致：

```text
账号：admin@admin.com
密码：ymfe.org
```

**首登后请立即改密码。**

## 默认口令与 .env 覆盖

Compose 内置了可直接跑通的默认值，**生产环境必须至少改掉两个数据库口令**。在 `docker-compose.yml` 同目录放 `.env` 文件覆盖：

```bash
cat > .env <<'EOF'
YAPI_PORT=3000
YAPI_ADMIN_ACCOUNT=admin@yourcompany.com
YAPI_DB_USER=yapi
YAPI_DB_PASS=换一个强口令
MONGO_INITDB_ROOT_USER=root
MONGO_INITDB_ROOT_PASS=再换一个强口令
EOF
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `YAPI_PORT` | `3000` | 服务端口，宿主机映射与容器内配置同值 |
| `YAPI_ADMIN_ACCOUNT` | `admin@admin.com` | 首次初始化创建的管理员账号（仅空库首装时生效） |
| `YAPI_DB_DATABASE` | `yapi` | 业务库名，同时是应用账号的 authSource |
| `YAPI_DB_USER` / `YAPI_DB_PASS` | `yapi` / `yapi_app_pass` | MongoDB 应用账号（仅授权业务库读写） |
| `MONGO_INITDB_ROOT_USER` / `MONGO_INITDB_ROOT_PASS` | `root` / `yapi_root_pass` | MongoDB root 账号（仅空库首装时创建） |
| `YAPI_AUTO_INSTALL` | `1` | 空库首装自动初始化；**接入已有数据的库必须置 `0`** |
| `TZ` | `Asia/Shanghai` | 容器时区 |

> **改端口等配置务必写进 `.env` 文件**，不要用 `YAPI_PORT=13000 docker compose up` 这类临时 shell 变量：后续不带变量的 `up --force-recreate` 会让容器按默认值重建，端口回到 3000（实测行为）。

## 数据持久化

| 卷 | 容器路径 | 内容 |
| --- | --- | --- |
| `mongo-data` | `/data/db` | 全部业务数据（项目、接口、账号等） |
| `yapi-persist` | `/yapi/persist` | `init.lock` 初始化标记 |
| `yapi-log` | `/yapi/log` | 运行日志 |
| `yapi-attachment` / `yapi-image` | `/yapi/static/attachment`、`/yapi/static/image` | 运行时上传文件（首次挂载自动带入镜像内基线文件） |

`init.lock` 通过符号链接落在 `yapi-persist` 卷里：容器重建后标记仍在，不会在已有库上重复执行 `install-server` 重复建管理员（实测 `--force-recreate` 后库内仍只有一个账号）。确实需要重装时删除标记再初始化：

```bash
docker compose exec yapi rm /yapi/persist/init.lock
docker compose run --rm yapi node server/install.js
```

数据备份（`down` 不删卷，备份不必停机）：

```bash
docker compose exec mongo mongodump -u root -p "$MONGO_INITDB_ROOT_PASS" --authenticationDatabase admin -d yapi --archive > yapi-backup.archive
```

## 服务管理与升级

```bash
docker compose logs -f yapi     # 跟踪应用日志
docker compose restart yapi     # 重启应用
docker compose down             # 停止并移除容器（数据卷保留）
docker compose down -v          # 停止并删除数据卷（危险：清空全部数据）
```

**版本升级**（镜像与代码随仓库更新，数据不动）：

```bash
git pull
docker compose up -d --build
```

**接入已有数据的库**（v1.x 升库或换库迁移）：先在 `.env` 置 `YAPI_AUTO_INSTALL=0` 再启动，避免在老库上凭空多出默认密码的管理员；v1.x 数据迁移步骤见[迁移指南](upgrade-migration-guide.md)。

## 完整配置（邮箱 / LDAP / MongoDB 集群）

环境变量只覆盖核心项，两种方式补全其余配置：

**方式一：`YAPI_EXTRA_CONFIG_JSON` 合并**（改动小，适合追加 `closeRegister`、`mail` 等）：

```yaml
# docker-compose.yml 的 yapi.environment 追加（各字段含义见部署文档对应章节）
YAPI_EXTRA_CONFIG_JSON: '{"closeRegister":true,"mail":{"enable":true,"host":"smtp.163.com","port":465,"from":"***@163.com","auth":{"user":"***@163.com","pass":"*****"}}}'
```

**方式二：挂载完整 `config.json`**（与裸机部署同一份文件，适合复杂配置）：

取消 `docker-compose.yml` 中 `# - ./config.json:/yapi/config.json:ro` 的注释，按 `config_example.json` 准备文件。注意两点：

1. 挂载后 `YAPI_DB_*` 环境变量不再参与配置，数据库连接以文件为准（ compose 内置 MongoDB 的地址写 `mongo`，端口 `27017`）；
2. 保持文件内 `port` 与 `YAPI_PORT` 一致——端口映射与健康检查都依赖它。

修改任何配置后 `docker compose up -d` 重建容器生效。

## 单容器接外部数据库（可选）

只用镜像、数据库走已有的外部实例：

```bash
docker build -t yapi:2.0.0 .
docker run -d --name yapi -p 3000:3000 \
  -e YAPI_DB_SERVERNAME=10.0.0.8 -e YAPI_DB_PORT=27017 \
  -e YAPI_DB_DATABASE=yapi -e YAPI_DB_USER=*** -e YAPI_DB_PASS=*** \
  -e YAPI_AUTO_INSTALL=1 \
  -v yapi-persist:/yapi/persist -v yapi-log:/yapi/log \
  -v yapi-attachment:/yapi/static/attachment -v yapi-image:/yapi/static/image \
  yapi:2.0.0
```

MongoDB 集群改用 `YAPI_DB_CONNECTSTRING` 传连接串。已有数据的库去掉 `YAPI_AUTO_INSTALL` 或置 `0`。

## 常见问题

* **改端口**：`.env` 里设 `YAPI_PORT`（宿主机映射与容器内同值，一处生效）。
* **宿主机直连 MongoDB**：compose 默认不发布 27017 端口（容器间内网访问）。临时调试可在 mongo 服务加 `ports: ["127.0.0.1:27017:27017"]`，用 `MONGO_INITDB_ROOT_*` 账号连接。
* **nginx 反代**：与裸机部署相同，需配置 websocket 透传（`proxy_set_header Upgrade/Connection`，见[部署文档](index.md)开头）。
* **https 站点**：同[部署文档](index.md)开头的提醒——https 下测试功能请求 http 站点时文件上传会受浏览器安全限制，建议反代为 http。
* **健康检查**：镜像内置 `HEALTHCHECK`（wget 探测入口页），`docker ps` 的 healthy 即代表 HTTP 就绪。
* **为什么不用 pm2**：容器由 Docker `restart: unless-stopped` 托管常驻，pm2 面向裸机部署，两者不叠加使用。

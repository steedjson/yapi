#!/bin/sh
# YApi 容器入口：生成缺失的 config.json、可选首次初始化，然后拉起服务。
set -e

cd /yapi

# 1) config.json 挂载优先；未挂载时由 YAPI_* 环境变量生成（见 docker/gen-config.js）。
#    邮箱 / LDAP / MongoDB 集群等完整配置请挂载 config.json，见 docs/devops/docker-deploy.md。
if [ ! -f config.json ]; then
  node docker/gen-config.js > config.json
  echo '[entrypoint] 未检测到挂载的 config.json，已由环境变量生成（完整配置请挂载文件覆盖）'
fi

# 2) 首次初始化：init.lock 经符号链接写入 /yapi/persist（随卷持久化）。
#    仅用于全新空库；接入已有数据的老库必须保持 YAPI_AUTO_INSTALL=0。
if [ "${YAPI_AUTO_INSTALL:-0}" = "1" ] && [ ! -f init.lock ]; then
  echo '[entrypoint] 未发现 init.lock，执行 install-server 初始化管理员账号 ...'
  node server/install.js
fi

exec "$@"

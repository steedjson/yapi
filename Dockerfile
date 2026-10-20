# syntax=docker/dockerfile:1
# YApi v2.0.0 生产镜像。
# Node >= 22.12 为硬性下限（插件 wiki 启动期 require('jsondiffpatch')，0.7 起 ESM-only），
# 默认基础镜像跟随 .nvmrc 的 24.x LTS，可用 --build-arg NODE_IMAGE= 覆盖。
ARG NODE_IMAGE=node:24-alpine

# ---- 依赖层：只装生产依赖，独立缓存 ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /yapi
# .npmrc 固定镜像源与 legacy-peer-deps，随仓库提交
COPY package.json package-lock.json .npmrc ./
# 根工程 postinstall（patch-package/simple-git-hooks 均为 devDependencies）在
# --omit=dev 下走"production install skipped"分支；仓库无 patches/，无需补丁。
RUN npm ci --omit=dev

# ---- 运行层 ----
FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /yapi

RUN apk add --no-cache tzdata

# 先复制依赖层，再复制源码（client/constants 等被服务端运行时引用，已由 .dockerignore 保留）
COPY --from=deps /yapi/node_modules ./node_modules
COPY . .

# init.lock 经符号链接落在 /yapi/persist：初始化标记随卷持久化，容器重建不丢，
# 避免 install-server 在已有数据的库上重复创建默认管理员账号。
RUN mkdir -p persist log \
 && ln -s /yapi/persist/init.lock /yapi/init.lock \
 && chmod +x docker/entrypoint.sh \
 && chown -R node:node /yapi

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${YAPI_PORT:-3000}/" || exit 1

ENTRYPOINT ["/yapi/docker/entrypoint.sh"]
CMD ["node", "server/app.js"]

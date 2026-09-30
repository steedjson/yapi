## 安装YApi

本仓是**根目录 npm 工程**（v2.0.0 起不再使用老版本的 `vendors/` 嵌套目录结构），完整部署步骤见 `docs/devops/index.md`（文档站「内网部署」页签）。快速起步：

```bash
git clone --depth=1 https://github.com/YMFE/yapi.git yapi && cd yapi
cp config_example.json ./config.json   # 复制完成后请修改相关配置
npm install                            # 二次开发需要完整依赖（含前端构建链）
npm run install-server                 # 仅全新空库执行一次
npm run dev                            # 开发模式启动
```

配置文件主要配置 MongoDB 数据库与 Admin 账号。

```json
{
  "port": "3011",
  "adminAccount": "admin@admin.com",
  "db": {
    "servername": "127.0.0.1",
    "DATABASE":  "yapi",
    "port": 27017,
    "user": "yapi",
    "pass": "yapi123"
  },
  "mail": {
    "enable": true,
    "host": "smtp.163.com",
    "port": 465,
    "from": "***@163.com",
    "auth": {
        "user": "***@163.com",
        "pass": "*****"
    }
  }
}
```
> db.user 和 db.pass 是 mongodb 的用户名和密码，如果没有开启 mongo 认证功能，请删除这两个选项。

目录结构（仅列主要部分）

```
|-- config.json
|-- init.lock
|-- log
|-- client/          # 前端源码
|-- common/          # 前后端共享代码
|-- exts/            # 内置插件（yapi-plugin-*）
|-- scripts/         # 构建与运维脚本
|-- server/          # 后端源码
|-- static/          # 静态资源与生产前端产物（static/prd）
|-- test/            # 自动化测试
|-- package.json
`-- rsbuild.config.mjs
```

## 技术栈说明

后端： koa mongoose

前端： react + zustand（状态管理，由 redux 迁移而来；迁移模式与语义差异见仓库内 `docs/zustand-migration-pattern.md`）

## 启动开发环境服务器

```bash
  npm run dev
  # 启动后请访问 127.0.0.1:{config.json配置的端口}
  # 3000 为后端与系统页面入口，4000 为前端开发资源服务
```

## 启动生产环境服务器

```bash
  npm ci --omit=dev         # 生产依赖
  node server/app.js        # 生产前端产物 static/prd 随仓库提供，无需构建
```

修改前端源码后需重新构建产物：`npm run build-client`（需完整依赖）。


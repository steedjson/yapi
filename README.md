## YApi  可视化接口管理平台

当前版本 **v2.0.0**（基于 [YMFE/yapi](https://github.com/YMFE/yapi) 的内网维护版，技术栈与安全基线已全面升级，详见 [版本说明](docs/documents/version.md)、[CHANGELOG.md](CHANGELOG.md)）

* 使用文档：仓库内 [docs/documents/](docs/documents/SUMMARY.md)，部署后页脚「使用文档」站内可直接查看，也可 `npm run docs` 本地构建文档站
* 内网部署：[docs/devops/index.md](docs/devops/index.md)（含初始化、pm2 常驻、部署验证与全部配置项）；Docker Compose 一键起全套见 [docker-deploy.md](docs/devops/docker-deploy.md)
* 上游演示站：[http://yapi.smart-xwork.cn/](http://yapi.smart-xwork.cn/) · 上游原版文档：[hellosean1025.github.io/yapi](https://hellosean1025.github.io/yapi)

### 平台介绍
![avatar](yapi-base-flow.jpg)

YApi 是<strong>高效</strong>、<strong>易用</strong>、<strong>功能强大</strong>的 api 管理平台，旨在为开发、产品、测试人员提供更优雅的接口管理服务。可以帮助开发者轻松创建、发布、维护 API，YApi 还为用户提供了优秀的交互体验，开发人员只需利用平台提供的接口数据写入工具以及简单的点击操作就可以实现接口的管理。

### 特性
*  基于 Json5 和 Mockjs 定义接口返回数据的结构和文档，效率提升多倍
*  扁平化权限设计，即保证了大型企业级项目的管理，又保证了易用性
*  类似 postman 的接口调试
*  自动化测试, 支持对 Response 断言
*  MockServer 除支持普通的随机 mock 外，还增加了 Mock 期望功能，根据设置的请求过滤规则，返回期望数据
*  项目 Wiki 协同文档（随仓库内置）：多人协同编辑与编辑锁防冲突
*  支持 postman, har, swagger 数据导入
*  开放接口（openapi）：项目 token 可调用 15 个数据面读写端点，接口文档随部署站内提供
*  免费开源，内网部署，信息再也不怕泄露了

### v2.0.0 技术栈
*  前端：React 19 · antd v6 · react-router v7，生产构建迁移至 rsbuild（产物 `static/prd/`）
*  编辑器：由 Ace 全面迁移至 CodeMirror 6（接口编辑/预览、Mock 脚本、测试脚本）
*  后端：Koa 2 · mongoose 8（MongoDB 4.2+），Node >= 22.12
*  安全：密码散列升级 scrypt（存量 sha1 口令登录时自动升级）；npm audit 生产依赖链 0 漏洞

### 内网部署
#### 环境要求
* nodejs（>= 22.12，硬性下限；推荐 24.21.0 LTS）
* mongodb（4.2+，推荐 4.4+）
* git
#### 安装
本仓是根目录 npm 工程，把代码放到部署目录即可部署，完整步骤（初始化、pm2 常驻、部署验证、配置项）见 [内网部署文档](docs/devops/index.md)；不想装 Node.js / MongoDB 环境时可用 `docker compose up -d` 一条命令起全套，见 [Docker 部署指南](docs/devops/docker-deploy.md)。

    git clone --depth=1 <仓库地址> yapi && cd yapi
    cp config_example.json config.json   # 修改 db 与 adminAccount
    npm ci --omit=dev                    # 生产依赖（前端产物 static/prd 随仓库提供，无需构建）
    npm run install-server               # 仅全新空库执行一次，创建管理员账号与索引
    node server/app.js                   # 启动后访问 http://127.0.0.1:{config.json 的 port}

默认管理员为 config.json 中 `adminAccount` 配置的邮箱，默认密码 `ymfe.org`，登录后请立即修改。

#### 服务管理
推荐使用 pm2 常驻管理服务，完整命令（安装、启动/停止/重启、查看日志）见 [服务管理 · 内网部署文档](docs/devops/index.md#服务管理)。

#### 升级
已有 v2.0.0 版本升级：拉取新代码后 `npm ci --omit=dev` 并重启即可，数据无需迁移。

老版本（v1.x）数据升级到 v2.0.0 请走迁移指南：[v1.x → v2.0.0 数据迁移指南](docs/devops/upgrade-migration-guide.md)（含 MongoDB 大版本换库迁移、原地升级两条路径与回滚密码陷阱）。

### 本地开发
    npm install           # 安装完整依赖（含 devDependencies）
    npm run dev           # 同时启动后端（nodemon）与前端（rsbuild，端口 4000）开发服务
    npm run build-client  # 构建生产前端产物到 static/prd
    npm test              # AVA 测试（可指定单文件：npm test -- test/common/xxx.test.js）
    npm run lint          # ESLint 全仓检查
    npm run typecheck     # TypeScript 类型门禁
    npm run docs          # 构建站内文档站到 static/docs

生产部署无需构建前端（`static/prd/` 随仓库提供）；仅当修改 `client/` 源码或启用带客户端入口的外部插件时才需要 `npm run build-client`。

### 开放接口（openapi）
项目 token 语义为「归属项目内的开发者」：15 个数据面读写端点可用（私有项目同样可调用）；项目配置修改（`/api/project/up`）与删除类操作不支持 token 调用；被禁用或已删除账号的 token 立即失效。端点清单与调用说明见 [docs/documents/api.md](docs/documents/api.md)，也可在项目「设置 → token」页直接查看站内文档。

### YApi 插件
*  本仓内置插件见 `exts/yapi-plugin-*/`（高级 Mock、Wiki、数据导入导出、Swagger 自动同步、统计、gen-services 等）
*  [yapi sso 登录插件](https://github.com/YMFE/yapi-plugin-qsso)
*  [yapi cas 登录插件](https://github.com/wsfe/yapi-plugin-cas) By wsfe
*  [yapi gitlab集成插件](https://github.com/cyj0122/yapi-plugin-gitlab)
*  [oauth2.0登录](https://github.com/xwxsee2014/yapi-plugin-oauth2)
*  [rap平台数据导入](https://github.com/wxxcarl/yapi-plugin-import-rap)
*  [dingding](https://github.com/zgs225/yapi-plugin-dding) 钉钉机器人推送插件
*  [export-docx-data](https://github.com/inceptiongt/Yapi-plugin-export-docx-data) 数据导出docx文档
*  [interface-oauth-token](https://github.com/shouldnotappearcalm/yapi-plugin-interface-oauth2-token) 定时自动获取鉴权token的插件
*  [import-swagger-customize](https://github.com/follow-my-heart/yapi-plugin-import-swagger-customize) 导入指定swagger接口

> 注：插件机制（服务端钩子 + `exts/`/`node_modules` 双路径加载）在 v2.0.0 保留，登录类服务端钩子插件架构上可装；涉及客户端渲染的插件在 React 19 + antd 6 下兼容性未验证，启用前请自行测试。

### 代码生成
* [yapi-to-typescript：根据 YApi 的接口定义生成 TypeScript 的请求函数](https://github.com/fjc0k/yapi-to-typescript)
* [yapi-gen-js-code: 根据 YApi 的接口定义生成 javascript 的请求函数](https://github.com/hellosean1025/yapi-gen-js-code)
* [SwiftJSONModeler:根据 YApi 的接口生成 Swift 模型代码](https://github.com/CodeOcenS/SwiftJSONModeler)

### YApi 一些工具
* [Api Generator](https://github.com/Forgus/api-generator) 接口文档自动生成插件（零入侵）
* [mysql服务http工具,可配合做自动化测试](https://github.com/hellosean1025/http-mysql-server)
* [idea 一键上传接口到yapi插件](https://github.com/diwand/YapiIdeaUploadPlugin)
* [idea 接口上传调试插件 easy-yapi](https://easyyapi.com/)
* [执行 postgres sql 的服务](https://github.com/shouldnotappearcalm/http-postgres-server)
* [SpringBoot依赖自动生成YApi](https://github.com/NoBugBoy/YDoc)
* [Yapi X 一键生成接口文档, 上传到yapi, rap2, eolinker等（IDEA插件）](https://github.com/jetplugins/yapix)

### License
Apache License 2.0

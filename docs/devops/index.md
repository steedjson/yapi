# v2.0.0 全新部署

本文面向**空库从零部署 v2.0.0**。已有老版本（v1.x）数据要升到 v2.0.0，请看 [v1.x → v2.0.0 数据迁移指南](upgrade-migration-guide.md)（原地升级与换库迁移两条路径，含回滚密码陷阱）。

建议部署成 http 站点，因 chrome 浏览器安全限制，部署成 https 会导致测试功能在请求 http 站点时文件上传功能异常。

如果您是将服务器代理到 nginx 服务器，请配置 nginx 支持 websocket。
```
在location /添加
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## 环境要求

* Node.js（**>= 22.12 硬性下限**：插件 wiki 启动期 `require('jsondiffpatch')`，该包 0.7 起为 ESM-only，低于此版本 Node 无法 require(esm)，启动即报 `ERR_REQUIRE_ESM`。本项目开发环境使用 24.21.0 LTS）
* npm（随 Node.js 24.21.0 LTS 安装，使用与 Node.js 兼容的 npm 版本）
* MongoDB（4.2+，推荐 4.4+，本仓当前部署实测为 8.0.x；本地开发可使用 Docker 启动 MongoDB 4.4）

> **别指望装依赖阶段拦住 Node 版本**：package.json 的 `engines` 字段只产生警告，npm 实测在 Node 版本不满足时**仍会完成安装**（仅打 `EBADENGINE` warn）。版本不合格的表现是启动阶段崩溃，请事先自行核对 `node -v`。

## 准备代码

本仓是**根目录 npm 工程**（不是老版本的 `vendors/` 嵌套结构），直接把代码放到部署目录即可：

```bash
git clone --depth=1 <仓库地址> yapi && cd yapi
# 或下载部署包解压
cp config_example.json config.json   # 复制后修改 db 与 adminAccount
```

`config.json` 最小形态（无认证 MongoDB）：

```json
{
  "port": "3000",
  "adminAccount": "admin@admin.com",
  "db": {
    "servername": "127.0.0.1",
    "DATABASE": "yapi",
    "port": 27017,
    "user": "",
    "pass": "",
    "authSource": ""
  }
}
```

该文件含数据库口令，已被 .gitignore 忽略，不要提交。更多配置项（邮箱 / LDAP / 关闭注册 / MongoDB 集群）见本文后半部分。

> **前端产物无需构建**：生产前端包 `static/prd/` 随仓库提供，全新部署直接可用。只有两种情况需要重新构建：改了 `client/` 源码，或在 `config.json` 里启用了带客户端入口的外部插件（`npm run build-client`，需先安装含 devDependencies 的完整依赖）。

## 安装依赖

```bash
npm ci --omit=dev
```

仓库已提交 `package-lock.json`，且 `.npmrc` 固定了镜像源与 `legacy-peer-deps`，无需额外传 `--registry`。生产部署不需要 devDependencies（lint / 测试 / 前端构建链都不参与运行）。

## 初始化数据库

**全新空库**执行一次：

```bash
npm run install-server
```

该命令做三件事：按 `config.json` 的 `adminAccount` 创建管理员账号（密码 `ymfe.org`，scrypt 格式存储）、创建业务索引、在仓库根写入 `init.lock`。看到「初始化管理员账号成功」即完成。

```text
默认管理员账号：admin@admin.com
默认密码：ymfe.org
```

**首登后请立即改密码。** `init.lock` 是初始化标记，重复执行 `install-server` 会被它拦住（报错而非重复建号）；确实需要重装时删除该文件再执行。

⚠️ 已有数据的库**不要**跑 `install-server`：它不会清库，但会凭空多出一个默认密码的管理员账号。老库升级请走[迁移指南](upgrade-migration-guide.md)。

## 启动服务

```bash
node server/app.js
```

启动日志出现 `mongodb load success...` 与「服务已启动」即正常，访问 `http://127.0.0.1:{config.json 的 port}`（默认 3000）。启动时会自动幂等创建查询索引与计数器唯一索引，重复启动无副作用。

生产环境建议交给 pm2 常驻（见下一节）。注意 `node server/app.js dev` 才是开发模式（入口为 `dev.html`，由前端 dev server 提供资源）；生产直接用 `node server/app.js`。

## 部署验证

按下面四项逐条过（均为实测可复现的判定）：

| 检查 | 命令 / 操作 | 预期 |
| --- | --- | --- |
| 入口页 | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/` | `200` |
| 前端产物清单 | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/prd/assets.js` | `200`（404 说明 `static/prd` 缺失） |
| 站内文档站 | 浏览器打开 `/docs/index.html` | 正常渲染（页脚「使用文档」抽屉即加载此页） |
| 管理员登录 | 用 `adminAccount` 与密码 `ymfe.org` 登录 | 进入系统，`role=admin` |

再做一遍业务动作确认端到端可用：新建项目 → 新增接口 → 保存 → mock 请求（`/mock/<projectId>/<path>`，注意前缀无 `/api`）。

## 服务管理

推荐使用 pm2 管理 node 服务器启动，停止：

```bash
npm install -g pm2
cd {项目目录}
pm2 start server/app.js --name yapi    # 生产启动（非 dev 模式）
pm2 info yapi                          # 查看服务信息
pm2 stop yapi                          # 停止服务
pm2 restart yapi                       # 重启服务
pm2 logs yapi                          # 查看日志
```

进阶用法见 [PM2 官网文档](https://pm2.keymetrics.io/docs/usage/quick-start/)。

## 升级与迁移

* **老版本（v1.x）数据升级到 v2.0.0**：[v1.x → v2.0.0 数据迁移指南](upgrade-migration-guide.md)——schema 向后兼容、索引自动创建、密码首登自动升级，含回滚密码陷阱。
* **已有 v2.0.0 及后续版本升级**：拉取新代码后 `npm ci --omit=dev` 重启即可。数据无需迁移；前端产物若版本已变动（`static/prd` 随仓库更新）一并生效，客户端对 `assets.js` 有 no-cache 回源校验，不会残留旧 chunk。
* **接口分类层级升级**：[接口分类层级升级迁移](interface-category-migration.md)。

## 本地开发启动

以下步骤适用于直接在本仓库中进行开发。项目使用根目录下的 `config.json`，该文件包含本地数据库配置，不要提交到 Git。

### 1. 准备 Node.js 环境

项目依赖较旧，建议使用 `nvm` 切换到项目指定版本：

```bash
source ~/.nvm/nvm.sh
nvm install
nvm use
node -v   # v24.21.0
npm -v    # 随 Node.js 24.21.0 安装的版本
```

> 如果需要复现历史运行环境，可执行 `nvm use 10.24.1`；该版本仅用于回滚和兼容性排查，日常开发优先使用 Node.js 24.21.0 LTS。

### 2. 启动本地 MongoDB

已安装 Docker 时，可以使用以下命令启动无认证的本地 MongoDB：

```bash
docker volume create yapi-mongodb-data
docker run -d --name yapi-mongodb \
  -p 127.0.0.1:27017:27017 \
  -v yapi-mongodb-data:/data/db \
  mongo:4.4
```

如果容器已经存在，使用：

```bash
docker start yapi-mongodb
```

### 3. 安装依赖并创建配置

在项目根目录执行：

```bash
npm install
cp config_example.json config.json
```

确认 `config.json` 中的数据库配置与本地 MongoDB 一致。无认证 MongoDB 使用空的 `user`、`pass` 和 `authSource`：

```json
{
  "db": {
    "servername": "127.0.0.1",
    "DATABASE": "yapi",
    "port": 27017,
    "user": "",
    "pass": "",
    "authSource": ""
  }
}
```

### 4. 初始化数据库

首次运行或数据库为空时执行：

```bash
npm run install-server
```

初始化成功后会生成根目录下的 `init.lock`。该文件只是本机初始化标记，不要提交到 Git。

默认管理员账号为：

```text
账号：admin@admin.com
密码：ymfe.org
```

### 5. 启动开发服务

```bash
npm run dev
```

启动后访问：

```text
http://127.0.0.1:3000
```

开发模式下：

- `3000` 是 YApi 后端和系统页面入口；
- `4000` 是前端开发资源服务，直接访问可能显示目录列表，不是系统页面。

也可以分别启动前后端：

```bash
npm run dev-server
npm run dev-client
```

停止服务可在对应终端按 `Ctrl+C`。修改 `config.json` 或数据库配置后，需要重启后端服务。

## 配置邮箱

打开项目目录 config.json 文件，新增 mail 配置， 替换默认的邮箱配置
```json
{
  "port": "*****",
  "adminAccount": "********",
  "db": {...},
  "mail": {
    "enable": true,
    "host": "smtp.163.com",    //邮箱服务器
    "port": 465,               //端口
    "from": "***@163.com",     //发送人邮箱
    "auth": {
        "user": "***@163.com", //邮箱服务器账号
        "pass": "*****"        //邮箱服务器密码
    }
  }
}
```
如何申请STMP服务器账号和密码可以参考下面的教程：<a href="https://jingyan.baidu.com/article/fdbd42771da9b0b89e3f48a8.html" target="_blank">如何开通电子邮箱的SMTP功能</a>


## 配置LDAP登录
     
打开项目目录 config.json 文件，添加如下字段：   

```json
{
  "port": "*****",
  "adminAccount": "********",
  "db": {...},
  "mail": {...},
  "ldapLogin": {
      "enable": true,
      "server": "ldap://l-ldapt1.com",
      "baseDn": "CN=Admin,CN=Users,DC=test,DC=com",
      "bindPassword": "password123",
      "searchDn": "OU=UserContainer,DC=test,DC=com",
      "searchStandard": "mail",    // 自定义格式： "searchStandard": "&(objectClass=user)(cn=%s)"
      "emailPostfix": "@163.com",
      "emailKey": "mail",
      "usernameKey": "name"
   }
}

```   
这里面的配置项含义如下：  

- `enable` 表示是否配置 LDAP 登录，true(支持 LDAP登录 )/false(不支持LDAP登录);
- `server ` LDAP 服务器地址，前面需要加上 ldap:// 前缀，也可以是 ldaps:// 表示是通过 SSL 连接;
- `baseDn` LDAP 服务器的登录用户名，必须是从根结点到用户节点的全路径(非必须);
- `bindPassword` 登录该 LDAP 服务器的密码(非必须);
- `searchDn` 查询用户数据的路径，类似数据库中的一张表的地址，注意这里也必须是全路径;
- `searchStandard` 查询条件，这里是 mail 表示查询用户信息是通过邮箱信息来查询的。注意，该字段信息与LDAP数据库存储数据的字段相对应，如果如果存储用户邮箱信息的字段是 email,  这里就需要修改成 email.（1.3.18+支持）自定义filter表达式，基本形式为：&(objectClass=user)(cn=%s), 其中%s会被username替换
- `emailPostfix` 登陆邮箱后缀（非必须）
- `emailKey`: ldap数据库存放邮箱信息的字段（v1.3.21 新增 非必须）
- `usernameKey`: ldap数据库存放用户名信息的字段（v1.3.21 新增 非必须）


重启服务器后，可以在登录页看到如下画面，说明 ldap 配置成功

<img src="./ldap.png" />


## 禁止注册
在 config.json 添加 `closeRegister:true` 配置项,就可以禁止用户注册 yapi 平台，修改完成后，请重启 yapi 服务器。

```json
{
  "port": "*****",
  "closeRegister":true
}

```


### 如何配置mongodb集群

请升级到 yapi >= **1.4.0**以上版本，然后在 config.json db项，配置 connectString:

```json

{
  "port": "***",
  "db": {
    "connectString": "mongodb://127.0.0.100:8418,127.0.0.101:8418,127.0.0.102:8418/yapidb?slaveOk=true",
    "user": "******",
    "pass": "******"
  },
}

```

详细配置参考： [wiki](https://mongoosejs.com/docs/connections.html#multiple_connections)

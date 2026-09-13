# 用户管理能力（管理员全量套件）

> 2026 年 9 月 14 日，分支 `codex/refactor-foundation`。新增管理员用户管理后端 API、
> 登录/会话两级禁用拦截与管理页操作界面。测试基线：Node 24.21.0（`.nvmrc`），全量 281 passed。

## 一、能力与 API 契约

| API（均 POST，除 list） | 参数 | 权限 | 关键行为 |
|---|---|---|---|
| `/api/user/add` | username/email/password 必填；role 可选 | admin，否则 401 | role 仅 `admin\|member`，缺省回落 member，非法值 400；email 查重 401；密码 `randStr` 盐 + `generatePassword` 加密；不发登录 cookie；返回脱敏记录（无 password/passsalt）；自动建私有分组 |
| `/api/user/reset_password` | uid/password 必填 | admin | 重生成 passsalt + password（旧会话随盐失效，有意行为） |
| `/api/user/change_status` | uid 必填；disabled 必须布尔 | admin | 禁止禁用自己（403）；更新 `{disabled, up_time}` |
| `/api/user/change_role` | uid 必填；role 仅 `admin\|member` | admin | 禁止修改自己角色（403，防最后一名管理员自降锁死）；更新 `{role, up_time}` |
| `/api/user/list?keyword=` | page/limit/keyword 可选 | 登录 | keyword 按 email/username 不区分大小写 `$or` 过滤；非法 keyword 400 'Bad query.'；无 keyword 行为不变 |

三个按 uid 操作的方法均有存在性校验（uid 不存在 400 'uid不存在'），写法与既有 `update()` 一致。

## 二、禁用拦截链路（两级）

1. **登录链路**：`login()` 在密码校验前 403 '账号已被禁用，请联系管理员'；`handleThirdLogin()`
   漏斗在发 cookie 前拦截，覆盖 `loginByToken` 与 `getLdapAuth` 两条第三方路径。
2. **会话链路**：`base.checkLogin()` 复用本次 `findById` 结果判断（零新增每请求查询），
   命中则 `$auth=false` 并写入 401 响应；`commons.createAction` 增加 `!ctx.body` 守卫，
   auth 层已写入的响应体（禁用 401、token 无效 42014）透传，未登录场景仍为 40011 '请登录...'。

`ignoreRouter`（login/logout/status/avatar 等）不经过 checkLogin，禁用用户仍可登出——有意设计。

## 三、数据兼容

- `user.disabled`：`{ type: Boolean, default: false }`，新字段可选，**无迁移脚本**；
- 所有判断均为 `disabled === true` 严格比较，旧数据无字段（undefined）视为启用；
- 读取端兼容：列表 select 已追加 `disabled` 供前端展示。

## 四、前端（client/containers/User/List.js）

- 操作列（仅 admin 可见，本人行隐藏禁用/角色入口）：编辑资料、重置密码、禁用/启用、修改角色、删除；
- 添加用户弹窗（username/email/password/角色 Select）；服务端 keyword 搜索（onSearch 重置页码）；
- 统一响应处理：`errcode===0` 成功提示并刷新列表，否则 `message.error(errmsg)`；
- 删除后重新拉取列表（修正旧实现本地 filter 导致的分页漂移）。

## 五、已知边界与备忘（评审 P2，均接受）

1. `/api/user/status` 对禁用用户返回 40011 '请登录...'（`getLoginStatus` 自建 body 覆盖了 401 文案），
   语义仍为"未登录态"，受保护路由可看到正确的 401 文案。
2. openApi 项目 token 路径不受会话禁用影响：项目 token 属项目凭据而非用户会话，如需吊销另行立项。
3. ws 路由在 auth 层已写 body 时 '请登录...' 发送被守卫跳过（当前插件 ws 路由不触发）。
4. keyword 正则构造与基线 `search()` 一致，`validateSearchKeyword` 未拦截中间位置元字符（存量面，未扩大）。
5. `add` 的 catch 将 `e.message` 以 401 返回（仅 admin 可见，与 `reg` 既有风格一致）。
6. `commons.js` 第 11 行 `followModel` 未使用的 lint 报错为基线既有问题，本次未顺手修复。

## 六、测试

- `test/server/userManage.test.js`（35 用例）：4 个新 API 的成功/缺参/非法值/非 admin/uid 不存在/
  自保护全分支，list keyword，login 与 handleThirdLogin 禁用拦截；
- `test/server/base.test.js`（10 用例）：checkLogin 禁用拦截（真实 jwt 签发）、createAction 守卫
  四分支（真实 createAction + 桩控制器）、真实 `app.js` HTTP 冒烟确认 4 条新路由注册；
- 全量 `npm test`：281 passed / 0 failed（基线 236 + 新增 45）；`tsc --noEmit` 0 错误；
  `build-client` 退出码 0。

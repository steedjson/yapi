// @ts-check
/**
 * 用户认证与会话方法组：登录（login）、登出（logout）、第三方登录跳转（loginByToken）、
 * LDAP 登录（getLdapAuth）、第三方登录落地（handleThirdLogin）、私有分组初始化（handlePrivateGroup）、
 * 登录态 Cookie（setLoginCookie）、注册（reg）。
 * 由 user.js 通过 Object.assign 合并到 userController.prototype（P9c God file 拆分，
 * 沿用 P9b interface.js 试点已验收的原型合并模式）。
 * 约束：this 由控制器实例调用时注入（原型合并模式）；各函数体自原文件原样搬移、逐字节不变，
 *       仅在 JSDoc 补充 this 标注、require 路径随目录深度调整（纯注释/导入调整，不影响运行时逻辑）。
 */
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const yapi = requireAny('../../yapi.js');
const userModel = requireAny('../../models/user.js');
const groupModel = requireAny('../../models/group.js');
const ldap = requireAny('../../utils/ldap.js');
const jwt = require('jsonwebtoken');

  /**
   * 用户登录接口
   * @interface /user/login
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {String} email email名称，不能为空
   * @param  {String} password 密码，不能为空
   * @returns {Object}
   * @example ./api/user/login.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function login(ctx) {
    //登录
    let userInst = yapi.getInst(userModel); //创建user实体
    let email = ctx.request.body.email;
    email = (email || '').trim();
    let password = ctx.request.body.password;

    if (!email) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'email不能为空'));
    }
    if (!password) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '密码不能为空'));
    }

    let result = await userInst.findByEmail(email);

    if (!result) {
      return (ctx.body = yapi.commons.resReturn(null, 404, '该用户不存在'));
    } else if (result.disabled === true) {
      //被禁用的账号不允许登录
      return (ctx.body = yapi.commons.resReturn(null, 403, '账号已被禁用，请联系管理员'));
    }

    const check = yapi.commons.verifyPassword(password, result.passsalt, result.password);
    if (!check.valid) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '密码错误'));
    }

    // 旧 sha1 格式口令在首次登录成功后自动升级为 scrypt 格式(passsalt 保持不变, setLoginCookie 依赖它)
    if (check.legacy) {
      try {
        await userInst.update(result._id, { password: yapi.commons.hashPassword(password) });
      } catch (/** @type {any} */ e) {
        // 升级失败不影响本次登录
        yapi.commons.log('password auto upgrade failed: ' + e.message, 'error');
      }
    }

    this.setLoginCookie(result._id, result.passsalt);

    return (ctx.body = yapi.commons.resReturn(
      {
        username: result.username,
        role: result.role,
        uid: result._id,
        email: result.email,
        add_time: result.add_time,
        up_time: result.up_time,
        type: 'site',
        study: result.study
      },
      0,
      'logout success...'
    ));
  }

  /**
   * 退出登录接口
   * @interface /user/logout
   * @method GET
   * @category user
   * @foldnumber 10
   * @returns {Object}
   * @example ./api/user/logout.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function logout(ctx) {
    ctx.cookies.set('_yapi_token', null);
    ctx.cookies.set('_yapi_uid', null);
    ctx.body = yapi.commons.resReturn('ok');
  }

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function loginByToken(ctx) {
    try {
      let ret = await yapi.emitHook('third_login', ctx);
      let login = await this.handleThirdLogin(ret.email, ret.username);
      if (login === true) {
        yapi.commons.log('login success');
        ctx.redirect('/group');
      }
    } catch (/** @type {any} */ e) {
      yapi.commons.log(e.message, 'error');
      ctx.redirect('/');
    }
  }

  /**
   * ldap登录
   * @interface /user/login_by_ldap
   * @method
   * @category user
   * @foldnumber 10
   * @param {String} email email名称，不能为空
   * @param  {String} password 密码，不能为空
   * @returns {Object}
   *
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getLdapAuth(ctx) {
    try {
      const { email, password } = ctx.request.body;
      // const username = email.split(/\@/g)[0];
      const { info: ldapInfo } = await ldap.ldapQuery(email, password);
      const emailPrefix = email.split(/@/g)[0];
      const emailPostfix = yapi.WEBCONFIG.ldapLogin.emailPostfix;

      const emailParams =
        ldapInfo[yapi.WEBCONFIG.ldapLogin.emailKey || 'mail'] ||
        (emailPostfix ? emailPrefix + emailPostfix : email);
      const username = ldapInfo[yapi.WEBCONFIG.ldapLogin.usernameKey] || emailPrefix;

      let login = await this.handleThirdLogin(emailParams, username);

      if (login === true) {
        let userInst = yapi.getInst(userModel); //创建user实体
        let result = await userInst.findByEmail(emailParams);
        return (ctx.body = yapi.commons.resReturn(
          {
            username: result.username,
            role: result.role,
            uid: result._id,
            email: result.email,
            add_time: result.add_time,
            up_time: result.up_time,
            type: result.type || 'third',
            study: result.study
          },
          0,
          'logout success...'
        ));
      }
    } catch (/** @type {any} */ e) {
      yapi.commons.log(e.message, 'error');
      return (ctx.body = yapi.commons.resReturn(null, 401, e.message));
    }
  }

  // 处理第三方登录
  /**
   * @this {any}
   * @param {any} email 用户邮箱
   * @param {any} username 用户名
   * @returns {Promise<any>}
   */
  async function handleThirdLogin(email, username) {
    let user, data, passsalt;
    let userInst = yapi.getInst(userModel);

    try {
      user = await userInst.findByEmail(email);

      // 新建用户信息
      if (!user || !user._id) {
        passsalt = yapi.commons.randStr();
        data = {
          username: username,
          // 第三方登录无口令, 占位密码使用 scrypt 随机串, 不可被反推或登录
          password: yapi.commons.hashPassword(yapi.commons.randStr()),
          email: email,
          passsalt: passsalt,
          role: 'member',
          add_time: yapi.commons.time(),
          up_time: yapi.commons.time(),
          type: 'third'
        };
        user = await userInst.save(data);
        await this.handlePrivateGroup(user._id);
        yapi.commons.sendMail({
          to: email,
          contents: `<h3>亲爱的用户：</h3><p>您好，感谢使用YApi平台，你的邮箱账号是：${email}</p>`
        });
      }

      //已存在的用户需校验禁用状态, 新注册用户不受影响
      if (user.disabled === true) {
        throw new Error('账号已被禁用，请联系管理员');
      }

      this.setLoginCookie(user._id, user.passsalt);
      return true;
    } catch (/** @type {any} */ e) {
      console.error('third_login:', e.message);
      throw new Error(`third_login: ${e.message}`);
    }
  }

  /**
   * @this {any}
   * @param {any} uid 用户uid
   * @returns {Promise<any>}
   */
  async function handlePrivateGroup(uid) {
    var groupInst = yapi.getInst(groupModel);
    await groupInst.save({
      uid: uid,
      group_name: 'User-' + uid,
      add_time: yapi.commons.time(),
      up_time: yapi.commons.time(),
      type: 'private'
    });
  }

  /**
   * @this {any}
   * @param {any} uid 用户uid
   * @param {any} passsalt 密码盐
   * @returns {void}
   */
  function setLoginCookie(uid, passsalt) {
    let token = jwt.sign({ uid: uid }, passsalt, { expiresIn: '7 days' });

    this.ctx.cookies.set('_yapi_token', token, {
      expires: yapi.commons.expireDate(7),
      httpOnly: true
    });
    this.ctx.cookies.set('_yapi_uid', uid, {
      expires: yapi.commons.expireDate(7),
      httpOnly: true
    });
  }

  /**
   * 用户注册接口
   * @interface /user/reg
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {String} email email名称，不能为空
   * @param  {String} password 密码，不能为空
   * @param {String} [username] 用户名
   * @returns {Object}
   * @example ./api/user/login.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function reg(ctx) {
    //注册
    if (yapi.WEBCONFIG.closeRegister) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '禁止注册，请联系管理员'));
    }
    let userInst = yapi.getInst(userModel);
    let params = ctx.request.body; //获取请求的参数,检查是否存在用户名和密码

    params = yapi.commons.handleParams(params, {
      username: 'string',
      password: 'string',
      email: 'string'
    });

    if (!params.email) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '邮箱不能为空'));
    }

    if (!params.password) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '密码不能为空'));
    }

    let checkRepeat = await userInst.checkRepeat(params.email); //然后检查是否已经存在该用户

    if (checkRepeat > 0) {
      return (ctx.body = yapi.commons.resReturn(null, 401, '该email已经注册'));
    }

    let passsalt = yapi.commons.randStr();
    let data = {
      username: params.username,
      password: yapi.commons.hashPassword(params.password), //加密
      email: params.email,
      passsalt: passsalt,
      role: 'member',
      add_time: yapi.commons.time(),
      up_time: yapi.commons.time(),
      type: 'site'
    };

    if (!data.username) {
      data.username = data.email.substr(0, data.email.indexOf('@'));
    }

    try {
      let user = await userInst.save(data);

      this.setLoginCookie(user._id, user.passsalt);
      await this.handlePrivateGroup(user._id);
      ctx.body = yapi.commons.resReturn({
        uid: user._id,
        email: user.email,
        username: user.username,
        add_time: user.add_time,
        up_time: user.up_time,
        role: 'member',
        type: user.type,
        study: false
      });
      yapi.commons.sendMail({
        to: user.email,
        contents: `<h3>亲爱的用户：</h3><p>您好，感谢使用YApi可视化接口平台,您的账号 ${
          params.email
        } 已经注册成功</p>`
      });
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 401, e.message);
    }
  }

module.exports = {
  login,
  logout,
  loginByToken,
  getLdapAuth,
  handleThirdLogin,
  handlePrivateGroup,
  setLoginCookie,
  reg
};

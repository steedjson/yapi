// @ts-check
/**
 * 管理员用户管理方法组（均要求 admin 角色）：删除用户（del）、添加用户（add）、重置密码（resetPassword）、
 * 禁用/启用（changeStatus）、修改角色（changeRole）。
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

  /**
   * 删除用户,只有admin用户才有此权限
   * @interface /user/del
   * @method POST
   * @param id 用户uid
   * @category user
   * @foldnumber 10
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function del(ctx) {
    //根据id删除一个用户
    try {
      if (this.getRole() !== 'admin') {
        return (ctx.body = yapi.commons.resReturn(null, 402, 'Without permission.'));
      }

      let userInst = yapi.getInst(userModel);
      let id = ctx.request.body.id;
      if (id == this.getUid()) {
        return (ctx.body = yapi.commons.resReturn(null, 403, '禁止删除管理员'));
      }
      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }

      let result = await userInst.del(id);

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 管理员添加用户,只有admin用户才有此权限
   * @interface /user/add
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {String} username 用户名，不能为空
   * @param {String} email email名称，不能为空
   * @param  {String} password 密码，不能为空
   * @param {String} [role] 用户角色,仅允许admin|member,默认member
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function add(ctx) {
    //管理员创建用户
    try {
      if (this.getRole() !== 'admin') {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      let userInst = yapi.getInst(userModel);
      let params = ctx.request.body;

      params = yapi.commons.handleParams(params, {
        username: 'string',
        password: 'string',
        email: 'string'
      });

      if (!params.username) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '用户名不能为空'));
      }

      if (!params.email) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '邮箱不能为空'));
      }

      if (!params.password) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '密码不能为空'));
      }

      if (params.role && params.role !== 'admin' && params.role !== 'member') {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'role仅允许admin或member'));
      }

      let checkRepeat = await userInst.checkRepeat(params.email); //然后检查是否已经存在该用户

      if (checkRepeat > 0) {
        return (ctx.body = yapi.commons.resReturn(null, 401, '该email已经注册'));
      }

      let passsalt = yapi.commons.randStr();
      let data = {
        username: params.username,
        password: yapi.commons.generatePassword(params.password, passsalt), //加密
        email: params.email,
        passsalt: passsalt,
        role: params.role || 'member',
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time(),
        type: 'site'
      };

      let user = await userInst.save(data);
      // handlePrivateGroup 定义于 authMethods 方法组（原型合并后仍在本原型上，this 调用不受拆分影响）
      await this.handlePrivateGroup(user._id);
      //与reg不同, 这里不调用setLoginCookie: 管理员创建的是其他用户, 不应替其建立登录态
      return (ctx.body = yapi.commons.resReturn({
        uid: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        type: user.type,
        add_time: user.add_time,
        up_time: user.up_time,
        study: user.study,
        disabled: user.disabled
      }));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 401, e.message);
    }
  }

  /**
   * 管理员重置指定用户密码,只有admin用户才有此权限,重置后原密码与旧登录态失效
   * @interface /user/reset_password
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {Number} uid 用户uid
   * @param  {String} password 新密码，不能为空
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function resetPassword(ctx) {
    try {
      if (this.getRole() !== 'admin') {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      let params = ctx.request.body;
      if (!params.uid) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }
      if (!params.password) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '密码不能为空'));
      }

      let userInst = yapi.getInst(userModel);
      let userData = await userInst.findById(params.uid);
      if (!userData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不存在'));
      }

      let passsalt = yapi.commons.randStr();
      let data = {
        up_time: yapi.commons.time(),
        password: yapi.commons.generatePassword(params.password, passsalt),
        passsalt: passsalt
      };

      let result = await userInst.update(params.uid, data);
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 管理员禁用/启用用户,只有admin用户才有此权限,不能禁用自己
   * @interface /user/change_status
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {Number} uid 用户uid
   * @param {Boolean} disabled true为禁用,false为启用
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function changeStatus(ctx) {
    try {
      if (this.getRole() !== 'admin') {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      let params = ctx.request.body;
      if (!params.uid) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }
      if (typeof params.disabled !== 'boolean') {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'disabled参数需要为布尔值'));
      }
      if (params.uid == this.getUid()) {
        return (ctx.body = yapi.commons.resReturn(null, 403, '不能禁用自己'));
      }

      let userInst = yapi.getInst(userModel);
      let userData = await userInst.findById(params.uid);
      if (!userData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不存在'));
      }

      let data = {
        up_time: yapi.commons.time(),
        disabled: params.disabled
      };
      let result = await userInst.update(params.uid, data);
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 管理员修改用户角色,只有admin用户才有此权限,不能修改自己的角色
   * @interface /user/change_role
   * @method POST
   * @category user
   * @foldnumber 10
   * @param {Number} uid 用户uid
   * @param {String} role 用户角色,仅允许admin|member
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function changeRole(ctx) {
    try {
      if (this.getRole() !== 'admin') {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      let params = ctx.request.body;
      if (!params.uid) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }
      if (params.role !== 'admin' && params.role !== 'member') {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'role仅允许admin或member'));
      }
      if (params.uid == this.getUid()) {
        return (ctx.body = yapi.commons.resReturn(null, 403, '不能修改自己的角色'));
      }

      let userInst = yapi.getInst(userModel);
      let userData = await userInst.findById(params.uid);
      if (!userData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不存在'));
      }

      let data = {
        up_time: yapi.commons.time(),
        role: params.role
      };
      let result = await userInst.update(params.uid, data);
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

module.exports = {
  del,
  add,
  resetPassword,
  changeStatus,
  changeRole
};

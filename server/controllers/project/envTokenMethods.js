// @ts-check
/**
 * 项目环境与 Token 方法组：更新环境（upEnv）、更新 tag（upTag）、读取环境（getEnv）、
 * 获取 token（token）、重置 token（updateToken）；arrRepeat 为 upEnv 的环境名去重辅助方法（唯一消费方同迁）。
 * 由 project.js 通过 Object.assign 合并到 projectController.prototype（P9c God file 拆分，
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
const sha = requireAny('sha.js');
const {getToken} = require('../../utils/token');

  /**
   * 编辑项目
   * @interface /project/up_env
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {Array} [env] 项目环境配置
   * @param {String} [env[].name] 环境名称
   * @param {String} [env[].domain] 环境域名
   * @param {Array}  [env[].header] header
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function upEnv(ctx) {
    try {
      let id = ctx.request.body.id;
      let params = ctx.request.body;
      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '项目id不能为空'));
      }

      if ((await this.checkAuth(id, 'project', 'edit')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }

      if (!params.env || !Array.isArray(params.env)) {
        return (ctx.body = yapi.commons.resReturn(null, 405, 'env参数格式有误'));
      }

      let projectData = await this.Model.get(id);
      /** @type {any} */
      let data = {
        up_time: yapi.commons.time()
      };

      data.env = params.env;
      let isRepeat = this.arrRepeat(data.env, 'name');
      if (isRepeat) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '环境变量名重复'));
      }
      let result = await this.Model.up(id, data);
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了项目 <a href="/project/${id}/interface/api">${
          projectData.name
        }</a> 的环境`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: id
      });
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 编辑项目
   * @interface /project/up_tag
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {Array} [tag] 项目tag配置
   * @param {String} [tag[].name] tag名称
   * @param {String} [tag[].desc] tag描述
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function upTag(ctx) {
    try {
      let id = ctx.request.body.id;
      let params = ctx.request.body;
      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '项目id不能为空'));
      }

      if ((await this.checkAuth(id, 'project', 'edit')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }

      if (!params.tag || !Array.isArray(params.tag)) {
        return (ctx.body = yapi.commons.resReturn(null, 405, 'tag参数格式有误'));
      }

      let projectData = await this.Model.get(id);
      /** @type {any} */
      let data = {
        up_time: yapi.commons.time()
      };
      data.tag = params.tag;

      let result = await this.Model.up(id, data);
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了项目 <a href="/project/${id}/interface/api">${
          projectData.name
        }</a> 的tag`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: id
      });
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 获取项目的环境变量值
   * @interface /project/get_env
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空

   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getEnv(ctx) {
    try {
      // console.log(ctx.request.query.project_id)
      let project_id = ctx.request.query.project_id;
      // let params = ctx.request.body;
      if (!project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '项目id不能为空'));
      }

      // 去掉权限判断
      // if ((await this.checkAuth(project_id, 'project', 'edit')) !== true) {
      //   return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      // }

      let env = await this.Model.getByEnv(project_id);

      ctx.body = yapi.commons.resReturn(env);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * @this {any}
   * @param {any[]} arr
   * @param {string} key
   * @returns {boolean}
   */
  function arrRepeat(arr, key) {
    const s = new Set();
    arr.forEach(item => s.add(item[key]));
    return s.size !== arr.length;
  }

  /**
   * 获取token数据
   * @interface /project/token
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {String} q
   * @return {Object}
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function token(ctx) {
    try {
      let project_id = ctx.params.project_id;
      let data = await this.tokenModel.get(project_id);
      let token;
      if (!data) {
        let passsalt = yapi.commons.randStr();
        token = sha('sha1')
          .update(passsalt)
          .digest('hex')
          .substr(0, 20);

        await this.tokenModel.save({ project_id, token });
      } else {
        token = data.token;
      }

      token = getToken(token, this.getUid())

      ctx.body = yapi.commons.resReturn(token);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  /**
   * 更新token数据
   * @interface /project/update_token
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {String} q
   * @return {Object}
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function updateToken(ctx) {
    try {
      let project_id = ctx.params.project_id;
      let data = await this.tokenModel.get(project_id);
      let token, result;
      if (data && data.token) {
        let passsalt = yapi.commons.randStr();
        token = sha('sha1')
          .update(passsalt)
          .digest('hex')
          .substr(0, 20);
        result = await this.tokenModel.up(project_id, token);
        // 存量调用缺第二个参数 uid，运行时行为保持不变
        token = /** @type {any} */ (getToken)(token);
        result.token = token;
      } else {
        return (ctx.body = yapi.commons.resReturn(null, 402, '没有查到token信息'));
      }

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

module.exports = {
  upEnv,
  upTag,
  getEnv,
  arrRepeat,
  token,
  updateToken
};

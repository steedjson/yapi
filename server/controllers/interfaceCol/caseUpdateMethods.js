// @ts-check
/**
 * 用例更新方法组：更新用例（upCase）、删除用例（delCase）、用例排序（upCaseIndex）。
 * 由 interfaceCol.js 通过 Object.assign 合并到 interfaceColController.prototype（P9c God file 拆分，
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

  /**
   * 更新一个测试用例
   * @interface /col/up_case
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {number} id
   * @param {String} casename
   * @param {String} domain
   * @param {String} path
   * @param {String} method
   * @param {Object} req_query
   * @param {Object} req_headers
   * @param {String} req_body_type
   * @param {Array} req_body_form
   * @param {String} req_body_other
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function upCase(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        id: 'number',
        casename: 'string'
      });

      if (!params.id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '用例id不能为空'));
      }

      // if (!params.casename) {
      //   return (ctx.body = yapi.commons.resReturn(null, 400, '用例名称不能为空'));
      // }

      let caseData = await this.caseModel.get(params.id);
      let auth = await this.checkAuth(caseData.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      params.uid = this.getUid();

      //不允许修改接口id和项目id
      delete params.interface_id;
      delete params.project_id;
      let result = await this.caseModel.up(params.id, params);
      let username = this.getUsername();
      this.colModel.get(caseData.col_id).then((/** @type {any} */ col) => {
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${
            caseData.project_id
          }/interface/col/${caseData.col_id}">${col.name}</a> 更新了测试用例 <a href="/project/${
            caseData.project_id
          }/interface/case/${params.id}">${params.casename || caseData.casename}</a>`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: caseData.project_id
        });
      });

      this.projectModel.up(caseData.project_id, { up_time: new Date().getTime() }).then();

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 更新多个接口case index
   * @interface /col/up_case_index
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Array}  \[id, index\]
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function upCaseIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组'));
      }
      const cases = await Promise.all(params.filter(item => item && item.id).map(item => this.caseModel.get(item.id)));
      for (const caseData of cases) {
        if (!caseData || (await this.checkAuth(caseData.project_id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }
      params.forEach((/** @type {any} */ item) => {
        if (item.id) {
          this.caseModel.upCaseIndex(item.id, item.index).then(
            () => {},
            (/** @type {any} */ err) => {
              yapi.commons.log(err.message, 'error');
            }
          );
        }
      });

      return (ctx.body = yapi.commons.resReturn('成功！'));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   *
   * @param {*} ctx
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function delCase(ctx) {
    try {
      let caseid = ctx.query.caseid;
      let caseData = await this.caseModel.get(caseid);
      if (!caseData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的caseid'));
      }

      if (caseData.uid !== this.getUid()) {
        let auth = await this.checkAuth(caseData.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      let result = await this.caseModel.del(caseid);

      let username = this.getUsername();
      this.colModel.get(caseData.col_id).then((/** @type {any} */ col) => {
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了接口集 <a href="/project/${
            caseData.project_id
          }/interface/col/${caseData.col_id}">${col.name}</a> 下的接口 ${caseData.casename}`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: caseData.project_id
        });
      });

      this.projectModel.up(caseData.project_id, { up_time: new Date().getTime() }).then();
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

module.exports = {
  upCase,
  upCaseIndex,
  delCase
};

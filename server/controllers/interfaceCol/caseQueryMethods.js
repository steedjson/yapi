// @ts-check
/**
 * 用例查询方法组：集合下用例列表（getCaseList）、用例环境变量列表（getCaseEnvList）、
 * 变量参数用例列表（getCaseListByVariableParams）、用例详情（getCase）、运行用例脚本（runCaseScript）；
 * requestParamsToObj / unique 为本组辅助方法（唯一消费方同迁）。
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
   * 获取一个接口集下的所有的测试用例
   * @interface /col/case_list
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String} col_id 接口集id
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getCaseList(ctx) {
    try {
      let id = ctx.query.col_id;
      if (!id || id == 0) {
        return (ctx.body = yapi.commons.resReturn(null, 407, 'col_id不能为空'));
      }

      let colData = await this.colModel.get(id);
      let project = await this.projectModel.getBaseInfo(colData.project_id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }

      ctx.body = await yapi.commons.getCaseList(id);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 获取一个接口集下的所有的测试用例的环境变量
   * @interface /col/case_env_list
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String} col_id 接口集id
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getCaseEnvList(ctx) {
    try {
      let id = ctx.query.col_id;
      if (!id || id == 0) {
        return (ctx.body = yapi.commons.resReturn(null, 407, 'col_id不能为空'));
      }

      let colData = await this.colModel.get(id);
      let project = await this.projectModel.getBaseInfo(colData.project_id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }

      // 通过col_id 找到 caseList，并批量读取关联项目的环境信息。
      const projectList = await this.caseModel.list(id, 'project_id');
      const projectIds = this.unique(projectList, 'project_id');
      const projectEnvList = await this.projectModel.listBaseInfoByIds(projectIds, 'name env');
      ctx.body = yapi.commons.resReturn(projectEnvList);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * @this {any}
   * @param {any} arr 请求参数数组
   * @returns {any}
   */
  function requestParamsToObj(arr) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      return {};
    }
    /** @type {Record<string, any>} */
    let obj = {};
    arr.forEach(item => {
      obj[item.name] = '';
    });
    return obj;
  }

  /**
   * 获取一个接口集下的所有的测试用例
   * @interface /col/case_list_by_var_params
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String} col_id 接口集id
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getCaseListByVariableParams(ctx) {
    try {
      let id = ctx.query.col_id;
      if (!id || id == 0) {
        return (ctx.body = yapi.commons.resReturn(null, 407, 'col_id不能为空'));
      }
      let resultList = await this.caseModel.list(id, 'all');
      if (resultList.length === 0) {
        return (ctx.body = yapi.commons.resReturn([]));
      }
      let project = await this.projectModel.getBaseInfo(resultList[0].project_id);

      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }

      // 一次读取全部关联接口，避免每条用例单独查询接口详情。
      const interfaceIds = resultList.map((/** @type {any} */ result) => result.interface_id);
      const interfaceList = await this.interfaceModel.getByIds(interfaceIds);
      /** @type {Record<string, any>} */
      const interfaceById = {};
      interfaceList.forEach((/** @type {any} */ data) => {
        interfaceById[data._id] = data;
      });

      for (let index = 0; index < resultList.length; index++) {
        let result = resultList[index].toObject();
        /** @type {any} */
        let item = {},
          body,
          query,
          bodyParams,
          pathParams;
        let data = interfaceById[result.interface_id];
        if (!data) {
          await this.caseModel.del(result._id);
          continue;
        }
        item._id = result._id;
        item.casename = result.casename;
        body = yapi.commons.json_parse(data.res_body);
        body = typeof body === 'object' ? body : {};
        if (data.res_body_is_json_schema) {
          body = yapi.commons.schemaToJson(body, {
            alwaysFakeOptionals: true
          });
        }
        item.body = Object.assign({}, body);
        query = this.requestParamsToObj(data.req_query);
        pathParams = this.requestParamsToObj(data.req_params);
        if (data.req_body_type === 'form') {
          bodyParams = this.requestParamsToObj(data.req_body_form);
        } else {
          bodyParams = yapi.commons.json_parse(data.req_body_other);
          if (data.req_body_is_json_schema) {
            bodyParams = yapi.commons.schemaToJson(bodyParams, {
              alwaysFakeOptionals: true
            });
          }
          bodyParams = typeof bodyParams === 'object' ? bodyParams : {};
        }
        item.params = Object.assign(pathParams, query, bodyParams);
        item.index = result.index;
        resultList[index] = item;
      }

      ctx.body = yapi.commons.resReturn(resultList);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 获取一个测试用例详情
   * @interface /col/case
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String} caseid
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getCase(ctx) {
    try {
      let id = ctx.query.caseid;
      let result = await this.caseModel.get(id);
      if (!result) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的case'));
      }
      result = result.toObject();
      let data = await this.interfaceModel.get(result.interface_id);
      if (!data) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '找不到对应的接口，请联系管理员'));
      }
      data = data.toObject();

      let projectData = await this.projectModel.getBaseInfo(data.project_id);
      result.path = projectData.basepath + data.path;
      result.method = data.method;
      result.req_body_type = data.req_body_type;
      result.req_headers = yapi.commons.handleParamsValue(data.req_headers, result.req_headers);
      result.res_body = data.res_body;
      result.res_body_type = data.res_body_type;
      result.req_body_form = yapi.commons.handleParamsValue(
        data.req_body_form,
        result.req_body_form
      );
      result.req_query = yapi.commons.handleParamsValue(data.req_query, result.req_query);
      result.req_params = yapi.commons.handleParamsValue(data.req_params, result.req_params);
      result.interface_up_time = data.up_time;
      result.req_body_is_json_schema = data.req_body_is_json_schema;
      result.res_body_is_json_schema = data.res_body_is_json_schema;
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function runCaseScript(ctx) {
    let params = ctx.request.body;
    ctx.body = await yapi.commons.runCaseScript(params, params.col_id, params.interface_id, this.getUid());
  }

  // 数组去重
  /**
   * @this {any}
   * @param {any} array 待去重数组
   * @param {any} compare 去重字段名
   * @returns {any}
   */
  function unique(array, compare) {
    /** @type {Record<string, any>} */
    let hash = {};
    let arr = array.reduce(function(/** @type {any} */ item, /** @type {any} */ next) {
      hash[next[compare]] ? '' : (hash[next[compare]] = item.push(next));
      // console.log('item',item.project_id)
      return item;
    }, []);
    // 输出去重以后的project_id
    return arr.map((/** @type {any} */ item) => {
      return item[compare];
    });
  }

module.exports = {
  getCaseList,
  getCaseEnvList,
  requestParamsToObj,
  getCaseListByVariableParams,
  getCase,
  runCaseScript,
  unique
};

// @ts-check
/**
 * 用例新增方法组：新增用例（addCase）、批量导入用例（addCaseList）、克隆用例集（cloneCaseList）。
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
   * 增加一个测试用例
   * @interface /col/add_case
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {String} casename
   * @param {Number} col_id
   * @param {Number} project_id
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
  async function addCase(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        casename: 'string',
        project_id: 'number',
        col_id: 'number',
        interface_id: 'number',
        case_env: 'string'
      });

      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }

      if (!params.interface_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空'));
      }

      let auth = await this.checkAuth(params.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      if (!params.col_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '接口集id不能为空'));
      }

      if (!params.casename) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '用例名称不能为空'));
      }

      const [col, interfaceData] = await Promise.all([
        this.colModel.get(params.col_id),
        this.interfaceModel.get(params.interface_id)
      ]);
      if (!col || col.project_id !== params.project_id || !interfaceData || interfaceData.project_id !== params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      params.uid = this.getUid();
      params.index = 0;
      params.add_time = yapi.commons.time();
      params.up_time = yapi.commons.time();
      let result = await this.caseModel.save(params);
      let username = this.getUsername();

      this.colModel.get(params.col_id).then((/** @type {any} */ col) => {
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${
            params.project_id
          }/interface/col/${params.col_id}">${col.name}</a> 下添加了测试用例 <a href="/project/${
            params.project_id
          }/interface/case/${result._id}">${params.casename}</a>`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: params.project_id
        });
      });
      this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function addCaseList(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        project_id: 'number',
        col_id: 'number'
      });
      if (!params.interface_list || !Array.isArray(params.interface_list)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'interface_list 参数有误'));
      }

      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }

      let auth = await this.checkAuth(params.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      if (!params.col_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '接口集id不能为空'));
      }

      /** @type {any} */
      let data = {
        uid: this.getUid(),
        index: 0,
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time(),
        project_id: params.project_id,
        col_id: params.col_id
      };

      // 先批量读取待导入接口和接口集，避免每个用例重复查询关联数据。
      const interfaceList = await this.interfaceModel.getByIds(params.interface_list);
      /** @type {Record<string, any>} */
      const interfaceById = {};
      interfaceList.forEach((/** @type {any} */ interfaceData) => {
        interfaceById[interfaceData._id] = interfaceData;
      });
      const col = await this.colModel.get(params.col_id);
      if (!col || col.project_id !== params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      for (let i = 0; i < params.interface_list.length; i++) {
        const interfaceId = params.interface_list[i];
        const interfaceData = interfaceById[interfaceId];
        if (!interfaceData) {
          throw new Error(`不存在的接口 ${interfaceId}`);
        }
        if (interfaceData.project_id !== params.project_id) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
        data.interface_id = interfaceId;
        data.casename = interfaceData.title;

        // 处理json schema 解析
        if (
          interfaceData.req_body_type === 'json' &&
          interfaceData.req_body_other &&
          interfaceData.req_body_is_json_schema
        ) {
          let req_body_other = yapi.commons.json_parse(interfaceData.req_body_other);
          req_body_other = yapi.commons.schemaToJson(req_body_other, {
            alwaysFakeOptionals: true
          });

          data.req_body_other = JSON.stringify(req_body_other);
        } else {
          data.req_body_other = interfaceData.req_body_other;
        }

        data.req_body_type = interfaceData.req_body_type;
        let caseResultData = await this.caseModel.save(data);
        let username = this.getUsername();
        Promise.resolve().then(() => {
          yapi.commons.saveLog({
            content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${
              params.project_id
            }/interface/col/${params.col_id}">${col.name}</a> 下导入了测试用例 <a href="/project/${
              params.project_id
            }/interface/case/${caseResultData._id}">${data.casename}</a>`,
            type: 'project',
            uid: this.getUid(),
            username: username,
            typeid: params.project_id
          });
        }).catch(err => {
          // 日志失败不能影响已经成功创建的测试用例。
          yapi.commons.log(err, 'error');
        });
      }

      this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();

      ctx.body = yapi.commons.resReturn('ok');
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function cloneCaseList(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        project_id: 'number',
        col_id: 'number',
        new_col_id: 'number'
      });

      const { project_id, col_id, new_col_id } = params;

      if (!project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }

      let auth = await this.checkAuth(params.project_id, 'project', 'edit');

      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      if (!col_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '被克隆的接口集id不能为空'));
      }

      if (!new_col_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '克隆的接口集id不能为空'));
      }

      let oldColCaselistData = await this.caseModel.list(col_id, 'all');

      oldColCaselistData = oldColCaselistData.sort(
        (/** @type {any} */ a, /** @type {any} */ b) => {
          return a.index - b.index;
        }
      );

      /** @type {any[]} */
      const newCaseList = [];
      /** @type {Record<string, any>} */
      const oldCaseObj = {};
      /** @type {any} */
      let obj = {};

      const handleTypeParams = (/** @type {any} */ data, /** @type {any} */ name) => {
        let res = data[name];
        const type = Object.prototype.toString.call(res);
        if (type === '[object Array]' && res.length) {
          res = JSON.stringify(res);
          try {
            res = JSON.parse(handleReplaceStr(res));
          } catch (/** @type {any} */ e) {
            console.log('e ->', e);
          }
        } else if (type === '[object String]' && data[name]) {
          res = handleReplaceStr(res);
        }
        return res;
      };

      const handleReplaceStr = (/** @type {any} */ str) => {
        if (str.indexOf('$') !== -1) {
          str = str.replace(/\$\.([0-9]+)\./g, function(/** @type {any} */ match, /** @type {any} */ p1) {
            p1 = p1.toString();
            return `$.${newCaseList[oldCaseObj[p1]]}.`;
          });
        }
        return str;
      };

      // 处理数据里面的$id;
      const handleParams = (/** @type {any} */ data) => {
        data.col_id = new_col_id;
        delete data._id;
        delete data.add_time;
        delete data.up_time;
        delete data.__v;
        data.req_body_other = handleTypeParams(data, 'req_body_other');
        data.req_query = handleTypeParams(data, 'req_query');
        data.req_params = handleTypeParams(data, 'req_params');
        data.req_body_form = handleTypeParams(data, 'req_body_form');
        return data;
      };

      for (let i = 0; i < oldColCaselistData.length; i++) {
        obj = oldColCaselistData[i].toObject();
        // 将被克隆的id和位置绑定
        oldCaseObj[obj._id] = i;
        let caseData = handleParams(obj);
        let newCase = await this.caseModel.save(caseData);
        newCaseList.push(newCase._id);
      }

      this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();
      ctx.body = yapi.commons.resReturn('ok');
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

module.exports = {
  addCase,
  addCaseList,
  cloneCaseList
};

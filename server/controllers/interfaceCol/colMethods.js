// @ts-check
/**
 * 接口集管理方法组：集合列表（list）、新增集合（addCol）、更新集合（upCol）、删除集合（delCol）、
 * 集合排序（upColIndex）。
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
   * 获取所有接口集
   * @interface /col/list
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String} project_id email名称，不能为空
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function list(ctx) {
    try {
      let id = ctx.query.project_id;
      let project = await this.projectModel.getBaseInfo(id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      let result = await this.colModel.list(id);
      result = result.sort((/** @type {any} */ a, /** @type {any} */ b) => {
        return a.index - b.index;
      });

      // 接口集和用例统一批量读取，避免“接口集数量 + 用例数量”次数据库查询。
      const collectionIds = result.map((/** @type {any} */ item) => item._id);
      const allCases = await this.caseModel.listByColIds(collectionIds);
      const interfaceIds = allCases.map((/** @type {any} */ item) => item.interface_id);
      const interfaceList = await this.interfaceModel.getBaseinfoByIds(interfaceIds);
      /** @type {Record<string, any>} */
      const interfaceById = {};
      interfaceList.forEach((/** @type {any} */ item) => {
        interfaceById[item._id] = item;
      });
      /** @type {Record<string, any>} */
      const casesByCollection = {};
      allCases.forEach((/** @type {any} */ caseItem) => {
        const interfaceData = interfaceById[caseItem.interface_id];
        if (!interfaceData) {
          throw new Error(`用例 ${caseItem._id} 对应的接口不存在`);
        }
        const item = caseItem.toObject();
        item.path = interfaceData.path;
        if (!casesByCollection[item.col_id]) casesByCollection[item.col_id] = [];
        casesByCollection[item.col_id].push(item);
      });

      result = result.map((/** @type {any} */ collection) => {
        const item = collection.toObject();
        item.caseList = (casesByCollection[item._id] || []).sort(
          (/** @type {any} */ a, /** @type {any} */ b) => a.index - b.index
        );
        return item;
      });
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 增加接口集
   * @interface /col/add_col
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Number} project_id
   * @param {String} name
   * @param {String} desc
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function addCol(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        name: 'string',
        project_id: 'number',
        desc: 'string'
      });

      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }
      if (!params.name) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '名称不能为空'));
      }

      let auth = await this.checkAuth(params.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      let result = await this.colModel.save({
        name: params.name,
        project_id: params.project_id,
        desc: params.desc,
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了接口集 <a href="/project/${
          params.project_id
        }/interface/col/${result._id}">${params.name}</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.project_id
      });
      // this.projectModel.up(params.project_id,{up_time: new Date().getTime()}).then();
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 更新一个接口集name或描述
   * @interface /col/up_col
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {String} name
   * @param {String} desc
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function upCol(ctx) {
    try {
      let params = ctx.request.body;
      let id = params.col_id;
      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '缺少 col_id 参数'));
      }
      let colData = await this.colModel.get(id);
      if (!colData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在'));
      }
      let auth = await this.checkAuth(colData.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }
      delete params.col_id;
      let result = await this.colModel.up(id, params);
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了测试集合 <a href="/project/${
          colData.project_id
        }/interface/col/${id}">${colData.name}</a> 的信息`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: colData.project_id
      });

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 更新多个测试集合 index
   * @interface /col/up_col_index
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
  async function upColIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组'));
      }
      const cols = await Promise.all(params.filter(item => item && item.id).map(item => this.colModel.get(item.id)));
      for (const col of cols) {
        if (!col || (await this.checkAuth(col.project_id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }
      params.forEach((/** @type {any} */ item) => {
        if (item.id) {
          this.colModel.upColIndex(item.id, item.index).then(
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
   * 删除一个接口集
   * @interface /col/del_col
   * @method GET
   * @category col
   * @foldnumber 10
   * @param {String}
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function delCol(ctx) {
    try {
      let id = ctx.query.col_id;
      let colData = await this.colModel.get(id);
      if (!colData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的id'));
      }

      if (colData.uid !== this.getUid()) {
        let auth = await this.checkAuth(colData.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }
      let result = await this.colModel.del(id);
      await this.caseModel.delByCol(id);
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了接口集 ${
          colData.name
        } 及其下面的接口`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: colData.project_id
      });
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

module.exports = {
  list,
  addCol,
  upCol,
  upColIndex,
  delCol
};

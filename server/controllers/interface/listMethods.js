// @ts-check
/**
 * 接口列表查询方法组：项目接口分页列表（list）、分类下接口列表（listByCat）、开放接口列表（listByOpen）。
 * 由 interface.js 通过 Object.assign 合并到 interfaceController.prototype（P9b God file 拆分试点）。
 * 约束：this 由控制器实例调用时注入（原型合并模式）；各函数体自 interface.js 原样搬移、逐字节不变，
 *       仅在 JSDoc 补充 this 标注（纯注释，不影响运行时）。
 */
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const yapi = requireAny('../../yapi.js');

  /**
   * 接口列表
   * @interface /interface/list
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @param {Number}   page 当前页
   * @param {Number}   limit 每一页限制条数
   * @returns {Object}
   * @example ./api/interface/list.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function list(ctx) {
    let project_id = ctx.params.project_id;
    let page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10;
    let status = ctx.request.query.status,
      tag = ctx.request.query.tag;
    let project = await this.projectModel.getBaseInfo(project_id);
    if (!project) {
      return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
    }
    if (project.project_type === 'private') {
      if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }
    if (!project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    try {
      let result, count;
      if (limit === 'all') {
        // 列表和总数互不依赖，并行查询可减少接口列表等待时间。
        [result, count] = await Promise.all([
          this.Model.list(project_id),
          this.Model.listCount({project_id})
        ]);
      } else {
        /** @type {any} */
        let option = {project_id};
        if (status) {
          if (Array.isArray(status)) {
            option.status = {"$in": status};
          } else {
            option.status = status;
          }
        }
        if (tag) {
          if (Array.isArray(tag)) {
            option.tag = {"$in": tag};
          } else {
            option.tag = tag;
          }
        }

        // 列表和总数互不依赖，并行查询不改变原有返回结构。
        [result, count] = await Promise.all([
          this.Model.listByOptionWithPage(option, page, limit),
          this.Model.listCount(option)
        ]);
      }


      ctx.body = yapi.commons.resReturn({
        count: count,
        total: limit === 'all' ? 1 : Math.ceil(count / parseInt(limit, 10)),
        list: result
      });
      yapi.emitHook('interface_list', result).then();
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function listByCat(ctx) {
    let catid = ctx.request.query.catid;
    let page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10;
    let status = ctx.request.query.status,
      tag = ctx.request.query.tag;

    if (!catid) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'catid不能为空'));
    }
    try {
      let catdata = await this.catModel.get(catid);

      if (!catdata) {
        return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的接口集'));
      }

      let project = await this.projectModel.getBaseInfo(catdata.project_id);
      if (!project) {
        return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
      }
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }


      /** @type {any} */
      let option = {catid}
      if (status) {
        if (Array.isArray(status)) {
          option.status = {"$in": status};
        } else {
          option.status = status;
        }
      }
      if (tag) {
        if (Array.isArray(tag)) {
          option.tag = {"$in": tag};
        } else {
          option.tag = tag;
        }
      }

      // 分页数据和总数并行读取，避免两个独立查询串行等待。
      let [result, count] = await Promise.all([
        this.Model.listByOptionWithPage(option, page, limit),
        this.Model.listCount(option)
      ]);

      ctx.body = yapi.commons.resReturn({
        count: count,
        total: Math.ceil(count / limit),
        list: result
      });
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message + '1');
    }
  }

  // 获取开放接口数据
  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function listByOpen(ctx) {
    let project_id = ctx.request.query.project_id;

    if (!project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    let project = await this.projectModel.getBaseInfo(project_id);
    if (!project) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '不存在的项目'));
    }
    if (project.project_type === 'private') {
      if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }

    let basepath = project.basepath;
    try {
      const result = await this.catModel.list(project_id);
      const catIds = result.map((/** @type {any} */ item) => item._id);
      // 一次读取项目下所有开放接口，避免按分类逐个查询。
      const openInterfaces = await this.Model.listOpenByCatids(catIds);
      /** @type {any} */
      const interfacesByCatid = {};
      openInterfaces.forEach((/** @type {any} */ item) => {
        if (!interfacesByCatid[item.catid]) interfacesByCatid[item.catid] = [];
        interfacesByCatid[item.catid].push(item);
      });
      // 按原分类顺序拼接，保持批量查询前的响应顺序不变。
      /** @type {any[]} */
      const newResult = [];
      catIds.forEach((/** @type {any} */ catid) => {
        (interfacesByCatid[catid] || []).forEach((/** @type {any} */ item) => {
          const data = item.toObject();
          data.basepath = basepath;
          newResult.push(data);
        });
      });

      ctx.body = yapi.commons.resReturn(newResult);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

module.exports = {
  list,
  listByCat,
  listByOpen
};

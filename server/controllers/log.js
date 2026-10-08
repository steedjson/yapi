// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const logModel = requireAny('../models/log.js');
const yapi = requireAny('../yapi.js');
const baseController = require('./base.js');
const groupModel = requireAny('../models/group');
const projectModel = requireAny('../models/project');
const interfaceModel = requireAny('../models/interface');

class logController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(logModel);
    this.groupModel = yapi.getInst(groupModel);
    this.projectModel = yapi.getInst(projectModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
    this.schemaMap = {
      listByUpdate: {
        '*type': 'string',
        '*typeid': 'number',
        apis: [
          {
            method: 'string',
            path: 'string'
          }
        ]
      }
    };
  }

  /**
   * 获取动态列表
   * @interface /log/list
   * @method GET
   * @category log
   * @foldnumber 10
   * @param {Number} typeid 动态类型id， 不能为空
   * @param {Number} [page] 分页页码
   * @param {Number} [limit] 分页大小
   * @returns {Object}
   * @example /log/list
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async list(ctx) {
    let typeid = ctx.request.query.typeid,
      page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10,
      type = ctx.request.query.type,
      selectValue = ctx.request.query.selectValue;
    if (!typeid) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'typeid不能为空'));
    }
    if (!type) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'type不能为空'));
    }
    try {
      // 项目域可见性判定（对齐 project.get / interface.list 的 view 级口径）：
      // typeid 是请求方自报的分组/项目 id，此前无任何域判定——任意登录用户可读
      // 他人项目/分组的操作日志（含项目名、操作内容、用户名）。公开项目放行，
      // 私有项目/分组需 view 级成员（含 guest）。
      if (type === 'group') {
        const groupAuth = await this.checkAuth(typeid, 'group', 'view');
        if (groupAuth !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      } else if (type === 'project') {
        const projectData = await this.projectModel.getBaseInfo(typeid, 'project_type');
        if (projectData && projectData.project_type === 'private') {
          if ((await this.checkAuth(typeid, 'project', 'view')) !== true) {
            return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
          }
        }
      }
      if (type === 'group') {
        let projectList = await this.projectModel.list(typeid);
        let /** @type {any} */ projectIds = [],
          /** @type {any} */ projectDatas = {};
        for (let i in projectList) {
          projectDatas[projectList[i]._id] = projectList[i];
          projectIds[i] = projectList[i]._id;
        }
        let projectLogList = await this.Model.listWithPagingByGroup(
          typeid,
          projectIds,
          page,
          limit
        );
        projectLogList.forEach((/** @type {any} */ item, /** @type {any} */ index) => {
          item = item.toObject();
          if (item.type === 'project') {
            item.content =
              `在 <a href="/project/${item.typeid}">${projectDatas[item.typeid].name}</a> 项目: ` +
              item.content;
          }
          projectLogList[index] = item;
        });
        let total = await this.Model.listCountByGroup(typeid, projectIds);
        ctx.body = yapi.commons.resReturn({
          list: projectLogList,
          total: Math.ceil(total / limit)
        });
      } else if (type === "project") {
        let result = await this.Model.listWithPaging(typeid, type, page, limit, selectValue);
        let count = await this.Model.listCount(typeid, type, selectValue);

        ctx.body = yapi.commons.resReturn({
          total: Math.ceil(count / limit),
          list: result
        });
      }
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
  /**
   * 获取特定cat_id下最新修改的动态信息
   * @interface /log/list_by_update
   * @method post
   * @category log
   * @foldnumber 10
   * @param {Number} typeid 动态类型id， 不能为空
   * @returns {Object}
   * @example /log/list
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async listByUpdate(ctx) {
    let params = ctx.params;

    try {
      let { typeid, type, apis } = params;
      /** @type {any[]} */
      let list = [];
      let projectDatas = await this.projectModel.getBaseInfo(typeid, 'basepath project_type');
      // 项目域可见性判定（同 list）：typeid 为请求方自报，须先过 view 级闸门，
      // 否则任意登录用户可读他人私有项目的接口变更日志（含路径与方法）。
      if (projectDatas && projectDatas.project_type === 'private') {
        if ((await this.checkAuth(typeid, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      let basePath = projectDatas.toObject().basepath;

      for (let i = 0; i < apis.length; i++) {
        let api = apis[i];
        if (basePath) {
          api.path = api.path.indexOf(basePath) === 0 ? api.path.substr(basePath.length) : api.path;
        }
        let interfaceIdList = await this.interfaceModel.getByPath(
          typeid,
          api.path,
          api.method,
          '_id'
        );

        for (let j = 0; j < interfaceIdList.length; j++) {
          let interfaceId = interfaceIdList[j];
          let id = interfaceId.id;
          let result = await this.Model.listWithCatid(typeid, type, id);

          list = list.concat(result);
        }
      }

      ctx.body = yapi.commons.resReturn(list);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
}

module.exports = logController;

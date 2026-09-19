// @ts-check
/**
 * 项目查询检索方法组：项目名校验（checkProjectName）、项目详情（get）、分组项目列表（list）、
 * 模糊搜索（search）。
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
const commons = requireAny('../../utils/commons.js');
const interfaceCatModel = requireAny('../../models/interfaceCat.js');

  /**
   * 判断分组名称是否重复
   * @interface /project/check_project_name
   * @method get
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function checkProjectName(ctx) {
    try {
      let name = ctx.request.query.name;
      let group_id = ctx.request.query.group_id;

      if (!name) {
        return (ctx.body = yapi.commons.resReturn(null, 401, '项目名不能为空'));
      }
      let checkRepeat = await this.Model.checkNameRepeat(name, group_id);

      if (checkRepeat > 0) {
        return (ctx.body = yapi.commons.resReturn(null, 401, '已存在的项目名'));
      }

      ctx.body = yapi.commons.resReturn({});
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  /**
   * 获取项目信息
   * @interface /project/get
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @returns {Object}
   * @example ./api/project/get.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function get(ctx) {
    let params = ctx.params;
    let projectId= params.id || params.project_id; // 通过 token 访问
    let result = await this.Model.getBaseInfo(projectId);

    if (!result) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的项目'));
    }
    if (result.project_type === 'private') {
      if ((await this.checkAuth(result._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }
    result = result.toObject();
    let catInst = yapi.getInst(interfaceCatModel);
    let cat = await catInst.list(params.id);
    result.cat = cat;
    if (result.env.length === 0) {
      result.env.push({ name: 'local', domain: 'http://127.0.0.1' });
    }
    result.role = await this.getProjectRole(params.id, 'project');

    yapi.emitHook('project_get', result).then();
    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * 获取项目列表
   * @interface /project/list
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} group_id 项目group_id，不能为空
   * @returns {Object}
   * @example ./api/project/list.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function list(ctx) {
    let group_id = ctx.params.group_id,
      /** @type {any[]} */
      project_list = [];

    let groupData = await this.groupModel.get(group_id);
    let isPrivateGroup = false;
    if (groupData.type === 'private' && this.getUid() === groupData.uid) {
      isPrivateGroup = true;
    }
    let auth = await this.checkAuth(group_id, 'group', 'view');
    let result = await this.Model.list(group_id);
    let follow = await this.followModel.list(this.getUid());
    if (isPrivateGroup === false) {
      for (let index = 0, item, r = 1; index < result.length; index++) {
        item = result[index].toObject();
        if (item.project_type === 'private' && auth === false) {
          r = await this.Model.checkMemberRepeat(item._id, this.getUid());
          if (r === 0) {
            continue;
          }
        }

        let f = follow.find((/** @type {any} */ fol) => {
          return fol.projectid === item._id;
        });
        // 排序：收藏的项目放前面
        if (f) {
          item.follow = true;
          project_list.unshift(item);
        } else {
          item.follow = false;
          project_list.push(item);
        }
      }
    } else {
      follow = follow.map((/** @type {any} */ item) => {
        item = item.toObject();
        item._id = item.projectid
        item.follow = true;
        return item;
      });
      // 等价于 _.uniq(list, item => item._id): 按 _id 去重, 保留首次出现
      const seenProjectIds = new Set();
      project_list = follow.concat(result).filter((/** @type {any} */ item) => {
        if (seenProjectIds.has(item._id)) {
          return false;
        }
        seenProjectIds.add(item._id);
        return true;
      });
    }

    ctx.body = yapi.commons.resReturn({
      list: project_list
    });
  }

  /**
   * 模糊搜索项目名称或者分组名称或接口名称
   * @interface /project/search
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {String} q
   * @return {Object}
   * @example ./api/project/search.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function search(ctx) {
    const { q } = ctx.request.query;

    if (!q) {
      return (ctx.body = yapi.commons.resReturn(void 0, 400, 'No keyword.'));
    }

    if (!yapi.commons.validateSearchKeyword(q)) {
      return (ctx.body = yapi.commons.resReturn(void 0, 400, 'Bad query.'));
    }

    let projectList = await this.Model.search(q);
    let groupList = await this.groupModel.search(q);
    let interfaceList = await this.interfaceModel.search(q);

    let projectRules = [
      '_id',
      'name',
      'basepath',
      'uid',
      'env',
      'members',
      { key: 'group_id', alias: 'groupId' },
      { key: 'up_time', alias: 'upTime' },
      { key: 'add_time', alias: 'addTime' }
    ];
    let groupRules = [
      '_id',
      'uid',
      { key: 'group_name', alias: 'groupName' },
      { key: 'group_desc', alias: 'groupDesc' },
      { key: 'add_time', alias: 'addTime' },
      { key: 'up_time', alias: 'upTime' }
    ];
    let interfaceRules = [
      '_id',
      'uid',
      { key: 'title', alias: 'title' },
      { key: 'project_id', alias: 'projectId' },
      { key: 'add_time', alias: 'addTime' },
      { key: 'up_time', alias: 'upTime' }
    ];

    projectList = commons.filterRes(projectList, projectRules);
    groupList = commons.filterRes(groupList, groupRules);
    interfaceList = commons.filterRes(interfaceList, interfaceRules);
    let queryList = {
      project: projectList,
      group: groupList,
      interface: interfaceList
    };

    return (ctx.body = yapi.commons.resReturn(queryList, 0, 'ok'));
  }

module.exports = {
  checkProjectName,
  get,
  list,
  search
};

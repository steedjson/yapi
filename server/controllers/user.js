// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const userModel = requireAny('../models/user.js');
const yapi = requireAny('../yapi.js');
const baseController = require('./base.js');
const common = requireAny('../utils/commons.js');

const interfaceModel = requireAny('../models/interface.js');
const groupModel = requireAny('../models/group.js');
const projectModel = requireAny('../models/project.js');

class userController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(userModel);
  }
  /**
   * 更新
   * @interface /user/up_study
   * @method GET
   * @category user
   * @foldnumber 10
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async upStudy(ctx) {
    let userInst = yapi.getInst(userModel); //创建user实体
    let data = {
      up_time: yapi.commons.time(),
      study: true
    };
    try {
      let result = await userInst.update(this.getUid(), data);
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 401, e.message);
    }
  }

  /**
   * 修改用户密码
   * @interface /user/change_password
   * @method POST
   * @category user
   * @param {Number} uid 用户ID
   * @param {Number} [old_password] 旧密码, 非admin用户必须传
   * @param {Number} password 新密码
   * @return {Object}
   * @example ./api/user/change_password.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async changePassword(ctx) {
    let params = ctx.request.body;
    let userInst = yapi.getInst(userModel);

    if (!params.uid) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
    }

    if (!params.password) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '密码不能为空'));
    }

    let user = await userInst.findById(params.uid);
    if (this.getRole() !== 'admin' && params.uid != this.getUid()) {
      return (ctx.body = yapi.commons.resReturn(null, 402, '没有权限'));
    }

    if (this.getRole() !== 'admin' || user.role === 'admin') {
      if (!params.old_password) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '旧密码不能为空'));
      }

      if (!yapi.commons.verifyPassword(params.old_password, user.passsalt, user.password).valid) {
        return (ctx.body = yapi.commons.resReturn(null, 402, '旧密码错误'));
      }
    }

    let passsalt = yapi.commons.randStr();
    let data = {
      up_time: yapi.commons.time(),
      password: yapi.commons.hashPassword(params.password),
      passsalt: passsalt
    };
    try {
      let result = await userInst.update(params.uid, data);
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 401, e.message);
    }
  }

  /**
   * 获取用户列表
   * @interface /user/list
   * @method GET
   * @category user
   * @foldnumber 10
   * @param {Number} [page] 分页页码
   * @param {Number} [limit] 分页大小,默认为10条
   * @param {String} [keyword] 可选过滤关键词,按email/username不区分大小写匹配
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async list(ctx) {
    let page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10;
    let keyword = ctx.request.query.keyword;

    const userInst = yapi.getInst(userModel);
    try {
      if (keyword && !yapi.commons.validateSearchKeyword(keyword)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'Bad query.'));
      }
      let user = await userInst.listWithPaging(page, limit, keyword);
      let count = await userInst.listCount(keyword);
      return (ctx.body = yapi.commons.resReturn({
        count: count,
        total: Math.ceil(count / limit),
        list: user
      }));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 402, e.message));
    }
  }

  /**
   * 获取用户个人信息
   * @interface /user/find
   * @method GET
   * @param id 用户uid
   * @category user
   * @foldnumber 10
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async findById(ctx) {
    //根据id获取用户信息
    try {
      let userInst = yapi.getInst(userModel);
      let id = ctx.request.query.id;

      if (this.getRole() !== 'admin' && id != this.getUid()) {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }

      let result = await userInst.findById(id);

      if (!result) {
        return (ctx.body = yapi.commons.resReturn(null, 402, '不存在的用户'));
      }

      return (ctx.body = yapi.commons.resReturn({
        uid: result._id,
        username: result.username,
        email: result.email,
        role: result.role,
        type: result.type,
        add_time: result.add_time,
        up_time: result.up_time
      }));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 402, e.message));
    }
  }

  /**
   * 更新用户个人信息
   * @interface /user/update
   * @method POST
   * @param uid  用户uid
   * @param [role] 用户角色,只有管理员有权限修改
   * @param [username] String
   * @param [email] String
   * @category user
   * @foldnumber 10
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async update(ctx) {
    //更新用户信息
    try {
      let params = ctx.request.body;

      params = yapi.commons.handleParams(params, {
        username: 'string',
        email: 'string'
      });

      if (this.getRole() !== 'admin' && params.uid != this.getUid()) {
        return (ctx.body = yapi.commons.resReturn(null, 401, '没有权限'));
      }

      let userInst = yapi.getInst(userModel);
      let id = params.uid;

      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不能为空'));
      }

      let userData = await userInst.findById(id);
      if (!userData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'uid不存在'));
      }

      /** @type {any} */
      let data = {
        up_time: yapi.commons.time()
      };

      params.username && (data.username = params.username);
      params.email && (data.email = params.email);

      if (data.email) {
        var checkRepeat = await userInst.checkRepeat(data.email); //然后检查是否已经存在该用户
        if (checkRepeat > 0) {
          return (ctx.body = yapi.commons.resReturn(null, 401, '该email已经注册'));
        }
      }

      let member = {
        uid: id,
        username: data.username || userData.username,
        email: data.email || userData.email
      };
      let groupInst = yapi.getInst(groupModel);
      await groupInst.updateMember(member);
      let projectInst = yapi.getInst(projectModel);
      await projectInst.updateMember(member);

      let result = await userInst.update(id, data);
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 模糊搜索用户名或者email
   * @interface /user/search
   * @method GET
   * @category user
   * @foldnumber 10
   * @param {String} q
   * @return {Object}
   * @example ./api/user/search.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async search(ctx) {
    const { q } = ctx.request.query;

    if (!q) {
      return (ctx.body = yapi.commons.resReturn(void 0, 400, 'No keyword.'));
    }

    if (!yapi.commons.validateSearchKeyword(q)) {
      return (ctx.body = yapi.commons.resReturn(void 0, 400, 'Bad query.'));
    }

    let queryList = await this.Model.search(q);
    let rules = [
      {
        key: '_id',
        alias: 'uid'
      },
      'username',
      'email',
      'role',
      {
        key: 'add_time',
        alias: 'addTime'
      },
      {
        key: 'up_time',
        alias: 'upTime'
      }
    ];

    let filteredRes = common.filterRes(queryList, rules);

    return (ctx.body = yapi.commons.resReturn(filteredRes, 0, 'ok'));
  }

  /**
   * 根据路由id初始化项目数据
   * @interface /user/project
   * @method GET
   * @category user
   * @foldnumber 10
   * @param {String} type 可选group|interface|project
   * @param {Number} id
   * @return {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async project(ctx) {
    let { id, type } = ctx.request.query;
    /** @type {any} */
    let result = {};
    try {
      if (type === 'interface') {
        let interfaceInst = yapi.getInst(interfaceModel);
        let interfaceData = await interfaceInst.get(id);
        result.interface = interfaceData;
        type = 'project';
        id = interfaceData.project_id;
      }

      if (type === 'project') {
        let projectInst = yapi.getInst(projectModel);
        let projectData = await projectInst.get(id);
        result.project = projectData.toObject();
        let ownerAuth = await this.checkAuth(id, 'project', 'danger'),
          devAuth;
        if (ownerAuth) {
          result.project.role = 'owner';
        } else {
          devAuth = await this.checkAuth(id, 'project', 'site');
          if (devAuth) {
            result.project.role = 'dev';
          } else {
            result.project.role = 'member';
          }
        }
        type = 'group';
        id = projectData.group_id;
      }

      if (type === 'group') {
        let groupInst = yapi.getInst(groupModel);
        let groupData = await groupInst.get(id);
        result.group = groupData.toObject();
        let ownerAuth = await this.checkAuth(id, 'group', 'danger'),
          devAuth;
        if (ownerAuth) {
          result.group.role = 'owner';
        } else {
          devAuth = await this.checkAuth(id, 'group', 'site');
          if (devAuth) {
            result.group.role = 'dev';
          } else {
            result.group.role = 'member';
          }
        }
      }

      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(result, 422, e.message));
    }
  }

}

// 方法组模块通过原型合并挂载（P9c God file 拆分，沿用 P9b interface.js 试点模式）：
// controller 方法名与路由挂载保持不变，this 在调用时由控制器实例注入。
// 遮蔽防护（约 5 行，P9c 拆分纪律）：合并前校验方法组导出键与原型自有属性名无交集，
// 防止 Object.assign 静默覆盖同名方法导致拆分前后行为分叉；交集非空立即抛错。
[
  ['authMethods', require('./user/authMethods.js')],
  ['adminMethods', require('./user/adminMethods.js')],
  ['avatarMethods', require('./user/avatarMethods.js')]
].forEach(([groupName, methods]) => {
  const shadowed = Object.keys(methods).filter(name =>
    Object.prototype.hasOwnProperty.call(userController.prototype, name)
  );
  if (shadowed.length > 0) {
    throw new Error(
      `[userController] 方法组 ${groupName} 与原型已有成员重名: ${shadowed.join(', ')}`
    );
  }
  Object.assign(userController.prototype, methods);
});

module.exports = userController;
// @ts-check
/**
 * 以非字面量参数调用 require，避免 tsc 静态解析后递归检查未迁移的模型和框架代码。
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const yapi = requireAny('../yapi.js');
const projectModel = requireAny('../models/project.js');
const userModel = requireAny('../models/user.js');
const interfaceModel = requireAny('../models/interface.js');
const groupModel = requireAny('../models/group.js');
const tokenModel = requireAny('../models/token.js');
const _ = require('underscore');
const jwt = require('jsonwebtoken');
const {parseToken} = require('../utils/token')

class baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    this.ctx = ctx;
    //网站上线后，role对象key是不能修改的，value可以修改
    this.roles = {
      admin: 'Admin',
      member: '网站会员'
    };
  }

  /**
   * 控制器初始化：统一处理登录态校验与 openapi token 鉴权。
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async init(ctx) {
    /** @type {any} 当前登录用户信息，未登录时为 null */
    this.$user = null;
    this.tokenModel = yapi.getInst(tokenModel);
    this.projectModel = yapi.getInst(projectModel);
    let ignoreRouter = [
      '/api/user/login_by_token',
      '/api/user/login',
      '/api/user/reg',
      '/api/user/status',
      '/api/user/logout',
      '/api/user/avatar',
      '/api/user/login_by_ldap'
    ];
    if (ignoreRouter.indexOf(ctx.path) > -1) {
      this.$auth = true;
    } else {
      await this.checkLogin(ctx);
    }

    let openApiRouter = [
      '/api/open/run_auto_test',
      '/api/open/import_data',
			'/api/interface/add',
			'/api/interface/save',
			'/api/interface/up',
			'/api/interface/get',
			'/api/interface/list',
			'/api/interface/list_menu',
      '/api/interface/get_cat_tree',
			'/api/interface/add_cat',
      '/api/interface/getCatMenu',
      '/api/interface/list_cat',
      '/api/project/get',
      '/api/plugin/export',
      '/api/project/up',
      '/api/plugin/exportSwagger'
    ];

    let params = Object.assign({}, ctx.query, ctx.request.body);
    let token = params.token;

    // 如果前缀是 /api/open，执行 parse token 逻辑
    if (token && typeof token === 'string' && (openApiRouter.indexOf(ctx.path) > -1 || ctx.path.indexOf('/api/open/') === 0 )) {

      let tokens = parseToken(token)

      const oldTokenUid = '999999'

      let tokenUid = oldTokenUid;

      if(!tokens){
        let checkId = await this.getProjectIdByToken(token);
        if(!checkId)return;
      }else{
        token = tokens.projectToken;
        tokenUid = tokens.uid;
      }

      // if (this.$auth) {
      //   ctx.params.project_id = await this.getProjectIdByToken(token);

      //   if (!ctx.params.project_id) {
      //     return (this.$tokenAuth = false);
      //   }
      //   return (this.$tokenAuth = true);
      // }

      let checkId = await this.getProjectIdByToken(token);
      if(!checkId){
        ctx.body = yapi.commons.resReturn(null, 42014, 'token 无效');
      }
      let projectData = await this.projectModel.get(checkId);
      if (projectData) {
        ctx.query.pid = checkId; // 兼容：/api/plugin/export
        ctx.params.project_id = checkId;
        this.$tokenAuth = true;
        this.$uid = tokenUid;
        let result;
        if(tokenUid === oldTokenUid){
          result = {
            _id: tokenUid,
            role: 'member',
            username: 'system'
          }
        }else{
          let userInst = yapi.getInst(userModel); //创建user实体
          result = await userInst.findById(tokenUid);
        }

        this.$user = result;
        this.$auth = true;
      }
    }
  }

  /**
   * 通过 openapi token 查询对应项目 id。
   * @param {string} token openapi token
   * @returns {Promise<any>} 项目 id，未找到时为 undefined
   */
  async getProjectIdByToken(token) {
    let projectId = await this.tokenModel.findId(token);
    if (projectId) {
      return projectId.toObject().project_id;
    }
  }

  /**
   * 获取当前登录用户 uid。
   * @returns {number}
   */
  getUid() {
    return parseInt(this.$uid, 10);
  }

  /**
   * 校验 cookie 登录态，登录成功时写入 $uid / $auth / $user。
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<boolean>}
   */
  async checkLogin(ctx) {
    let token = ctx.cookies.get('_yapi_token');
    let uid = ctx.cookies.get('_yapi_uid');
    try {
      if (!token || !uid) {
        return false;
      }
      let userInst = yapi.getInst(userModel); //创建user实体
      let result = await userInst.findById(uid);
      if (!result) {
        return false;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, result.passsalt);
      } catch (err) {
        return false;
      }

      if (decoded.uid == uid) {
        this.$uid = uid;
        this.$auth = true;
        this.$user = result;
        return true;
      }

      return false;
    } catch (e) {
      yapi.commons.log(e, 'error');
      return false;
    }
  }
  
  /**
   * 是否开放注册。
   * @returns {Promise<boolean>}
   */
  async checkRegister() {
    // console.log('config', yapi.WEBCONFIG);
    if (yapi.WEBCONFIG.closeRegister) {
      return false;
    } else {
      return true;
    }
  }

  /**
   * 是否启用 LDAP 登录。
   * @returns {Promise<boolean>}
   */
  async checkLDAP() {
    // console.log('config', yapi.WEBCONFIG);
    if (!yapi.WEBCONFIG.ldapLogin) {
      return false;
    } else {
      return yapi.WEBCONFIG.ldapLogin.enable || false;
    }
  }
  /**
   * 获取当前登录状态并写入响应。
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async getLoginStatus(ctx) {
    let body;
    if ((await this.checkLogin(ctx)) === true) {
      let result = yapi.commons.fieldSelect(this.$user, [
        '_id',
        'username',
        'email',
        'up_time',
        'add_time',
        'role',
        'type',
        'study'
      ]);
      body = yapi.commons.resReturn(result);
    } else {
      body = yapi.commons.resReturn(null, 40011, '请登录...');
    }

    body.ladp = await this.checkLDAP();
    body.canRegister = await this.checkRegister();
    ctx.body = body;
  }

  /**
   * 获取当前登录用户角色。
   * @returns {any}
   */
  getRole() {
    return this.$user.role;
  }

  /**
   * 获取当前登录用户名。
   * @returns {any}
   */
  getUsername() {
    return this.$user.username;
  }

  /**
   * 获取当前登录用户邮箱。
   * @returns {any}
   */
  getEmail() {
    return this.$user.email;
  }

  /**
   * 查询当前用户在接口 / 项目 / 分组下的角色。
   * @param {any} id type 对应的 id
   * @param {string} type enum[interface, project, group]
   * @returns {Promise<string|boolean>} 角色字符串，异常时返回 false
   */
  async getProjectRole(id, type) {
    /** @type {any} */
    let result = {};
    try {
      if (this.getRole() === 'admin') {
        return 'admin';
      }
      if (type === 'interface') {
        let interfaceInst = yapi.getInst(interfaceModel);
        let interfaceData = await interfaceInst.get(id);
        result.interfaceData = interfaceData;
        // 项目创建者相当于 owner
        if (interfaceData.uid === this.getUid()) {
          return 'owner';
        }
        type = 'project';
        id = interfaceData.project_id;
      }

      if (type === 'project') {
        let projectInst = yapi.getInst(projectModel);
        let projectData = await projectInst.get(id);
        if (projectData.uid === this.getUid()) {
          // 建立项目的人
          return 'owner';
        }
        let memberData = _.find(projectData.members, m => {
          if (m && m.uid === this.getUid()) {
            return true;
          }
        });

        if (memberData && memberData.role) {
          if (memberData.role === 'owner') {
            return 'owner';
          } else if (memberData.role === 'dev') {
            return 'dev';
          } else {
            return 'guest';
          }
        }
        type = 'group';
        id = projectData.group_id;
      }

      if (type === 'group') {
        let groupInst = yapi.getInst(groupModel);
        let groupData = await groupInst.get(id);
        // 建立分组的人
        if (groupData.uid === this.getUid()) {
          return 'owner';
        }

        let groupMemberData = _.find(groupData.members, m => {
          if (m.uid === this.getUid()) {
            return true;
          }
        });
        if (groupMemberData && groupMemberData.role) {
          if (groupMemberData.role === 'owner') {
            return 'owner';
          } else if (groupMemberData.role === 'dev') {
            return 'dev';
          } else {
            return 'guest';
          }
        }
      }

      return 'member';
    } catch (e) {
      yapi.commons.log(e, 'error');
      return false;
    }
  }
  /**
   * 身份验证
   * @param {any} id type 对应的 id
   * @param {string} type enum[interface, project, group]
   * @param {string} action enum[ danger, edit, view ] danger 只有 owner 或管理员才能操作，edit 只要是 dev 或以上就能执行
   * @returns {Promise<boolean>}
   */
  async checkAuth(id, type, action) {
    let role = await this.getProjectRole(id, type);

    if (action === 'danger') {
      if (role === 'admin' || role === 'owner') {
        return true;
      }
    } else if (action === 'edit') {
      if (role === 'admin' || role === 'owner' || role === 'dev') {
        return true;
      }
    } else if (action === 'view') {
      if (role === 'admin' || role === 'owner' || role === 'dev' || role === 'guest') {
        return true;
      }
    }
    return false;
  }
}

module.exports = baseController;

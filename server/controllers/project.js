// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const projectModel = requireAny('../models/project.js');
const yapi = requireAny('../yapi.js');
const baseController = require('./base.js');
const interfaceModel = requireAny('../models/interface.js');
const interfaceColModel = requireAny('../models/interfaceCol.js');
const interfaceCaseModel = requireAny('../models/interfaceCase.js');
const interfaceCatModel = requireAny('../models/interfaceCat.js');
const groupModel = requireAny('../models/group');
const logModel = requireAny('../models/log.js');
const followModel = requireAny('../models/follow.js');
const tokenModel = requireAny('../models/token.js');
const axios = requireAny('axios').default;

class projectController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(projectModel);
    this.groupModel = yapi.getInst(groupModel);
    this.logModel = yapi.getInst(logModel);
    this.followModel = yapi.getInst(followModel);
    this.tokenModel = yapi.getInst(tokenModel);
    this.interfaceModel = yapi.getInst(interfaceModel);

    const id = 'number';
    const member_uid = ['number'];
    const name = {
      type: 'string',
      minLength: 1
    };
    const role = {
      type: 'string',
      enum: ['owner', 'dev', 'guest']
    };
    const basepath = {
      type: 'string',
      default: ''
    };
    const group_id = 'number';
    const group_name = 'string';
    const project_type = {
      type: 'string',
      enum: ['private', 'public'],
      default: 'private'
    };
    const desc = 'string';
    const icon = 'string';
    const color = 'string';
    const env = 'array';

    const cat = 'array';
    this.schemaMap = {
      add: {
        '*name': name,
        basepath: basepath,
        '*group_id': group_id,
        group_name,
        desc: desc,
        color,
        icon,
        project_type
      },
      copy: {
        '*name': name,
        preName: name,
        basepath: basepath,
        '*group_id': group_id,
        _id: id,
        cat,
        pre_script: desc,
        after_script: desc,
        env,
        group_name,
        desc,
        color,
        icon,
        project_type
      },
      addMember: {
        '*id': id,
        '*member_uids': member_uid,
        role: role
      },
      delMember: {
        '*id': id,
        '*member_uid': id
      },
      getMemberList: {
        '*id': id
      },
      get: {
        'id': id,
        'project_id': id
      },
      list: {
        '*group_id': group_id
      },
      del: {
        '*id': id
      },
      changeMemberRole: {
        '*id': id,
        '*member_uid': id,
        role
      },
      token: {
        '*project_id': id
      },
      updateToken: {
        '*project_id': id
      }
    };
  }

  /**
   * @param {string} basepath
   * @returns {string|boolean}
   */
  handleBasepath(basepath) {
    if (!basepath) {
      return '';
    }
    if (basepath === '/') {
      return '';
    }
    if (basepath[0] !== '/') {
      basepath = '/' + basepath;
    }
    if (basepath[basepath.length - 1] === '/') {
      basepath = basepath.substr(0, basepath.length - 1);
    }
    if (!/^\/[a-zA-Z0-9\-/._]+$/.test(basepath)) {
      return false;
    }
    return basepath;
  }

  /**
   * @param {string} domain
   * @returns {boolean}
   */
  verifyDomain(domain) {
    if (!domain) {
      return false;
    }
    if (/^[a-zA-Z0-9\-_.]+?\.[a-zA-Z0-9\-_.]*?[a-zA-Z]{2,6}$/.test(domain)) {
      return true;
    }
    return false;
  }

  /**
   * 添加项目分组
   * @interface /project/add
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {String} name 项目名称，不能为空
   * @param {String} basepath 项目基本路径，不能为空
   * @param {Number} group_id 项目分组id，不能为空
   * @param {Number} group_name 项目分组名称，不能为空
   * @param {String} project_type private public
   * @param  {String} [desc] 项目描述
   * @returns {Object}
   * @example ./api/project/add.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async add(ctx) {
    let params = ctx.params;

    if ((await this.checkAuth(params.group_id, 'group', 'edit')) !== true) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
    }

    let checkRepeat = await this.Model.checkNameRepeat(params.name, params.group_id);

    if (checkRepeat > 0) {
      return (ctx.body = yapi.commons.resReturn(null, 401, '已存在的项目名'));
    }

    params.basepath = params.basepath || '';

    if ((params.basepath = this.handleBasepath(params.basepath)) === false) {
      return (ctx.body = yapi.commons.resReturn(null, 401, 'basepath格式有误'));
    }

    let data = {
      name: params.name,
      desc: params.desc,
      basepath: params.basepath,
      members: [],
      project_type: params.project_type || 'private',
      uid: this.getUid(),
      group_id: params.group_id,
      group_name: params.group_name,
      icon: params.icon,
      color: params.color,
      add_time: yapi.commons.time(),
      up_time: yapi.commons.time(),
      is_json5: false,
      env: [{ name: 'local', domain: 'http://127.0.0.1' }]
    };

    let result = await this.Model.save(data);
    let colInst = yapi.getInst(interfaceColModel);
    let catInst = yapi.getInst(interfaceCatModel);
    if (result._id) {
      await colInst.save({
        name: '公共测试集',
        project_id: result._id,
        desc: '公共测试集',
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });
      await catInst.save({
        name: '公共分类',
        project_id: result._id,
        desc: '公共分类',
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });
    }
    let uid = this.getUid();
    // 将项目添加者变成项目组长,除admin以外
    if (this.getRole() !== 'admin') {
      let userdata = await yapi.commons.getUserdata(uid, 'owner');
      await this.Model.addMember(result._id, [userdata]);
    }
    let username = this.getUsername();
    yapi.commons.saveLog({
      content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了项目 <a href="/project/${
        result._id
      }">${params.name}</a>`,
      type: 'project',
      uid,
      username: username,
      typeid: result._id
    });
    yapi.emitHook('project_add', result).then();
    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * 拷贝项目分组
   * @interface /project/copy
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {String} name 项目名称，不能为空
   * @param {String} basepath 项目基本路径，不能为空
   * @param {Number} group_id 项目分组id，不能为空
   * @param {Number} group_name 项目分组名称，不能为空
   * @param {String} project_type private public
   * @param  {String} [desc] 项目描述
   * @returns {Object}
   * @example ./api/project/add.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async copy(ctx) {
    try {
      let params = ctx.params;

      // 拷贝项目的ID
      let copyId = params._id;
      if ((await this.checkAuth(params.group_id, 'group', 'edit')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }

      params.basepath = params.basepath || '';

      let data = Object.assign(params, {
        project_type: params.project_type || 'private',
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time(),
        env: params.env || [{ name: 'local', domain: 'http://127.0.0.1' }]
      });

      delete data._id;
      let result = await this.Model.save(data);
      let colInst = yapi.getInst(interfaceColModel);
      let catInst = yapi.getInst(interfaceCatModel);

      // 增加集合
      if (result._id) {
        await colInst.save({
          name: '公共测试集',
          project_id: result._id,
          desc: '公共测试集',
          uid: this.getUid(),
          add_time: yapi.commons.time(),
          up_time: yapi.commons.time()
        });

        // 拷贝接口列表
        let cat = params.cat;
        for (let i = 0; i < cat.length; i++) {
          let item = cat[i];
          let catDate = {
            name: item.name,
            project_id: result._id,
            desc: item.desc,
            uid: this.getUid(),
            add_time: yapi.commons.time(),
            up_time: yapi.commons.time()
          };
          let catResult = await catInst.save(catDate);

          // 获取每个集合中的interface
          let interfaceData = await this.interfaceModel.listByInterStatus(item._id);

          // 将interfaceData存到新的catID中
          for (let key = 0; key < interfaceData.length; key++) {
            let interfaceItem = interfaceData[key].toObject();
            let data = Object.assign(interfaceItem, {
              uid: this.getUid(),
              catid: catResult._id,
              project_id: result._id,
              add_time: yapi.commons.time(),
              up_time: yapi.commons.time()
            });
            delete data._id;

            await this.interfaceModel.save(data);
          }
        }
      }

      // 增加member
      let copyProject = await this.Model.get(copyId);
      let copyProjectMembers = copyProject.members;

      let uid = this.getUid();
      // 将项目添加者变成项目组长,除admin以外
      if (this.getRole() !== 'admin') {
        let userdata = await yapi.commons.getUserdata(uid, 'owner');
        let check = await this.Model.checkMemberRepeat(copyId, uid);
        if (check === 0) {
          copyProjectMembers.push(userdata);
        }
      }
      await this.Model.addMember(result._id, copyProjectMembers);

      // 在每个测试结合下添加interface

      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 复制了项目 ${
          params.preName
        } 为 <a href="/project/${result._id}">${params.name}</a>`,
        type: 'project',
        uid,
        username: username,
        typeid: result._id
      });
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  /**
   * 删除项目
   * @interface /project/del
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @returns {Object}
   * @example ./api/project/del.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async del(ctx) {
    let id = ctx.params.id;

    if ((await this.checkAuth(id, 'project', 'danger')) !== true) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
    }

    let interfaceInst = yapi.getInst(interfaceModel);
    let interfaceColInst = yapi.getInst(interfaceColModel);
    let interfaceCaseInst = yapi.getInst(interfaceCaseModel);
    await interfaceInst.delByProjectId(id);
    await interfaceCaseInst.delByProjectId(id);
    await interfaceColInst.delByProjectId(id);
    await this.followModel.delByProjectId(id);
    yapi.emitHook('project_del', id).then();
    let result = await this.Model.del(id);
    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * 项目头像设置
   * @interface /project/upset
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {String} icon 项目icon
   * @param {Array} color 项目color
   * @returns {Object}
   * @example ./api/project/upset
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async upSet(ctx) {
    let id = ctx.request.body.id;
    /** @type {any} */
    let data = {};
    if ((await this.checkAuth(id, 'project', 'danger')) !== true) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
    }
    data.color = ctx.request.body.color;
    data.icon = ctx.request.body.icon;
    if (!id) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '项目id不能为空'));
    }
    try {
      let result = await this.Model.up(id, data);
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
    try {
      this.followModel.updateById(this.getUid(), id, data).then(() => {
        let username = this.getUsername();
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 修改了项目图标、颜色`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: id
        });
      });
    } catch (/** @type {any} */ e) {
      yapi.commons.log(e, 'error');
    }
  }

  /**
   * 编辑项目
   * @interface /project/up
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {String} name 项目名称，不能为空
   * @param {String} basepath 项目基本路径，不能为空
   * @param {String} [desc] 项目描述
   * @returns {Object}
   * @example ./api/project/up.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async up(ctx) {
    try {
      let id = ctx.request.body.id;
      let params = ctx.request.body;

      params = yapi.commons.handleParams(params, {
        name: 'string',
        basepath: 'string',
        group_id: 'number',
        desc: 'string',
        pre_script: 'string',
        after_script: 'string',
        project_mock_script: 'string'
      });

      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '项目id不能为空'));
      }

      if ((await this.checkAuth(id, 'project', 'danger')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }

      let projectData = await this.Model.get(id);

      if (params.basepath) {
        if ((params.basepath = this.handleBasepath(params.basepath)) === false) {
          return (ctx.body = yapi.commons.resReturn(null, 401, 'basepath格式有误'));
        }
      }

      if (projectData.name === params.name) {
        delete params.name;
      }

      if (params.name) {
        let checkRepeat = await this.Model.checkNameRepeat(params.name, params.group_id);
        if (checkRepeat > 0) {
          return (ctx.body = yapi.commons.resReturn(null, 401, '已存在的项目名'));
        }
      }

      let data = {
        up_time: yapi.commons.time()
      };

      data = Object.assign({}, data, params);

      let result = await this.Model.up(id, data);
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了项目 <a href="/project/${id}/interface/api">${
          projectData.name
        }</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: id
      });
      yapi.emitHook('project_up', result).then();
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  // 输入 swagger url 的时候 node 端请求数据
  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async swaggerUrl(ctx) {
    try {
      const { url } = ctx.request.query;
      const { data } = await axios.get(url);
      if (data == null || typeof data !== 'object') {
        throw new Error('返回数据格式不是 JSON');
      }
      ctx.body = yapi.commons.resReturn(data);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, String(err));
    }
  }
}

// 方法组模块通过原型合并挂载（P9c God file 拆分，沿用 P9b interface.js 试点模式）：
// controller 方法名与路由挂载保持不变，this 在调用时由控制器实例注入。
// 遮蔽防护（约 5 行，P9c 拆分纪律）：合并前校验方法组导出键与原型自有属性名无交集，
// 防止 Object.assign 静默覆盖同名方法导致拆分前后行为分叉；交集非空立即抛错。
[
  ['memberMethods', require('./project/memberMethods.js')],
  ['envTokenMethods', require('./project/envTokenMethods.js')],
  ['queryMethods', require('./project/queryMethods.js')]
].forEach(([groupName, methods]) => {
  const shadowed = Object.keys(methods).filter(name =>
    Object.prototype.hasOwnProperty.call(projectController.prototype, name)
  );
  if (shadowed.length > 0) {
    throw new Error(
      `[projectController] 方法组 ${groupName} 与原型已有成员重名: ${shadowed.join(', ')}`
    );
  }
  Object.assign(projectController.prototype, methods);
});

module.exports = projectController;
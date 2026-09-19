// @ts-check
/**
 * 项目成员管理方法组：添加成员（addMember）、删除成员（delMember）、成员列表（getMemberList）、
 * 修改成员角色（changeMemberRole）、修改成员邮件通知（changeMemberEmailNotice）。
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
const userModel = requireAny('../../models/user.js');
const projectModel = requireAny('../../models/project.js');

  /**
   * 添加项目成员
   * @interface /project/add_member
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {Array} member_uid 项目成员uid,不能为空
   * @returns {Object}
   * @example ./api/project/add_member.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function addMember(ctx) {
    let params = ctx.params;
    if ((await this.checkAuth(params.id, 'project', 'edit')) !== true) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
    }

    params.role = ['owner', 'dev', 'guest'].find(v => v === params.role) || 'dev';
    /** @type {any[]} */
    let add_members = [];
    /** @type {any[]} */
    let exist_members = [];
    /** @type {any[]} */
    let no_members = [];
    for (let i = 0, len = params.member_uids.length; i < len; i++) {
      let id = params.member_uids[i];
      let check = await this.Model.checkMemberRepeat(params.id, id);
      let userdata = await yapi.commons.getUserdata(id, params.role);
      if (check > 0) {
        exist_members.push(userdata);
      } else if (!userdata) {
        no_members.push(id);
      } else {
        add_members.push(userdata);
      }
    }

    let result = await this.Model.addMember(params.id, add_members);
    if (add_members.length) {
      /** @type {any} */
      let members = add_members.map(item => {
        return `<a href = "/user/profile/${item.uid}">${item.username}</a>`;
      });
      members = members.join('、');
      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了项目成员 ${members}`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.id
      });
    }
    ctx.body = yapi.commons.resReturn({
      result,
      add_members,
      exist_members,
      no_members
    });
  }

  /**
   * 删除项目成员
   * @interface /project/del_member
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @param {member_uid} uid 项目成员uid,不能为空
   * @returns {Object}
   * @example ./api/project/del_member.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function delMember(ctx) {
    try {
      let params = ctx.params;

      var check = await this.Model.checkMemberRepeat(params.id, params.member_uid);
      if (check === 0) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目成员不存在'));
      }

      if ((await this.checkAuth(params.id, 'project', 'danger')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }

      let result = await this.Model.delMember(params.id, params.member_uid);
      let username = this.getUsername();
      yapi
        .getInst(userModel)
        .findById(params.member_uid)
        .then((/** @type {any} */ member) => {
          yapi.commons.saveLog({
            content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了项目中的成员 <a href="/user/profile/${
              params.member_uid
            }">${member ? member.username : ''}</a>`,
            type: 'project',
            uid: this.getUid(),
            username: username,
            typeid: params.id
          });
        });
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 获取项目成员列表
   * @interface /project/get_member_list
   * @method GET
   * @category project
   * @foldnumber 10
   * @param {Number} id 项目id，不能为空
   * @return {Object}
   * @example ./api/project/get_member_list.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getMemberList(ctx) {
    let params = ctx.params;
    if (!params.id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    let project = await this.Model.get(params.id);
    ctx.body = yapi.commons.resReturn(project.members);
  }

  /**
   * 修改项目成员角色
   * @interface /project/change_member_role
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {String} id 项目id
   * @param {String} member_uid 项目成员uid
   * @param {String} role 权限 ['owner'|'dev']
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function changeMemberRole(ctx) {
    let params = ctx.request.body;
    let projectInst = yapi.getInst(projectModel);

    var check = await projectInst.checkMemberRepeat(params.id, params.member_uid);
    if (check === 0) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目成员不存在'));
    }
    if ((await this.checkAuth(params.id, 'project', 'danger')) !== true) {
      return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
    }

    params.role = ['owner', 'dev', 'guest'].find(v => v === params.role) || 'dev';
    /** @type {Record<string, string>} */
    let rolename = {
      owner: '组长',
      dev: '开发者',
      guest: '访客'
    };

    let result = await projectInst.changeMemberRole(params.id, params.member_uid, params.role);

    let username = this.getUsername();
    yapi
      .getInst(userModel)
      .findById(params.member_uid)
      .then((/** @type {any} */ member) => {
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 修改了项目中的成员 <a href="/user/profile/${
            params.member_uid
          }">${member.username}</a> 的角色为 "${rolename[params.role]}"`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: params.id
        });
      });
    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * 修改项目成员是否收到邮件通知
   * @interface /project/change_member_email_notice
   * @method POST
   * @category project
   * @foldnumber 10
   * @param {String} id 项目id
   * @param {String} member_uid 项目成员uid
   * @param {String} role 权限 ['owner'|'dev']
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function changeMemberEmailNotice(ctx) {
    try {
      let params = ctx.request.body;
      let projectInst = yapi.getInst(projectModel);
      var check = await projectInst.checkMemberRepeat(params.id, params.member_uid);
      if (check === 0) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目成员不存在'));
      }

      let result = await projectInst.changeMemberEmailNotice(
        params.id,
        params.member_uid,
        params.notice
      );
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

module.exports = {
  addMember,
  delMember,
  getMemberList,
  changeMemberRole,
  changeMemberEmailNotice
};

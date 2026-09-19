// @ts-check
/**
 * 接口集（分类）管理方法组：分类新增（addCat）、分类更新（upCat）、分类菜单（listByMenu）。
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
const { attachInterfacesToCategories } = require('../../utils/categoryTree');
const clearProjectCategoryCache = require('./cacheHelper.js');

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function addCat(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        name: 'string',
        project_id: 'number',
        parent_id: 'number',
        desc: 'string'
      });

      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }
      if (!this.$tokenAuth) {
        let auth = await this.checkAuth(params.project_id, 'project', 'edit');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      if (!params.name) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '名称不能为空'));
      }

      let parentId = params.parent_id || 0;
      if (parentId) {
        let parent = await this.catModel.get(parentId);
        if (!parent || parent.project_id !== params.project_id) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '父分类不存在'));
        }
      }

      let result = await this.catModel.save({
        name: params.name,
        project_id: params.project_id,
        parent_id: parentId,
        desc: params.desc,
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });
      clearProjectCategoryCache(params.project_id);

      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了分类  <a href="/project/${
          params.project_id
        }/interface/api/cat_${result._id}">${params.name}</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.project_id
      });

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
  async function upCat(ctx) {
    try {
      let params = ctx.request.body;

      let username = this.getUsername();
      let cate = await this.catModel.get(params.catid);
      if (!cate) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的分类'));
      }

      let auth = await this.checkAuth(cate.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      let parentId = params.parent_id === undefined ? cate.parent_id || 0 : params.parent_id || 0;
      if (parentId === params.catid) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不能将分类设置为自己的父分类'));
      }
      if (parentId) {
        let parent = await this.catModel.get(parentId);
        if (!parent || parent.project_id !== cate.project_id) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '父分类不存在'));
        }
        let cursor = parent;
        while (cursor) {
          if (cursor._id === params.catid) {
            return (ctx.body = yapi.commons.resReturn(null, 400, '不能移动到自己的子分类下'));
          }
          cursor = cursor.parent_id ? await this.catModel.get(cursor.parent_id) : null;
        }
      }

      let result = await this.catModel.up(params.catid, {
        name: params.name,
        parent_id: parentId,
        desc: params.desc,
        up_time: yapi.commons.time()
      });
      clearProjectCategoryCache(cate.project_id);

      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了分类 <a href="/project/${
          cate.project_id
        }/interface/api/cat_${params.catid}">${cate.name}</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: cate.project_id
      });

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
  async function listByMenu(ctx) {
    let project_id = ctx.params.project_id;
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

    try {
      let result = await this.catModel.list(project_id);
      // 分类和接口分别查询一次，再统一挂载接口，保持原有返回结构。
      let interfaces = await this.Model.listByProjectIdForMenu(project_id);
      let newResult = attachInterfacesToCategories(result, interfaces);
      ctx.body = yapi.commons.resReturn(newResult);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

module.exports = {
  addCat,
  upCat,
  listByMenu
};

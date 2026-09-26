// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const interfaceModel = requireAny('../models/interface.js');
const interfaceCatModel = requireAny('../models/interfaceCat.js');
const interfaceCaseModel = requireAny('../models/interfaceCase.js');
const followModel = requireAny('../models/follow.js');
const groupModel = requireAny('../models/group.js');
const url = requireAny('url');
const baseController = require('./base.js');
const yapi = requireAny('../yapi.js');
const userModel = requireAny('../models/user.js');
const projectModel = requireAny('../models/project.js');
const mergeJsonSchema = require('../../common/mergeJsonSchema');
const categoryCache = require('../utils/ttlCache');
const { buildCategoryTree, attachInterfacesToCategories } = require('../utils/categoryTree');
// 该绑定保留供测试 rewire __get__('handleHeaders') 使用（add/up 已迁至方法组模块）。
// eslint-disable-next-line no-unused-vars
const handleHeaders = require('../utils/interfaceNormalizer.js');


// cross-request.zip 为随版本发布的静态附件，内容固定不变，
// 进程内缓存避免每个下载请求都同步读盘（参照 user.js 的 defaultAvatarBuffer 模式）。
/** @type {Buffer | null} */
let crossRequestZipBuffer = null;

// clearProjectCategoryCache 抽取至 ./interface/cacheHelper.js（各模块共享同一份 ttlCache 引用），
// 这里保留同名绑定：测试通过 rewire __get__('clearProjectCategoryCache') 获取该函数。
const clearProjectCategoryCache = require('./interface/cacheHelper.js');



class interfaceController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(interfaceModel);
    this.catModel = yapi.getInst(interfaceCatModel);
    this.projectModel = yapi.getInst(projectModel);
    this.caseModel = yapi.getInst(interfaceCaseModel);
    this.followModel = yapi.getInst(followModel);
    this.userModel = yapi.getInst(userModel);
    this.groupModel = yapi.getInst(groupModel);

    const minLengthStringField = {
      type: 'string',
      minLength: 1
    };

    const addAndUpCommonField = {
      desc: 'string',
      status: 'string',
      req_query: [
        {
          name: 'string',
          value: 'string',
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_headers: [
        {
          name: 'string',
          value: 'string',
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_body_type: 'string',
      req_params: [
        {
          name: 'string',
          example: 'string',
          desc: 'string'
        }
      ],
      req_body_form: [
        {
          name: 'string',
          type: {
            type: 'string'
          },
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_body_other: 'string',
      res_body_type: 'string',
      res_body: 'string',
      custom_field_value: 'string',
      api_opened: 'boolean',
      req_body_is_json_schema: 'string',
      res_body_is_json_schema: 'string',
      markdown: 'string',
      tag: 'array'
    };

    this.schemaMap = {
      add: Object.assign(
        {
          '*project_id': 'number',
          '*path': minLengthStringField,
          '*title': minLengthStringField,
          '*method': minLengthStringField,
          '*catid': 'number'
        },
        addAndUpCommonField
      ),
      up: Object.assign(
        {
          '*id': 'number',
          project_id: 'number',
          path: minLengthStringField,
          title: minLengthStringField,
          method: minLengthStringField,
          catid: 'number',
          switch_notice: 'boolean',
          message: minLengthStringField
        },
        addAndUpCommonField
      ),
      save: Object.assign(
        {
          project_id: 'number',
          catid: 'number',
          title: minLengthStringField,
          path: minLengthStringField,
          method: minLengthStringField,
          message: minLengthStringField,
          switch_notice: 'boolean',
          dataSync: 'string'
        },
        addAndUpCommonField
      )
    };
  }



  /**
   * 保存接口数据，如果接口存在则更新数据，如果接口不存在则添加数据
   * @interface /interface/save
   * @method  post
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @param {String}   title 接口标题，不能为空
   * @param {String}   path 接口请求路径，不能为空
   * @param {String}   method 请求方式
   * @param {Array}  [req_headers] 请求的header信息
   * @param {String}  [req_headers[].name] 请求的header信息名
   * @param {String}  [req_headers[].value] 请求的header信息值
   * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
   * @param {String}  [req_headers[].desc] header描述
   * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
   * @param {Array} [req_params] name, desc两个参数
   * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
   * @param {String} [req_body_form[].name] 请求参数名
   * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
   * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
   * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
   * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
   * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
   * @param  {String} [desc] 接口描述
   * @returns {Object}
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async save(ctx) {
    let params = ctx.params;

    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(params.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }
    params.method = params.method || 'GET';
    params.method = params.method.toUpperCase();

    let http_path = url.parse(params.path, true);

    if (!yapi.commons.verifyPath(http_path.pathname)) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
      ));
    }

    let result = await this.Model.getByPath(params.project_id, params.path, params.method, '_id res_body');

    if (result.length > 0) {
      for (const item of result) {
        params.id = item._id;
        let validParams = Object.assign({}, params);
        let validResult = yapi.commons.validateParams(this.schemaMap['up'], validParams);
        if (!validResult.valid) {
          return (ctx.body = yapi.commons.resReturn(null, 400, validResult.message));
        }

        let data = Object.assign({}, ctx);
        data.params = validParams;

        if (params.res_body_is_json_schema && params.dataSync === 'good') {
          try {
            let new_res_body = yapi.commons.json_parse(params.res_body);
            let old_res_body = yapi.commons.json_parse(item.res_body);
            data.params.res_body = JSON.stringify(mergeJsonSchema(old_res_body, new_res_body), null, 2);
          } catch (/** @type {any} */ err) {}
        }
        await this.up(data);
        // 批量保存必须透传单个接口的错误，避免数据库未完整更新却返回成功。
        if (data.body && data.body.errcode) {
          return (ctx.body = data.body);
        }
      }
    } else {
      let validResult = yapi.commons.validateParams(this.schemaMap['add'], params);
      if (!validResult.valid) {
        return (ctx.body = yapi.commons.resReturn(null, 400, validResult.message));
      }
      await this.add({ params });
    }

    ctx.body = yapi.commons.resReturn(null);
    // return ctx.body = yapi.commons.resReturn(null, 400, 'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
  }


  /**
   * 获取项目分组
   * @interface /interface/get
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @returns {Object}
   * @example ./api/interface/get.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async get(ctx) {
    let params = ctx.params;
    if (!params.id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空'));
    }

    try {
      let result = await this.Model.get(params.id);
      if(this.$tokenAuth){
        if(params.project_id !== result.project_id){
          ctx.body = yapi.commons.resReturn(null, 400, 'token有误')
          return;
        }
      }
      // console.log('result', result);
      if (!result) {
        return (ctx.body = yapi.commons.resReturn(null, 490, '不存在的'));
      }
      let userinfo = await this.userModel.findById(result.uid);
      let project = await this.projectModel.getBaseInfo(result.project_id);
      if (!project) {
        return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
      }
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      yapi.emitHook('interface_get', result).then();
      result = result.toObject();
      if (userinfo) {
        result.username = userinfo.username;
      }
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }


  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async downloadCrx(ctx) {
    if (!crossRequestZipBuffer) {
      // 惰性缓存改为异步读盘，消除首次请求的同步阻塞
      crossRequestZipBuffer = await yapi.fs.promises.readFile(
        yapi.path.join(yapi.WEBROOT, 'static/attachment/cross-request.zip')
      );
    }
    ctx.set('Content-disposition', 'attachment; filename=crossRequest.zip');
    ctx.set('Content-Type', 'application/zip');
    ctx.body = crossRequestZipBuffer;
  }





  /**
   * 删除接口
   * @interface /interface/del
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @returns {Object}
   * @example ./api/interface/del.json
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async del(ctx) {
    try {
      let id = ctx.request.body.id;

      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空'));
      }

      let data = await this.Model.get(id);

      if (data.uid != this.getUid()) {
        let auth = await this.checkAuth(data.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      // let inter = await this.Model.get(id);
      let result = await this.Model.del(id);
      clearProjectCategoryCache(data.project_id);
      yapi.emitHook('interface_del', id).then();
      await this.caseModel.delByInterfaceId(id);
      let username = this.getUsername();
      this.catModel.get(data.catid).then((/** @type {any} */ cate) => {
        if (!cate) return;
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了分类 <a href="/project/${
            cate.project_id
          }/interface/api/cat_${data.catid}">${cate.name}</a> 下的接口 "${data.title}"`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: cate.project_id
        });
      }).catch((/** @type {any} */ err) => {
        // 日志分类读取失败不能影响接口删除结果。
        yapi.commons.log(err, 'error');
      });
      this.projectModel.up(data.project_id, { up_time: new Date().getTime() }).then();
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
  // 处理编辑冲突
  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async solveConflict(ctx) {
    try {
      let id = parseInt(ctx.query.id, 10),
        result,
        userInst,
        userinfo,
        data;
      if (!id) {
        return ctx.websocket.send('id 参数有误');
      }
      result = await this.Model.get(id);

      if (result.edit_uid !== 0 && result.edit_uid !== this.getUid()) {
        userInst = yapi.getInst(userModel);
        userinfo = await userInst.findById(result.edit_uid);
        data = {
          errno: result.edit_uid,
          data: { uid: result.edit_uid, username: userinfo.username }
        };
      } else {
        this.Model.upEditUid(id, this.getUid()).then();
        data = {
          errno: 0,
          data: result
        };
      }
      ctx.websocket.send(JSON.stringify(data));
      ctx.websocket.on('close', () => {
        this.Model.upEditUid(id, 0).then();
      });
    } catch (/** @type {any} */ err) {
      yapi.commons.log(err, 'error');
    }
  }



  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async delCat(ctx) {
    try {
      let id = ctx.request.body.catid;
      let catData = await this.catModel.get(id);
      if (!catData) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的分类'));
      }

      if (catData.uid !== this.getUid()) {
        let auth = await this.checkAuth(catData.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了分类 "${
          catData.name
        }" 及该分类下的接口`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: catData.project_id
      });

      let allCats = await this.catModel.list(catData.project_id);
      let catIds = [id];
      for (let i = 0; i < catIds.length; i++) {
        allCats.forEach((/** @type {any} */ cat) => {
          if (cat.parent_id === catIds[i]) catIds.push(cat._id);
        });
      }
      // 先批量读取待删除分类下的接口，避免每个分类单独查询接口。
      const interfacesByCatid = await this.Model.listByCatids(catIds);
      /** @type {any} */
      const interfaceGroups = {};
      interfacesByCatid.forEach((/** @type {any} */ item) => {
        if (!interfaceGroups[item.catid]) interfaceGroups[item.catid] = [];
        interfaceGroups[item.catid].push(item);
      });
      /** @type {any[]} */
      let interfaceData = [];
      for (const catId of catIds) {
        interfaceData = interfaceData.concat(interfaceGroups[catId] || []);
        await this.catModel.del(catId);
        await this.Model.delByCatid(catId);
      }
      clearProjectCategoryCache(catData.project_id);
      for (const item of interfaceData) {
        yapi.emitHook('interface_del', item._id).then();
        await this.caseModel.delByInterfaceId(item._id);
      }
      let r = { deletedCategories: catIds.length, deletedInterfaces: interfaceData.length };
      return (ctx.body = yapi.commons.resReturn(r));
    } catch (/** @type {any} */ e) {
      // 删除分类失败时必须写回响应，避免请求悬挂或误返回成功。
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 获取分类列表
   * @interface /interface/getCatMenu
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @returns {Object}
   * @example ./api/interface/getCatMenu
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async getCatMenu(ctx) {
    let project_id = ctx.params.project_id;

    if (!project_id || isNaN(project_id)) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    try {
      let project = await this.projectModel.getBaseInfo(project_id);
      if (!project) {
        return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
      }
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      const cacheKey = 'menu:' + project_id;
      const cached = categoryCache.get(cacheKey);
      if (cached) return (ctx.body = yapi.commons.resReturn(cached));
      let res = await this.catModel.list(project_id);
      const menu = res.map((/** @type {any} */ item) => item.toObject());
      categoryCache.set(cacheKey, menu);
      return (ctx.body = yapi.commons.resReturn(menu));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 获取树形接口分类
   * @interface /interface/get_cat_tree
   * @method GET
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async getCatTree(ctx) {
    let project_id = ctx.params.project_id;
    if (!project_id || isNaN(project_id)) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    try {
      let project = await this.projectModel.getBaseInfo(project_id);
      if (!project) {
        return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
      }
      if (project.project_type === 'private' && (await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
      const cacheKey = 'tree:' + project_id;
      const cached = categoryCache.get(cacheKey);
      if (cached) return (ctx.body = yapi.commons.resReturn(cached));
      let res = await this.catModel.list(project_id);
      // 分类和接口分别查询一次，再统一挂载接口，保持原有返回结构。
      let interfaces = await this.Model.listByProjectIdForMenu(project_id);
      let categories = attachInterfacesToCategories(res, interfaces);
      const tree = buildCategoryTree(categories);
      categoryCache.set(cacheKey, tree);
      return (ctx.body = yapi.commons.resReturn(tree));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 获取自定义接口字段数据
   * @interface /interface/get_custom_field
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {String}   app_code = '111'
   * @returns {Object}
   *
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async getCustomField(ctx) {
    let params = ctx.request.query;

    if (Object.keys(params).length !== 1) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '参数数量错误'));
    }
    let customFieldName = Object.keys(params)[0];
    let customFieldValue = params[customFieldName];

    try {
      //  查找有customFieldName的分组（group）
      let groups = await this.groupModel.getcustomFieldName(customFieldName);
      if (groups.length === 0) {
        return (ctx.body = yapi.commons.resReturn(null, 404, '没有找到对应自定义接口'));
      }

      // 先并行读取分组下的项目，再批量读取项目接口，避免项目循环产生 N+1 查询。
      const projectGroups = await Promise.all(
        groups.map((/** @type {any} */ group) => this.projectModel.list(group._id))
      );
      /** @type {any[]} */
      const projects = [].concat(...projectGroups);
      const projectIds = projects.map(project => project._id);
      const interfaceList = await this.Model.getcustomFieldValueByProjectIds(
        projectIds,
        customFieldValue
      );
      /** @type {any} */
      const interfacesByProject = {};
      interfaceList.forEach((/** @type {any} */ item) => {
        if (!interfacesByProject[item.project_id]) interfacesByProject[item.project_id] = [];
        interfacesByProject[item.project_id].push(item);
      });

      /** @type {any[]} */
      let interfaces = [];
      projects.forEach(project => {
        let inter = interfacesByProject[project._id] || [];
        if (inter.length === 0) return;
        inter = inter.map((/** @type {any} */ item) => {
          item = item.toObject();
          // project_id 只用于批量结果归组，移除后保持原接口明细字段不变。
          delete item.project_id;
          item.res_body = yapi.commons.json_parse(item.res_body);
          item.req_body_other = yapi.commons.json_parse(item.req_body_other);
          return item;
        });
        interfaces.push({
          project_name: project.name,
          project_id: project._id,
          list: inter
        });
      });
      return (ctx.body = yapi.commons.resReturn(interfaces));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

  /**
   * @param {any} params 排序参数数组
   * @returns {any}
   */
  requiredSort(params) {
    return params.sort((/** @type {any} */ item1, /** @type {any} */ item2) => {
      return item2.required - item1.required;
    });
  }

  /**
   * 更新多个接口case index
   * @interface /interface/up_index
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Array}  idIndexList [id, index]
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async upIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组'));
      }
      const interfaces = await Promise.all(
        params.filter(item => item && item.id).map(item => this.Model.get(item.id))
      );
      for (const interfaceData of interfaces) {
        if (!interfaceData || (await this.checkAuth(interfaceData.project_id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }
      categoryCache.clear();
      params.forEach((/** @type {any} */ item) => {
        if (item.id) {
          this.Model.upIndex(item.id, item.index).then(
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
   * 更新多个接口cat index
   * @interface /interface/up_cat_index
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Array}  idIndexList [id, index]
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async upCatIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组'));
      }
      const categories = await Promise.all(
        params.filter(item => item && item.id !== undefined).map(item => this.catModel.get(item.id))
      );
      for (const category of categories) {
        if (!category || (await this.checkAuth(category.project_id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }
      await Promise.all(
        params
          .filter(item => item && item.id !== undefined)
          .map(item => this.catModel.upCatIndex(item.id, item.index))
      );
      // 等待所有排序更新完成后再清理缓存，避免前端刷新时读到旧顺序。
      categoryCache.clear();

      return (ctx.body = yapi.commons.resReturn('成功！'));
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async schema2json(ctx) {
    let schema = ctx.request.body.schema;
    let required = ctx.request.body.required;

    let res = await yapi.commons.schemaToJson(schema, {
      alwaysFakeOptionals: required === undefined ? true : required
    });
    // console.log('res',res)
    return (ctx.body = res);
  }

}

// 方法组模块通过原型合并挂载（P9b God file 拆分试点）：
// controller 方法名与路由挂载保持不变，this 在调用时由控制器实例注入。
Object.assign(interfaceController.prototype, require('./interface/saveMethods.js'));
Object.assign(interfaceController.prototype, require('./interface/upMethods.js'));
Object.assign(interfaceController.prototype, require('./interface/categoryMethods.js'));
Object.assign(interfaceController.prototype, require('./interface/listMethods.js'));

module.exports = interfaceController;

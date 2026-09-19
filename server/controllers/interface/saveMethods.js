// @ts-check
/**
 * 接口新增方法组：接口新增（add）与项目标签自动注册（autoAddTag）。
 * 由 interface.js 通过 Object.assign 合并到 interfaceController.prototype（P9b God file 拆分试点）。
 * 约束：this 由控制器实例调用时注入（原型合并模式）；各函数体自 interface.js 原样搬移、逐字节不变，
 *       仅在 JSDoc 补充 this 标注（纯注释，不影响运行时）。
 */
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const url = requireAny('url');
const yapi = requireAny('../../yapi.js');
const handleHeaders = require('../../utils/interfaceNormalizer.js');
const clearProjectCategoryCache = require('./cacheHelper.js');

  /**
   * 添加项目分组
   * @interface /interface/add
   * @method POST
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
   * @example ./api/interface/add.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function add(ctx) {
    let params = ctx.params;

    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(params.project_id, 'project', 'edit');

      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }
    params.method = params.method || 'GET';
    params.res_body_is_json_schema = params.res_body_is_json_schema === undefined
      ? false
      : params.res_body_is_json_schema;
    params.req_body_is_json_schema = params.req_body_is_json_schema === undefined
      ? false
      : params.req_body_is_json_schema;
    params.method = params.method.toUpperCase();
    params.req_params = params.req_params || [];
    params.res_body_type = params.res_body_type ? params.res_body_type.toLowerCase() : 'json';
    let http_path = url.parse(params.path, true);

    if (!yapi.commons.verifyPath(http_path.pathname)) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
      ));
    }

    handleHeaders(params)

    params.query_path = {};
    params.query_path.path = http_path.pathname;
    params.query_path.params = [];
    Object.keys(http_path.query).forEach(item => {
      params.query_path.params.push({
        name: item,
        value: http_path.query[item]
      });
    });

    let checkRepeat = await this.Model.checkRepeat(params.project_id, params.path, params.method);

    if (checkRepeat > 0) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        40022,
        '已存在的接口:' + params.path + '[' + params.method + ']'
      ));
    }

    let data = Object.assign(params, {
      uid: this.getUid(),
      add_time: yapi.commons.time(),
      up_time: yapi.commons.time()
    });

    yapi.commons.handleVarPath(params.path, params.req_params);

    if (params.req_params.length > 0) {
      data.type = 'var';
      data.req_params = params.req_params;
    } else {
      data.type = 'static';
    }

    // 新建接口的人成为项目dev  如果不存在的话
    // 命令行导入时无法获知导入接口人的信息，其uid 为 999999
    let uid = this.getUid();

    if (this.getRole() !== 'admin' && uid !== 999999) {
      let userdata = await yapi.commons.getUserdata(uid, 'dev');
      // 检查一下是否有这个人
      let check = await this.projectModel.checkMemberRepeat(params.project_id, uid);
      if (check === 0 && userdata) {
        await this.projectModel.addMember(params.project_id, [userdata]);
      }
    }

    let result = await this.Model.save(data);
    clearProjectCategoryCache(params.project_id);
    yapi.emitHook('interface_add', result).then();
    this.catModel.get(params.catid).then((/** @type {any} */ cate) => {
      if (!cate) return;
      let username = this.getUsername();
      let title = `<a href="/user/profile/${this.getUid()}">${username}</a> 为分类 <a href="/project/${
        params.project_id
      }/interface/api/cat_${params.catid}">${cate.name}</a> 添加了接口 <a href="/project/${
        params.project_id
      }/interface/api/${result._id}">${data.title}</a> `;

      yapi.commons.saveLog({
        content: title,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.project_id
      });
      this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).catch((/** @type {any} */ err) => {
        yapi.commons.log(err, 'error');
      });
    }).catch((/** @type {any} */ err) => {
      // 日志分类读取失败不能影响接口新增结果。
      yapi.commons.log(err, 'error');
    });

    await this.autoAddTag(params);

    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * @this {any}
   * @param {any} params 接口保存参数
   * @returns {Promise<any>}
   */
  async function autoAddTag(params) {
    //检查是否提交了目前不存在的tag
    let tags = params.tag;
    if (tags && Array.isArray(tags) && tags.length > 0) {
      let projectData = await this.projectModel.get(params.project_id);
      if (!projectData) return;
      let tagsInProject = projectData.tag;
      let needUpdate = false;
      if (tagsInProject && Array.isArray(tagsInProject) && tagsInProject.length > 0) {
        tags.forEach(tag => {
          if (!tagsInProject.find((/** @type {any} */ item) => {
            return item.name === tag;
          })) {//tag不存在
            needUpdate = true;
            tagsInProject.push({
              name: tag,
              desc: tag
            });
          }
        });
      } else {
        needUpdate = true
        tagsInProject = []
        tags.forEach(tag => {
          tagsInProject.push({
            name: tag,
            desc: tag
          });
        });
      }
      if (needUpdate) {//需要更新tag
        let data = {
          tag: tagsInProject,
          up_time: yapi.commons.time()
        };
        await this.projectModel.up(params.project_id, data);
      }
    }
  }

module.exports = {
  add,
  autoAddTag
};

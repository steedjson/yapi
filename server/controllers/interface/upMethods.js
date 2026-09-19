// @ts-check
/**
 * 接口更新方法组：接口更新（up）、更新日志与邮件通知、差异视图渲染（diffHTML），并持有 diffCssCache 进程内缓存。
 * 由 interface.js 通过 Object.assign 合并到 interfaceController.prototype（P9b God file 拆分试点）。
 * 约束：this 由控制器实例调用时注入（原型合并模式）；各函数体自 interface.js 原样搬移、逐字节不变，
 *       仅在 JSDoc 补充 this 标注（纯注释，不影响运行时）。
 */
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const jsondiffpatch = requireAny('jsondiffpatch');
const formattersHtml = jsondiffpatch.formatters && jsondiffpatch.formatters.html;
const showDiffMsg = requireAny('../../../common/diff-view.js');
const fs = requireAny('fs-extra');
const path = requireAny('path');
const url = requireAny('url');
const yapi = requireAny('../../yapi.js');
const handleHeaders = require('../../utils/interfaceNormalizer.js');
const clearProjectCategoryCache = require('./cacheHelper.js');
const escapeHtml = require('../../utils/escapeHtml.js');

// diff 通知邮件所需的两个 CSS 内容固定不变，进程内缓存避免每次保存接口都同步读盘。
/** @type {{ annotatedCss: string, htmlCss: string } | null} */
let diffCssCache = null;
// const annotatedCss = require("jsondiffpatch/public/formatters-styles/annotated.css");
// const htmlCss = require("jsondiffpatch/public/formatters-styles/html.css");

  /**
   * 编辑接口
   * @interface /interface/up
   * @method POST
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @param {String}   [path] 接口请求路径
   * @param {String}   [method] 请求方式
   * @param {Array}  [req_headers] 请求的header信息
   * @param {String}  [req_headers[].name] 请求的header信息名
   * @param {String}  [req_headers[].value] 请求的header信息值
   * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
   * @param {String}  [req_headers[].desc] header描述
   * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
   * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
   * @param {String} [req_body_form[].name] 请求参数名
   * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
   * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
   * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
   * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
   * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
   * @param  {String} [desc] 接口描述
   * @returns {Object}
   * @example ./api/interface/up.json
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function up(ctx) {
    let params = ctx.params;

    if (params.method !== undefined) {
      params.method = params.method || 'GET';
      params.method = params.method.toUpperCase();
    }

    let id = params.id;
    params.message = params.message || '';
    params.message = params.message.replace(/\n/g, '<br>');
    // params.res_body_is_json_schema = _.isUndefined (params.res_body_is_json_schema) ? true : params.res_body_is_json_schema;
    // params.req_body_is_json_schema = _.isUndefined(params.req_body_is_json_schema) ?  true : params.req_body_is_json_schema;

    handleHeaders(params)

    let interfaceData = await this.Model.get(id);
    if (!interfaceData) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的接口'));
    }
    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }
    }

    let data = Object.assign(
      {
        up_time: yapi.commons.time()
      },
      params
    );

    if (params.path) {
      let http_path;
      http_path = url.parse(params.path, true);

      if (!yapi.commons.verifyPath(http_path.pathname)) {
        return (ctx.body = yapi.commons.resReturn(
          null,
          400,
          'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
        ));
      }
      params.query_path = {};
      params.query_path.path = http_path.pathname;
      params.query_path.params = [];
      Object.keys(http_path.query).forEach(item => {
        params.query_path.params.push({
          name: item,
          value: http_path.query[item]
        });
      });
      data.query_path = params.query_path;
    }

    if (
      params.path &&
      (params.path !== interfaceData.path || params.method !== interfaceData.method)
    ) {
      let checkRepeat = await this.Model.checkRepeat(
        interfaceData.project_id,
        params.path,
        params.method
      );
      if (checkRepeat > 0) {
        return (ctx.body = yapi.commons.resReturn(
          null,
          401,
          '已存在的接口:' + params.path + '[' + params.method + ']'
        ));
      }
    }

    if (data.req_params !== undefined) {
      if (Array.isArray(data.req_params) && data.req_params.length > 0) {
        data.type = 'var';
      } else {
        data.type = 'static';
        data.req_params = [];
      }
    }
    let result = await this.Model.up(id, data);
    clearProjectCategoryCache(interfaceData.project_id);
    let username = this.getUsername();
    let CurrentInterfaceData;
    try {
      CurrentInterfaceData = await this.Model.get(id);
    } catch (/** @type {any} */ err) {
      yapi.commons.log(err, 'error');
    }
    // 更新已经完成时，读取日志快照失败不能再把成功保存误报成失败。
    if (!CurrentInterfaceData) {
      CurrentInterfaceData = Object.assign({}, interfaceData.toObject(), data);
    }
    // 查询结果可能是 Mongoose 文档，也可能是保存成功后的普通对象，统一转换为日志快照。
    const currentData =
      typeof CurrentInterfaceData.toObject === 'function'
        ? CurrentInterfaceData.toObject()
        : CurrentInterfaceData;
    let logData = {
      interface_id: id,
      cat_id: data.catid,
      current: currentData,
      old: interfaceData.toObject()
    };

    this.catModel.get(interfaceData.catid).then((/** @type {any} */ cate) => {
      if (!cate) return;
      try {
        let diffView2 = showDiffMsg(jsondiffpatch, formattersHtml, logData);
        if (diffView2.length <= 0) {
          return; // 没有变化时，不写日志
        }
        yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 
                    更新了分类 <a href="/project/${cate.project_id}/interface/api/cat_${
          data.catid
        }">${cate.name}</a> 
                    下的接口 <a href="/project/${cate.project_id}/interface/api/${id}">${
          interfaceData.title
        }</a><p>${params.message}</p>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: cate.project_id,
          data: logData
        });
      } catch (/** @type {any} */ err) {
        yapi.commons.log(err, 'error');
      }
    }).catch((/** @type {any} */ err) => {
      // 日志分类读取失败不能影响已经完成的接口保存，同时记录异常便于排查。
      yapi.commons.log(err, 'error');
    });

    this.projectModel.up(interfaceData.project_id, { up_time: new Date().getTime() }).catch((/** @type {any} */ err) => {
      yapi.commons.log(err, 'error');
    });
    if (params.switch_notice === true) {
      let diffView = showDiffMsg(jsondiffpatch, formattersHtml, logData);
      if (!diffCssCache) {
        diffCssCache = {
          annotatedCss: fs.readFileSync(
            path.resolve(
              yapi.WEBROOT,
              'node_modules/jsondiffpatch/dist/formatters-styles/annotated.css'
            ),
            'utf8'
          ),
          htmlCss: fs.readFileSync(
            path.resolve(yapi.WEBROOT, 'node_modules/jsondiffpatch/dist/formatters-styles/html.css'),
            'utf8'
          )
        };
      }
      let { annotatedCss, htmlCss } = diffCssCache;

      let project = await this.projectModel.getBaseInfo(interfaceData.project_id);

      let interfaceUrl = `${ctx.request.origin}/project/${
        interfaceData.project_id
      }/interface/api/${id}`;

      // 邮件 HTML 正文中的用户可控字段(用户名/接口名/路径/方法)统一转义, 阻断存储型 HTML 注入;
      // title 为纯文本邮件主题, 不转义; interfaceUrl 由 origin 与内部数字 id 拼接, 无需转义。
      const safeUsername = escapeHtml(username);
      const safeTitle = escapeHtml(data.title);
      const safeMethod = escapeHtml(data.method);
      const safePath = escapeHtml(data.path);

      yapi.commons.sendNotice(interfaceData.project_id, {
        title: `${username} 更新了接口`,
        content: `<html>
        <head>
        <style>
        ${annotatedCss}
        ${htmlCss}
        </style>
        </head>
        <body>
        <div><h3>${safeUsername}更新了接口(${safeTitle})</h3>
        <p>项目名：${escapeHtml(project.name)} </p>
        <p>修改用户: ${safeUsername}</p>
        <p>接口名: <a href="${interfaceUrl}">${safeTitle}</a></p>
        <p>接口路径: [${safeMethod}]${safePath}</p>
        <p>详细改动日志: ${this.diffHTML(diffView)}</p></div>
        </body>
        </html>`
      });
    }

    yapi.emitHook('interface_update', id).then();
    await this.autoAddTag(params);

    ctx.body = yapi.commons.resReturn(result);
    return 1;
  }

  /**
   * @param {any} html 差异视图数据
   * @returns {any}
   */
  function diffHTML(html) {
    if (html.length === 0) {
      return `<span style="color: #555">没有改动，该操作未改动Api数据</span>`;
    }

    return html.map((/** @type {any} */ item) => {
      return `<div>
      <h4 class="title">${item.title}</h4>
      <div>${item.content}</div>
    </div>`;
    });
  }

module.exports = {
  up,
  diffHTML
};

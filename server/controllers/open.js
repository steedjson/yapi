// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const projectModel = requireAny('../models/project.js');
const interfaceColModel = requireAny('../models/interfaceCol.js');
const interfaceCaseModel = requireAny('../models/interfaceCase.js');
const interfaceModel = requireAny('../models/interface.js');
const interfaceCatModel = requireAny('../models/interfaceCat.js');
const followModel = requireAny('../models/follow.js');
const userModel = requireAny('../models/user.js');
const yapi = requireAny('../yapi.js');
const baseController = require('./base.js');
const {
  handleParams,
  crossRequest,
  handleCurrDomain,
  checkNameIsExistInArray
} = requireAny('../../common/postmanLib');
const { handleParamsValue, ArrayToObject } = requireAny('../../common/utils.js');
const renderToHtml = require('../utils/reportHtml');
const axios = requireAny('axios');
const HanldeImportData = requireAny('../../common/HandleImportData');
const _ = require('underscore');
const createContex = require('../../common/createContext')

/**
 * {
 *    postman: require('./m')
 * }
 */
const importDataModule = /** @type {any} */ ({});
yapi.emitHook('import_data', importDataModule);

class openController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.projectModel = yapi.getInst(projectModel);
    this.interfaceColModel = yapi.getInst(interfaceColModel);
    this.interfaceCaseModel = yapi.getInst(interfaceCaseModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
    this.interfaceCatModel = yapi.getInst(interfaceCatModel);
    this.followModel = yapi.getInst(followModel);
    this.userModel = yapi.getInst(userModel);
    this.handleValue = this.handleValue.bind(this);
    this.schemaMap = {
      runAutoTest: {
        '*id': 'number',
        project_id: 'string',
        token: 'string',
        mode: {
          type: 'string',
          default: 'html'
        },
        email: {
          type: 'boolean',
          default: false
        },
        download: {
          type: 'boolean',
          default: false
        },
        closeRemoveAdditional: true
      },
      importData: {
        '*type': 'string',
        url: 'string',
        '*token': 'string',
        json: 'string',
        project_id: 'string',
        merge: {
          type: 'string',
          default: 'normal'
        }
      }
    };
  }

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async importData(ctx) {
    let type = ctx.params.type;
    let content = ctx.params.json;
    let project_id = ctx.params.project_id;
    let dataSync = ctx.params.merge;

    let warnMessage = ''

    /**
     * 因为以前接口文档写错了，做下兼容
     */
    try{
      if(!dataSync &&ctx.params.dataSync){
        warnMessage = 'importData Api 已废弃 dataSync 传参，请联系管理员将 dataSync 改为 merge.'
        dataSync = ctx.params.dataSync
      }
    }catch(/** @type {any} */ e){}

    let token = ctx.params.token;
    if (!type || !importDataModule[type]) {
      return (ctx.body = yapi.commons.resReturn(null, 40022, '不存在的导入方式'));
    }

    if (!content && !ctx.params.url) {
      return (ctx.body = yapi.commons.resReturn(null, 40022, 'json 或者 url 参数，不能都为空'));
    }
    try {
      let request = requireAny("request");// let Promise = require('Promise');
      let syncGet = function (/** @type {any} */ url){
          return new Promise(function(resolve, reject){
              request.get({url : url}, function(/** @type {any} */ error, /** @type {any} */ response, /** @type {any} */ body){
                  if(error){
                      reject(error);
                  }else{
                      resolve(body);
                  }
              });
          });
      }
      if(ctx.params.url){
        content = await syncGet(ctx.params.url);
      }else if(content.indexOf('http://') === 0 || content.indexOf('https://') === 0){
        content = await syncGet(content);
      }
      content = JSON.parse(content);
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 40022, 'json 格式有误:' + e));
    }

    let menuList = await this.interfaceCatModel.list(project_id);
    /**
     * 防止分类被都被删除时取不到 selectCatid
     * 如果没有分类,增加一个默认分类
     */
    if (menuList.length === 0) {
      const catInst = yapi.getInst(interfaceCatModel);
      const menu = await catInst.save({
        name: '默认分类',
        project_id: project_id,
        desc: '默认分类',
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });
      menuList.push(menu);
    }
    let selectCatid = menuList[0]._id;
    let projectData = await this.projectModel.get(project_id);
    let res = await importDataModule[type](content);

    let successMessage;
    let errorMessage = /** @type {any[]} */ ([]);
    await HanldeImportData(
      res,
      project_id,
      selectCatid,
      menuList,
      projectData.basePath,
      dataSync,
      (/** @type {any} */ err) => {
        errorMessage.push(err);
      },
      (/** @type {any} */ msg) => {
        successMessage = msg;
      },
      () => {},
      token,
      yapi.WEBCONFIG.port
    );

    if (errorMessage.length > 0) {
      return (ctx.body = yapi.commons.resReturn(null, 404, errorMessage.join('\n')));
    }
    ctx.body = yapi.commons.resReturn(null, 0, successMessage + warnMessage);
  }

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async projectInterfaceData(ctx) {
    ctx.body = 'projectInterfaceData';
  }

  /**
   * @param {any} val
   * @param {any} global
   * @returns {any}
   */
  handleValue(val, global) {
    let globalValue = ArrayToObject(global);
    let context = Object.assign({}, {global: globalValue}, this.records);
    return handleParamsValue(val, context);
  }

  /**
   * @param {any} params
   * @returns {any[]}
   */
  handleEvnParams(params) {
    let result = /** @type {any[]} */ ([]);
    Object.keys(params).map(item => {
      if (/env_/gi.test(item)) {
        let curEnv = yapi.commons.trim(params[item]);
        let value = { curEnv, project_id: item.split('_')[1] };
        result.push(value);
      }
    });
    return result;
  }

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async runAutoTest(ctx) {
    if (!this.$tokenAuth) {
      return (ctx.body = yapi.commons.resReturn(null, 40022, 'token 验证失败'));
    }
    // console.log(1231312)
    const token = ctx.query.token;

    const projectId = ctx.params.project_id;
    const startTime = new Date().getTime();
    const records = (this.records = /** @type {any} */ ({}));
    const reports = (this.reports = /** @type {any} */ ({}));
    const testList = [];
    let id = ctx.params.id;
    let curEnvList = this.handleEvnParams(ctx.params);

    let colData = await this.interfaceColModel.get(id);
    if (!colData) {
      return (ctx.body = yapi.commons.resReturn(null, 40022, 'id值不存在'));
    }

    let projectData = await this.projectModel.get(projectId);

    let caseList = await yapi.commons.getCaseList(id);
    if (caseList.errcode !== 0) {
      ctx.body = caseList;
    }
    caseList = caseList.data;
    for (let i = 0, l = caseList.length; i < l; i++) {
      let item = caseList[i];
      let projectEvn = await this.projectModel.getByEnv(item.project_id);

      item.id = item._id;
      let curEnvItem = _.find(curEnvList, key => {
        return key.project_id == item.project_id;
      });

      item.case_env = curEnvItem ? curEnvItem.curEnv || item.case_env : item.case_env;
      item.req_headers = this.handleReqHeader(item.req_headers, projectEvn.env, item.case_env);
      item.pre_script = projectData.pre_script;
      item.after_script = projectData.after_script;
      item.env = projectEvn.env;
      let result;
      // console.log('item',item.case_env)
      try {
        result = await this.handleTest(item);
      } catch (/** @type {any} */ err) {
        result = err;
      }

      reports[item.id] = result;
      records[item.id] = {
        params: result.params,
        body: result.res_body
      };
      testList.push(result);
    }

    function getMessage(/** @type {any[]} */ testList) {
      let successNum = 0,
        failedNum = 0,
        len = 0,
        msg = '';
      testList.forEach(item => {
        len++;
        if (item.code === 0) {
          successNum++;
        }
        else {
          failedNum++;
        }
      });
      if (failedNum === 0) {
        msg = `一共 ${len} 测试用例，全部验证通过`;
      } else {
        msg = `一共 ${len} 测试用例，${successNum} 个验证通过， ${failedNum} 个未通过。`;
      }

      return { msg, len, successNum, failedNum };
    }

    const endTime = new Date().getTime();
    const executionTime = (endTime - startTime) / 1000;

    let reportsResult = {
      message: getMessage(testList),
      runTime: executionTime + 's',
      numbs: testList.length,
      list: testList
    };

    if (ctx.params.email === true && reportsResult.message.failedNum !== 0) {
      let autoTestUrl = `${
        ctx.request.origin
      }/api/open/run_auto_test?id=${id}&token=${token}&mode=${ctx.params.mode}`;
      yapi.commons.sendNotice(projectId, {
        title: `YApi自动化测试报告`,
        content: `
        <html>
        <head>
        <title>测试报告</title>
        <meta charset="utf-8" />
        <body>
        <div>
        <h3>测试结果：</h3>
        <p>${reportsResult.message.msg}</p>
        <h3>测试结果详情如下：</h3>
        <p>${autoTestUrl}</p>
        </div>
        </body>
        </html>`
      });
    }
    let mode = ctx.params.mode || 'html';
    if(ctx.params.download === true) {
      ctx.set('Content-Disposition', `attachment; filename=test.${mode}`);
    }
    if (ctx.params.mode === 'json') {
      return (ctx.body = reportsResult);
    } else {
      return (ctx.body = renderToHtml(reportsResult));
    }
  }

  /**
   * @param {any} interfaceData
   * @returns {Promise<any>}
   */
  async handleTest(interfaceData) {
    let requestParams = {};
    let options;
    options = handleParams(interfaceData, this.handleValue, requestParams);
    let result = /** @type {any} */ ({
      id: interfaceData.id,
      name: interfaceData.casename,
      path: interfaceData.path,
      code: 400,
      validRes: []
    });
    try {
      options.taskId = this.getUid();
      let data = await crossRequest(options, interfaceData.pre_script, interfaceData.after_script,createContex(
        this.getUid(),
        interfaceData.project_id,
        interfaceData.interface_id
      ));
      let res = data.res;

      result = Object.assign(result, {
        status: res.status,
        statusText: res.statusText,
        url: data.req.url,
        method: data.req.method,
        data: data.req.data,
        headers: data.req.headers,
        res_header: res.header,
        res_body: res.body
      });
      if (options.data && typeof options.data === 'object') {
        requestParams = Object.assign(requestParams, options.data);
      }

      let validRes = /** @type {any[]} */ ([]);

      let responseData = Object.assign(
        {},
        {
          status: res.status,
          body: res.body,
          header: res.header,
          statusText: res.statusText
        }
      );

      await this.handleScriptTest(interfaceData, responseData, validRes, requestParams);
      result.params = requestParams;
      if (validRes.length === 0) {
        result.code = 0;
        result.validRes = [{ message: '验证通过' }];
      } else if (validRes.length > 0) {
        result.code = 1;
        result.validRes = validRes;
      }
    } catch (/** @type {any} */ data) {
      result = Object.assign(options, result, {
        res_header: data.header,
        res_body: data.body || data.message,
        status: null,
        statusText: data.message,
        code: 400
      });
    }

    return result;
  }

  /**
   * @param {any} interfaceData
   * @param {any} response
   * @param {any[]} validRes
   * @param {any} requestParams
   * @returns {Promise<any>}
   */
  async handleScriptTest(interfaceData, response, validRes, requestParams) {

    try {
      let test = await yapi.commons.runCaseScript({
        response: response,
        records: this.records,
        script: interfaceData.test_script,
        params: requestParams
      }, interfaceData.col_id, interfaceData.interface_id, this.getUid());
      if (test.errcode !== 0) {
        test.data.logs.forEach((/** @type {any} */ item) => {
          validRes.push({
            message: item
          });
        });
      }
    } catch (/** @type {any} */ err) {
      validRes.push({
        message: 'Error: ' + err.message
      });
    }
  }

  /**
   * @param {any[]} req_header
   * @param {any} envData
   * @param {any} curEnvName
   * @returns {any[]}
   */
  handleReqHeader(req_header, envData, curEnvName) {
    let currDomain = handleCurrDomain(envData, curEnvName);

    req_header = (Array.isArray(req_header) ? req_header : []).filter(item => {
      return item && typeof item === 'object';
    });
    let header = currDomain.header || [];
    header.forEach((/** @type {any} */ item) => {
      if (!checkNameIsExistInArray(item.name, req_header)) {
        item.abled = true;
        req_header.push(item);
      }
    });
    req_header = req_header.filter(item => {
      return item && typeof item === 'object';
    });
    return req_header;
  }
}

module.exports = openController;

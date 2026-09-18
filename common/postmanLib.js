// @ts-check
const { isJson5, json_parse, handleJson, joinPath, safeArray } = require('./utils');
const constants = require('../client/constants/variable.js');
// underscore 仅用于沙箱脚本 utils._ 公开 API(YApi 文档承诺), 内部代码禁用 underscore
const _ = require('underscore');
const URL = require('url');
const utils = require('./power-string.js').utils;
/** @type {Record<string, any>} */
const HTTP_METHOD = constants.HTTP_METHOD;
const axios = /** @type {any} */ (require('axios'));
const qs = require('qs');
const CryptoJS = require('crypto-js');
const jsrsasign = require('jsrsasign');
const https = require('https');

const isNode = typeof global == 'object' && global.global === global;
/** @type {Record<string, string>} */
const ContentTypeMap = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/html': 'html',
  'text/html': 'html',
  other: 'text'
};

/**
 * 按 taskId 获取存储对象（Node 侧走 storageCreator，浏览器侧走 localStorage）
 * @param {any} id 任务 id
 * @returns {Promise<any>}
 */
const getStorage = async (id)=>{
  try{
    if(isNode){
      let storage = (/** @type {*} */ (global)).storageCreator(id);
      let data = await storage.getItem();
      return {
        getItem: (/** @type {any} */ name)=> data[name],
        setItem: (/** @type {any} */ name, /** @type {any} */ value)=>{
          data[name] = value;
          storage.setItem(name, value)
        }
      }
    }else{
      return {
        getItem: (/** @type {any} */ name)=> window.localStorage.getItem(name),
        setItem: (/** @type {any} */ name, /** @type {any} */ value)=>  window.localStorage.setItem(name, value)
      }
    }
  }catch(e){
    console.error(e)
    return {
      getItem: (/** @type {any} */ name)=>{
        console.error(name, e)
      },
      setItem: (/** @type {any} */ name, /** @type {any} */ value)=>{
        console.error(name, value, e)
      }
    }
  }
}

/**
 * Node 环境下通过 axios 发送请求并归一化响应结构
 * @param {any} options 请求配置
 * @returns {Promise<any>} 归一化后的 { res: { header, status, body } } 结构
 */
async function httpRequestByNode(options) {
  /**
   * @param {any} response
   * @returns {any}
   */
  function handleRes(response) {
    if (!response || typeof response !== 'object') {
      return {
        res: {
          status: 500,
          body: isNode
            ? '请求出错, 内网服务器自动化测试无法访问到，请检查是否为内网服务器！'
            : '请求出错'
        }
      };
    }
    return {
      res: {
        header: response.headers,
        status: response.status,
        body: response.data
      }
    };
  }

  function handleData() {
    let contentTypeItem;
    if (!options) return;
    if (typeof options.headers === 'object' && options.headers) {
      Object.keys(options.headers).forEach(key => {
        if (/content-type/i.test(key)) {
          if (options.headers[key]) {
            contentTypeItem = options.headers[key]
              .split(';')[0]
              .trim()
              .toLowerCase();
          }
        }
        if (!options.headers[key]) delete options.headers[key];
      });

      if (
        contentTypeItem === 'application/x-www-form-urlencoded' &&
        typeof options.data === 'object' &&
        options.data
      ) {
        options.data = qs.stringify(options.data);
      }
    }
  }

  try {
    (/** @type {*} */ (handleData))(options);
    let response = await axios({
      method: options.method,
      url: options.url,
      headers: options.headers,
      timeout: 10000,
      maxRedirects: 0,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      data: options.data
    });
    return handleRes(response);
  } catch (/** @type {any} */ err) {
    if (err.response === undefined) {
      return handleRes({
        headers: {},
        status: null,
        data: err.message
      });
    }
    return handleRes(err.response);
  }
}

/**
 * 根据响应头推断响应体内容类型
 * @param {any} headers 响应头
 * @returns {string} 内容类型标识
 */
function handleContentType(headers) {
  if (!headers || typeof headers !== 'object') return ContentTypeMap.other;
  let contentTypeItem = 'other';
  try {
    Object.keys(headers).forEach(key => {
      if (/content-type/i.test(key)) {
        contentTypeItem = headers[key]
          .split(';')[0]
          .trim()
          .toLowerCase();
      }
    });
    return ContentTypeMap[contentTypeItem] ? ContentTypeMap[contentTypeItem] : ContentTypeMap.other;
  } catch (err) {
    return ContentTypeMap.other;
  }
}

/**
 * 判断请求体是否为 raw 类型
 * @param {any} method 请求方法
 * @param {any} reqBodyType 请求体类型
 * @returns {any} raw 类型时返回 reqBodyType，否则返回 false
 */
function checkRequestBodyIsRaw(method, reqBodyType) {
  if (
    reqBodyType &&
    reqBodyType !== 'file' &&
    reqBodyType !== 'form' &&
    HTTP_METHOD[method].request_body
  ) {
    return reqBodyType;
  }
  return false;
}

/**
 * 判断指定 name 是否已存在于数组中
 * @param {any} name 待检查的名称
 * @param {any} arr 待遍历的数组
 * @returns {boolean} 是否已存在
 */
function checkNameIsExistInArray(name, arr) {
  let isRepeat = false;
  for (let i = 0; i < arr.length; i++) {
    let item = arr[i];
    if (item.name === name) {
      isRepeat = true;
      break;
    }
  }
  return isRepeat;
}

/**
 * 根据环境名挑选当前使用的域名配置
 * @param {any} domains 域名列表
 * @param {any} case_env 环境名称
 * @returns {any} 命中的域名配置
 */
function handleCurrDomain(domains, case_env) {
  let currDomain = domains.find((/** @type {any} */ item) => item.name === case_env);

  if (!currDomain) {
    currDomain = domains[0];
  }
  return currDomain;
}

/**
 * Node 环境沙箱：在 vm 上下文中执行脚本
 * @param {any} sandbox 沙箱上下文对象
 * @param {any} script 待执行脚本
 * @returns {any} 执行后的上下文
 */
function sandboxByNode(sandbox = {}, script) {
  const vm = /** @type {any} */ (require('vm'));
  script = new vm.Script(script);
  const context = new vm.createContext(sandbox);
  script.runInContext(context, {
    timeout: 10000
  });
  return sandbox;
}

/**
 * 沙箱执行脚本（Node 走 vm，浏览器走 eval），并等待脚本产生的 promise
 * @param {any} context 沙箱上下文对象
 * @param {any} script 待执行脚本
 * @returns {Promise<any>} 执行后的上下文
 */
async function sandbox(context = {}, script) {
  if (isNode) {
    try {
      context.context = context;
      context.console = console;
      context.Promise = Promise;
      context.setTimeout = setTimeout;
      context = sandboxByNode(context, script);
    } catch (/** @type {any} */ err) {
      err.message = `Script: ${script}
      message: ${err.message}`;
      throw err;
    }
  } else {
    context = sandboxByBrowser(context, script);
  }
  if (context.promise && typeof context.promise === 'object' && context.promise.then) {
    try {
      await context.promise;
    } catch (/** @type {any} */ err) {
      err.message = `Script: ${script}
      message: ${err.message}`;
      throw err;
    }
  }
  return context;
}

/**
 * 浏览器环境沙箱：将上下文注入全局后 eval 执行脚本
 * @param {any} context 沙箱上下文对象
 * @param {any} script 待执行脚本
 * @returns {any} 执行后的上下文
 */
function sandboxByBrowser(context = {}, script) {
  if (!script || typeof script !== 'string') {
    return context;
  }
  let beginScript = '';
  for (var i in context) {
    beginScript += `var ${i} = context.${i};`;
  }
  try {
    eval(beginScript + script);
  } catch (/** @type {any} */ err) {
    let message = `Script:
                   ----CodeBegin----:
                   ${beginScript}
                   ${script}
                   ----CodeEnd----
                  `;
    err.message = `Script: ${message}
    message: ${err.message}`;

    throw err;
  }
  return context;
}

/**
 * 跨端请求入口：组装沙箱上下文、执行前后置脚本并发送请求
 * @param {any} defaultOptions 请求配置
 * @param {any} preScript 前置脚本
 * @param {any} afterScript 后置脚本
 * @param {Record<string, any>} commonContext 负责传递一些业务信息，crossRequest 不关注具体传什么，只负责当中间人
 * @returns {Promise<any>} 请求结果
 */
async function crossRequest(defaultOptions, preScript, afterScript, commonContext = {}) {
  let options = Object.assign({}, defaultOptions);
  const taskId = options.taskId || Math.random() + '';
  let urlObj = URL.parse(options.url, true),
    query = {};
  query = Object.assign(query, urlObj.query);
  let context = /** @type {Record<string, any>} */ ({
    isNode,
    get href() {
      return urlObj.href;
    },
    set href(val) {
      throw new Error('context.href 不能被赋值');
    },
    get hostname() {
      return urlObj.hostname;
    },
    set hostname(val) {
      throw new Error('context.hostname 不能被赋值');
    },

    get caseId() {
      return options.caseId;
    },

    set caseId(val) {
      throw new Error('context.caseId 不能被赋值');
    },

    method: options.method,
    pathname: urlObj.pathname,
    query: query,
    requestHeader: options.headers || {},
    requestBody: options.data,
    promise: false,
    storage: await getStorage(taskId)
  });

  Object.assign(context, commonContext)

  context.utils = Object.freeze({
    _: _,
    CryptoJS: CryptoJS,
    jsrsasign: jsrsasign,
    base64: utils.base64,
    md5: utils.md5,
    sha1: utils.sha1,
    sha224: utils.sha224,
    sha256: utils.sha256,
    sha384: utils.sha384,
    sha512: utils.sha512,
    unbase64: utils.unbase64,
    axios: axios
  });

  // The browser bundle must not import server/yapi (and its MongoDB/mail dependencies).
  // The value is injected by ykit.config.js at build time.
  const scriptEnable = process.env.scriptEnable === 'true';

  if (preScript && scriptEnable) {
    context = await sandbox(context, preScript);
    defaultOptions.url = options.url = URL.format({
      protocol: urlObj.protocol,
      host: urlObj.host,
      query: context.query,
      pathname: context.pathname
    });
    defaultOptions.headers = options.headers = context.requestHeader;
    defaultOptions.data = options.data = context.requestBody;
  }

  let data;

  if (isNode) {
    data = await httpRequestByNode(options);
    data.req = options;
  } else {
    data = await new Promise((resolve, reject) => {
      options.error = options.success = function(/** @type {any} */ res, /** @type {any} */ header, /** @type {any} */ data) {
        let message = '';
        if (res && typeof res === 'string') {
          res = json_parse(data.res.body);
          data.res.body = res;
        }
        if (!isNode) message = '请求异常，请检查 chrome network 错误信息... https://juejin.im/post/5c888a3e5188257dee0322af 通过该链接查看教程"）';
        if (isNaN(data.res.status)) {
          reject({
            body: res || message,
            header,
            message
          });
        }
        resolve(data);
      };

      (/** @type {any} */ (window)).crossRequest(options);
    });
  }

  if (afterScript && scriptEnable) {
    context.responseData = data.res.body;
    context.responseHeader = data.res.header;
    context.responseStatus = data.res.status;
    context.runTime = data.runTime;
    context = await sandbox(context, afterScript);
    data.res.body = context.responseData;
    data.res.header = context.responseHeader;
    data.res.status = context.responseStatus;
    data.runTime = context.runTime;
  }
  return data;
}

/**
 * 将接口用例数据组装为可执行的请求配置
 * @param {any} interfaceData 接口用例数据
 * @param {any} handleValue 变量替换函数
 * @param {any} requestParams 收集实际请求参数的对象
 * @returns {any} 请求配置
 */
function handleParams(interfaceData, handleValue, requestParams) {
  let interfaceRunData = Object.assign({}, interfaceData);
  /**
   * @param {any} arr
   * @returns {Record<string, any>}
   */
  function paramsToObjectWithEnable(arr) {
    const obj = /** @type {Record<string, any>} */ ({});
    safeArray(arr).forEach(item => {
      if (item && item.name && (item.enable || item.required === '1')) {
        obj[item.name] = handleValue(item.value, currDomain.global);
        if (requestParams) {
          requestParams[item.name] = obj[item.name];
        }
      }
    });
    return obj;
  }

  /**
   * @param {any} arr
   * @returns {Record<string, any>}
   */
  function paramsToObjectUnWithEnable(arr) {
    const obj = /** @type {Record<string, any>} */ ({});
    safeArray(arr).forEach(item => {
      if (item && item.name) {
        obj[item.name] = handleValue(item.value, currDomain.global);
        if (requestParams) {
          requestParams[item.name] = obj[item.name];
        }
      }
    });
    return obj;
  }

  let { case_env, path, env, _id } = interfaceRunData;
  /** @type {any} */ let currDomain,
    requestBody,
    requestOptions = /** @type {Record<string, any>} */ ({});
  currDomain = handleCurrDomain(env, case_env);
  interfaceRunData.req_params = interfaceRunData.req_params || [];
  interfaceRunData.req_params.forEach((/** @type {any} */ item) => {
    let val = handleValue(item.value, currDomain.global);
    if (requestParams) {
      requestParams[item.name] = val;
    }
    path = path.replace(`:${item.name}`, val || `:${item.name}`);
    path = path.replace(`{${item.name}}`, val || `{${item.name}}`);
  });

  const urlObj = URL.parse(joinPath(currDomain.domain, path), true);
  const url = URL.format({
    protocol: urlObj.protocol || 'http',
    host: urlObj.host,
    pathname: urlObj.pathname,
    query: Object.assign(urlObj.query, paramsToObjectWithEnable(interfaceRunData.req_query))
  });

  let headers = paramsToObjectUnWithEnable(interfaceRunData.req_headers);
  requestOptions = {
    url,
    caseId: _id,
    method: interfaceRunData.method,
    headers,
    timeout: 82400000
  };

  // 对 raw 类型的 form 处理
  try {
    if (interfaceRunData.req_body_type === 'raw') {
      if (headers && headers['Content-Type']) {
        if (headers['Content-Type'].indexOf('application/x-www-form-urlencoded') >= 0) {
          interfaceRunData.req_body_type = 'form';
          let reqData = json_parse(interfaceRunData.req_body_other);
          if (reqData && typeof reqData === 'object') {
            interfaceRunData.req_body_form = [];
            Object.keys(reqData).forEach(key => {
              interfaceRunData.req_body_form.push({
                name: key,
                type: 'text',
                value: JSON.stringify(reqData[key]),
                enable: true
              });
            });
          }
        } else if (headers['Content-Type'].indexOf('application/json') >= 0) {
          interfaceRunData.req_body_type = 'json';
        }
      }
    }
  } catch (e) {
    console.error('err', e);
  }

  if (HTTP_METHOD[interfaceRunData.method].request_body) {
    if (interfaceRunData.req_body_type === 'form') {
      requestBody = paramsToObjectWithEnable(
        safeArray(interfaceRunData.req_body_form).filter(item => {
          return item.type == 'text';
        })
      );
    } else if (interfaceRunData.req_body_type === 'json') {
      let reqBody = isJson5(interfaceRunData.req_body_other);
      if (reqBody === false) {
        requestBody = interfaceRunData.req_body_other;
      } else {
        if (requestParams) {
          requestParams = Object.assign(requestParams, reqBody);
        }
        requestBody = handleJson(reqBody, (/** @type {any} */ val) => handleValue(val, currDomain.global));
      }
    } else {
      requestBody = interfaceRunData.req_body_other;
    }
    requestOptions.data = requestBody;
    if (interfaceRunData.req_body_type === 'form') {
      requestOptions.files = paramsToObjectWithEnable(
        safeArray(interfaceRunData.req_body_form).filter(item => {
          return item.type == 'file';
        })
      );
    } else if (interfaceRunData.req_body_type === 'file') {
      requestOptions.file = 'single-file';
    }
  }
  return requestOptions;
}

exports.checkRequestBodyIsRaw = checkRequestBodyIsRaw;
exports.handleParams = handleParams;
exports.handleContentType = handleContentType;
exports.crossRequest = crossRequest;
exports.handleCurrDomain = handleCurrDomain;
exports.checkNameIsExistInArray = checkNameIsExistInArray;

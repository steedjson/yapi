const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const yapi = require('../yapi.js');
const logModel = require('../models/log.js');
const projectModel = require('../models/project.js');
const interfaceColModel = require('../models/interfaceCol.js');
const interfaceCaseModel = require('../models/interfaceCase.js');
const interfaceModel = require('../models/interface.js');
const userModel = require('../models/user.js');
const followModel = require('../models/follow.js');
const json5 = require('json5');
const Ajv = require('ajv-draft-04');
const Mock = require('mockjs');
const sandboxFn = require('./sandbox')



const ejs = require('easy-json-schema');

const jsf = require('json-schema-faker');
const { schemaValidator } = require('../../common/utils');
const http = require('http');

jsf.extend('mock', function () {
  return {
    mock: function (xx) {
      return Mock.mock(xx);
    }
  };
});

const defaultOptions = {
  failOnInvalidTypes: false,
  failOnInvalidFormat: false
};

// formats.forEach(item => {
//   item = item.name;
//   jsf.format(item, () => {
//     if (item === 'mobile') {
//       return jsf.random.randexp('^[1][34578][0-9]{9}$');
//     }
//     return Mock.mock('@' + item);
//   });
// });

exports.schemaToJson = function (schema, options = {}) {
  Object.assign(options, defaultOptions);

  jsf.option(options);
  let result;
  try {
    result = jsf(schema);
  } catch (err) {
    result = err.message;
  }
  jsf.option(defaultOptions);
  return result;
};

exports.resReturn = (data, num, errmsg) => {
  num = num || 0;

  return {
    errcode: num,
    errmsg: errmsg || '成功！',
    data: data
  };
};

exports.log = (msg, type) => {
  if (!msg) {
    return;
  }

  type = type || 'log';

  let f;

  switch (type) {
    case 'log':
      f = console.log; // eslint-disable-line
      break;
    case 'warn':
      f = console.warn; // eslint-disable-line
      break;
    case 'error':
      f = console.error; // eslint-disable-line
      break;
    default:
      f = console.log; // eslint-disable-line
      break;
  }

  f(type + ':', msg);

  let date = new Date();
  let year = date.getFullYear();
  let month = date.getMonth() + 1;

  let logfile = path.join(yapi.WEBROOT_LOG, year + '-' + month + '.log');

  if (typeof msg === 'object') {
    if (msg instanceof Error) msg = msg.message;
    else msg = JSON.stringify(msg);
  }

  // let data = (new Date).toLocaleString() + '\t|\t' + type + '\t|\t' + msg + '\n';
  let data = `[ ${new Date().toLocaleString()} ] [ ${type} ] ${msg}\n`;

  fs.writeFileSync(logfile, data, {
    flag: 'a'
  });
};

exports.fileExist = filePath => {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
};

exports.time = () => {
  return Date.parse(new Date()) / 1000;
};

exports.fieldSelect = (data, field) => {
  if (!data || !field || !Array.isArray(field)) {
    return null;
  }

  var arr = {};

  field.forEach(f => {
    typeof data[f] !== 'undefined' && (arr[f] = data[f]);
  });

  return arr;
};

exports.rand = (min, max) => {
  return Math.floor(Math.random() * (max - min) + min);
};

exports.json_parse = json => {
  try {
    return json5.parse(json);
  } catch (e) {
    return json;
  }
};

exports.randStr = () => {
  return Math.random()
    .toString(36)
    .substr(2);
};
exports.getIp = ctx => {
  let ip;
  try {
    ip = ctx.ip.match(/\d+.\d+.\d+.\d+/) ? ctx.ip.match(/\d+.\d+.\d+.\d+/)[0] : 'localhost';
  } catch (e) {
    ip = null;
  }
  return ip;
};

// legacy 口令摘要: sha1(password + sha1(passsalt)), 与历史 sha1 npm 包输出保持一致
function legacyPasswordDigest(password, passsalt) {
  const sha1Hex = str => crypto.createHash('sha1').update(String(str)).digest('hex');
  return sha1Hex(password + sha1Hex(passsalt));
}

exports.generatePassword = legacyPasswordDigest;

// scrypt 参数(自描述存储格式 scrypt$N$r$p$saltHex$hashHex)
const SCRYPT_COST_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * 生成 scrypt 口令哈希, 存储为自描述字符串, 盐内嵌于哈希串中。
 * @param {string} password 明文口令
 * @returns {string} scrypt$N$r$p$saltHex$hashHex
 */
exports.hashPassword = password => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_COST_PARAMS);
  return `scrypt$${SCRYPT_COST_PARAMS.N}$${SCRYPT_COST_PARAMS.r}$${SCRYPT_COST_PARAMS.p}$${salt.toString(
    'hex'
  )}$${hash.toString('hex')}`;
};

/**
 * 校验口令。
 * storedHash 以 scrypt$ 开头时按自描述参数校验; 否则按 legacy sha1 公式校验。
 * @param {string} password 明文口令
 * @param {string} passsalt 用户盐(legacy 校验使用)
 * @param {string} storedHash 存储的口令哈希
 * @returns {{valid: boolean, legacy: boolean}} legacy 为 true 表示命中旧格式
 */
exports.verifyPassword = (password, passsalt, storedHash) => {
  if (typeof storedHash === 'string' && storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) {
      return { valid: false, legacy: false };
    }
    const expected = Buffer.from(parts[5], 'hex');
    try {
      const actual = crypto.scryptSync(String(password), Buffer.from(parts[4], 'hex'), expected.length, {
        N: parseInt(parts[1], 10),
        r: parseInt(parts[2], 10),
        p: parseInt(parts[3], 10)
      });
      return {
        valid: actual.length === expected.length && crypto.timingSafeEqual(actual, expected),
        legacy: false
      };
    } catch (e) {
      return { valid: false, legacy: false };
    }
  }
  return { valid: legacyPasswordDigest(password, passsalt) === storedHash, legacy: true };
};

exports.expireDate = day => {
  let date = new Date();
  date.setTime(date.getTime() + day * 86400000);
  return date;
};

exports.sendMail = (options, cb) => {
  if (!yapi.mail) return false;
  options.subject = options.subject ? options.subject + '-YApi 平台' : 'YApi 平台';

  cb =
    cb ||
    function (err) {
      if (err) {
        yapi.commons.log('send mail ' + options.to + ' error,' + err.message, 'error');
      } else {
        yapi.commons.log('send mail ' + options.to + ' success');
      }
    };

  try {
    yapi.mail.sendMail(
      {
        from: yapi.WEBCONFIG.mail.from,
        to: options.to,
        subject: options.subject,
        html: options.contents
      },
      cb
    );
  } catch (e) {
    yapi.commons.log(e.message, 'error');
    console.error(e.message); // eslint-disable-line
  }
};

exports.validateSearchKeyword = keyword => {
  if (/^\*|\?|\+|\$|\^|\\|\.$/.test(keyword)) {
    return false;
  }

  return true;
};

exports.filterRes = (list, rules) => {
  return list.map(item => {
    let filteredRes = {};

    rules.forEach(rule => {
      if (typeof rule == 'string') {
        filteredRes[rule] = item[rule];
      } else if (typeof rule == 'object') {
        filteredRes[rule.alias] = item[rule.key];
      }
    });

    return filteredRes;
  });
};

exports.handleVarPath = (pathname, params) => {
  function insertParams(name) {
    if (!params.find(item => item.name === name)) {
      params.push({
        name: name,
        desc: ''
      });
    }
  }

  if (!pathname) return;
  if (pathname.indexOf(':') !== -1) {
    let paths = pathname.split('/'),
      name,
      i;
    for (i = 1; i < paths.length; i++) {
      if (paths[i] && paths[i][0] === ':') {
        name = paths[i].substr(1);
        insertParams(name);
      }
    }
  }
  pathname.replace(/\{(.+?)\}/g, function (str, match) {
    insertParams(match);
  });
};

/**
 * 验证一个 path 是否合法
 * path第一位必需为 /, path 只允许由 字母数字-/_:.{}= 组成
 */
exports.verifyPath = path => {
  // if (/^\/[a-zA-Z0-9\-\/_:!\.\{\}\=]*$/.test(path)) {
  //   return true;
  // } else {
  //   return false;
  // }
  return /^\/[a-zA-Z0-9\-\/_:!\.\{\}\=]*$/.test(path);
};

/**
 * 沙盒执行 js 代码
 * @sandbox Object context
 * @script String script
 * @return sandbox
 *
 * @example let a = sandbox({a: 1}, 'a=2')
 * a = {a: 2}
 */
exports.sandbox = (sandbox, script) => {
  try {
    const vm = require('vm');
    sandbox = sandbox || {};	
    script = new vm.Script(script);	
    const context = new vm.createContext(sandbox);	
    script.runInContext(context, {	
      timeout: 3000	
    });	      
    return sandbox
  } catch (err) {
    throw err
  }
};

function trim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(^\s*)|(\s*$)/g, '');
}

function ltrim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(^\s*)/g, '');
}

function rtrim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(\s*$)/g, '');
}

exports.trim = trim;
exports.ltrim = ltrim;
exports.rtrim = rtrim;

/**
 * 处理请求参数类型，String 字符串去除两边空格，Number 使用parseInt 转换为数字
 * @params Object {a: ' ab ', b: ' 123 '}
 * @keys Object {a: 'string', b: 'number'}
 * @return Object {a: 'ab', b: 123}
 */
exports.handleParams = (params, keys) => {
  if (!params || typeof params !== 'object' || !keys || typeof keys !== 'object') {
    return false;
  }

  for (var key in keys) {
    var filter = keys[key];
    if (params[key]) {
      switch (filter) {
        case 'string':
          params[key] = trim(params[key] + '');
          break;
        case 'number':
          params[key] = !isNaN(params[key]) ? parseInt(params[key], 10) : 0;
          break;
        default:
          params[key] = trim(params + '');
      }
    }
  }

  return params;
};

// ajv 编译缓存: 以规范化后的 schema JSON 串为 key, 容量上限 500, 超限后清空重来
const validatorCache = new Map();
const VALIDATOR_CACHE_MAX = 500;

function cacheValidator(cacheKey, build) {
  let compiled = validatorCache.get(cacheKey);
  if (compiled) {
    return compiled;
  }
  const { ajv, validate } = build();
  compiled = { validate, errorsText: ajv.errorsText.bind(ajv) };
  if (validatorCache.size >= VALIDATOR_CACHE_MAX) {
    validatorCache.clear();
  }
  validatorCache.set(cacheKey, compiled);
  return compiled;
}

// easy-json-schema 对无必填项的对象也会生成 required: [], draft-04 meta 不允许, 递归剥离
function stripEmptyRequired(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node.required) && node.required.length === 0) {
    delete node.required;
  }
  if (node.properties) {
    Object.keys(node.properties).forEach(key => stripEmptyRequired(node.properties[key]));
  }
  if (node.items) {
    stripEmptyRequired(node.items);
  }
  return node;
}

exports.validateParams = (schema2, params) => {
  const flag = schema2 && schema2.closeRemoveAdditional === true;
  // 不再原地修改入参 schema: 复制后剥离 closeRemoveAdditional, 使 schemaMap 可安全复用
  const cloned = structuredClone(schema2);
  delete cloned.closeRemoveAdditional;

  const schema = stripEmptyRequired(ejs(cloned));
  schema.additionalProperties = flag ? true : false;

  const { validate, errorsText } = cacheValidator(JSON.stringify(schema), () => {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: true,
      useDefaults: true,
      removeAdditional: flag ? false : true,
      validateFormats: false,
      // 对齐 ajv5 默认行为: 不按 meta-schema 严格校验 schema 本身, 仅告警级别的差异直接忽略
      validateSchema: false,
      strict: false
    });
    return { ajv, validate: ajv.compile(schema) };
  });

  let valid = validate(params);

  let message = '请求参数 ';
  if (!valid) {
    var localize = require('ajv-i18n');
    localize.zh(validate.errors);
    message += errorsText(validate.errors, { separator: '\n' });
  }

  return {
    valid: valid,
    message: message
  };
};

exports.saveLog = logData => {
  try {
    let logInst = yapi.getInst(logModel);
    let data = {
      content: logData.content,
      type: logData.type,
      uid: logData.uid,
      username: logData.username,
      typeid: logData.typeid,
      data: logData.data
    };

    logInst.save(data).then();
  } catch (e) {
    yapi.commons.log(e, 'error'); // eslint-disable-line
  }
};

/**
 *
 * @param {*} router router
 * @param {*} baseurl base_url_path
 * @param {*} routerController controller
 * @param {*} path  routerPath
 * @param {*} method request_method , post get put delete ...
 * @param {*} action controller action_name
 * @param {*} ws enable ws
 */
exports.createAction = (router, baseurl, routerController, action, path, method, ws) => {
  router[method](baseurl + path, async ctx => {
    let inst = new routerController(ctx);
    try {
      await inst.init(ctx);
      ctx.params = Object.assign({}, ctx.request.query, ctx.request.body, ctx.params);
      if (inst.schemaMap && typeof inst.schemaMap === 'object' && inst.schemaMap[action]) {

        let validResult = yapi.commons.validateParams(inst.schemaMap[action], ctx.params);

        if (!validResult.valid) {
          return (ctx.body = yapi.commons.resReturn(null, 400, validResult.message));
        }
      }
      if (inst.$auth === true) {
        await inst[action].call(inst, ctx);
      } else if (!ctx.body) {
        //auth 层(init/checkLogin)已写入错误响应时(如账号禁用401、token无效42014)透传, 不覆盖
        if (ws === true) {
          ctx.ws.send('请登录...');
        } else {
          ctx.body = yapi.commons.resReturn(null, 40011, '请登录...');
        }
      }
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 40011, '服务器出错...');
      yapi.commons.log(err, 'error');
    }
  });
};

/**
 *
 * @param {*} params 接口定义的参数
 * @param {*} val  接口case 定义的参数值
 */
function handleParamsValue(params, val) {
  let value = {};
  try {
    params = params.toObject();
  } catch (e) { }
  if (params.length === 0 || val.length === 0) {
    return params;
  }
  val.forEach(item => {
    value[item.name] = item;
  });
  params.forEach((item, index) => {
    if (!value[item.name] || typeof value[item.name] !== 'object') return null;
    params[index].value = value[item.name].value;
    if (value[item.name].enable !== undefined) {
      params[index].enable = value[item.name].enable;
    }
  });
  return params;
}

exports.handleParamsValue = handleParamsValue;

exports.getCaseList = async function getCaseList(id) {
  const caseInst = yapi.getInst(interfaceCaseModel);
  const colInst = yapi.getInst(interfaceColModel);
  const projectInst = yapi.getInst(projectModel);
  const interfaceInst = yapi.getInst(interfaceModel);

  let resultList = await caseInst.list(id, 'all');
  let colData = await colInst.get(id);
  for (let index = 0; index < resultList.length; index++) {
    let result = resultList[index].toObject();
    let data = await interfaceInst.get(result.interface_id);
    if (!data) {
      await caseInst.del(result._id);
      continue;
    }
    let projectData = await projectInst.getBaseInfo(data.project_id);
    result.path = projectData.basepath + data.path;
    result.method = data.method;
    result.title = data.title;
    result.req_body_type = data.req_body_type;
    result.req_headers = handleParamsValue(data.req_headers, result.req_headers);
    result.res_body_type = data.res_body_type;
    result.req_body_form = handleParamsValue(data.req_body_form, result.req_body_form);
    result.req_query = handleParamsValue(data.req_query, result.req_query);
    result.req_params = handleParamsValue(data.req_params, result.req_params);
    resultList[index] = result;
  }
  resultList = resultList.sort((a, b) => {
    return a.index - b.index;
  });
  let ctxBody = yapi.commons.resReturn(resultList);
  ctxBody.colData = colData;
  return ctxBody;
};

function convertString(variable) {
  if (variable instanceof Error) {
    return variable.name + ': ' + variable.message;
  }
  try {
    if (variable && typeof variable === 'string') {
      return variable;
    }
    return JSON.stringify(variable, null, '   ');
  } catch (err) {
    return variable || '';
  }
}


exports.runCaseScript = async function runCaseScript(params, colId, interfaceId) {
  const colInst = yapi.getInst(interfaceColModel);
  let colData = await colInst.get(colId);
  const logs = [];
  const context = {
    assert: require('assert'),
    status: params.response.status,
    body: params.response.body,
    header: params.response.header,
    records: params.records,
    params: params.params,
    log: msg => {
      logs.push('log: ' + convertString(msg));
    }
  };

  let result = {};
  try {

    if (colData.checkHttpCodeIs200) {
      let status = +params.response.status;
      if (status !== 200) {
        throw ('Http status code 不是 200，请检查(该规则来源于于 [测试集->通用规则配置] )')
      }
    }

    if (colData.checkResponseField.enable) {
      if (params.response.body[colData.checkResponseField.name] != colData.checkResponseField.value) {
        throw (`返回json ${colData.checkResponseField.name} 值不是${colData.checkResponseField.value}，请检查(该规则来源于于 [测试集->通用规则配置] )`)
      }
    }

    if (colData.checkResponseSchema) {
      const interfaceInst = yapi.getInst(interfaceModel);
      let interfaceData = await interfaceInst.get(interfaceId);
      if (interfaceData.res_body_is_json_schema && interfaceData.res_body) {
        let schema = JSON.parse(interfaceData.res_body);
        let result = schemaValidator(schema, context.body)
        if (!result.valid) {
          throw (`返回Json 不符合 response 定义的数据结构,原因: ${result.message}
数据结构如下：
${JSON.stringify(schema, null, 2)}`)
        }
      }
    }

    if (colData.checkScript.enable) {
      let globalScript = colData.checkScript.content;
      // script 是断言
      if (globalScript) {
        logs.push('执行脚本：' + globalScript)
        result = await sandboxFn(context, globalScript);
      }
    }


    let script = params.script;
    // script 是断言
    if (script) {
      logs.push('执行脚本:' + script)
      result = await sandboxFn(context, script);
    }
    // 沙箱子进程内 log() 收集的输出并入执行日志
    result.logs = logs.concat((result && result.logs) || []);
    return yapi.commons.resReturn(result);
  } catch (err) {
    logs.push(convertString(err));
    result.logs = logs;
    return yapi.commons.resReturn(result, 400, err.name + ': ' + err.message);
  }
};

exports.getUserdata = async function getUserdata(uid, role) {
  role = role || 'dev';
  let userInst = yapi.getInst(userModel);
  let userData = await userInst.findById(uid);
  if (!userData) {
    return null;
  }
  return {
    role: role,
    uid: userData._id,
    username: userData.username,
    email: userData.email
  };
};

// 处理mockJs脚本
exports.handleMockScript = async function (script, context) {
  let sandbox = {
    header: context.ctx.header,
    query: context.ctx.query,
    body: context.ctx.request.body,
    mockJson: context.mockJson,
    params: Object.assign({}, context.ctx.query, context.ctx.request.body),
    resHeader: context.resHeader,
    httpCode: context.httpCode,
    delay: context.httpCode,
    Random: Mock.Random
  };
  sandbox.cookie = {};

  context.ctx.header.cookie &&
    context.ctx.header.cookie.split(';').forEach(function (Cookie) {
      var parts = Cookie.split('=');
      sandbox.cookie[parts[0].trim()] = (parts[1] || '').trim();
    });
  sandbox = await sandboxFn(sandbox, script);
  sandbox.delay = isNaN(sandbox.delay) ? 0 : +sandbox.delay;

  context.mockJson = sandbox.mockJson;
  context.resHeader = sandbox.resHeader;
  context.httpCode = sandbox.httpCode;
  context.delay = sandbox.delay;
};



exports.createWebAPIRequest = function (ops) {
  return new Promise(function (resolve, reject) {
    let req = '';
    let http_client = http.request(
      {
        host: ops.hostname,
        method: 'GET',
        port: ops.port,
        path: ops.path
      },
      function (res) {
        res.on('error', function (err) {
          reject(err);
        });
        res.setEncoding('utf8');
        if (res.statusCode != 200) {
          reject({ message: 'statusCode != 200' });
        } else {
          res.on('data', function (chunk) {
            req += chunk;
          });
          res.on('end', function () {
            resolve(req);
          });
        }
      }
    );
    http_client.on('error', (e) => {
      reject({ message: `request error: ${e.message}` });
    });
    http_client.end();
  });
}


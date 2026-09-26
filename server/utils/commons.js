// @ts-check
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
const json5 = require('json5');
// ajv-draft-04 的导出类型与 CJS 构造用法不匹配, 按 any 处理
/** @type {any} */
const Ajv = require('ajv-draft-04');
const Mock = require('mockjs');
const sandboxFn = require('./sandbox')



const ejs = require('./easy-json-schema');

const { schemaValidator } = require('../../common/utils');
const http = require('http');

/** @type {Promise<any> | null} */
let jsfPromise = null;
// babel-register（test/ava 管线）会把源码中的字面量 import() 转译为 require 形态，
// 而 0.6 exports 无 require 条件 → 测试环境断链（生产纯 node 无碍,实测确认）。
// 经 Function 构造器调用可避开 babel 对 import() 语法的静态转译,生产/测试均走原生动态 import。
const dynamicImport = /** @type {(specifier: string) => Promise<any>} */ (
  new Function('specifier', 'return import(specifier);')
);
/**
 * 惰性加载 json-schema-faker（模块级缓存 Promise）。
 *
 * 动机：json-schema-faker 0.6 起 ESM-only（exports 仅含 import 条件，无
 * require/default 条件），顶层同步 require 在 0.6 上直接断链（生产与测试
 * 同挂，见 TECH_DEBT.md「四」区 2026-09-20 回退登记）。改由首次调用
 * schemaToJson 时动态 import（5 个调用点均处于 async 上下文），加载成功
 * 后复用同一 Promise（后续调用零额外成本）；失败不缓存，允许下次重试。
 * Node require(esm) 无法作为兜底：其 exports 解析不含 import 条件，对本包
 * 报 ERR_PACKAGE_PATH_NOT_EXPORTED（0.6.3 实测）。裁决出处：
 * docs/server-esm-evaluation.md「四 B1」。
 *
 * mock 扩展按 0.5/0.6 双 API 注册（YApi schema 的 mock 属性 → mockjs）：
 * - 0.5 extend(name, factory)：factory 返回对象按属性子键调用，收到内层 spec；
 * - 0.6 define(name, callback)：按 schema 节点 key 匹配扩展，callback 收到
 *   完整属性值（如 {mock: '@cname'}），需解包后再交给 Mock.mock。
 *
 * @returns {Promise<any>} json-schema-faker 实例（已应用 mock 扩展）
 */
const loadJsf = () => {
  if (!jsfPromise) {
    jsfPromise = dynamicImport('json-schema-faker').then(
      /** @param {any} jsfModule */ jsfModule => {
        const jsf = jsfModule.default || jsfModule;
        if (typeof jsf.define === 'function') {
          jsf.define('mock', (/** @type {any} */ value) => {
            const spec =
              value && typeof value === 'object' && 'mock' in value ? value.mock : value;
            return Mock.mock(spec);
          });
        } else {
          jsf.extend('mock', () => ({
            mock: /** @param {any} xx */ xx => Mock.mock(xx)
          }));
        }
        return jsf;
      }
    );
    jsfPromise.catch(() => {
      // 失败不缓存（如临时安装损坏），下次调用重试
      jsfPromise = null;
    });
  }
  return jsfPromise;
};

const defaultOptions = {
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
  // json-schema-faker 0.5.0-rc16 → 0.5.9 行为对齐:rc16 默认仅生成 required 属性
  // (无 required 的对象输出 {});0.5.9 起默认生成 optional 并附加随机命名属性,
  // requiredOnly 显式固定 rc16 语义,实测各 schema 形态输出结构逐一一致
  requiredOnly: true
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

/**
 * 按 JSON Schema 生成 mock 数据
 * @param {any} schema JSON Schema
 * @param {object} [options] json-schema-faker 选项
 * @returns {Promise<any>} mock 结果, 生成失败时返回错误信息（错误契约保持字符串返回,
 *   调用方 await 后即得结果或错误文案, 不会 reject）
 */
exports.schemaToJson = async function (schema, options = {}) {
  Object.assign(options, defaultOptions);

  let result;
  let jsf = null;
  try {
    jsf = await loadJsf();
    if (typeof jsf.generateSync === 'function') {
      // 0.6: 选项随调用传入（无全局注册表, 无需复位）。requiredOnly 由 0.6 兼容
      // shim 处理（requiredOnly:true 且未显式给 optionalsProbability 时强制
      // optionalsProbability:0/alwaysFakeOptionals:false, 与 0.5.9 优先级语义一致）。
      // seed 缺省固定为 1（同一 schema 每次输出相同）, 为保持 0.5 每次调用随机化
      // 的行为, 显式注入随机 seed（不回写调用方 options 对象）。
      result = jsf.generateSync(schema, {
        ...options,
        seed: Math.floor(Math.random() * 0x7fffffff)
      });
    } else {
      // 0.5 升级窗口兼容: 全局 option + 可调用函数体（jsf(schema) 已废弃, 走 .generate()）
      jsf.option(options);
      result =
        typeof jsf.generate === 'function' ? jsf.generate(schema) : jsf(schema);
    }
  } catch (/** @type {any} */ err) {
    result = err.message;
  } finally {
    // 对齐原同步版复位语义: 仅 0.5 全局注册表需要复位; 0.6 无全局状态, 无需复位
    if (jsf && typeof jsf.option === 'function') {
      jsf.option(defaultOptions);
    }
  }
  return result;
};

/**
 * 统一响应结构
 * @param {any} data 响应数据
 * @param {number} [num] 错误码, 缺省为 0
 * @param {string} [errmsg] 错误信息, 缺省为 '成功！'
 * @returns {{errcode: number, errmsg: string, data: any}} 响应体
 */
exports.resReturn = (data, num, errmsg) => {
  num = num || 0;

  return {
    errcode: num,
    errmsg: errmsg || '成功！',
    data: data
  };
};

/**
 * 写入日志文件
 * @param {any} msg 日志内容, 对象会被序列化
 * @param {string} [type] 日志级别: log | warn | error, 缺省为 log
 * @returns {void}
 */
exports.log = (msg, type) => {
  if (!msg) {
    return;
  }

  type = type || 'log';

  let f;

  switch (type) {
    case 'log':
      f = console.log;
      break;
    case 'warn':
      f = console.warn;
      break;
    case 'error':
      f = console.error;
      break;
    default:
      f = console.log;
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

  fs.writeFile(logfile, data, { flag: 'a' }, err => {
    if (err) {
      console.error('write log file failed:', err && err.message);
    }
  });
};

/**
 * 判断给定路径是否存在且为文件
 * @param {string} filePath 文件路径
 * @returns {boolean} 存在且为文件时返回 true
 */
exports.fileExist = filePath => {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
};

/**
 * 当前时间戳(秒)
 * @returns {number} 秒级时间戳
 */
exports.time = () => {
  return Date.parse(/** @type {any} */ (new Date())) / 1000;
};

/**
 * 从对象中挑选指定字段
 * @param {Record<string, any>} data 源数据
 * @param {string[]} field 字段名列表
 * @returns {Record<string, any>|null} 仅包含命名字段的对象, 入参非法时返回 null
 */
exports.fieldSelect = (data, field) => {
  if (!data || !field || !Array.isArray(field)) {
    return null;
  }

  /** @type {Record<string, any>} */
  var arr = {};

  field.forEach(f => {
    typeof data[f] !== 'undefined' && (arr[f] = data[f]);
  });

  return arr;
};

/**
 * 生成 [min, max) 区间内的随机整数
 * @param {number} min 下界
 * @param {number} max 上界
 * @returns {number} 随机整数
 */
exports.rand = (min, max) => {
  return Math.floor(Math.random() * (max - min) + min);
};

/**
 * 解析 JSON 字符串, 失败时原样返回入参
 * @param {string} json JSON 字符串
 * @returns {any} 解析结果
 */
exports.json_parse = json => {
  try {
    return json5.parse(json);
  } catch (e) {
    return json;
  }
};

/**
 * 生成随机字符串
 * @returns {string} 随机字符串
 */
exports.randStr = () => {
  return Math.random()
    .toString(36)
    .substr(2);
};
/**
 * 从 koa 上下文中提取客户端 ip
 * @param {any} ctx koa 上下文
 * @returns {string|null} 客户端 ip, 解析失败时返回 null
 */
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
/**
 * 计算 legacy 口令摘要
 * @param {string} password 明文口令
 * @param {string} passsalt 用户盐
 * @returns {string} sha1 摘要
 */
function legacyPasswordDigest(password, passsalt) {
  const sha1Hex = (/** @type {string} */ str) => crypto.createHash('sha1').update(String(str)).digest('hex');
  return sha1Hex(password + sha1Hex(passsalt));
}

/**
 * 为新口令生成存储哈希（注册/管理员新增/重置口令/安装初始化等一切新写入路径）。
 * 统一产出 scrypt 自描述格式（盐内嵌于哈希串，passsalt 仅 legacy 格式使用，故不再入参）。
 * 兼容性：存量调用点（adminMethods add/resetPassword、install.js）仍按旧形态传入
 * (password, passsalt) 两参，第二参 passsalt 在此被静默忽略，无需改调用方。
 * legacy sha1 格式仅存在于存量数据：legacyPasswordDigest 仅供 verifyPassword 兼容
 * 路径与测试向量消费，任何新口令不得再生成该格式。
 * @param {string} password 明文口令
 * @returns {string} scrypt$N$r$p$saltHex$hashHex
 */
exports.generatePassword = password => exports.hashPassword(password);

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

/**
 * 计算口令过期时间
 * @param {number} day 有效天数
 * @returns {Date} 过期时间点
 */
exports.expireDate = day => {
  let date = new Date();
  date.setTime(date.getTime() + day * 86400000);
  return date;
};

/**
 * 发送邮件
 * @param {any} options 邮件选项, 含 to / subject / contents
 * @param {(err: any) => void} [cb] 发送回调, 缺省时记录日志
 * @returns {boolean|undefined} 未配置邮件服务时返回 false
 */
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
  } catch (/** @type {any} */ e) {
    yapi.commons.log(e.message, 'error');
    console.error(e.message);
  }
};

/**
 * 校验搜索关键字是否合法
 * @param {string} keyword 搜索关键字
 * @returns {boolean} 合法时返回 true
 */
exports.validateSearchKeyword = keyword => {
  if (/^\*|\?|\+|\$|\^|\\|\.$/.test(keyword)) {
    return false;
  }

  return true;
};

/**
 * 按规则列表过滤接口返回数据
 * @param {any[]} list 数据列表
 * @param {any[]} rules 字段规则列表, 项为字段名或 {alias, key}
 * @returns {any[]} 过滤后的数据列表
 */
exports.filterRes = (list, rules) => {
  return list.map(item => {
    /** @type {Record<string, any>} */
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

/**
 * 从 path 中提取动态路由参数并追加到参数列表
 * @param {string} pathname 接口 path
 * @param {any[]} params 参数列表
 * @returns {void}
 */
exports.handleVarPath = (pathname, params) => {
  /**
   * 追加同名参数
   * @param {string} name 参数名
   */
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
  pathname.replace(
    /\{(.+?)\}/g,
    /** @type {(substring: string, ...args: any[]) => any} */
    (function (/** @type {string} */ str, /** @type {string} */ match) {
      insertParams(match);
    })
  );
};

/**
 * 验证一个 path 是否合法
 * path第一位必需为 /, path 只允许由 字母数字-/_:.{}= 组成
 * @param {string} path 待校验 path
 * @returns {boolean} 合法时返回 true
 */
exports.verifyPath = path => {
  // if (/^\/[a-zA-Z0-9\-\/_:!\.\{\}\=]*$/.test(path)) {
  //   return true;
  // } else {
  //   return false;
  // }
  return /^\/[a-zA-Z0-9\-/_:.!{}=]*$/.test(path);
};

/**
 * 沙盒执行 js 代码
 * @sandbox Object context
 * @script String script
 *
 * @example let a = sandbox({a: 1}, 'a=2')
 * a = {a: 2}
 * @param {Record<string, any>} sandbox 沙盒上下文对象
 * @param {any} script 待执行脚本, 编译后为 vm.Script
 * @returns {Record<string, any>} 执行后的沙盒上下文
 */
exports.sandbox = (sandbox, script) => {
  /** @type {any} */
  const vm = require('vm');
  sandbox = sandbox || {};
  script = new vm.Script(script);
  const context = new vm.createContext(sandbox);
  script.runInContext(context, {
    timeout: 3000
  });
  return sandbox;
};

/**
 * 去除字符串两端空白
 * @param {string} str 输入
 * @returns {string} 结果
 */
function trim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(^\s*)|(\s*$)/g, '');
}

/**
 * 去除字符串左侧空白
 * @param {string} str 输入
 * @returns {string} 结果
 */
function ltrim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(^\s*)/g, '');
}

/**
 * 去除字符串右侧空白
 * @param {string} str 输入
 * @returns {string} 结果
 */
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
 * Result Object: {a: 'ab', b: 123}
 * @param {Record<string, any>} params 请求参数
 * @param {Record<string, any>} keys 字段类型映射
 * @returns {Record<string, any>|boolean} 转换后的参数, 入参非法时返回 false
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

/**
 * 编译缓存辅助: 命中缓存直接返回, 否则构建并写入缓存
 * @param {string} cacheKey 缓存键
 * @param {() => {ajv: any, validate: any}} build 编译函数
 * @returns {{validate: any, errorsText: any}} 编译产物
 */
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
/**
 * 递归剥离空的 required 数组
 * @param {any} node schema 节点
 * @returns {any} 处理后的节点
 */
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

/**
 * 请求参数 JSON Schema 校验
 * @param {Record<string, any>} schema2 JSON Schema, 可带 closeRemoveAdditional 开关
 * @param {any} params 待校验参数
 * @returns {{valid: boolean, message: string}} 校验结果与错误信息
 */
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
    /** @type {any} */
    var localize = require('ajv-i18n');
    localize.zh(validate.errors);
    message += errorsText(validate.errors, { separator: '\n' });
  }

  return {
    valid: valid,
    message: message
  };
};

/**
 * 保存操作日志
 * @param {any} logData 日志数据, 含 content / type / uid / username / typeid / data
 * @returns {void}
 */
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
    yapi.commons.log(e, 'error');
  }
};

/**
 *
 * @param {any} router router
 * @param {string} baseurl base_url_path
 * @param {any} routerController controller
 * @param {string} action controller action_name
 * @param {string} path  routerPath
 * @param {string} method request_method , post get put delete ...
 * @param {boolean} ws enable ws
 * @returns {void}
 */
exports.createAction = (router, baseurl, routerController, action, path, method, ws) => {
  router[method](baseurl + path, async (/** @type {any} */ ctx) => {
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
 * @param {any} params 接口定义的参数
 * @param {any} val  接口case 定义的参数值
 * @returns {any} 参数值合并后的参数列表
 */
function handleParamsValue(params, val) {
  /** @type {Record<string, any>} */
  let value = {};
  try {
    params = params.toObject();
  } catch (e) { }
  if (params.length === 0 || val.length === 0) {
    return params;
  }
  val.forEach((/** @type {any} */ item) => {
    value[item.name] = item;
  });
  params.forEach((/** @type {any} */ item, /** @type {number} */ index) => {
    if (!value[item.name] || typeof value[item.name] !== 'object') return null;
    params[index].value = value[item.name].value;
    if (value[item.name].enable !== undefined) {
      params[index].enable = value[item.name].enable;
    }
  });
  return params;
}

exports.handleParamsValue = handleParamsValue;

/**
 * 获取接口集合下的用例列表, 并回填接口 path/method 等信息
 * @param {any} id 接口集合 id
 * @returns {Promise<any>} 用例列表响应体
 */
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
  resultList = resultList.sort((/** @type {any} */ a, /** @type {any} */ b) => {
    return a.index - b.index;
  });
  let ctxBody = yapi.commons.resReturn(resultList);
  ctxBody.colData = colData;
  return ctxBody;
};

/**
 * 将变量转为日志用字符串
 * @param {any} variable 任意值
 * @returns {string} 字符串形式
 */
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


/**
 * 运行断言/测试脚本
 * @param {any} params 用例执行参数, 含 response / records / params / script
 * @param {any} colId 测试集 id
 * @param {any} interfaceId 接口 id
 * @returns {Promise<any>} 执行结果响应体
 */
exports.runCaseScript = async function runCaseScript(params, colId, interfaceId) {
  const colInst = yapi.getInst(interfaceColModel);
  let colData = await colInst.get(colId);
  /** @type {any[]} */
  const logs = [];
  const context = {
    assert: require('assert'),
    status: params.response.status,
    body: params.response.body,
    header: params.response.header,
    records: params.records,
    params: params.params,
    log: (/** @type {any} */ msg) => {
      logs.push('log: ' + convertString(msg));
    }
  };

  /** @type {any} */
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
  } catch (/** @type {any} */ err) {
    logs.push(convertString(err));
    result.logs = logs;
    return yapi.commons.resReturn(result, 400, err.name + ': ' + err.message);
  }
};

/**
 * 查询用户信息并组装为标准角色数据
 * @param {any} uid 用户 id
 * @param {string} [role] 角色, 缺省为 dev
 * @returns {Promise<any>} 用户角色数据, 用户不存在时返回 null
 */
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
/**
 * 在沙盒中执行 mock 脚本, 并把沙盒结果回写到 context
 * @param {string} script mock 脚本
 * @param {any} context mock 上下文, 含 ctx / mockJson / resHeader / httpCode / delay
 * @returns {Promise<void>}
 */
exports.handleMockScript = async function (script, context) {
  /** @type {Record<string, any>} */
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
    context.ctx.header.cookie.split(';').forEach(function (/** @type {string} */ Cookie) {
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



/**
 * 发起 GET 请求获取远程内容
 * @param {any} ops 请求选项, 含 hostname / port / path
 * @returns {Promise<any>} 响应内容
 */
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


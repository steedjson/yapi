// @ts-check
const Mock = require('mockjs');
const filter = require('./power-string.js').filter;
const stringUtils = require('./power-string.js').utils;
const json5 = require('json5');
// ajv-draft-04 为 ajv8 官方 draft-04 配套实现, 保持对存量 draft-04 语法的兼容
// 二者的类型声明均为 ESM default 导出，而此处按 CJS require 取到的是导出对象本身，
// 故先以 @type {*} 承接运行时对象，再在声明处还原真实类型（均为编译期行为，不改运行时）
/** @type {typeof import('ajv-draft-04').default} */
const Ajv = /** @type {*} */ (require('ajv-draft-04'));
/** @type {typeof import('ajv-i18n').default} */
const localize = /** @type {*} */ (require('ajv-i18n'));

// schemaValidator 编译缓存: 以 schema JSON 串为 key, 容量上限 500, 超限后清空重来
// 显式注解 value 类型: 该缓存是 validate 的唯一来源, 若不注解会推导为 Map<any, any>,
// 使 validate(params) 调用与缓存写入完全绕过类型检查（注解仅作用于模块内私有变量，
// 不进入 exports.schemaValidator 的公开签名，故客户端消费方无需解析 ajv 类型）
/** @type {Map<string, import('ajv').ValidateFunction>} */
const schemaValidatorCache = new Map();
const SCHEMA_VALIDATOR_CACHE_MAX = 500;

/** @type {InstanceType<typeof Ajv> | null} */
let sharedAjv = null;

function getSharedAjv() {
  if (!sharedAjv) {
    sharedAjv = new Ajv({
      validateFormats: false,
      validateSchema: false,
      strict: false
    });
  }
  return sharedAjv;
}
/**
 * 作用：解析规则串 key ，然后根据规则串的规则以及路径找到在 json 中对应的数据
 * 规则串：$.{key}.{body||params}.{dataPath} 其中 body 为返回数据，params 为请求数据，datapath 为数据的路径
 * 数组：$.key.body.data.arr[0]._id  (获取 key 所指向请求的返回数据的 arr 数组的第 0 项元素的 _id 属性)
 * 对象：$.key.body.data.obj._id ((获取 key 所指向请求的返回数据的 obj 对象的 _id 属性))
 *
 * @param {string} key 规则串
 * @param {*} json 数据
 * @returns {*} 命中的数据；key 不合法时返回 null，路径取不到时返回空串
 */
function simpleJsonPathParse(key, json) {
  if (!key || typeof key !== 'string' || key.indexOf('$.') !== 0 || key.length <= 2) {
    return null;
  }
  let keys = key.substr(2).split('.');
  keys = keys.filter(item => {
    return item;
  });
  for (let i = 0, l = keys.length; i < l; i++) {
    try {
      let m = keys[i].match(/(.*?)\[([0-9]+)\]/);
      if (m) {
        json = json[m[1]][m[2]];
      } else {
        json = json[keys[i]];
      }
    } catch (e) {
      json = '';
      break;
    }
  }

  return json;
}

// 全局变量 {{ global.value }}
// value 是在环境变量中定义的字段
/**
 * @param {string} word 全局变量表达式（global.xxx.yyy）
 * @param {*} json 取值上下文
 * @returns {*} 命中的数据，取不到时原样返回表达式
 */
function handleGlobalWord(word, json) {
  if (!word || typeof word !== 'string' || word.indexOf('global.') !== 0) return word;
  let keys = word.split('.');
  keys = keys.filter(item => {
    return item;
  });
  return json[keys[0]][keys[1]] || word;
}

/**
 * @param {*} word mock 表达式（以 @ 开头）
 * @returns {*} mock 结果，非 mock 表达式时原样返回
 */
function handleMockWord(word) {
  if (!word || typeof word !== 'string' || word[0] !== '@') return word;
  return Mock.mock(word);
}

/**
 *
 * @param {*} data
 * @param {*} handleValueFn 处理参数值函数
 */
function handleJson(data, handleValueFn) {
  if (!data) {
    return data;
  }
  if (typeof data === 'string') {
    return handleValueFn(data);
  } else if (typeof data === 'object') {
    for (let i in data) {
      data[i] = handleJson(data[i], handleValueFn);
    }
  } else {
    return data;
  }
  return data;
}

/**
 * @param {*} context 取值上下文
 * @returns {(match: string) => *} 变量匹配回调
 */
function handleValueWithFilter(context) {
  return function(/** @type {string} */ match) {
    if (match[0] === '@') {
      return handleMockWord(match);
    } else if (match.indexOf('$.') === 0) {
      return simpleJsonPathParse(match, context);
    } else if (match.indexOf('global.') === 0) {
      return handleGlobalWord(match, context);
    } else {
      return match;
    }
  };
}

/**
 * @param {*} str 原始文本（处理异常时原样返回）
 * @param {string} match 待处理的规则串
 * @param {*} context 取值上下文
 * @returns {*} 处理结果
 */
function handleFilter(str, match, context) {
  match = match.trim();
  try {
    let a = filter(match, handleValueWithFilter(context));

    return a;
  } catch (err) {
    return str;
  }
}

/**
 * @param {*} val 待处理值（非字符串原样返回）
 * @param {*} [context] 取值上下文
 * @returns {*} 处理结果
 */
function handleParamsValue(val, context = {}) {
  const variableRegexp = /\{\{\s*([^}]+?)\}\}/g;
  if (!val || typeof val !== 'string') {
    return val;
  }
  val = val.trim();

  let match = val.match(/^\{\{([^}]+)\}\}$/);
  if (!match) {
    // val ==> @name 或者 $.body
    if (val[0] === '@' || val[0] === '$') {
      return handleFilter(val, val, context);
    }
  } else {
    return handleFilter(val, match[1], context);
  }

  return val.replace(variableRegexp, (/** @type {string} */ str, /** @type {string} */ match) => {
    return handleFilter(str, match, context);
  });
}

exports.handleJson = handleJson;
exports.handleParamsValue = handleParamsValue;

exports.simpleJsonPathParse = simpleJsonPathParse;
exports.handleMockWord = handleMockWord;

/**
 * @param {string} domain 域名
 * @param {string} joinPath 待拼接路径
 * @returns {string} 拼接后的完整地址
 */
exports.joinPath = (domain, joinPath) => {
  let l = domain.length;
  if (domain[l - 1] === '/') {
    domain = domain.substr(0, l - 1);
  }
  if (joinPath[0] !== '/') {
    joinPath = joinPath.substr(1);
  }
  return domain + joinPath;
};

// exports.safeArray = arr => {
//   return Array.isArray(arr) ? arr : [];
// };
/**
 * @param {*} arr 待判定值
 * @returns {Array<any>} 原数组或空数组
 */
function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}
exports.safeArray = safeArray;

/**
 * @param {*} json JSON5 文本（空值返回 false）
 * @returns {*} 解析结果，解析失败返回 false
 */
exports.isJson5 = function isJson5(json) {
  if (!json) return false;
  try {
    json = json5.parse(json);
    return json;
  } catch (e) {
    return false;
  }
};

/**
 * @param {*} json JSON 文本（空值返回 false）
 * @returns {*} 解析结果，解析失败返回 false
 */
function isJson(json) {
  if (!json) return false;
  try {
    json = JSON.parse(json);
    return json;
  } catch (e) {
    return false;
  }
}

exports.isJson = isJson;

/**
 * @param {string} base64Str base64 文本
 * @returns {*} 解码结果，解码失败原样返回
 */
exports.unbase64 = function(base64Str) {
    try {
      return stringUtils.unbase64(base64Str);
    } catch (err) {
      return base64Str;
    }
  };

/**
 * @param {string} json JSON 文本
 * @returns {*} 解析结果，解析失败原样返回
 */
exports.json_parse = function(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    return json;
  }
};

/**
 * @param {string} json JSON 文本
 * @returns {string} 格式化后的文本，失败时原样返回
 */
exports.json_format = function(json) {
  try {
    return JSON.stringify(JSON.parse(json), null, '   ');
  } catch (e) {
    return json;
  }
};

/**
 * @param {*} arr 形如 [{ name, value }] 的数组
 * @returns {Record<string, any>} name -> value 映射
 */
exports.ArrayToObject = function(arr) {
  /** @type {Record<string, any>} */
  let obj = {};
  safeArray(arr).forEach(item => {
    obj[item.name] = item.value;
  });

  return obj;
};

/**
 * @param {number} timestamp 秒级时间戳
 * @returns {string} 相对当前时间的描述文本
 */
exports.timeago = function(timestamp) {
  let minutes, hours, days, seconds, mouth, year;
  const timeNow = parseInt(/** @type {any} */ (new Date().getTime() / 1000));
  seconds = timeNow - timestamp;
  if (seconds > 86400 * 30 * 12) {
    year = parseInt(/** @type {any} */ (seconds / (86400 * 30 * 12)));
  } else {
    year = 0;
  }
  if (seconds > 86400 * 30) {
    mouth = parseInt(/** @type {any} */ (seconds / (86400 * 30)));
  } else {
    mouth = 0;
  }
  if (seconds > 86400) {
    days = parseInt(/** @type {any} */ (seconds / 86400));
  } else {
    days = 0;
  }
  if (seconds > 3600) {
    hours = parseInt(/** @type {any} */ (seconds / 3600));
  } else {
    hours = 0;
  }
  minutes = parseInt(/** @type {any} */ (seconds / 60));
  if (year > 0) {
    return year + '年前';
  } else if (mouth > 0 && year <= 0) {
    return mouth + '月前';
  } else if (days > 0 && mouth <= 0) {
    return days + '天前';
  } else if (days <= 0 && hours > 0) {
    return hours + '小时前';
  } else if (hours <= 0 && minutes > 0) {
    return minutes + '分钟前';
  } else if (minutes <= 0 && seconds > 0) {
    if (seconds < 30) {
      return '刚刚';
    } else {
      return seconds + '秒前';
    }
  } else {
    return '刚刚';
  }
};

// json schema 验证器
/**
 * @param {*} schema JSON Schema（为空时使用内置空对象 schema）
 * @param {*} params 待校验数据
 * @returns {{ valid: boolean, message: string }} 校验结果与错误信息
 */
exports.schemaValidator = function(schema, params) {
  try {
    const ajv = getSharedAjv();

    schema = schema || {
      type: 'object',
      title: 'empty object',
      properties: {}
    };

    const cacheKey = JSON.stringify(schema);
    let validate = schemaValidatorCache.get(cacheKey);
    if (!validate) {
      validate = ajv.compile(schema);
      if (schemaValidatorCache.size >= SCHEMA_VALIDATOR_CACHE_MAX) {
        schemaValidatorCache.clear();
      }
      schemaValidatorCache.set(cacheKey, validate);
    }

    let valid = validate(params);

    let message = '';
    if (!valid) {
      localize.zh(validate.errors);
      message += ajv.errorsText(validate.errors, { separator: '\n' });
    }

    return {
      valid: valid,
      message: message
    };
  } catch (/** @type {any} */ e) {
    // 诚实性说明: 本函数声明的返回类型为 {valid: boolean, message: string},
    // 但本分支的 message 取自 e.message —— 仅当抛出值为 Error 时它才是字符串。
    // 若 catch 到非 Error（如 throw 'xxx'），e.message 为 undefined，此处返回的
    // message 实际为 undefined，声明比运行时偏乐观。要收紧声明必须改动运行时
    // （如 String(e) 兜底），超出本次「仅改注解」的范围，故保留现状并在此标注。
    return {
      valid: false,
      message: e.message
    };
  }
};

/**
 * 将树形分类列表拍平为一维数组，供下拉框等需要全量分类的场景使用。
 * 带环保护，避免异常数据导致死循环；保持深度优先的原有顺序。
 * @param {Array<any>} list 树形分类数组
 * @returns {Array<any>} 拍平后的分类数组
 */
function flattenCatList(list) {
  const result = [];
  const stack = Array.isArray(list) ? list.slice() : [];
  const visited = new Set();
  while (stack.length) {
    const item = stack.shift();
    if (!item || visited.has(item._id)) continue;
    visited.add(item._id);
    result.push(item);
    const children = item.children;
    if (Array.isArray(children) && children.length) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.unshift(children[i]);
      }
    }
  }
  return result;
}
exports.flattenCatList = flattenCatList;

/**
 * 将树形分类列表转换为 antd TreeSelect 兼容的 treeData 结构。
 * @param {Array<any>} list 树形分类数组
 * @returns {Array<any>} 转换后的 treeData
 */
function formatCatTreeData(list) {
  if (!Array.isArray(list)) return [];
  /**
   * @param {Array<any>} items 待转换的节点数组
   * @param {Set<any>} [visited] 已访问节点的 _id 集合（环保护）
   * @returns {Array<any>} 转换后的节点数组
   */
  const transform = (items, visited = new Set()) => {
    return items
      .filter(item => item && !visited.has(item._id))
      .map(item => {
        visited.add(item._id);
        /** @type {{ title: any, value: string, key: string, children?: Array<any> }} */
        const node = {
          title: item.name,
          value: String(item._id),
          key: String(item._id)
        };
        if (Array.isArray(item.children) && item.children.length > 0) {
          const children = transform(item.children, visited);
          if (children.length > 0) {
            node.children = children;
          }
        }
        return node;
      });
  };
  return transform(list);
}
exports.formatCatTreeData = formatCatTreeData;


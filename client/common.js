// @ts-check
const dayjs = require('dayjs');
const constants = require('./constants/variable');
const Mock = require('mockjs');
const json5 = require('json5');
const MockExtra = require('common/mock-extra.js');

/** @type {Record<string, string>} */
const Roles = {
  0: 'admin',
  10: 'owner',
  20: 'dev',
  30: 'guest',
  40: 'member'
};

/** @type {Record<string, string>} */
const roleAction = {
  manageUserlist: 'admin',
  changeMemberRole: 'owner',
  editInterface: 'dev',
  viewPrivateInterface: 'guest',
  viewGroup: 'guest'
};

/**
 * @param {*} json 待校验内容
 * @returns {*} 解析结果，失败返回 false
 */
function isJson(json) {
  if (!json) {
    return false;
  }
  try {
    json = JSON.parse(json);
    return json;
  } catch (e) {
    return false;
  }
}

exports.isJson = isJson;

/**
 * @param {*} json 待解析的 json5 文本
 * @returns {*} 解析结果，失败返回 false
 */
function isJson5(json) {
  if (!json) {
    return false;
  }
  try {
    json = json5.parse(json);
    return json;
  } catch (e) {
    return false;
  }
}
/**
 * @param {*} arr 任意值
 * @returns {any[]} 数组本身或空数组
 */
exports.safeArray = function(arr) {
  return Array.isArray(arr) ? arr : [];
};

/**
 * @param {*} json json5 文本
 * @returns {*} 解析结果，失败时原样返回入参
 */
exports.json5_parse = function(json) {
  try {
    return json5.parse(json);
  } catch (err) {
    return json;
  }
};

/**
 * @param {*} json JSON 文本
 * @returns {*} 解析结果，失败时原样返回入参
 */
exports.json_parse = function(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    return json;
  }
};

/**
 * @param {*} json 任意可序列化值
 * @returns {*} 深拷贝结果
 */
function deepCopyJson(json) {
  return JSON.parse(JSON.stringify(json));
}

exports.deepCopyJson = deepCopyJson;

exports.isJson5 = isJson5;

/**
 * @param {string} action 权限动作名
 * @param {string} role 当前角色
 * @returns {boolean} 是否有权限
 */
exports.checkAuth = (action, role) => {
  return Roles[roleAction[action]] <= Roles[role];
};

/**
 * @param {*} timestamp unix 秒
 * @returns {string} 格式化时间
 */
exports.formatTime = timestamp => {
  // dayjs.unix 按 UTC 秒解析,输出格式与替换前保持一致
  return dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

// 防抖函数，减少高频触发的函数执行的频率
// 请在 constructor 里使用:
// import { debounce } from '$/common';
// this.func = debounce(this.func, 400);
/**
 * @param {Function} func 目标函数
 * @param {number} wait 等待毫秒数
 * @returns {() => void} 防抖包装后的函数
 */
exports.debounce = (func, wait) => {
  /** @type {any} */
  let timeout;
  return function() {
    clearTimeout(timeout);
    timeout = setTimeout(func, wait);
  };
};

// 从 Javascript 对象中选取随机属性
/**
 * @param {*} obj 任意对象
 * @returns {*} 随机选中的属性名
 */
exports.pickRandomProperty = obj => {
  let result;
  let count = 0;
  for (let prop in obj) {
    if (Math.random() < 1 / ++count) {
      result = prop;
    }
  }
  return result;
};

/**
 * @param {string} path 图片基础路径
 * @param {string} type 图片扩展名
 * @returns {string} 按设备像素比拼出的图片路径
 */
exports.getImgPath = (path, type) => {
  let rate = window.devicePixelRatio >= 2 ? 2 : 1;
  return `${path}@${rate}x.${type}`;
};

/**
 * @param {string} str 待去空白字符串
 * @returns {string} 去空白结果
 */
function trim(str) {
  if (!str) {
    return str;
  }

  str = str + '';

  return str.replace(/(^\s*)|(\s*$)/g, '');
}

exports.trim = trim;

/**
 * @param {string} path 原始路径
 * @returns {string} 规范化后的接口路径
 */
exports.handlePath = path => {
  path = trim(path);
  if (!path) {
    return path;
  }
  if (path === '/') {
    return '';
  }
  path = path[0] !== '/' ? '/' + path : path;
  path = path[path.length - 1] === '/' ? path.substr(0, path.length - 1) : path;
  return path;
};

/**
 * @param {string} path 原始路径
 * @returns {string} 保证以 / 开头的路径
 */
exports.handleApiPath = path => {
  if (!path) {
    return '';
  }
  path = trim(path);
  path = path[0] !== '/' ? '/' + path : path;
  return path;
};

// 名称限制 constants.NAME_LIMIT 字符
/**
 * @param {string} type 名称类型（用于提示文案）
 * @returns {any[]} antd form 校验规则
 */
exports.nameLengthLimit = type => {
  /**
   * 返回字符串长度，汉字计数为2
   * @param {string} str 待计数文本
   * @returns {number} 长度
   */
  const strLength = str => {
    let length = 0;
    for (let i = 0; i < str.length; i++) {
      str.charCodeAt(i) > 255 ? (length += 2) : length++;
    }
    return length;
  };
  // 返回 form中的 rules 校验规则
  return [
    {
      required: true,
      /**
       * @param {*} rule 校验规则（未使用）
       * @param {*} value 当前字段值
       * @param {*} callback 校验回调
       * @returns {*} callback 的返回值
       */
      validator(rule, value, callback) {
        const len = value ? strLength(value) : 0;
        if (len > constants.NAME_LIMIT) {
          callback(
            '请输入' + type + '名称，长度不超过' + constants.NAME_LIMIT + '字符(中文算作2字符)!'
          );
        } else if (len === 0) {
          callback(
            '请输入' + type + '名称，长度不超过' + constants.NAME_LIMIT + '字符(中文算作2字符)!'
          );
        } else {
          return callback();
        }
      }
    }
  ];
};

// 去除所有html标签只保留文字

/**
 * @param {string} html 原始 HTML
 * @returns {string} 纯文本
 */
exports.htmlFilter = html => {
  let reg = /<\/?.+?\/?>/g;
  return html.replace(reg, '') || '新项目';
};

// 实现 Object.entries() 方法
/**
 * @param {*} obj 任意对象
 * @returns {any[]} [key, value] 二元组数组
 */
exports.entries = obj => {
  let res = [];
  for (let key in obj) {
    res.push([key, obj[key]]);
  }
  return res;
};

// 原生剪贴板写入：优先 Clipboard API，失败或弱环境降级 execCommand('copy')
/**
 * @param {string} text 待写入文本
 * @returns {boolean} 是否写入成功
 */
function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (e) {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}

/**
 * @param {string} text 待写入文本
 * @returns {Promise<boolean | void>} 成功与否（Clipboard API 成功时其 resolve 值为 void）
 */
exports.copyText = text => {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return Promise.resolve(fallbackCopyText(text));
};

/**
 * @param {string} mockTpl mock 模板（json5 文本）
 * @returns {string} 美化后的 mock 数据，失败返回空串
 */
exports.getMockText = mockTpl => {
  try {
    return JSON.stringify(Mock.mock(MockExtra(json5.parse(mockTpl), {})), null, '  ');
  } catch (err) {
    return '';
  }
};
/**
 * 合并后新的对象属性与 Obj 一致，nextObj 有对应属性则取 nextObj 属性值，否则取 Obj 属性值
 * @param  {Record<string, any>} Obj     旧对象
 * @param  {Record<string, any>} nextObj 新对象
 * @return {Record<string, any>}           合并后的对象
 */
exports.safeAssign = (Obj, nextObj) => {
  let keys = Object.keys(nextObj);
  return Object.keys(Obj).reduce(
    (/** @type {Record<string, any>} */ result, value) => {
      if (keys.indexOf(value) >= 0) {
        result[value] = nextObj[value];
      } else {
        result[value] = Obj[value];
      }
      return result;
    },
    {}
  );
};

/**
 * 交换数组的位置
 * @param {any[]} arr 原数组
 * @param {number} start 起始下标
 * @param {number} end 目标下标
 * @returns {{ id: any, index: number }[]} 新的顺序描述（含 _id 与 index）
 */
exports.arrayChangeIndex = (arr, start, end) => {
  // 保持 [].concat(arr) 的原语义（arr 可能被调用方传入非数组），仅补类型断言
  let newArr = /** @type {any[]} */ (([]).concat(/** @type {any} */ (arr)));
  // newArr[start] = arr[end];
  // newArr[end] = arr[start];
  let startItem = newArr[start];
  newArr.splice(start, 1);
  // end自动加1
  newArr.splice(end, 0, startItem);
  /** @type {{ id: any, index: number }[]} */
  let changes = [];
  newArr.forEach((item, index) => {
    changes.push({
      id: item._id,
      index: index
    });
  });

  return changes;
};

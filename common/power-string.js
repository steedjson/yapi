// @ts-check
/**
 * @author suxiaoxin
 */

const aUniqueVerticalStringNotFoundInData = '___UNIQUE_VERTICAL___';
const aUniqueCommaStringNotFoundInData = '___UNIQUE_COMMA___';
const segmentSeparateChar = '|';
const methodAndArgsSeparateChar = ':';
const argsSeparateChar = ',';

const md5 = require('md5');
const sha = require('sha.js');
const Base64 = require('js-base64').Base64;

/**
 * 处理函数签名：首个参数由 addMethod 注入（当前累积的字符串），其余为表达式参数。
 * 返回值会被回写到实例的 _string，故不限定返回类型（length/number 会返回非字符串）。
 * @typedef {(...args: *) => *} StringHandle
 */

/**
 * 「方法名 → 处理函数」映射表形态。stringHandles 是字面量对象、自身没有索引签名，
 * 动态按名查表处（handleSegment）用此断言。
 * @typedef {Record<string, StringHandle>} StringHandleTable
 */

/**
 * filter 表达式中的一个分段：index 为 0 时是原始字符串，其余位置为
 * `{ method, args }`（由 handleSegment 产出，execute 据此调用实例上的同名方法）。
 * @typedef {{ method: string, args: *[] }} Segment
 */

const stringHandles = {
  /** @param {string} str */
  md5: function(str) {
    return md5(str);
  },

  /**
   * @param {string} str
   * @param {import('sha.js').Algorithm} arg 算法名（sha1/sha224/sha256/sha384/sha512）
   */
  sha: function(str, arg) {
    return sha(arg)
      .update(str)
      .digest('hex');
  },

  /**
   * type: sha1 sha224 sha256 sha384 sha512
   * @param {string} str
   */
  sha1: function(str) {
    return sha('sha1')
      .update(str)
      .digest('hex');
  },

  /** @param {string} str */
  sha224: function(str) {
    return sha('sha224')
      .update(str)
      .digest('hex');
  },

  /** @param {string} str */
  sha256: function(str) {
    return sha('sha256')
      .update(str)
      .digest('hex');
  },

  /** @param {string} str */
  sha384: function(str) {
    return sha('sha384')
      .update(str)
      .digest('hex');
  },

  /** @param {string} str */
  sha512: function(str) {
    return sha('sha512')
      .update(str)
      .digest('hex');
  },

  /** @param {string} str */
  base64: function(str) {
    return Base64.encode(str);
  },

  /** @param {string} str */
  unbase64: function(str) {
    return Base64.decode(str);
  },

  /**
   * @param {string} str
   * @param {...*} args 透传给 String.prototype.substr 的 start/length
   */
  substr: function(str, ...args) {
    // String.prototype.substr 只接受 (start, length) 两个位置参数，而实参类型由
    // handleValue 决定（默认为字符串，靠 substr 自身做数字转换），
    // 故此处按「可选元素元组」断言以满足展开调用的语法要求。
    return str.substr(.../** @type {[*, *?]} */ (args));
  },

  /**
   * @param {string} str
   * @param {...*} args
   */
  concat: function(str, ...args) {
    args.forEach(item => {
      str += item;
    });
    return str;
  },

  /**
   * 挂载为原型方法后由实例调用，this 即 PowerString 实例（故可读 _string）。
   * @this {PowerString}
   * @param {string} str
   * @param {...*} args
   */
  lconcat: function(str, ...args) {
    args.forEach(item => {
      str = item + this._string;
    });
    return str;
  },

  /** @param {string} str */
  lower: function(str) {
    return str.toLowerCase();
  },

  /** @param {string} str */
  upper: function(str) {
    return str.toUpperCase();
  },

  /** @param {string} str */
  length: function(str) {
    return str.length;
  },

  /** @param {string} str */
  number: function(str) {
    return !isNaN(/** @type {*} */ (str)) ? +str : str;
  }
};

/** @type {(str: string) => *} */
let handleValue = function(str) {
  return str;
};

/**
 * 去掉分段值两端成对的引号，并还原表达式里被转义的分隔符。
 * @param {string} str
 * @returns {*}
 */
const _handleValue = function(str) {
  if (str[0] === str[str.length - 1] && (str[0] === '"' || str[0] === "'")) {
    str = str.substr(1, str.length - 2);
  }
  return handleValue(
    str
      .replace(new RegExp(aUniqueVerticalStringNotFoundInData, 'g'), segmentSeparateChar)
      .replace(new RegExp(aUniqueCommaStringNotFoundInData, 'g'), argsSeparateChar)
  );
};

class PowerString {
  /** @param {string} str */
  constructor(str) {
    this._string = str;
  }

  toString() {
    return this._string;
  }
}

/**
 * importMethods 挂载完成后的实例形态：可按 stringHandles 中任意方法名调用，
 * 方法内部把 _string 作为首参传入并返回实例自身，故支持链式调用。
 * @typedef {PowerString & StringHandleTable} PowerStringInstance
 */

/**
 * 把处理函数挂载为 PowerString 的原型方法。
 * @param {string} method 方法名（与表达式中的名称一致）
 * @param {StringHandle} fn 处理函数
 */
function addMethod(method, fn) {
  (/** @type {PowerStringInstance} */ (PowerString.prototype))[method] = function(...args) {
    args.unshift(this._string + '');
    this._string = fn.apply(this, args);
    return this;
  };
}

/**
 * @param {StringHandleTable} handles 方法表
 */
function importMethods(handles) {
  for (let method in handles) {
    addMethod(method, handles[method]);
  }
}

importMethods(stringHandles);

/**
 * 解析 filter 表达式（类似 angularJs 的 filter）。
 * @param {string} str 表达式，如 `string | substr: 1, 10 | md5 | concat: hello`
 * @param {StringHandle} [handleValueFn] 处理参数值函数，默认原样返回参数值
 * @returns {string}
 */
function handleOriginStr(str, handleValueFn) {
  if (!str) return str;
  if (typeof handleValueFn === 'function') {
    handleValue = handleValueFn;
  }
  str = str
    .replace('\\' + segmentSeparateChar, aUniqueVerticalStringNotFoundInData)
    .replace('\\' + argsSeparateChar, aUniqueCommaStringNotFoundInData)
    .split(segmentSeparateChar)
    .map(handleSegment)
    .reduce(execute, /** @type {*} */ (null))
    .toString();
  return str;
}

/**
 * reduce 回调：index 为 0 时 curItem 是原始字符串（此时 str 为初值 null、不使用），
 * 其余位置 curItem 是 handleSegment 产出的分段对象，据此调用实例上的同名方法。
 * @param {PowerStringInstance} str 上一轮结果；index 为 0 时不使用（初值为 null 占位）
 * @param {*} curItem 当前分段，形态由 index 决定（见上）
 * @param {number} index
 * @returns {PowerStringInstance}
 */
function execute(str, curItem, index) {
  if (index === 0) {
    // 原型方法由 importMethods 动态挂载，静态类型上尚不体现，故按挂载后的形态断言
    return /** @type {PowerStringInstance} */ (new PowerString(curItem));
  }
  return str[curItem.method].apply(str, curItem.args);
}

/**
 * 解析单个分段。
 * 注意：str 在函数内被复用为两种形态——入参是字符串，命中 `方法名:参数` 分支后
 * 被复用为 split 结果数组，故入参按联合类型声明，由首次赋值收窄。
 * @param {string|string[]} str
 * @param {number} index
 * @returns {string|Segment}
 */
function handleSegment(str, index) {
  str = /** @type {string} */ (str).trim();
  if (index === 0) {
    return _handleValue(str);
  }

  let method,
    args = [];
  if (str.indexOf(methodAndArgsSeparateChar) > 0) {
    str = str.split(methodAndArgsSeparateChar);
    method = str[0].trim();
    args = str[1].split(argsSeparateChar).map(item => _handleValue(item.trim()));
  } else {
    method = str;
  }
  if (typeof (/** @type {StringHandleTable} */ (stringHandles))[method] !== 'function') {
    throw new Error(`This method name(${method}) is not exist.`);
  }

  return {
    method,
    args
  };
}

module.exports = {
  utils: stringHandles,
  PowerString,
  /**
   * 类似于 angularJs的 filter 功能
   * @params string
   * @params fn 处理参数值函数，默认是一个返回原有参数值函数
   *
   * @expamle
   * filter('string | substr: 1, 10 | md5 | concat: hello ')
   */
  filter: handleOriginStr
};

// @ts-check
/**
 * JSON -> JSON Schema（draft-04 风格）转换。
 *
 * 自 2026-09 起自 easy-json-schema@0.0.2-beta（停更 beta 包）原样内联：
 * 算法未改动（'*key' 前缀标记必填；已含受支持 type 字段的对象按既有 schema 处理并
 * 递归 properties/items），仅去掉 window 全局挂载并整理为标准 CommonJS 导出。
 * 唯一消费方：server/utils/commons.js validateParams（行为由 test/server/validateParams.test.js 钉住）。
 */

/**
 * @param {any} obj
 * @returns {boolean}
 */
function isPlainObject(obj) {
  return obj ? typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype : false;
}

const supportType = ['string', 'number', 'array', 'object', 'boolean', 'integer'];

/**
 * @param {any} type
 * @returns {any}
 */
function getType(type) {
  if (!type) type = 'string';
  if (supportType.indexOf(type) !== -1) {
    return type;
  }
  return typeof type;
}

/**
 * @param {any} object
 * @returns {boolean}
 */
function isSchema(object) {
  if (supportType.indexOf(object.type) !== -1) {
    return true;
  }
  return false;
}

/**
 * @param {any} json
 * @param {any} schema
 */
function handleSchema(json, schema) {
  Object.assign(schema, json);
  if (schema.type === 'object') {
    delete schema.properties;
    parse(json.properties, schema);
  }
  if (schema.type === 'array') {
    delete schema.items;
    schema.items = {};
    parse(json.items, schema.items);
  }
}

/**
 * @param {any[]} arr
 * @param {any} schema
 */
function handleArray(arr, schema) {
  schema.type = 'array';
  var props = (schema.items = {});
  parse(arr[0], props);
}

/**
 * @param {any} json
 * @param {any} schema
 */
function handleObject(json, schema) {
  if (isSchema(json)) {
    return handleSchema(json, schema);
  }
  schema.type = 'object';
  schema.required = [];
  /** @type {any} */
  var props = (schema.properties = {});
  for (var key in json) {
    var item = json[key];
    var curSchema = (props[key] = {});
    if (key[0] === '*') {
      delete props[key];
      key = key.substr(1);
      schema.required.push(key);
      curSchema = props[key] = {};
    }
    parse(item, curSchema);
  }
}

/**
 * @param {any} json
 * @param {any} schema
 */
function parse(json, schema) {
  if (Array.isArray(json)) {
    handleArray(json, schema);
  } else if (isPlainObject(json)) {
    handleObject(json, schema);
  } else {
    schema.type = getType(json);
  }
}

/**
 * @param {any} data
 * @returns {any}
 */
function ejs(data) {
  var JsonSchema = {};
  parse(data, JsonSchema);
  return JsonSchema;
}

module.exports = ejs;

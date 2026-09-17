// @ts-check

let fieldNum = 1;

/**
 * 将 JSON Schema 转换为表格数据结构
 * @param {Record<string, any>} schema - JSON Schema 对象
 * @returns {*} 表格行数据；解析失败时为 undefined
 */
exports.schemaTransformToTable = schema => {
  try {
    schema = checkJsonSchema(schema);
    let result = Schema(schema, 0);
    result = Array.isArray(result) ? result : [result];
    return result;
  } catch (err) {
    console.log(err);
  }
};

//  自动添加type

/**
 * 自动补全缺失的 type 字段
 * @param {Record<string, any>} json - 原 JSON Schema
 * @returns {Record<string, any>} 补全 type 后的浅拷贝
 */
function checkJsonSchema(json) {
  let newJson = Object.assign({}, json);
  if (json.type === undefined && typeof json.properties === 'object') {
    newJson.type = 'object';
  }

  return newJson;
}

/**
 * 按 JSON Schema 的类型分发到对应的转换函数
 * @param {Record<string, any>} data - JSON Schema 节点
 * @param {string|number} index - 节点键名或索引
 * @returns {*} 转换后的表格节点
 */
const mapping = function(data, index) {
  switch (data.type) {
    case 'string':
      return SchemaString(data);

    case 'number':
      return SchemaNumber(data);

    case 'array':
      return SchemaArray(data, index);

    case 'object':
      return SchemaObject(data, index);

    case 'boolean':
      return SchemaBoolean(data);

    case 'integer':
      return SchemaInt(data);
    default:
      return SchemaOther(data);
  }
};

/**
 * 拼接标题与描述
 * @param {string} title - 标题
 * @param {string} desc - 描述
 * @returns {string} 以换行拼接并去首尾空白后的文本
 */
const ConcatDesc = (title, desc) => {
  return [title, desc].join('\n').trim();
};

/**
 * 转换单个 Schema 节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @param {string|number} key - 节点键名
 * @returns {*} 转换后的表格节点（object 类型直接返回子节点数组）
 */
const Schema = (data, key) => {
  let result = mapping(data, key);
  if (data.type !== 'object') {
    let desc = result.desc;
    let d = result.default;
    let children = result.children;

    delete result.desc;
    delete result.default;
    delete result.children;
    let item = {
      type: data.type,
      key,
      desc,
      default: d,
      sub: result
    };

    if (Array.isArray(children)) {
      item = Object.assign({}, item, { children });
    }

    return item;
  }

  return result;
};

/**
 * 转换 object 类型节点，展开其 properties
 * @param {Record<string, any>} data - JSON Schema 节点
 * @param {string|number} key - 节点键名
 * @returns {any[]} 表格行数组
 */
const SchemaObject = (data, key) => {
  let { properties, required } = data;
  properties = properties || {};
  required = required || [];
  /** @type {any[]} */
  let result = [];
  Object.keys(properties).map((name, index) => {
    let value = properties[name];
    let copiedState = checkJsonSchema(JSON.parse(JSON.stringify(value)));

    let optionForm = Schema(copiedState, key + '-' + index);
    let item = {
      name,
      key: key + '-' + index,
      desc: ConcatDesc(copiedState.title, copiedState.description),
      required: required.indexOf(name) != -1
    };

    if (value.type === 'object' || (value.type === undefined && Array.isArray(optionForm))) {
      item = Object.assign({}, item, { type: 'object', children: optionForm });
      delete (/** @type {*} */ (item)).sub;
    } else {
      item = Object.assign({}, item, optionForm);
    }

    result.push(item);
  });

  return result;
};

/**
 * 转换 string 类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @returns {object} 表格节点属性
 */
const SchemaString = data => {
  let item = {
    desc: ConcatDesc(data.title, data.description),
    default: data.default,
    maxLength: data.maxLength,
    minLength: data.minLength,
    enum: data.enum,
    enumDesc: data.enumDesc,
    format: data.format,
    mock: data.mock && data.mock.mock
  };
  return item;
};

/**
 * 转换 array 类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @param {string|number} index - 节点索引
 * @returns {*} 转换后的表格节点
 */
const SchemaArray = (data, index) => {
  data.items = data.items || { type: 'string' };
  let items = checkJsonSchema(data.items);
  let optionForm = mapping(items, index);
  //  处理array嵌套array的问题
  let children =optionForm ;
  if (!Array.isArray(optionForm) && optionForm !== undefined) {
    optionForm.key = 'array-' + fieldNum++;
    children = [optionForm];
  }

  let item = {
    desc: ConcatDesc(data.title, data.description),
    default: data.default,
    minItems: data.minItems,
    uniqueItems: data.uniqueItems,
    maxItems: data.maxItems,
    itemType: items.type,
    children
  };
  if (items.type === 'string') {
    item = Object.assign({}, item, { itemFormat: items.format });
  }
  return item;
};

/**
 * 转换 number 类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @returns {object} 表格节点属性
 */
const SchemaNumber = data => {
  let item = {
    desc: ConcatDesc(data.title, data.description),
    maximum: data.maximum,
    minimum: data.minimum,
    default: data.default,
    format: data.format,
    enum: data.enum,
    enumDesc: data.enumDesc,
    mock: data.mock && data.mock.mock
  };
  return item;
};

/**
 * 转换 integer 类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @returns {object} 表格节点属性
 */
const SchemaInt = data => {
  let item = {
    desc: ConcatDesc(data.title, data.description),
    maximum: data.maximum,
    minimum: data.minimum,
    default: data.default,
    format: data.format,
    enum: data.enum,
    enumDesc: data.enumDesc,
    mock: data.mock && data.mock.mock
  };
  return item;
};

/**
 * 转换 boolean 类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @returns {object} 表格节点属性
 */
const SchemaBoolean = data => {
  let item = {
    desc: ConcatDesc(data.title, data.description),
    default: data.default,
    enum: data.enum,
    mock: data.mock && data.mock.mock
  };
  return item;
};

/**
 * 转换其他类型节点
 * @param {Record<string, any>} data - JSON Schema 节点
 * @returns {object} 表格节点属性
 */
const SchemaOther = data => {
  let item = {
    desc: ConcatDesc(data.title, data.description),
    default: data.default,
    mock: data.mock && data.mock.mock
  };
  return item;
};

// @ts-check
/**
 * JsonSchemaEditor 纯函数层：JSON Schema 数据契约的容错解析、稳定序列化与节点操作。
 *
 * 数据契约（与 json-schema-editor-visual 保持兼容，见 docs/json-schema-editor-plan.md）：
 * - 顶层固定 `{ type: 'object', properties: {} , required: [...] }`，可含 title/$schema 等透传字段；
 * - 属性节点字段：type / default / enum / enumDesc / mock / description / format / title 等，
 *   其中 mock 为 YApi 形态 `{ mock: '@name' }`（旧编辑器 MockSelect 写入的正是该形态）；
 * - object.properties 与 array.items 递归嵌套；
 * - 兼容红线：历史数据中的未知字段编辑往返后必须保留（读取不丢失）。
 *
 * 全部为纯函数：入参 schema 不被原地修改，变更操作返回新根对象；
 * 无变更（重名 / 边界 / 未知路径等）时原样返回入参引用，供组件据此跳过 onChange。
 */

/** @type {string[]} 支持的类型集合（对齐旧编辑器 utils.SCHEMA_TYPE） */
const SCHEMA_TYPES = ['string', 'number', 'array', 'object', 'boolean', 'integer'];

/** @type {string[]} 类型专属结构键，切换类型时由新类型的默认结构重建，不做字段保留 */
const STRUCTURAL_KEYS = ['type', 'properties', 'items'];

/** @type {string[]} 序列化时的规范键顺序（先已知键按此顺序，其余未知键按原顺序追加） */
const CANONICAL_KEYS = [
  'type',
  'title',
  'description',
  'default',
  'enum',
  'enumDesc',
  'mock',
  'format',
  'properties',
  'required',
  'items'
];

/** 数组 items 行在树中的显示名（对齐旧编辑器写死的 "Items"） */
const ITEMS_ROW_NAME = 'Items';

/**
 * @typedef {Record<string, any>} SchemaNode JSON Schema 节点（顶层根或属性/items 节点）
 */

/**
 * @typedef {Object} SchemaRow
 * @property {string} key 行唯一 key（JSON.stringify(nodePath)，任意字段名下无碰撞）
 * @property {string[]} path 节点路径（从根到该节点的键序列，如 ['properties','a','items']）
 * @property {string} name 属性名（items 行为 'Items'）
 * @property {SchemaNode} node 节点对象
 * @property {number} depth 缩进层级（根属性为 0）
 * @property {'property'|'items'} kind 行类别
 * @property {string[]|null} parentPropsPath 所属 properties 对象的路径（items 行为 null）
 * @property {boolean} isRequired 是否出现在父级 required 中
 * @property {boolean} expandable 是否可展开（object/array）
 */

/**
 * @param {any} value
 * @returns {boolean} 是否为普通对象（非数组非 null）
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * JSON 值深拷贝（契约数据保证 JSON-safe）。
 * @param {any} value
 * @returns {any}
 */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 读取对象「自有数据属性」的值。数据键可能是任意字符串（含 __proto__），
 * 经属性描述符读取，避免在自有键缺席时命中 Object.prototype 的 __proto__ 存取器
 * （B1 加固：无效路径/缺席键返回 undefined 而非原型对象）。
 * @param {Record<string, any>} obj
 * @param {string} key
 * @returns {any}
 */
function getOwnValue(obj, key) {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  return desc === undefined ? undefined : desc.value;
}

/**
 * 以 CreateDataProperty 语义写入自有数据属性（与对象展开/JSON.parse 的键写入同语义，
 * 不触发 Object.prototype 的 __proto__ 存取器）。B1 修复的关键原语：
 * "新造空对象 + obj[key]=value" 的键拷贝循环对键名 __proto__ 会命中存取器——
 * 基本类型值静默丢键、对象值偷换本地原型（幻影字段）。
 * @param {Record<string, any>} target
 * @param {string} key
 * @param {any} value
 * @returns {Record<string, any>} target（便于循环内调用）
 */
function defineKey(target, key, value) {
  Object.defineProperty(target, key, {
    value: value,
    writable: true,
    enumerable: true,
    configurable: true
  });
  return target;
}

/**
 * 自有键值对快照（值经描述符读取，键序保持入参对象的自有键序）。
 * @param {Record<string, any>} obj
 * @returns {[string, any][]}
 */
function ownEntries(obj) {
  return Object.keys(obj).map(key => /** @type {[string, any]} */ ([key, getOwnValue(obj, key)]));
}

/**
 * 以 CreateDataProperty 语义按键值对序重建对象（键序保持）。
 * @param {[string, any][]} entries
 * @returns {Record<string, any>}
 */
function buildObject(entries) {
  const out = /** @type {Record<string, any>} */ ({});
  entries.forEach(pair => defineKey(out, pair[0], pair[1]));
  return out;
}

/**
 * 指定类型的默认节点（对齐旧编辑器 utils.defaultSchema）。
 * @param {string} type
 * @returns {SchemaNode}
 */
function defaultNode(type) {
  if (type === 'object') {
    return { type: 'object', properties: {} };
  }
  if (type === 'array') {
    return { type: 'array', items: { type: 'string' } };
  }
  return { type };
}

/**
 * 空根 schema（对齐旧编辑器 data 为空时的初始形态，但不写入 title: 'empty object'，
 * 避免污染输出数据）。
 * @returns {SchemaNode}
 */
function defaultRoot() {
  return { type: 'object', properties: {} };
}

/**
 * 递归规范化节点结构（对齐旧编辑器 schema.js handleSchema）：
 * - 缺 type 时：有 properties 视为 object，否则视为 string；
 * - object 缺/脏 properties 补 `{}`；array 缺/脏 items 补 `{type:'string'}`；
 * - 仅补结构，不改写其余任何字段（未知字段原样保留）。
 * @param {any} node
 * @returns {SchemaNode}
 */
function normalizeNode(node) {
  if (!isPlainObject(node)) {
    return defaultNode('string');
  }
  if (!node.type) {
    node.type = isPlainObject(node.properties) ? 'object' : 'string';
  }
  if (node.type === 'object') {
    if (!isPlainObject(node.properties)) {
      node.properties = {};
    }
    Object.keys(node.properties).forEach(name => {
      node.properties[name] = normalizeNode(node.properties[name]);
    });
  } else if (node.type === 'array') {
    if (!isPlainObject(node.items)) {
      node.items = { type: 'string' };
    }
    node.items = normalizeNode(node.items);
  }
  return node;
}

/**
 * 容错解析：字符串按 JSON.parse 严格解析（与旧编辑器一致），非法 / 空 / 非 object 顶层
 * 一律回退为空 object 根；对象入参深拷贝后规范化。绝不抛出。
 * @param {any} input data prop（JSON 字符串 / 已解析对象 / 空值 / 脏数据）
 * @returns {SchemaNode} 规范化后的根 schema
 */
function parseSchema(input) {
  let data = null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return defaultRoot();
    }
    try {
      data = JSON.parse(trimmed);
    } catch (/** @type {any} */ e) {
      return defaultRoot();
    }
  } else if (isPlainObject(input)) {
    data = input;
  } else {
    return defaultRoot();
  }
  if (!isPlainObject(data)) {
    return defaultRoot();
  }
  return normalizeNode(cloneJson(data));
}

/**
 * 仅对结构键（properties/items）递归规范化键序，其余键值原样透传。
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function canonicalizeValue(key, value) {
  if (key === 'properties' && isPlainObject(value)) {
    return buildObject(ownEntries(value).map(pair => [pair[0], canonicalizeNode(pair[1])]));
  }
  if (key === 'items' && isPlainObject(value)) {
    return canonicalizeNode(value);
  }
  return value;
}

/**
 * 递归按规范键顺序重排节点键（已知键按 CANONICAL_KEYS 在前，未知键按原顺序在后），
 * 保证同一份 schema 序列化结果逐字节稳定（幂等）。
 * 键值对经 CreateDataProperty 语义写入（B1 修复）：未知键拷贝不得用
 * "fresh {} + obj[key]=value" 循环，否则键名 __proto__ 会被静默丢弃/偷换原型。
 * @param {SchemaNode} node
 * @returns {SchemaNode}
 */
function canonicalizeNode(node) {
  /** @type {[string, any][]} */
  const entries = [];
  CANONICAL_KEYS.forEach(key => {
    const value = getOwnValue(node, key);
    if (value !== undefined) {
      entries.push([key, canonicalizeValue(key, value)]);
    }
  });
  ownEntries(node).forEach(pair => {
    if (CANONICAL_KEYS.indexOf(pair[0]) === -1) {
      entries.push([pair[0], canonicalizeValue(pair[0], pair[1])]);
    }
  });
  return buildObject(entries);
}

/**
 * 稳定序列化：compact JSON（与旧编辑器 onChange 输出的 JSON.stringify 形态一致），
 * 键序规范化保证幂等。
 * @param {SchemaNode} schema
 * @returns {string}
 */
function stringifySchema(schema) {
  return JSON.stringify(canonicalizeNode(schema));
}

/**
 * 按路径取节点（空路径返回根本身；路径中断返回 undefined）。
 * 逐级走自有属性描述符读取（B1 加固）：键名 __proto__ 或无效路径不会命中
 * Object.prototype 的存取器/原型链。
 * @param {any} root
 * @param {string[]} path
 * @returns {any}
 */
function getNode(root, path) {
  let cur = root;
  for (let i = 0; i < path.length; i++) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = getOwnValue(cur, path[i]);
  }
  return cur;
}

/**
 * 按路径写入节点值（root 须已克隆，可安全原地写）；空路径返回 value 本身。
 * @param {any} root
 * @param {string[]} path
 * @param {any} value
 * @returns {any} 根（或空路径时的新值）
 */
function setNodeValue(root, path, value) {
  if (path.length === 0) {
    return value;
  }
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
  return root;
}

/**
 * 各操作共用的入口：深拷贝 + 规范化，保证在脏数据上同样安全。
 * @param {SchemaNode} schema
 * @returns {SchemaNode}
 */
function cloneRoot(schema) {
  return normalizeNode(cloneJson(schema));
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function hasRequiredArray(value) {
  return isPlainObject(value) && Array.isArray(value.required);
}

/**
 * 在 properties 对象里取一个不冲突的 field_N 名称（首个空闲 N，行为确定性可测；
 * 名称格式对齐旧编辑器的 'field_' + N）。
 * @param {Record<string, any>} props
 * @returns {string}
 */
function uniqueFieldName(props) {
  let i = 1;
  while (Object.prototype.hasOwnProperty.call(props, 'field_' + i)) {
    i++;
  }
  return 'field_' + i;
}

/**
 * 在 parentPropsPath 指向的 properties 中新增 string 属性（afterName 为空则追加末尾），
 * 并将其加入所属节点的 required（对齐旧编辑器 addFieldAction/addChildFieldAction：
 * 新增字段默认必填）。
 * @param {SchemaNode} schema
 * @param {string[]} parentPropsPath 目标 properties 对象路径（根级为 ['properties']）
 * @param {string|null} afterName 插入锚点属性名（null/undefined 表示追加末尾）
 * @returns {SchemaNode} 新根；目标 properties 不存在时原样返回
 */
function addProperty(schema, parentPropsPath, afterName) {
  const root = cloneRoot(schema);
  const owner = getNode(root, parentPropsPath.slice(0, -1));
  if (!isPlainObject(owner) || !isPlainObject(owner.properties)) {
    return schema;
  }
  const props = owner.properties;
  const name = uniqueFieldName(props);
  /** @type {[string, any][]} */
  const newEntries = [];
  let inserted = false;
  ownEntries(props).forEach(pair => {
    newEntries.push(pair);
    if (!inserted && pair[0] === afterName) {
      newEntries.push([name, defaultNode('string')]);
      inserted = true;
    }
  });
  if (!inserted) {
    newEntries.push([name, defaultNode('string')]);
  }
  // B1 修复：CreateDataProperty 语义重建，__proto__ 等数据键原样保全
  owner.properties = buildObject(newEntries);
  const required = hasRequiredArray(owner) ? owner.required.slice() : [];
  required.push(name);
  owner.required = required;
  return root;
}

/**
 * 删除 nodePath 指向的属性节点，并同步清理所属节点 required 中的引用
 * （required 清空后整个键删除，对齐旧编辑器 deleteItemAction + enableRequireAction 组合）。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath 属性节点路径（末位为属性名）
 * @returns {SchemaNode} 新根；节点不存在时原样返回
 */
function removeProperty(schema, nodePath) {
  if (nodePath.length === 0) {
    return schema;
  }
  const root = cloneRoot(schema);
  const name = nodePath[nodePath.length - 1];
  const parentPropsPath = nodePath.slice(0, -1);
  const props = getNode(root, parentPropsPath);
  if (!isPlainObject(props) || !Object.prototype.hasOwnProperty.call(props, name)) {
    return schema;
  }
  // B1 修复：CreateDataProperty 语义重建，__proto__ 等数据键原样保全
  const newProps = buildObject(
    ownEntries(props).filter(pair => pair[0] !== name)
  );
  setNodeValue(root, parentPropsPath, newProps);
  const owner = getNode(root, parentPropsPath.slice(0, -1));
  if (hasRequiredArray(owner)) {
    const nextRequired = owner.required.filter((/** @type {string} */ n) => n !== name);
    if (nextRequired.length > 0) {
      owner.required = nextRequired;
    } else {
      delete owner.required;
    }
  }
  return root;
}

/**
 * 重命名属性：键序保持原位，所属 required 数组同步映射（对齐旧编辑器 changeNameAction）。
 * 重名目标 / 空名 / 同名 / 节点不存在时原样返回（对齐旧编辑器的重名拒改）。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath
 * @param {string} nextName
 * @returns {SchemaNode}
 */
function renameProperty(schema, nodePath, nextName) {
  if (nodePath.length === 0 || !nextName || nextName === nodePath[nodePath.length - 1]) {
    return schema;
  }
  const root = cloneRoot(schema);
  const oldName = nodePath[nodePath.length - 1];
  const parentPropsPath = nodePath.slice(0, -1);
  const props = getNode(root, parentPropsPath);
  if (
    !isPlainObject(props) ||
    !Object.prototype.hasOwnProperty.call(props, oldName) ||
    Object.prototype.hasOwnProperty.call(props, nextName)
  ) {
    return schema;
  }
  // B1 修复：CreateDataProperty 语义重建——改名目标可以是任意键名（含 __proto__），
  // 赋值循环会静默丢键并造成 required 悬挂引用
  const newProps = buildObject(
    ownEntries(props).map(pair => [pair[0] === oldName ? nextName : pair[0], pair[1]])
  );
  setNodeValue(root, parentPropsPath, newProps);
  const owner = getNode(root, parentPropsPath.slice(0, -1));
  if (hasRequiredArray(owner)) {
    owner.required = owner.required.map((/** @type {string} */ n) => (n === oldName ? nextName : n));
  }
  return root;
}

/**
 * 勾选 / 取消必填：维护所属节点的 required 数组（清空后删键，对齐旧编辑器
 * enableRequireAction）。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath
 * @param {boolean} required
 * @returns {SchemaNode}
 */
function toggleRequired(schema, nodePath, required) {
  if (nodePath.length === 0) {
    return schema;
  }
  const root = cloneRoot(schema);
  const name = nodePath[nodePath.length - 1];
  const parentPropsPath = nodePath.slice(0, -1);
  const props = getNode(root, parentPropsPath);
  if (!isPlainObject(props) || !Object.prototype.hasOwnProperty.call(props, name)) {
    return schema;
  }
  const owner = getNode(root, parentPropsPath.slice(0, -1));
  if (!isPlainObject(owner)) {
    return schema;
  }
  const cur = hasRequiredArray(owner) ? owner.required : [];
  let next = cur;
  if (required && cur.indexOf(name) === -1) {
    next = cur.concat([name]);
  } else if (!required && cur.indexOf(name) !== -1) {
    next = cur.filter((/** @type {string} */ n) => n !== name);
  }
  if (next === cur) {
    return schema;
  }
  if (next.length > 0) {
    owner.required = next;
  } else {
    delete owner.required;
  }
  return root;
}

/**
 * 切换节点类型：结构键（type/properties/items）由新类型默认结构重建
 * （切 object 自动建 properties、切 array 自动建 items，对齐旧编辑器 defaultSchema）；
 * 其余字段（title/description/mock/enum/enumDesc/format/default 及未知字段）merge 保留
 * （兼容红线：读取不丢失）。同类型 / 非法类型 / 节点不存在时原样返回。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath 根节点为 []
 * @param {string} nextType
 * @returns {SchemaNode}
 */
function changeNodeType(schema, nodePath, nextType) {
  if (SCHEMA_TYPES.indexOf(nextType) === -1) {
    return schema;
  }
  const root = cloneRoot(schema);
  const node = getNode(root, nodePath);
  if (!isPlainObject(node) || node.type === nextType) {
    return schema;
  }
  // B1 同类修复：非结构字段保留须经 CreateDataProperty 语义复制（对象展开为
  // CreateDataProperty 写入），fresh {} + obj[key]=value 循环会命中 __proto__ 存取器；
  // required 仅对 object 有语义（描述 properties 的必填集合），随旧类型一并丢弃
  const next = /** @type {SchemaNode} */ ({ ...node });
  STRUCTURAL_KEYS.forEach(key => {
    delete next[key];
  });
  delete next.required;
  Object.assign(next, defaultNode(nextType));
  return setNodeValue(root, nodePath, next);
}

/**
 * 同级上移 / 下移：重建父 properties 的键序（required 数组不含顺序语义，不动）。
 * 已在边界 / 节点不存在时原样返回。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath
 * @param {'up'|'down'} direction
 * @returns {SchemaNode}
 */
function moveProperty(schema, nodePath, direction) {
  if (nodePath.length === 0) {
    return schema;
  }
  const root = cloneRoot(schema);
  const name = nodePath[nodePath.length - 1];
  const parentPropsPath = nodePath.slice(0, -1);
  const props = getNode(root, parentPropsPath);
  if (!isPlainObject(props)) {
    return schema;
  }
  const names = Object.keys(props);
  const index = names.indexOf(name);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index === -1 || target < 0 || target >= names.length) {
    return schema;
  }
  /** @type {[string, any][]} */
  const entries = ownEntries(props);
  const swapped = entries[index];
  entries[index] = entries[target];
  entries[target] = swapped;
  // B1 修复：CreateDataProperty 语义重建，__proto__ 等数据键原样保全
  setNodeValue(root, parentPropsPath, buildObject(entries));
  return root;
}

/**
 * 通用字段写入：value 为 '' / null / undefined 时删除该字段，否则写入。
 * 比旧编辑器 changeValueAction 的 falsy 全删更保守：false / 0 等合法 falsy 值
 * 原样写入不删除（红线测试固化该行为）。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath
 * @param {string} field
 * @param {any} value
 * @returns {SchemaNode}
 */
function setNodeField(schema, nodePath, field, value) {
  const root = cloneRoot(schema);
  const node = getNode(root, nodePath);
  if (!isPlainObject(node)) {
    return schema;
  }
  if (value === undefined || value === null || value === '') {
    if (!Object.prototype.hasOwnProperty.call(node, field)) {
      return schema;
    }
    delete node[field];
  } else {
    node[field] = value;
  }
  return root;
}

/**
 * 写入 mock（YApi 形态 `{ mock: '<value>' }`；清空删除整个 mock 字段）。
 * 语义对齐旧编辑器 SchemaJson.handleChangeMock：`value ? { mock: value } : ''`。
 * 当前值识别兼容历史字符串形态 mock（mock: '@raw-string'）：其字符串值视为当前
 * mock 值——清空时删除整个 mock 键（批次 2 等价性修复：此前字符串形态被当作
 * 无 mock，清空成为 no-op，与旧编辑器 changeValueAction falsy 删键不等价）。
 * @param {SchemaNode} schema
 * @param {string[]} nodePath
 * @param {string|null|undefined} mockValue
 * @returns {SchemaNode}
 */
function setMock(schema, nodePath, mockValue) {
  const value = mockValue === null || mockValue === undefined ? '' : String(mockValue);
  const curNode = getNode(schema, nodePath);
  let curMock = '';
  if (isPlainObject(curNode)) {
    if (isPlainObject(curNode.mock)) {
      curMock = curNode.mock.mock;
    } else if (typeof curNode.mock === 'string') {
      curMock = curNode.mock;
    }
  }
  if (curMock === value) {
    return schema;
  }
  return setNodeField(schema, nodePath, 'mock', value === '' ? '' : { mock: value });
}

/**
 * 将属性树摊平为可见行列表（按折叠谓词跳过已折叠子树），供 schemaTree 渲染。
 * 数组节点在其子级渲染一行 items（对齐旧编辑器的 Items 行），items 为 object 时
 * 其 properties 继续下钻。
 * @param {SchemaNode} schema 已 parseSchema 的根
 * @param {(key: string) => boolean} isCollapsed 折叠谓词（key 为行 key）
 * @returns {SchemaRow[]}
 */
function flattenRows(schema, isCollapsed) {
  /** @type {SchemaRow[]} */
  const rows = [];

  /**
   * 遍历一个 properties 对象（propsPath 指向该 properties）。
   * @param {string[]} propsPath
   * @param {number} depth
   * @returns {void}
   */
  function walkProps(propsPath, depth) {
    const props = getNode(schema, propsPath);
    if (!isPlainObject(props)) {
      return;
    }
    const owner = getNode(schema, propsPath.slice(0, -1));
    const required = hasRequiredArray(owner) ? owner.required : [];
    Object.keys(props).forEach(name => {
      const node = props[name];
      const path = propsPath.concat([name]);
      const expandable = isPlainObject(node) && (node.type === 'object' || node.type === 'array');
      rows.push({
        key: JSON.stringify(path),
        path,
        name,
        node,
        depth,
        kind: 'property',
        parentPropsPath: propsPath,
        isRequired: required.indexOf(name) !== -1,
        expandable
      });
      if (expandable && !isCollapsed(JSON.stringify(path))) {
        walkNode(node, path, depth + 1);
      }
    });
  }

  /**
   * 遍历一个 object/array 节点的子级。
   * @param {SchemaNode} node
   * @param {string[]} nodePath
   * @param {number} depth
   * @returns {void}
   */
  function walkNode(node, nodePath, depth) {
    if (!isPlainObject(node)) {
      return;
    }
    if (node.type === 'object') {
      walkProps(nodePath.concat(['properties']), depth);
    } else if (node.type === 'array' && isPlainObject(node.items)) {
      const itemsPath = nodePath.concat(['items']);
      const items = node.items;
      rows.push({
        key: JSON.stringify(itemsPath),
        path: itemsPath,
        name: ITEMS_ROW_NAME,
        node: items,
        depth,
        kind: 'items',
        parentPropsPath: null,
        isRequired: false,
        expandable: items.type === 'object' || items.type === 'array'
      });
      if (!isCollapsed(JSON.stringify(itemsPath))) {
        walkNode(items, itemsPath, depth + 1);
      }
    }
  }

  walkProps(['properties'], 0);
  return rows;
}

export {
  SCHEMA_TYPES,
  STRUCTURAL_KEYS,
  CANONICAL_KEYS,
  ITEMS_ROW_NAME,
  isPlainObject,
  defaultNode,
  defaultRoot,
  parseSchema,
  stringifySchema,
  getNode,
  addProperty,
  removeProperty,
  renameProperty,
  toggleRequired,
  changeNodeType,
  moveProperty,
  setNodeField,
  setMock,
  flattenRows
};

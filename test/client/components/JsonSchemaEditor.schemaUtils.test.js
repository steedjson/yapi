import test from 'ava';

// 纯函数层，不依赖 DOM，直接 require（babel-register 处理 ESM）
const u = require('../../../client/components/JsonSchemaEditor/schemaUtils.js');

/** 快捷构造合法根 schema 字符串 */
function rootStr(props, required) {
  return JSON.stringify({
    type: 'object',
    properties: props,
    required: required || undefined
  });
}

// ---------- parseSchema 容错 ----------

test.serial('parseSchema: 空串/纯空白容错为空 object 根', t => {
  for (const input of ['', '   ', '\n\t ']) {
    t.deepEqual(u.parseSchema(input), { type: 'object', properties: {} });
  }
});

test.serial('parseSchema: 非法 JSON 容错为空 object 根且不抛出', t => {
  for (const input of ['{oops', '{"type": "object",,}', 'not json at all', '{"a":1']) {
    t.deepEqual(u.parseSchema(input), { type: 'object', properties: {} });
  }
});

test.serial('parseSchema: 合法 JSON 但顶层非 object（字符串/数字/数组/null/布尔）容错', t => {
  for (const input of ['"text"', '123', '[1,2,3]', 'null', 'true']) {
    t.deepEqual(u.parseSchema(input), { type: 'object', properties: {} });
  }
  // 对象入参同样走该分支
  for (const input of [42, ['x'], null, true, undefined]) {
    t.deepEqual(u.parseSchema(input), { type: 'object', properties: {} });
  }
});

test.serial('parseSchema: 缺 type 时有 properties 视为 object，否则视为 string（对齐旧编辑器 handleSchema）', t => {
  const parsed = u.parseSchema(
    JSON.stringify({
      properties: { a: { properties: { b: { type: 'string' } } }, c: { type: 'number' } }
    })
  );
  t.is(parsed.type, 'object');
  t.is(parsed.properties.a.type, 'object', '有 properties 的子节点补 object');
  t.is(parsed.properties.c.type, 'number', '已有 type 不改写');

  const parsed2 = u.parseSchema(rootStr({ d: {} }));
  t.is(parsed2.properties.d.type, 'string', '无 properties 无 type 的空节点补 string');
});

test.serial('parseSchema: object 缺 properties 补 {}，array 缺 items 补 {type:string}，递归生效', t => {
  const parsed = u.parseSchema(
    JSON.stringify({
      type: 'object',
      properties: {
        obj: { type: 'object', description: '缺 properties' },
        arr: { type: 'array' },
        deep: {
          type: 'object',
          properties: {
            inner: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' } } } }
          }
        }
      }
    })
  );
  t.deepEqual(parsed.properties.obj.properties, {});
  t.deepEqual(parsed.properties.arr.items, { type: 'string' });
  t.deepEqual(parsed.properties.deep.properties.inner.items.properties.x, { type: 'string' });
});

test.serial('parseSchema: 历史脏数据未知字段保全（title/format/$schema/enum/enumDesc/新旧 mock 形态）', t => {
  const source = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    title: '历史接口',
    properties: {
      name: {
        type: 'string',
        title: '名称',
        format: 'email',
        default: 'a@b.c',
        enum: ['a', 'b'],
        enumDesc: 'a 是甲, b 是乙',
        mock: { mock: '@integer(1,5)' },
        description: '历史备注'
      },
      tags: { type: 'array', items: { type: 'string', mock: { mock: '@name' }, unknownKey: 1 } }
    },
    required: ['name']
  };
  const parsed = u.parseSchema(JSON.stringify(source));
  t.is(parsed.$schema, source.$schema, '顶层 $schema 透传保留');
  t.is(parsed.title, source.title);
  const name = parsed.properties.name;
  for (const key of ['title', 'format', 'default', 'enum', 'enumDesc', 'mock', 'description']) {
    t.deepEqual(name[key], source.properties.name[key], `字段 ${key} 编辑往返保留`);
  }
  t.deepEqual(parsed.properties.tags.items.unknownKey, 1, '深层未知键保留');
});

test.serial('parseSchema: 纯函数不修改入参对象', t => {
  const input = { type: 'object', properties: { arr: { type: 'array' } } };
  const snapshot = JSON.stringify(input);
  u.parseSchema(input);
  u.stringifySchema(/** @type {any} */ (input));
  t.is(JSON.stringify(input), snapshot, '解析/序列化不得原地改写入参');
});

// ---------- stringifySchema 稳定序列化 ----------

test.serial('stringifySchema: 幂等稳定（重复解析序列化逐字节一致）', t => {
  const dirty =
    '{"required":["name"],"properties":{"name":{"mock":{"mock":"@name"},"format":"email","type":"string","title":"n"},"tags":{"type":"array","items":{"type":"string"}}},"type":"object","title":"t"}';
  const once = u.stringifySchema(u.parseSchema(dirty));
  const twice = u.stringifySchema(u.parseSchema(once));
  t.is(once, twice);
  // 语义等价：输出可解析回同一份数据
  t.deepEqual(JSON.parse(once), JSON.parse(dirty));
});

test.serial('stringifySchema: 规范键序（已知键按约定顺序在前，未知键按原序在后），compact JSON', t => {
  const out = u.stringifySchema(
    u.parseSchema(
      JSON.stringify({
        customField: { a: 1 },
        description: 'd',
        type: 'object',
        properties: { x: { type: 'string' } }
      })
    )
  );
  t.is(Object.keys(JSON.parse(out))[0], 'type', 'type 固定在最前');
  const topKeys = Object.keys(JSON.parse(out));
  t.deepEqual(topKeys, ['type', 'description', 'properties', 'customField']);
  t.is(out.indexOf(' ') === -1 || out.indexOf('": ') === -1, true, 'compact JSON 无缩进空格');

  const childKeys = Object.keys(JSON.parse(out).properties.x);
  t.deepEqual(childKeys, ['type'], '子节点同样按规范键序');
});

// ---------- addProperty ----------

test.serial('addProperty: 根级新增 field_1(string) 并默认加入 required（对齐旧编辑器）', t => {
  const next = u.addProperty(u.parseSchema(rootStr({})), ['properties'], null);
  t.deepEqual(next.properties.field_1, { type: 'string' });
  t.deepEqual(next.required, ['field_1']);
});

test.serial('addProperty: afterName 锚点插入保持顺序，多次新增名字递增不冲突', t => {
  let schema = u.parseSchema(rootStr({ a: { type: 'string' }, b: { type: 'string' } }));
  schema = u.addProperty(schema, ['properties'], 'a');
  t.deepEqual(Object.keys(schema.properties), ['a', 'field_1', 'b'], '新节点插在锚点后');
  schema = u.addProperty(schema, ['properties'], null);
  t.deepEqual(Object.keys(schema.properties), ['a', 'field_1', 'b', 'field_2'], '无锚点追加末尾');
  t.deepEqual(schema.required, ['field_1', 'field_2']);
});

test.serial('addProperty: 嵌套 object 子属性写入目标 properties 并同步该节点 required', t => {
  const schema = u.parseSchema(
    rootStr({ user: { type: 'object', properties: {}, required: [] } })
  );
  const next = u.addProperty(schema, ['properties', 'user', 'properties'], null);
  t.deepEqual(next.properties.user.properties.field_1, { type: 'string' });
  t.deepEqual(next.properties.user.required, ['field_1']);
  t.is(next.required, undefined, '根 required 不受嵌套新增影响');
  t.true(schema !== next, '返回新根对象');
});

// ---------- removeProperty ----------

test.serial('removeProperty: 删除属性并同步清理 required；required 清空后整个键删除', t => {
  const schema = u.parseSchema(rootStr({ a: { type: 'string' }, b: { type: 'string' } }, ['a', 'b']));
  const next = u.removeProperty(schema, ['properties', 'a']);
  t.is(next.properties.a, undefined);
  t.deepEqual(next.required, ['b']);

  const next2 = u.removeProperty(next, ['properties', 'b']);
  t.true(
    Object.prototype.hasOwnProperty.call(next2, 'required') === false,
    'required 清空后删键（对齐旧编辑器）'
  );
});

test.serial('removeProperty: 不存在的节点原样返回同引用（不触发无谓 onChange）', t => {
  const schema = u.parseSchema(rootStr({ a: { type: 'string' } }));
  t.is(u.removeProperty(schema, ['properties', 'ghost']), schema);
  t.is(u.removeProperty(schema, []), schema, '空路径拒操作');
});

// ---------- renameProperty ----------

test.serial('renameProperty: 原位改名保持键序，required 数组同步映射', t => {
  const schema = u.parseSchema(
    rootStr({ a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } }, ['a', 'c'])
  );
  const next = u.renameProperty(schema, ['properties', 'a'], 'alpha');
  t.deepEqual(Object.keys(next.properties), ['alpha', 'b', 'c'], '改名不改变键序');
  t.deepEqual(next.required, ['alpha', 'c']);
  t.deepEqual(next.properties.alpha, { type: 'string' });
});

test.serial('renameProperty: 重名/空名/同名/未知节点均原样返回（对齐旧编辑器重名拒改）', t => {
  const schema = u.parseSchema(rootStr({ a: { type: 'string' }, b: { type: 'string' } }, ['a']));
  t.is(u.renameProperty(schema, ['properties', 'a'], 'b'), schema, '重名拒改');
  t.is(u.renameProperty(schema, ['properties', 'a'], ''), schema, '空名拒改');
  t.is(u.renameProperty(schema, ['properties', 'a'], 'a'), schema, '同名无操作');
  t.is(u.renameProperty(schema, ['properties', 'ghost'], 'x'), schema);
});

// ---------- toggleRequired ----------

test.serial('toggleRequired: 勾选追加/取消移除/全取消删键/重复勾选幂等', t => {
  let schema = u.parseSchema(rootStr({ a: { type: 'string' }, b: { type: 'string' } }));
  schema = u.toggleRequired(schema, ['properties', 'a'], true);
  t.deepEqual(schema.required, ['a']);
  schema = u.toggleRequired(schema, ['properties', 'b'], true);
  t.deepEqual(schema.required, ['a', 'b']);
  t.is(u.toggleRequired(schema, ['properties', 'b'], true), schema, '已必填再勾选幂等同引用');
  schema = u.toggleRequired(schema, ['properties', 'a'], false);
  t.deepEqual(schema.required, ['b']);
  schema = u.toggleRequired(schema, ['properties', 'b'], false);
  t.false(Object.prototype.hasOwnProperty.call(schema, 'required'), '清空后删键');
});

// ---------- changeNodeType ----------

test.serial('changeNodeType: string→object 自动建 properties，非结构字段 merge 保留', t => {
  const schema = u.parseSchema(
    rootStr({
      a: { type: 'string', description: '备注', title: '标题', mock: { mock: '@name' }, format: 'email', enum: ['x'] }
    })
  );
  const next = u.changeNodeType(schema, ['properties', 'a'], 'object');
  const node = next.properties.a;
  t.is(node.type, 'object');
  t.deepEqual(node.properties, {}, '切 object 自动建 properties');
  t.is(node.description, '备注');
  t.is(node.title, '标题');
  t.deepEqual(node.mock, { mock: '@name' });
  t.is(node.format, 'email');
  t.deepEqual(node.enum, ['x']);
});

test.serial('changeNodeType: object→array 移除 properties 建 items{type:string}，array→string 移除 items', t => {
  let schema = u.parseSchema(
    rootStr({ a: { type: 'object', title: 't', properties: { x: { type: 'string' } }, required: ['x'] } })
  );
  schema = u.changeNodeType(schema, ['properties', 'a'], 'array');
  t.deepEqual(schema.properties.a.items, { type: 'string' });
  t.is(schema.properties.a.properties, undefined, '旧结构键不残留');
  t.is(schema.properties.a.required, undefined);
  t.is(schema.properties.a.title, 't', '非结构字段保留');

  schema = u.changeNodeType(schema, ['properties', 'a'], 'string');
  t.deepEqual(schema.properties.a, { type: 'string', title: 't' });
});

test.serial('changeNodeType: 同类型/非法类型原样返回', t => {
  const schema = u.parseSchema(rootStr({ a: { type: 'string' } }));
  t.is(u.changeNodeType(schema, ['properties', 'a'], 'string'), schema);
  t.is(u.changeNodeType(schema, ['properties', 'a'], 'unknown-type'), schema);
  // 根节点类型切换（路径 []）同样可用（顶层固定 object，仅为数据层完整性）
  const rootChanged = u.changeNodeType(schema, [], 'array');
  t.is(rootChanged.type, 'array');
  t.deepEqual(rootChanged.items, { type: 'string' });
});

// ---------- moveProperty ----------

test.serial('moveProperty: 上移/下移交换键序，required 不受影响，边界原样返回', t => {
  let schema = u.parseSchema(
    rootStr({ a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } }, ['a', 'c'])
  );
  let next = u.moveProperty(schema, ['properties', 'c'], 'up');
  t.deepEqual(Object.keys(next.properties), ['a', 'c', 'b']);
  t.deepEqual(next.required, ['a', 'c'], 'required 不含顺序语义，不动');
  next = u.moveProperty(next, ['properties', 'c'], 'down');
  t.deepEqual(Object.keys(next.properties), ['a', 'b', 'c']);
  // 边界
  t.is(u.moveProperty(schema, ['properties', 'a'], 'up'), schema);
  t.is(u.moveProperty(schema, ['properties', 'c'], 'down'), schema);
});

// ---------- setNodeField / setMock ----------

test.serial('setNodeField: 写入 description/default；空串删除字段（对齐旧编辑器 falsy 删除）', t => {
  let schema = u.parseSchema(rootStr({ a: { type: 'string' } }));
  schema = u.setNodeField(schema, ['properties', 'a'], 'description', '说明');
  t.is(schema.properties.a.description, '说明');
  schema = u.setNodeField(schema, ['properties', 'a'], 'default', '18');
  t.is(schema.properties.a.default, '18');
  schema = u.setNodeField(schema, ['properties', 'a'], 'description', '');
  t.false(Object.prototype.hasOwnProperty.call(schema.properties.a, 'description'));
  t.is(u.setNodeField(schema, ['properties', 'a'], 'ghost', ''), schema, '删除不存在字段幂等');
});

test.serial('setMock: 写入 YApi 形态 {mock:value}，清空删除整个 mock 字段，同值幂等', t => {
  let schema = u.parseSchema(rootStr({ a: { type: 'string' } }));
  schema = u.setMock(schema, ['properties', 'a'], '@name');
  t.deepEqual(schema.properties.a.mock, { mock: '@name' }, '对齐旧编辑器 handleChangeMock 形态');
  schema = u.setMock(schema, ['properties', 'a'], '@integer(1,5)');
  t.deepEqual(schema.properties.a.mock, { mock: '@integer(1,5)' });
  t.is(u.setMock(schema, ['properties', 'a'], '@integer(1,5)'), schema, '同值幂等同引用');
  schema = u.setMock(schema, ['properties', 'a'], '');
  t.false(Object.prototype.hasOwnProperty.call(schema.properties.a, 'mock'), '清空删除 mock 字段');
});

// ---------- flattenRows ----------

test.serial('flattenRows: 行序/深度/类别正确，array 渲染 Items 行，折叠谓词隐藏子树', t => {
  const schema = u.parseSchema(
    rootStr({
      user: {
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        required: ['name']
      },
      tags: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
      simple: { type: 'string' }
    })
  );

  const all = u.flattenRows(schema, () => false);
  t.deepEqual(
    all.map(r => `${r.name}@${r.depth}@${r.kind}`),
    [
      'user@0@property',
      'name@1@property',
      'age@1@property',
      'tags@0@property',
      'Items@1@items',
      'id@2@property',
      'simple@0@property'
    ],
    '摊平行序与层级应符合树形结构'
  );
  t.true(all[0].expandable, 'object 行可展开');
  t.false(all[all.length - 1].expandable, 'string 行不可展开');
  t.true(all.find(r => r.name === 'name').isRequired, 'required 勾选态来自父级 required 数组');
  t.false(all.find(r => r.name === 'age').isRequired);
  t.true(all.find(r => r.name === 'Items').path.join('.').indexOf('tags.items') !== -1, 'items 行路径指向 items 节点');

  // 折叠 user 与 Items 行后，其子树不出现
  const userKey = all.find(r => r.name === 'user').key;
  const itemsKey = all.find(r => r.name === 'Items').key;
  const collapsed = u.flattenRows(schema, key => key === userKey || key === itemsKey);
  t.deepEqual(
    collapsed.map(r => r.name),
    ['user', 'tags', 'Items', 'simple'],
    '折叠后仅隐藏子树，兄弟行保留'
  );
});

// ---------- 组合场景：编辑往返 ----------

test.serial('组合场景: 历史脏 schema 经增删改往返后未知字段与嵌套结构不丢失', t => {
  let schema = u.parseSchema(
    JSON.stringify({
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        keep: { type: 'string', format: 'ipv4', title: '保留我' },
        drop: { type: 'string', mock: { mock: '@name' } }
      },
      required: ['keep', 'drop']
    })
  );
  schema = u.removeProperty(schema, ['properties', 'drop']);
  schema = u.addProperty(schema, ['properties'], null);
  schema = u.changeNodeType(schema, ['properties', 'field_1'], 'object');
  schema = u.addProperty(schema, ['properties', 'field_1', 'properties'], null);
  schema = u.setMock(schema, ['properties', 'field_1', 'properties', 'field_1'], '@cname');

  const json = JSON.parse(u.stringifySchema(schema));
  t.is(json.$schema, 'http://json-schema.org/draft-04/schema#', '顶层未知字段往返保留');
  t.is(json.properties.keep.format, 'ipv4');
  t.is(json.properties.keep.title, '保留我');
  // 删除 drop 后剩 ['keep']，新增 field_1 默认必填（对齐旧编辑器）→ ['keep','field_1']
  t.deepEqual(json.required, ['keep', 'field_1']);
  t.is(json.properties.field_1.type, 'object');
  t.deepEqual(json.properties.field_1.properties.field_1.mock, { mock: '@cname' });
  t.deepEqual(json.properties.field_1.required, ['field_1']);
});

// ---------- B1 红线回归：__proto__ 属性名数据保全 ----------

test.serial('B1 红线: __proto__ 属性名 parse→stringify 往返保全（嵌套值不实体化/原型不偷换/required 无悬挂）', t => {
  const probe =
    '{"type":"object","properties":{"a":{"type":"string","__proto__":{"properties":{"ghost":{"type":"string"}}}}},"required":["a"]}';
  const parsed = u.parseSchema(probe);
  const a = parsed.properties.a;
  t.true(Object.prototype.hasOwnProperty.call(a, '__proto__'), 'parse 后须为自有数据属性');
  t.deepEqual(Object.getOwnPropertyDescriptor(a, '__proto__').value, {
    properties: { ghost: { type: 'string' } }
  }, '自有 __proto__ 值经描述符读取须保全');
  t.is(Object.getPrototypeOf(a), Object.prototype, '节点原型不得被偷换');

  const out = JSON.parse(u.stringifySchema(parsed));
  t.true(
    Object.prototype.hasOwnProperty.call(out.properties.a, '__proto__'),
    'stringify 往返后 __proto__ 键不得静默丢失'
  );
  t.deepEqual(Object.getOwnPropertyDescriptor(out.properties.a, '__proto__').value, {
    properties: { ghost: { type: 'string' } }
  }, '嵌套值往返保全');
  t.is(Object.getOwnPropertyDescriptor(out.properties.a, 'ghost'), undefined, 'ghost 不得实体化为真实字段');
  t.is(Object.getOwnPropertyDescriptor(out.properties.a, 'properties'), undefined, '幻影结构键不得出现');
  t.deepEqual(out.required, ['a'], 'required 无悬挂引用');
});

test.serial('B1 红线: rename 为 __proto__ 保全，且经增删移动类型切换全操作后无键丢失/无 required 悬挂', t => {
  let schema = u.parseSchema(rootStr({ b: { type: 'string' } }, ['b']));
  schema = u.renameProperty(schema, ['properties', 'b'], '__proto__');
  t.true(Object.prototype.hasOwnProperty.call(schema.properties, '__proto__'), '改名目标 __proto__ 须成为自有键');
  t.deepEqual(Object.getOwnPropertyDescriptor(schema.properties, '__proto__').value, { type: 'string' });
  t.is(Object.getPrototypeOf(schema.properties), Object.prototype, 'properties 原型不得被偷换');
  t.deepEqual(Object.keys(schema.properties), ['__proto__'], '改名保持键序');
  t.deepEqual(schema.required, ['__proto__'], 'required 同步且与 properties 一致（无悬挂）');

  // __proto__ 锚点插入 → 上移 → 类型切换 → 删除，全链路键保全
  schema = u.addProperty(schema, ['properties'], '__proto__');
  t.deepEqual(Object.keys(schema.properties), ['__proto__', 'field_1'], '锚点插入顺序正确');
  schema = u.moveProperty(schema, ['properties', 'field_1'], 'up');
  t.deepEqual(Object.keys(schema.properties), ['field_1', '__proto__'], '交换不破坏 __proto__ 键');
  schema = u.changeNodeType(schema, ['properties', 'field_1'], 'object');
  t.deepEqual(Object.getOwnPropertyDescriptor(schema.properties, 'field_1').value, {
    type: 'object',
    properties: {}
  });
  schema = u.removeProperty(schema, ['properties', 'field_1']);
  t.deepEqual(Object.keys(schema.properties), ['__proto__'], '删除后 __proto__ 键仍在');
  t.deepEqual(schema.required, ['__proto__'], 'required 悬挂消除');

  const round = JSON.parse(u.stringifySchema(schema));
  t.true(Object.prototype.hasOwnProperty.call(round.properties, '__proto__'), '编辑全操作往返后键保全');
  t.deepEqual(round.required, ['__proto__']);
});

test.serial('B1 守卫: 脏数据全操作前后全局 Object.prototype 无污染', t => {
  const before = Object.getOwnPropertyNames(Object.prototype).join('|');
  let schema = u.parseSchema(
    rootStr({ a: { type: 'string', __proto__: { evil: true } } }, ['a'])
  );
  schema = u.renameProperty(schema, ['properties', 'a'], 'b');
  schema = u.addProperty(schema, ['properties'], 'b');
  schema = u.removeProperty(schema, ['properties', 'field_1']);
  schema = u.moveProperty(schema, ['properties', 'b'], 'up');
  schema = u.changeNodeType(schema, ['properties', 'b'], 'object');
  schema = u.parseSchema(u.stringifySchema(schema));

  t.is(Object.getOwnPropertyNames(Object.prototype).join('|'), before, 'Object.prototype 自有键不得被污染');
  t.is(Object.getOwnPropertyDescriptor(Object.prototype, 'evil'), undefined);
  t.is(Object.getPrototypeOf({}), Object.prototype, '空对象原型保持正常');
  t.is(Object.getPrototypeOf(schema.properties), Object.prototype);
  t.is(Object.getPrototypeOf(schema.properties.b), Object.prototype);
  t.is(Object.getOwnPropertyDescriptor(schema.properties.b, 'evil'), undefined, 'evil 不得实体化');
});

test.serial('M2: 行 key 用 JSON.stringify(path)，特殊字段名不碰撞', t => {
  const schema = u.parseSchema(
    rootStr({
      'a\u0001b': { type: 'string' },
      a: { type: 'object', properties: { b: { type: 'string' } } }
    })
  );
  const rows = u.flattenRows(schema, () => false);
  const keys = rows.map(r => r.key);
  t.is(new Set(keys).size, keys.length, `所有行 key 唯一: ${JSON.stringify(keys)}`);
  const ab = rows.find(r => r.name === 'a\u0001b');
  const aRow = rows.find(r => r.name === 'a');
  const bRow = rows.find(r => r.name === 'b');
  t.truthy(ab && aRow && bRow);
  t.is(ab.key, JSON.stringify(['properties', 'a\u0001b']));
  t.true(ab.key !== bRow.key, '旧拼接方案下两 key 均为 properties\\u0001a\\u0001b 会碰撞');
});

test.serial('B1 探针: 对象值 __proto__ 经 addProperty 键拷贝不偷换原型、不实体化幻影字段', t => {
  // 注意须用 JSON 字符串入参：JSON.parse 才会创建名为 __proto__ 的自有数据属性
  // （JS 对象字面量的标识符形式 __proto__: 设置的是原型而非自有键）
  let schema = u.parseSchema(
    '{"type":"object","properties":{"a":{"type":"object","properties":{},"__proto__":{"ghost":{"type":"string"}}}}}'
  );
  schema = u.addProperty(schema, ['properties', 'a', 'properties'], null);
  const node = schema.properties.a;
  t.is(Object.getPrototypeOf(node), Object.prototype, '对象值 __proto__ 不得偷换节点原型');
  t.true(Object.prototype.hasOwnProperty.call(node, '__proto__'), '__proto__ 键保全');
  t.deepEqual(Object.getOwnPropertyDescriptor(node, '__proto__').value, {
    ghost: { type: 'string' }
  }, '嵌套值保全（走描述符而非原型链）');
  t.is(Object.getOwnPropertyDescriptor(node, 'ghost'), undefined, 'ghost 不得实体化为真实字段');
  t.deepEqual(Object.keys(node.properties), ['field_1'], '嵌套 properties 只含新增字段');
});

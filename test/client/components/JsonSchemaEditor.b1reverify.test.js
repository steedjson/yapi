// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: JsonSchemaEditor } = require('../../../client/components/JsonSchemaEditor/index.js');
const u = require('../../../client/components/JsonSchemaEditor/schemaUtils.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// ========== csl-tester 独立复验探针（B1 打回重验，与实施方用例互相独立） ==========

/** 全局 Object.prototype 污染快照 */
function protoSnapshot() {
  return Object.getOwnPropertyNames(Object.prototype).join('|');
}

/** 自有键是否存在 */
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function rootStr(props, required) {
  return JSON.stringify({
    type: 'object',
    properties: props,
    required: required || undefined
  });
}

test.serial('REVERIFY-B1a: parse→stringify 往返 __proto__ 键保全且 ghost 不实体化（独立构造）', t => {
  const ghost = { type: 'string', title: '幽灵' };
  const probe = JSON.stringify({
    type: 'object',
    properties: { a: { type: 'string' } }
  }).replace(
    '"a":{"type":"string"}',
    '"a":{"type":"string","__proto__":' + JSON.stringify(ghost) + '}'
  );
  t.true(probe.indexOf('__proto__') !== -1, '探针数据须确实含 __proto__ 字面键');

  const parsed = u.parseSchema(probe);
  const a = parsed.properties.a;
  t.true(hasOwn(a, '__proto__'), 'parse 后 __proto__ 为自有数据属性');
  t.deepEqual(Object.getOwnPropertyDescriptor(a, '__proto__').value, ghost, 'ghost 值走描述符保全');
  t.is(Object.getPrototypeOf(a), Object.prototype, '节点原型未被偷换');

  const out = JSON.parse(u.stringifySchema(parsed));
  t.true(hasOwn(out.properties.a, '__proto__'), '往返后 __proto__ 键保全');
  t.deepEqual(Object.getOwnPropertyDescriptor(out.properties.a, '__proto__').value, ghost);
  t.is(Object.getOwnPropertyDescriptor(out.properties.a, 'title'), undefined, 'ghost 内字段不得实体化');
  // 幂等：二轮序列化逐字节一致
  const once = u.stringifySchema(parsed);
  t.is(u.stringifySchema(u.parseSchema(once)), once, '含 __proto__ 数据序列化幂等');
});

test.serial('REVERIFY-B1b: rename→__proto__ 与 rename 脱离 __proto__ 双向，required 均无悬挂', t => {
  // 正向：普通名改为 __proto__
  let schema = u.parseSchema(rootStr({ b: { type: 'number' }, c: { type: 'string' } }, ['c']));
  schema = u.renameProperty(schema, ['properties', 'b'], '__proto__');
  t.true(hasOwn(schema.properties, '__proto__'), '改名后 __proto__ 为自有键');
  t.is(Object.getOwnPropertyDescriptor(schema.properties, '__proto__').value.type, 'number');
  t.is(Object.getPrototypeOf(schema.properties), Object.prototype);
  t.deepEqual(schema.required, ['c'], 'required 与自有键一致');

  // 反向：__proto__ 改回普通名（ownEntries 读旧键 → buildObject 重建 → required 映射）
  schema = u.renameProperty(schema, ['properties', '__proto__'], 'b2');
  t.false(hasOwn(schema.properties, '__proto__'), '脱离 __proto__ 后旧键不得残留');
  t.true(hasOwn(schema.properties, 'b2'));
  t.is(Object.getOwnPropertyDescriptor(schema.properties, 'b2').value.type, 'number');
  t.is(Object.getPrototypeOf(schema.properties), Object.prototype, '重建对象原型正常');
  t.deepEqual(schema.required, ['c']);
  const round = JSON.parse(u.stringifySchema(schema));
  t.deepEqual(Object.keys(round.properties), ['b2', 'c'], '往返键序与键集正确');
});

test.serial('REVERIFY-B1c: 名为 __proto__ 的属性之「子级」全操作（路径遍历含 __proto__ 段）无污染无丢失', t => {
  const before = protoSnapshot();
  // 属性名本身是 __proto__，其下再嵌子属性——setNodeValue/plain 路径遍历的对抗场景
  const probe = JSON.stringify({
    type: 'object',
    properties: {}
  }).replace(
    '"properties":{}',
    '"properties":{"__proto__":{"type":"object","properties":{"child":{"type":"string"}},"required":["child"]}}'
  );
  let schema = u.parseSchema(probe);
  // getNode 须走自有描述符：返回节点本身，而不是 Object.prototype
  const node = u.getNode(schema, ['properties', '__proto__']);
  t.is(node.type, 'object', 'getNode 经 __proto__ 段取到真实节点');
  t.true(hasOwn(node.properties, 'child'));

  // 子级改名（写路径经过 ['properties','__proto__','properties']）
  schema = u.renameProperty(schema, ['properties', '__proto__', 'properties', 'child'], 'renamed');
  t.true(hasOwn(schema.properties.__proto__.properties, 'renamed'), '子级改名生效');
  t.false(hasOwn(schema.properties.__proto__.properties, 'child'));
  t.deepEqual(schema.properties.__proto__.required, ['renamed'], '嵌套 required 同步');

  // __proto__ 节点内新增/删除/移动
  schema = u.addProperty(schema, ['properties', '__proto__', 'properties'], 'renamed');
  t.deepEqual(Object.keys(schema.properties.__proto__.properties), ['renamed', 'field_1']);
  schema = u.moveProperty(schema, ['properties', '__proto__', 'properties', 'field_1'], 'up');
  t.deepEqual(Object.keys(schema.properties.__proto__.properties), ['field_1', 'renamed']);
  schema = u.removeProperty(schema, ['properties', '__proto__', 'properties', 'field_1']);
  t.deepEqual(Object.keys(schema.properties.__proto__.properties), ['renamed']);

  // __proto__ 节点本身切换类型
  schema = u.changeNodeType(schema, ['properties', '__proto__'], 'array');
  t.true(hasOwn(schema.properties, '__proto__'), '类型切换后 __proto__ 属性键仍在');
  t.deepEqual(schema.properties.__proto__.items, { type: 'string' });
  t.is(schema.properties.__proto__.properties, undefined);

  // 删除 __proto__ 属性本身
  schema = u.removeProperty(schema, ['properties', '__proto__']);
  t.false(hasOwn(schema.properties, '__proto__'), '删除后键消失');
  t.deepEqual(Object.keys(schema.properties), []);

  // 全局污染探针
  t.is(protoSnapshot(), before, 'Object.prototype 自有键集合不变');
  t.is(Object.getPrototypeOf({}), Object.prototype, '空对象原型不变');
  t.is(Object.getOwnPropertyDescriptor(Object.prototype, 'child'), undefined);
  const round = JSON.parse(u.stringifySchema(schema));
  t.deepEqual(round.properties, {}, '最终往返为空 properties');
});

test.serial('REVERIFY-B1d: changeNodeType 保留节点自有 __proto__ 字段（扩展修复点）', t => {
  const ghost = { properties: { g: { type: 'string' } } };
  const probe = JSON.stringify({ type: 'object', properties: {} }).replace(
    '"properties":{}',
    '"properties":{"a":{"type":"string","__proto__":' + JSON.stringify(ghost) + '}}'
  );
  const schema = u.parseSchema(probe);
  const next = u.changeNodeType(schema, ['properties', 'a'], 'object');
  const a = next.properties.a;
  t.true(hasOwn(a, '__proto__'), '类型切换后 __proto__ 字段键保全');
  t.deepEqual(Object.getOwnPropertyDescriptor(a, '__proto__').value, ghost, '幻影值不走原型链');
  t.is(Object.getPrototypeOf(a), Object.prototype, '切换节点原型未被偷换');
  t.is(Object.getOwnPropertyDescriptor(a, 'g'), undefined, 'ghost 子键不得实体化');
  t.deepEqual(a.properties, {}, '新结构键正常建立');
  const out = JSON.parse(u.stringifySchema(next));
  t.true(hasOwn(out.properties.a, '__proto__'));
  t.deepEqual(out.properties.a.properties, {});
});

test.serial('REVERIFY-M2: 行 key 唯一性（\\u0001 与 a.b 字面名 vs 嵌套 a{b} 双场景）', t => {
  const schema = u.parseSchema(
    rootStr({
      'a\u0001b': { type: 'string' },
      'a.b': { type: 'string' },
      a: { type: 'object', properties: { b: { type: 'string' } } }
    })
  );
  const rows = u.flattenRows(schema, () => false);
  const keys = rows.map(r => r.key);
  t.is(new Set(keys).size, keys.length, '全部行 key 互不相同: ' + JSON.stringify(keys));
  t.is(rows.find(r => r.name === 'a\u0001b').key, JSON.stringify(['properties', 'a\u0001b']));
  t.is(rows.find(r => r.name === 'a.b').key, JSON.stringify(['properties', 'a.b']));
  t.is(rows.find(r => r.name === 'b').key, JSON.stringify(['properties', 'a', 'properties', 'b']));
});

test.serial('REVERIFY-M3: 重名拒改同引用返回且 message.error 携带重名（独立打桩）', t => {
  const schema = u.parseSchema(rootStr({ a: { type: 'string' }, b: { type: 'string' } }));
  t.is(u.renameProperty(schema, ['properties', 'a'], 'b'), schema, '纯层重名原样返回');

  const antd = require('antd');
  const original = antd.message.error;
  const calls = [];
  antd.message.error = msg => {
    calls.push(String(msg));
  };
  try {
    const changes = [];
    const { container } = render(
      <JsonSchemaEditor
        data={rootStr({ a: { type: 'string' }, b: { type: 'string' } })}
        isMock={false}
        onChange={text => changes.push(text)}
      />
    );
    const rows = Array.from(container.querySelectorAll('.jse-row'));
    const rowA = rows.find(r => r.querySelector('.jse-name-input').value === 'a');
    fireEvent.change(rowA.querySelector('.jse-name-input'), { target: { value: 'b' } });
    t.is(changes.length, 0, '重名不上抛 onChange');
    t.is(calls.length, 1, 'message.error 恰好调用一次');
    t.true(calls[0].indexOf('b') !== -1, '提示文案须包含重名目标: ' + JSON.stringify(calls[0]));
    t.is(calls[0], 'The field "b" already exists.', '文案对齐旧编辑器重名提示');
  } finally {
    antd.message.error = original;
  }
});

test.serial('REVERIFY-M1: array 行无添加子级按钮，Items(object) 行有且写入 items.properties', t => {
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      arr: { type: 'array', items: { type: 'object', properties: {} } },
      str: { type: 'string' }
    }
  });
  const changes = [];
  const { container } = render(
    <JsonSchemaEditor data={schema} isMock={false} onChange={text => changes.push(text)} />
  );
  const rows = Array.from(container.querySelectorAll('.jse-row'));
  const arrRow = rows.find(r => r.querySelector('.jse-name-input').value === 'arr');
  const itemsRow = rows.find(r => r.querySelector('.jse-name-input').value === 'Items');
  const strRow = rows.find(r => r.querySelector('.jse-name-input').value === 'str');
  t.falsy(arrRow.querySelector('.jse-btn-add-child'), 'array 行不得渲染添加子级按钮');
  t.truthy(itemsRow.querySelector('.jse-btn-add-child'), 'Items(object) 行渲染添加子级按钮');
  t.falsy(strRow.querySelector('.jse-btn-add-child'), 'string 行无添加子级按钮');

  fireEvent.click(itemsRow.querySelector('.jse-btn-add-child'));
  t.true(changes.length === 1, '点击应生效一次上抛');
  const out = JSON.parse(changes[0]);
  t.deepEqual(out.properties.arr.items.properties.field_1, { type: 'string' }, '写入 items.properties');
  t.deepEqual(out.properties.arr.items.required, ['field_1']);
  t.is(out.properties.arr.properties, undefined, '不得误写 array 节点自身 properties');
});

test.serial('REVERIFY-回归: 全操作贪吃蛇 gauntlet 后 Object.prototype 与节点原型双干净', t => {
  const before = protoSnapshot();
  // 对抗性数据：__proto__ 同时作为「字段名」与「属性名」出现在多层
  const probe =
    '{"type":"object","properties":{"a":{"type":"string","__proto__":{"evil":1}},"__proto__":{"type":"object","properties":{"deep":{"type":"string","__proto__":{"evil2":2}}}}},"required":["a","__proto__"]}';
  let schema = u.parseSchema(probe);
  schema = u.renameProperty(schema, ['properties', 'a'], 'renamed');
  schema = u.addProperty(schema, ['properties'], 'renamed');
  schema = u.moveProperty(schema, ['properties', 'field_1'], 'up');
  schema = u.changeNodeType(schema, ['properties', 'field_1'], 'object');
  schema = u.addProperty(schema, ['properties', 'field_1', 'properties'], null);
  schema = u.toggleRequired(schema, ['properties', 'field_1'], false);
  schema = u.setMock(schema, ['properties', '__proto__', 'properties', 'deep'], '@name');
  schema = u.setNodeField(schema, ['properties', '__proto__', 'properties', 'deep'], 'description', 'd');
  schema = u.removeProperty(schema, ['properties', '__proto__']);
  const once = u.stringifySchema(schema);
  schema = u.parseSchema(once);
  t.is(u.stringifySchema(schema), once, '贪吃蛇后序列化幂等');

  t.is(protoSnapshot(), before, 'Object.prototype 自有键集合不变');
  t.is(Object.getOwnPropertyDescriptor(Object.prototype, 'evil'), undefined);
  t.is(Object.getOwnPropertyDescriptor(Object.prototype, 'evil2'), undefined);
  t.is(Object.getOwnPropertyDescriptor(Object.prototype, 'ghost'), undefined);
  t.is(Object.getPrototypeOf({}), Object.prototype);
  Object.keys(schema.properties).forEach(name => {
    t.is(Object.getPrototypeOf(schema.properties[name]), Object.prototype, '属性节点 ' + name + ' 原型正常');
  });
  const out = JSON.parse(once);
  t.true(hasOwn(out.properties.renamed, '__proto__'), 'a 的 __proto__ 字段经全链路保留');
  t.false(hasOwn(out.properties, '__proto__'), '已删除的 __proto__ 属性不复活');
  t.deepEqual(out.required, ['renamed'], 'required 与实际键集一致无悬挂（field_1 被取消必填）');
});

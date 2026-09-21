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

/**
 * 递归深冻结（含数组），配合模块严格模式：被测函数任何原地改写入参的行为
 * 都会抛 TypeError 而非静默成功。
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

function rootStr(props, required) {
  return JSON.stringify({
    type: 'object',
    properties: props,
    required: required || undefined
  });
}

// ---------- 兼容红线：历史脏 schema 对抗性往返（独立构造，区别于 schemaUtils 契约用例） ----------

test.serial('红线: 对抗性脏 schema 全编辑链路往返，未知字段逐节点深保留且序列化幂等', t => {
  const dirty = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    $id: 'urn:legacy:api',
    type: 'object',
    title: '历史接口',
    unknownTop: { nested: [1, 2, { keep: true }] },
    properties: {
      // 全字段历史形态：enum/enumDesc/format/title/数字 default/mock 对象形态/未知键
      name: {
        type: 'string',
        title: '名称',
        description: '含,逗号描述',
        format: 'ipv4',
        default: 42,
        enum: ['a', 1, null],
        enumDesc: 'a 是甲, 1 是乙, 空是丙',
        mock: { mock: '@integer(1,5)' },
        examples: ['x'],
        customExt: { deep: { er: 1 } }
      },
      // mock 旧形态：手写历史数据可能是字符串形态
      legacy: { type: 'string', mock: '@raw-string', note: 'string-form mock' },
      tags: {
        type: 'array',
        items: { type: 'string', unknownInItems: '$ref-like', $comment: 'keep me' }
      }
    },
    required: ['name']
  };
  const frozenInput = deepFreeze(JSON.parse(JSON.stringify(dirty)));

  let schema = u.parseSchema(frozenInput);
  // 全编辑链路：删 / 增 / 改名 / 类型切换 / 移动 / mock 写入与清空 / 必填切换
  schema = u.removeProperty(schema, ['properties', 'legacy']);
  schema = u.addProperty(schema, ['properties'], 'name');
  schema = u.renameProperty(schema, ['properties', 'field_1'], 'added');
  schema = u.changeNodeType(schema, ['properties', 'added'], 'object');
  schema = u.moveProperty(schema, ['properties', 'tags'], 'up');
  schema = u.setMock(schema, ['properties', 'name'], '@cname');
  schema = u.toggleRequired(schema, ['properties', 'tags'], true);

  const out = JSON.parse(u.stringifySchema(schema));

  // 顶层未知/透传字段
  t.is(out.$schema, dirty.$schema, '$schema 保留');
  t.is(out.$id, dirty.$id, '$id 保留');
  t.is(out.title, '历史接口');
  t.deepEqual(out.unknownTop, dirty.unknownTop, '顶层未知复杂字段深保留');

  // name：enum/enumDesc/format/title/数字 default/未知键逐项深比对
  const name = out.properties.name;
  t.deepEqual(name.enum, ['a', 1, null]);
  t.is(name.enumDesc, 'a 是甲, 1 是乙, 空是丙');
  t.is(name.format, 'ipv4');
  t.is(name.title, '名称');
  t.is(name.description, '含,逗号描述');
  t.is(name.default, 42, '非字符串 default 原型保留');
  t.deepEqual(name.examples, ['x']);
  t.deepEqual(name.customExt, { deep: { er: 1 } });
  t.deepEqual(name.mock, { mock: '@cname' }, 'mock 编辑后为新值对象形态');

  // 新增字段是全新节点：类型切换后应为纯 object 默认结构（无历史字段可保留）
  const added = out.properties.added;
  t.deepEqual(added, { type: 'object', properties: {} });
  t.true(out.required.indexOf('added') !== -1, '新增字段默认必填');

  // 类型切换的未知字段保留：对 name 节点单独切换验证（结构重建, 非结构与未知字段 merge）
  let switchSchema = u.parseSchema(frozenInput);
  switchSchema = u.changeNodeType(switchSchema, ['properties', 'name'], 'object');
  const switched = JSON.parse(u.stringifySchema(switchSchema)).properties.name;
  t.is(switched.type, 'object');
  t.deepEqual(switched.properties, {});
  t.deepEqual(switched.examples, ['x'], '类型切换保留未知字段');
  t.deepEqual(switched.customExt, { deep: { er: 1 } });
  t.is(switched.title, '名称');
  t.deepEqual(switched.enum, ['a', 1, null]);
  t.is(switched.format, 'ipv4');
  t.deepEqual(switched.mock, { mock: '@integer(1,5)' }, '类型切换保留 mock');

  // items 未知键
  t.deepEqual(out.properties.tags.items.unknownInItems, '$ref-like');
  t.is(out.properties.tags.items.$comment, 'keep me');

  // 序列化幂等：再走一轮 parse→stringify 逐字节一致
  const once = u.stringifySchema(schema);
  t.is(u.stringifySchema(u.parseSchema(once)), once, '往返幂等');
});

test.serial('红线: 未触碰节点的字符串形态 mock 原样保留，触碰节点 mock 才规范化', t => {
  const schema = u.parseSchema(
    JSON.stringify({
      type: 'object',
      properties: {
        legacy: { type: 'string', mock: '@raw-string' },
        other: { type: 'number' }
      }
    })
  );
  // 不触碰 legacy，只编辑 other
  const next = u.setNodeField(schema, ['properties', 'other'], 'description', 'x');
  const out = JSON.parse(u.stringifySchema(next));
  t.is(out.properties.legacy.mock, '@raw-string', '字符串形态 mock 往返保留');

  // 触碰 legacy 的 mock 写入 → 规范化为 {mock:value}（旧编辑器写入形态）
  const edited = u.setMock(next, ['properties', 'legacy'], '@natural');
  const out2 = JSON.parse(u.stringifySchema(edited));
  t.deepEqual(out2.properties.legacy.mock, { mock: '@natural' });
});

test.serial('红线: setNodeField 写入 false/0 不删除（比旧编辑器 falsy 全删更保守），空串才删', t => {
  let schema = u.parseSchema(rootStr({ a: { type: 'boolean' } }));
  schema = u.setNodeField(schema, ['properties', 'a'], 'default', false);
  t.is(schema.properties.a.default, false, 'false 不被 falsy 误删');
  schema = u.setNodeField(schema, ['properties', 'a'], 'default', 0);
  t.is(schema.properties.a.default, 0, '0 不被 falsy 误删');
});

// ---------- 纯函数不改入参：全导出变更函数 deep-freeze 抽查 ----------

test.serial('纯函数: 全部导出变更函数在深冻结入参上不抛错不改入参', t => {
  const base = () =>
    u.parseSchema(
      JSON.stringify({
        type: 'object',
        title: 't',
        $schema: 'x',
        properties: {
          a: { type: 'string', mock: { mock: '@name' }, enum: ['x'] },
          b: { type: 'object', properties: { c: { type: 'number' } }, required: ['c'] },
          d: { type: 'array', items: { type: 'string' } }
        },
        required: ['a']
      })
    );

  const ops = [
    s => u.addProperty(s, ['properties'], 'a'),
    s => u.addProperty(s, ['properties', 'b', 'properties'], null),
    s => u.addProperty(s, ['properties', 'ghost', 'properties'], null),
    s => u.removeProperty(s, ['properties', 'a']),
    s => u.renameProperty(s, ['properties', 'a'], 'renamed'),
    s => u.renameProperty(s, ['properties', 'a'], 'b'),
    s => u.toggleRequired(s, ['properties', 'a'], false),
    s => u.toggleRequired(s, ['properties', 'b'], true),
    s => u.changeNodeType(s, ['properties', 'a'], 'object'),
    s => u.changeNodeType(s, ['properties', 'd'], 'string'),
    s => u.moveProperty(s, ['properties', 'a'], 'down'),
    s => u.moveProperty(s, ['properties', 'a'], 'up'),
    s => u.setNodeField(s, ['properties', 'a'], 'description', 'x'),
    s => u.setNodeField(s, ['properties', 'a'], 'description', ''),
    s => u.setMock(s, ['properties', 'a'], '@url'),
    s => u.setMock(s, ['properties', 'a'], ''),
    s => u.stringifySchema(s),
    s => u.flattenRows(s, () => false),
    s => u.getNode(s, ['properties', 'a']),
    s => u.parseSchema(s)
  ];

  ops.forEach((op, i) => {
    const input = deepFreeze(base());
    const snapshot = JSON.stringify(input);
    t.notThrows(() => {
      op(input);
    }, `操作 ${i} 在冻结入参上不应抛错`);
    t.is(JSON.stringify(input), snapshot, `操作 ${i} 不得原地改写入参`);
  });
});

// ---------- onChange 回环抑制：行为级核验（dataRef/emittedRef 机制） ----------

function renderEditor(overrides) {
  const changes = [];
  const props = Object.assign(
    {
      data: '',
      isMock: false,
      onChange: text => changes.push(text)
    },
    overrides
  );
  const utils = render(<JsonSchemaEditor {...props} />);
  return Object.assign({ changes, props }, utils);
}

test.serial('回环: 自身输出精确回灌不重解析不上抛（changes 不增长）', t => {
  const { container, changes, rerender } = renderEditor();

  fireEvent.click(container.querySelector('.jse-add-root'));
  t.is(changes.length, 1);
  const emitted = changes[0];

  // 父组件把输出原样回灌（YApi InterfaceEditForm 的真实链路）
  rerender(<JsonSchemaEditor data={emitted} isMock={false} onChange={text => changes.push(text)} />);
  t.is(changes.length, 1, '回灌不得触发新 onChange');

  // 回灌后继续编辑，正常上抛且内容累积正确
  fireEvent.click(container.querySelector('.jse-add-root'));
  t.is(changes.length, 2);
  const out = JSON.parse(changes[1]);
  t.deepEqual(Object.keys(out.properties), ['field_1', 'field_2'], '回灌未重解析, 状态连续');
});

test.serial('回环: 语义相同但格式不同的回灌（重格式化 JSON）不触发 onChange, 后续编辑输出仍规范', t => {
  const { container, changes, rerender } = renderEditor();

  fireEvent.click(container.querySelector('.jse-add-root'));
  const emitted = changes[0];
  const reformatted = JSON.stringify(JSON.parse(emitted), null, 2);

  rerender(
    <JsonSchemaEditor data={reformatted} isMock={false} onChange={text => changes.push(text)} />
  );
  t.is(changes.length, 1, '格式不同的等价回灌也不得上抛');
  t.is(container.querySelectorAll('.jse-row').length, 1, '内容保持');

  fireEvent.click(container.querySelector('.jse-add-root'));
  t.is(changes.length, 2);
  t.true(changes[1].indexOf('\n') === -1, '后续输出仍为 compact 规范形态');
});

test.serial('回环: 外部 data 换新值重解析; 非字符串 data 更新被忽略不崩溃', t => {
  const { container, changes, rerender } = renderEditor();

  fireEvent.click(container.querySelector('.jse-add-root'));
  const other = JSON.stringify({
    type: 'object',
    properties: { only: { type: 'number' } },
    required: ['only']
  });
  rerender(<JsonSchemaEditor data={other} isMock={false} onChange={text => changes.push(text)} />);
  t.is(container.querySelectorAll('.jse-row').length, 1, '外部换新值应重解析');
  t.true(
    container.querySelector('.jse-name-input').value === 'only',
    '行内容为新 schema'
  );
  t.is(changes.length, 1, '重解析本身不触发 onChange');

  // 非字符串 data（父组件瞬时传 undefined）→ 忽略更新, UI 不崩不丢
  rerender(<JsonSchemaEditor data={undefined} isMock={false} onChange={text => changes.push(text)} />);
  t.is(container.querySelectorAll('.jse-row').length, 1, '非字符串 data 被忽略, 状态保留');
  t.is(changes.length, 1);
});

test.serial('回环: 对象入参 data 在挂载期被解析（parse 容错形态全集之对象入参）', t => {
  const { container } = render(
    <JsonSchemaEditor
      data={{ type: 'object', properties: { x: { type: 'string' } } }}
      isMock={false}
      onChange={() => {}}
    />
  );
  t.is(container.querySelectorAll('.jse-row').length, 1, '对象入参直接解析为树');
  t.is(container.querySelector('.jse-name-input').value, 'x');
});

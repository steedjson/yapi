// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: JsonSchemaEditor } = require('../../../client/components/JsonSchemaEditor/index.js');
const u = require('../../../client/components/JsonSchemaEditor/schemaUtils.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 带嵌套 object/array 与历史脏字段的样例 schema */
const SAMPLE = JSON.stringify({
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  properties: {
    user: {
      type: 'object',
      description: '用户信息',
      properties: { name: { type: 'string', format: 'email' }, age: { type: 'integer' } },
      required: ['name']
    },
    tags: { type: 'array', items: { type: 'string' } },
    simple: { type: 'string', title: '简单字段', mock: { mock: '@name' } }
  },
  required: ['user', 'simple']
});

/**
 * 挂载编辑器并采集 onChange 输出。
 * @param {any} overrides
 * @returns {any}
 */
function renderEditor(overrides) {
  const changes = [];
  const props = Object.assign(
    {
      data: SAMPLE,
      isMock: true,
      onChange: text => changes.push(text)
    },
    overrides
  );
  const utils = render(<JsonSchemaEditor {...props} />);
  return Object.assign({ changes, props }, utils);
}

/** 取第 index 行（.jse-row）元素 */
function row(container, index) {
  return container.querySelectorAll('.jse-row')[index];
}

/** 按参数名找行（Items 行传 'Items'） */
function rowByName(container, name) {
  const rows = Array.from(container.querySelectorAll('.jse-row'));
  return rows.find(r => r.querySelector('.jse-name-input').value === name);
}

// antd Select 的下拉需在 selector 内部搜索输入框上触发 mousedown 才会展开
async function openTypeSelect(rowEl) {
  fireEvent.mouseDown(rowEl.querySelector('.jse-type-select .ant-select-selection-search-input'));
  await act(async () => {
    await sleep(20);
  });
}

test.serial('渲染: 合法 schema 按树形渲染行, 名称/类型/必填/mock/描述回显正确', t => {
  const { container } = renderEditor();

  const rows = container.querySelectorAll('.jse-row');
  // user(0) → name(1) age(2) → tags(3) → Items(4) → simple(5)
  t.is(rows.length, 6, '展开态共 6 行: 3 根属性 + 2 个 user 子属性 + 1 个 Items 行');

  const nameInput = row(container, 0).querySelector('.jse-name-input');
  t.is(nameInput.value, 'user');

  const typeTexts = Array.from(container.querySelectorAll('.jse-type-select')).map(select => {
    const item = select.querySelector('.ant-select-selection-item');
    return item ? item.textContent : '';
  });
  t.deepEqual(typeTexts, ['object', 'string', 'integer', 'array', 'string', 'string'], '各行类型回显');

  const requiredBoxes = Array.from(container.querySelectorAll('.jse-required input'));
  // user(root required), name(user.required), age, tags, simple(root required)
  t.deepEqual(
    requiredBoxes.map(box => box.checked),
    [true, true, false, false, true],
    '必填勾选态来自父级 required 数组, Items 行无必填'
  );

  // Items 行名称输入禁用（对齐旧编辑器写死 "Items"）
  t.true(rowByName(container, 'Items').querySelector('.jse-name-input').disabled, 'Items 行名称不可编辑');
  // mock 列: simple 行回显 @name, object 行(user)禁用
  const mockInputs = Array.from(container.querySelectorAll('.jse-mock input'));
  t.is(mockInputs[mockInputs.length - 1].value, '@name', 'simple 行 mock 回显');
  t.true(mockInputs[0].disabled, 'object 类型 mock 输入禁用（对齐旧编辑器）');
  t.false(mockInputs[mockInputs.length - 1].disabled);
});

test.serial('渲染: isMock=false 不渲染 mock 列', t => {
  const { container } = renderEditor({ isMock: false });
  t.is(container.querySelectorAll('.jse-mock').length, 0);
  t.true(container.querySelector('.jse-row').className.indexOf('jse-row--no-mock') !== -1);
});

test.serial('交互: 点击添加属性上抛 onChange(field_1 string, 默认必填)', t => {
  const { container, changes } = renderEditor({ data: '' });

  fireEvent.click(container.querySelector('.jse-add-root'));
  t.is(changes.length, 1, '变更一次上抛一次');
  const out = JSON.parse(changes[0]);
  t.deepEqual(out, {
    type: 'object',
    properties: { field_1: { type: 'string' } },
    required: ['field_1']
  });
});

test.serial('交互: 空串与非法 JSON data 容错挂载不崩溃', t => {
  for (const data of ['', '   ', '{oops', '"scalar"']) {
    const { container } = renderEditor({ data });
    t.truthy(container.querySelector('.json-schema-editor'), `data=${JSON.stringify(data)} 应容错挂载`);
    t.is(container.querySelectorAll('.jse-row').length, 0, '容错后为空 object 根, 无属性行');
    cleanup();
  }
});

test.serial('交互: 重命名输入同步 required 数组并上抛（键序保持）', t => {
  const { container, changes } = renderEditor();

  const nameInput = rowByName(container, 'name').querySelector('.jse-name-input');
  fireEvent.change(nameInput, { target: { value: 'fullname' } });

  t.true(changes.length > 0, '重命名应上抛');
  const out = JSON.parse(changes[changes.length - 1]);
  const propKeys = Object.keys(out.properties.user.properties);
  t.deepEqual(propKeys, ['fullname', 'age'], '改名不改变键序');
  t.deepEqual(out.properties.user.required, ['fullname'], 'required 同步映射');
  t.is(out.properties.user.properties.fullname.format, 'email', '节点其余字段保留');
});

test.serial('交互: 重名拒改不上抛（对齐旧编辑器）', t => {
  const { container, changes } = renderEditor();

  const nameInput = rowByName(container, 'name').querySelector('.jse-name-input');
  fireEvent.change(nameInput, { target: { value: 'age' } }); // 与同级 age 冲突

  t.is(changes.length, 0, '重名拒改, 无 onChange');
  t.is(rowByName(container, 'name').querySelector('.jse-name-input').value, 'name', '受控值保持原名');
});

test.serial('交互: 必填勾选切换维护 required 数组并上抛', t => {
  const { container, changes } = renderEditor();

  // 取消 user 的必填（根 required ['user','simple'] → ['simple']）
  fireEvent.click(rowByName(container, 'user').querySelector('.jse-required input'));
  // 勾选 tags 的必填
  fireEvent.click(rowByName(container, 'tags').querySelector('.jse-required input'));

  const out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(out.required, ['simple', 'tags']);
});

test.serial('交互: 删除行同步清理 required, 兄弟节点历史脏字段（format/title/$schema/mock）保留', t => {
  const { container, changes } = renderEditor();

  // 删除根属性 user（展开行, 连同子树）
  fireEvent.click(rowByName(container, 'user').querySelector('.jse-btn-remove'));

  t.true(changes.length > 0);
  const out = JSON.parse(changes[changes.length - 1]);
  t.is(out.properties.user, undefined, '节点连同子树删除');
  t.deepEqual(Object.keys(out.properties), ['tags', 'simple'], '其余根属性保留');
  t.deepEqual(out.required, ['simple'], 'required 同步清理');
  t.is(out.$schema, 'http://json-schema.org/draft-04/schema#', '顶层未知字段保留');
  t.is(out.properties.simple.title, '简单字段');
  t.deepEqual(out.properties.simple.mock, { mock: '@name' });
});

test.serial('交互: 类型切换 string→array 上抛 items, 并渲染 Items 行', async t => {
  const { container, changes } = renderEditor();

  const simpleRow = rowByName(container, 'simple');
  await openTypeSelect(simpleRow);
  const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
    o => o.textContent === 'array'
  );
  t.truthy(option, '类型下拉应含 array 选项');
  await act(async () => {
    fireEvent.click(option);
    await sleep(20);
  });

  const out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(out.properties.simple.items, { type: 'string' }, '切 array 自动建 items');
  t.is(out.properties.simple.title, '简单字段', '非结构字段 merge 保留');
  t.deepEqual(out.properties.simple.mock, { mock: '@name' });

  // simple 行展开后出现 Items 行（行数 6 → 7）
  t.is(container.querySelectorAll('.jse-row').length, 7);
  const itemsName = rowByName(container, 'Items').querySelector('.jse-name-input');
  t.is(itemsName.value, 'Items');
  t.true(itemsName.disabled, 'Items 行名称禁用');
});

test.serial('交互: 展开/折叠纯 UI 状态, 折叠后子树行隐藏且不上抛 onChange', async t => {
  const { container, changes } = renderEditor();

  t.is(container.querySelectorAll('.jse-row').length, 6);
  fireEvent.click(rowByName(container, 'user').querySelector('.jse-caret-btn'));
  await act(async () => {
    await sleep(10);
  });

  t.is(container.querySelectorAll('.jse-row').length, 4, '折叠 user 后隐藏其 2 个子属性行');
  t.is(changes.length, 0, '折叠为纯 UI 状态, 不触发 onChange');

  // 再次点击恢复展开
  fireEvent.click(rowByName(container, 'user').querySelector('.jse-caret-btn'));
  await act(async () => {
    await sleep(10);
  });
  t.is(container.querySelectorAll('.jse-row').length, 6);
});

test.serial('交互: 添加子级/同级与上下移的输出契约', t => {
  const { container, changes } = renderEditor();

  // user 行(object)添加子级 → user.properties.field_1 + user.required（新增默认必填）
  fireEvent.click(rowByName(container, 'user').querySelector('.jse-btn-add-child'));
  let out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(out.properties.user.properties.field_1, { type: 'string' });
  t.deepEqual(out.properties.user.required, ['name', 'field_1']);

  // simple 行(string)添加同级 → 根级新属性
  fireEvent.click(rowByName(container, 'simple').querySelector('.jse-btn-add-sibling'));
  out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(Object.keys(out.properties), ['user', 'tags', 'simple', 'field_1']);

  // tags 下移 → 键序交换
  fireEvent.click(rowByName(container, 'tags').querySelector('.jse-btn-down'));
  out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(Object.keys(out.properties), ['user', 'simple', 'tags', 'field_1'], '下移交换键序');
  t.deepEqual(out.required, ['user', 'simple', 'field_1'], '移动不影响 required');

  // tags 再上移回原位
  fireEvent.click(rowByName(container, 'tags').querySelector('.jse-btn-up'));
  out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(Object.keys(out.properties), ['user', 'tags', 'simple', 'field_1']);
});

test.serial('交互: mock 输入写入 YApi 形态 {mock:value}, 清空删除字段', t => {
  const { container, changes } = renderEditor();

  const tagsMock = rowByName(container, 'tags').querySelector('.jse-mock input');
  fireEvent.change(tagsMock, { target: { value: '@url' } });

  let out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(out.properties.tags.mock, { mock: '@url' });

  fireEvent.change(tagsMock, { target: { value: '' } });
  out = JSON.parse(changes[changes.length - 1]);
  t.false(Object.prototype.hasOwnProperty.call(out.properties.tags, 'mock'));
});

test.serial('交互: 描述/默认值输入写入对应字段', t => {
  const { container, changes } = renderEditor();

  const tagsRow = rowByName(container, 'tags');
  fireEvent.change(tagsRow.querySelector('input[placeholder="描述"]'), {
    target: { value: '标签列表' }
  });
  fireEvent.change(rowByName(container, 'simple').querySelector('input[placeholder="默认值"]'), {
    target: { value: 'hello' }
  });

  const out = JSON.parse(changes[changes.length - 1]);
  t.is(out.properties.tags.description, '标签列表');
  t.is(out.properties.simple.default, 'hello');
});

test.serial('契约: 外部 data 变化重新解析进内部状态, 自身输出回灌不重解析', t => {
  const { container, rerender } = renderEditor();

  // 模拟父组件把编辑器输出回灌为 data（旧编辑器链路的真实行为）
  const emitted = u.stringifySchema(u.parseSchema(SAMPLE));
  rerender(<JsonSchemaEditor data={emitted} isMock={true} onChange={() => {}} />);
  t.is(
    rowByName(container, 'user').querySelector('.jse-name-input').value,
    'user',
    '回灌后内容不变'
  );

  // 外部换成另一份 schema → 重新解析
  const other = JSON.stringify({
    type: 'object',
    properties: { only: { type: 'number' } },
    required: ['only']
  });
  rerender(<JsonSchemaEditor data={other} isMock={true} onChange={() => {}} />);
  t.is(
    rowByName(container, 'only').querySelector('.jse-name-input').value,
    'only',
    '外部 data 变化应重新解析进内部状态'
  );
});

// ---------- 评审修复回归（B1/M1/M3） ----------

test.serial('B1(UI): __proto__ 属性行可见、可删除且 onChange 输出无键丢失/无幻影字段', t => {
  // 根级属性名就叫 __proto__（字符串入参经 JSON.parse 成为自有数据属性）
  const dirtySchema =
    '{"type":"object","properties":{"__proto__":{"type":"string"},"keep":{"type":"string"}},"required":["__proto__","keep"]}';
  const { container, changes } = renderEditor({ data: dirtySchema, isMock: false });

  const protoRow = rowByName(container, '__proto__');
  t.truthy(protoRow, '__proto__ 属性行应正常渲染');
  fireEvent.click(protoRow.querySelector('.jse-btn-remove'));

  t.true(changes.length > 0);
  const out = JSON.parse(changes[changes.length - 1]);
  t.is(Object.getOwnPropertyDescriptor(out.properties, '__proto__'), undefined, '__proto__ 节点删除');
  t.deepEqual(Object.keys(out.properties), ['keep']);
  t.deepEqual(out.required, ['keep'], 'required 悬挂消除');
  t.is(Object.getPrototypeOf(out.properties), Object.prototype, '输出对象原型不被偷换');
});

test.serial('M1: 添加子级按钮仅 object 行渲染, array 行不渲染(items 行提供该能力)', t => {
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      obj: { type: 'object', properties: {} },
      arr: { type: 'array', items: { type: 'object', properties: {} } },
      str: { type: 'string' }
    }
  });
  const { container, changes } = renderEditor({ data: schema, isMock: false });

  t.truthy(rowByName(container, 'obj').querySelector('.jse-btn-add-child'), 'object 行有添加子级');
  t.falsy(
    rowByName(container, 'arr').querySelector('.jse-btn-add-child'),
    'array 行不得渲染点击后静默无效的添加子级按钮'
  );
  t.falsy(rowByName(container, 'str').querySelector('.jse-btn-add-child'), 'string 行无添加子级');

  // items(object) 行的添加子级写入 items.properties
  const itemsRow = rowByName(container, 'Items');
  t.truthy(itemsRow.querySelector('.jse-btn-add-child'), 'items(object) 行有添加子级');
  fireEvent.click(itemsRow.querySelector('.jse-btn-add-child'));
  const out = JSON.parse(changes[changes.length - 1]);
  t.deepEqual(out.properties.arr.items.properties.field_1, { type: 'string' });
  t.deepEqual(out.properties.arr.items.required, ['field_1']);
});

test.serial('M3: 重名拒改调用 message.error 提示且不上抛', t => {
  // message 经 rc-notification 在独立 React root 异步挂载（DOM 渲染已单独验证），
  // 组件测试按本仓库 axios 打桩先例对 message.error 可写属性打桩，断言组件行为本身
  const antd = require('antd');
  const originalMessageError = antd.message.error;
  const messageCalls = [];
  antd.message.error = (/** @type {any} */ msg) => {
    messageCalls.push(String(msg));
  };

  try {
    const { container, changes } = renderEditor();
    const input = rowByName(container, 'name').querySelector('.jse-name-input');
    fireEvent.change(input, { target: { value: 'age' } }); // 与同级 age 冲突

    t.is(changes.length, 0, '重名拒改不上抛');
    t.deepEqual(messageCalls, ['The field "age" already exists.'], '应调用 message.error 提示重名');
  } finally {
    antd.message.error = originalMessageError;
  }
});


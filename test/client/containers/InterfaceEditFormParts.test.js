// InterfaceEditForm render 子组件化批次：子组件单测（BasicSettingPanel /
// RequestParamsSetting + RequestBodySetting / ResponseSetting）。
//
// 钉住的契约：受控展示（字段回填与显隐完全由 props 决定）+ 事件回调上抛（父组件仍是
// 唯一状态持有者）+ 两个子组件间的 slots 装配顺序 + 编辑器 ref 接线。整体渲染组装的
// 逐字节等价由批次交付期的 7 场景独立进程比对证明（旧版 git worktree @ 46310ed2），
// 本文件只覆盖单点契约，不重复容器级快照。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, stubDefaultExport, REPO_ROOT } from '../../helpers/containers';

const path = require('path');
const Module = require('module');

// 子组件经 webpack 别名引用 client/...，jsdom-setup 只映射了 common/ 前缀，
// 这里补 client/ 前缀映射，必须在 require 生产代码之前安装
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// 重型编辑器打桩（与既有 InterfaceEditForm.test.js 同源）：AceEditor 暴露 ref 句柄，
// 便于断言「模板页编辑器实例确实写入父组件 ref」这一接线契约
const ACE_HANDLE = { editor: { insertCode: () => {}, editor: { getCursorIndex: () => 0 } } };
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => ACE_HANDLE, []);
    return React.createElement(
      'div',
      {
        className: props.className,
        'data-data': String(props.data == null ? '' : props.data)
      },
      'STUB_ACE'
    );
  })
);

// json-schema-editor-visual 主入口为未转译的 ESM+JSX 源码（生产构建由 webpack
// babel-loader 处理），与既有 InterfaceEditForm.test.js 一致注入等价工厂桩
const jsvPath = require.resolve('json-schema-editor-visual');
{
  const jsvStubModule = new Module(jsvPath, null);
  jsvStubModule.filename = jsvPath;
  jsvStubModule.loaded = true;
  jsvStubModule.exports = function stubJSchemaFactory() {
    return function StubSchemaEditor(props) {
      return React.createElement(
        'div',
        { className: 'stub-json-schema-editor', 'data-data': String(props.data) },
        'STUB_SCHEMA_EDITOR'
      );
    };
  };
  require.cache[jsvPath] = jsvStubModule;
}

// EasyDragSort：在真实实现之上叠加 props 捕获（仍委托真实实现渲染，wrapper div 与
// 拖拽 handler 装配与生产一致），供拖拽契约用例断言 data() 与 onChange 的接线
const realEasyDragSort = require(path.join(
  REPO_ROOT,
  'client/components/EasyDragSort/EasyDragSort.js'
)).default;
const capturedDragSortProps = [];
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/EasyDragSort/EasyDragSort.js'),
  function CapturedEasyDragSort(props) {
    capturedDragSortProps.push(props);
    return React.createElement(realEasyDragSort, props);
  }
);

const { default: BasicSettingPanel } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditFormParts/BasicSettingPanel.js');
const { default: RequestParamsSetting } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditFormParts/RequestParamsSetting.js');
const { default: RequestBodySetting } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditFormParts/RequestBodySetting.js');
const { default: ResponseSetting } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditFormParts/ResponseSetting.js');

const { Form } = require('antd');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  capturedDragSortProps.length = 0;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buttonByText(container, text) {
  // antd Button 会在两个汉字间插入空格，比较前去除空白
  return Array.from(container.querySelectorAll('button')).find(
    b => b.textContent.replace(/\s/g, '') === text
  );
}

// ① BasicSettingPanel：字段受控回填 + 方法切换 / 路径输入 / Tag 设置上抛
test.serial('BasicSettingPanel 受控回填基本设置字段并上抛方法切换、路径输入与 Tag 设置', async t => {
  const calls = [];
  const props = {
    basepath: '/api/base',
    cat: [{ _id: '1', name: '分类A' }],
    custom_field: { enable: true, name: '自定义字段' },
    tags: [
      { _id: 't1', name: 'tagA' },
      { _id: 't2', name: 'tagB' }
    ],
    title: '接口一',
    catid: '1',
    method: 'POST',
    path: '/api/pet/{id}',
    tag: ['tagA'],
    status: 'done',
    custom_field_value: 'cfv',
    req_params: [
      { name: 'id', desc: '路径参数', example: '42' },
      { name: 'pid', desc: '', example: '' }
    ],
    onChangeMethod: v => calls.push(['method', v]),
    onPathChange: e => calls.push(['path', e.target.value]),
    onTagClick: () => calls.push(['tagClick'])
  };
  const utils = render(
    <Form>
      <BasicSettingPanel {...props} />
    </Form>
  );
  const { container } = utils;

  // 受控回填：名称 / 方法 / 路径 / 自定义字段标签
  t.is(container.querySelector('input#title').value, '接口一', '接口名称应回填 title');
  t.is(
    container.querySelector('.ant-select-selection-item[title="POST"]').textContent,
    'POST',
    '方法选择器应展示当前 method'
  );
  t.is(container.querySelector('input[placeholder="/path"]').value, '/api/pet/{id}', '路径应回填 path');
  t.true(container.innerHTML.indexOf('自定义字段') !== -1, 'custom_field.enable 为真时应渲染自定义字段项');

  // 路径参数行：由 req_params 求值，行数随数据变化
  t.is(
    container.querySelectorAll('.interface-edit-item-content').length,
    2,
    '路径参数行数应与 req_params 一致（paramsTpl 行）'
  );

  // 方法切换：Select onSelect 上抛 value（打开下拉与点选项分属两个 act 作用域，
  // 与生产 discrete 事件同步提交语义一致）
  const methodSelect = Array.from(container.querySelectorAll('.ant-select')).find(s =>
    s.textContent.indexOf('POST') !== -1
  );
  t.truthy(methodSelect, '方法选择器应可定位（受控展示当前 method）');
  await act(async () => {
    fireEvent.mouseDown(methodSelect.querySelector('.ant-select-selector'));
    await sleep(30);
  });
  await act(async () => {
    const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
      o => o.textContent === 'PUT'
    );
    t.truthy(option, '方法下拉应包含 PUT 选项');
    fireEvent.click(option);
    await sleep(30);
  });
  t.deepEqual(calls[0], ['method', 'PUT'], '方法切换应上抛 onChangeMethod(value)');

  // 路径输入：受控 onChange 上抛事件对象
  await act(async () => {
    fireEvent.change(container.querySelector('input[placeholder="/path"]'), {
      target: { value: '/api/pet/{pid}' }
    });
    await sleep(20);
  });
  t.deepEqual(calls[1], ['path', '/api/pet/{pid}'], '路径输入应上抛 onChange(e)');

  // Tag 设置按钮位于 Tag 多选下拉内，展开后点击应上抛 onTagClick
  const tagSelect = Array.from(container.querySelectorAll('.ant-select')).find(s =>
    s.textContent.indexOf('tagA') !== -1
  );
  t.truthy(tagSelect, 'Tag 多选应回填已选 tagA');
  await act(async () => {
    fireEvent.mouseDown(tagSelect.querySelector('.ant-select-selector'));
    await sleep(30);
  });
  const tagSettingButton = Array.from(document.querySelectorAll('.ant-select-item-option button')).find(
    b => b.textContent.indexOf('Tag设置') !== -1
  );
  t.truthy(tagSettingButton, 'Tag 下拉末项应内嵌 Tag设置 按钮');
  await act(async () => {
    fireEvent.click(tagSettingButton);
    await sleep(20);
  });
  t.deepEqual(calls[2], ['tagClick'], 'Tag设置按钮应上抛 onTagClick');
});

// ② RequestParamsSetting（含 RequestBodySetting 槽位）：行受控渲染 + 增删/批量/拖拽/页签上抛
//    + BODY 区块在 panel-sub 内保持 Headers 之后的装配顺序
test.serial('RequestParamsSetting 行受控渲染并上抛增删批量页签，BODY 槽位保持在 Headers 之后', async t => {
  const calls = [];
  const dragMoveFactories = [];
  const bodyCalls = [];
  const noop = () => {};
  const props = {
    method: 'POST',
    req_radio_type: 'req-query',
    reqHideTabs: { query: '', headers: 'hide', body: 'hide' },
    req_query: [
      { name: 'q', required: '1', desc: '查询', example: 'hello' },
      { name: 'opt', required: '0', desc: '', example: '' }
    ],
    req_headers: [{ name: 'Content-Type', value: 'application/json', required: '1' }],
    onRadioChange: e => calls.push(['radio', e.target.value]),
    onAddParams: name => calls.push(['add', name]),
    onShowBulk: name => calls.push(['bulk', name]),
    // 拖拽排序回调工厂在渲染期即被静态装配（收集工厂入参，验证两个列表各装配一次）
    onDragMove: name => {
      dragMoveFactories.push(name);
      return noop;
    },
    onDelParams: (index, name) => calls.push(['del', index, name])
  };
  const bodyProps = {
    method: 'POST',
    reqBodyType: 'json',
    reqBodyIsJsonSchema: false,
    isJson5: true,
    req_body_type: 'json',
    req_body_other: '{"a":1}',
    req_body_form: [{ name: 'f1', type: 'text', required: '1' }],
    req_body_is_json_schema: false,
    bodyHideTab: '',
    onAddParams: name => bodyCalls.push(['add', name]),
    onShowBulk: name => bodyCalls.push(['bulk', name]),
    onDragMove: noop,
    onDelParams: (index, name) => bodyCalls.push(['del', index, name]),
    onReqBodyChange: noop,
    onReqBodySchemaChange: noop
  };

  const utils = render(
    <Form>
      <RequestParamsSetting {...props}>
        <RequestBodySetting {...bodyProps} />
      </RequestParamsSetting>
    </Form>
  );
  const { container } = utils;

  // Query 行受控渲染（行名来自 req_query），隐藏位来自 reqHideTabs
  const queryInputs = Array.from(container.querySelectorAll('input[placeholder="参数名称"]')).map(
    i => i.value
  );
  t.deepEqual(queryInputs, ['q', 'opt'], 'Query 行应逐行回填 req_query 的名称');
  t.deepEqual(
    dragMoveFactories,
    ['req_query', 'req_headers'],
    'Query / Headers 两个列表应各装配一次拖拽排序回调工厂（顺序与区块一致）'
  );
  t.true(
    container.querySelectorAll('.interface-edit-item.hide').length >= 2,
    'headers 区块（表单项与行）的隐藏位为 hide 时应落在 className 上'
  );

  // 增删 / 批量 / 页签事件上抛
  await act(async () => {
    fireEvent.click(buttonByText(container, '添加Query参数'));
    fireEvent.click(container.querySelector('.bulk-import'));
    fireEvent.click(container.querySelectorAll('.interface-edit-del-icon')[0]);
    await sleep(20);
  });
  t.deepEqual(calls[0], ['add', 'req_query'], '「添加Query参数」应上抛 onAddParams(req_query)');
  t.deepEqual(calls[1], ['bulk', 'req_query'], '「批量添加」应上抛 onShowBulk(req_query)');
  t.deepEqual(calls[2], ['del', 0, 'req_query'], '删除图标应上抛 onDelParams(index, req_query)');

  await act(async () => {
    const headersRadio = Array.from(container.querySelectorAll('.ant-radio-button-wrapper')).find(
      w => w.textContent === 'Headers'
    );
    fireEvent.click(headersRadio);
    await sleep(20);
  });
  t.deepEqual(calls[3], ['radio', 'req-headers'], 'Headers 页签应上抛 onRadioChange 且值为 req-headers');

  // BODY 槽位：JSON 编辑区与 schema 开关在位，且 DOM 顺序在 Headers 区块之后
  const switchEl = container.querySelector('.ant-switch');
  t.truthy(switchEl, 'BODY 区块应渲染 JSON-SCHEMA 开关');
  const bodyRow = switchEl.closest('.ant-row');
  const headersFormItem = container.querySelector('.interface-edit-item.hide');
  t.true(
    Boolean(headersFormItem.compareDocumentPosition(bodyRow) & Node.DOCUMENT_POSITION_FOLLOWING),
    'BODY 区块应保持在 Headers 区块之后（panel-sub 内槽位顺序）'
  );
  t.is(switchEl.disabled, false, '项目开启 json5 时 JSON-SCHEMA 开关可用');
  t.true(container.innerHTML.indexOf('JSON-SCHEMA') !== -1, 'BODY 区应展示 JSON-SCHEMA 提示');
  const ace = container.querySelector('.interface-editor');
  t.truthy(ace, 'json 且非 json-schema 时应渲染 raw 编辑器');
  t.is(ace.getAttribute('data-data'), '{"a":1}', 'raw 编辑器内容应来自 req_body_other');
});

// ③ ResponseSetting：JSON/RAW 显隐与页签上抛 + schema 编辑器互斥 + 模板页编辑器 ref 接线
test.serial('ResponseSetting 按 resBodyType 与 json-schema 开关切换编辑区并接线编辑器 ref', async t => {
  const calls = [];
  const editorRef = { current: null };
  const baseProps = {
    isJson5: true,
    resBodyType: 'json',
    resBodyIsJsonSchema: false,
    res_body_type: 'json',
    res_body: '{"a":1}',
    res_body_is_json_schema: false,
    jsonType: 'tpl',
    onJsonTypeChange: key => calls.push(['jsonType', key]),
    onResBodyChange: () => {},
    onResBodySchemaChange: () => {},
    editorRef
  };

  const utils = render(
    <Form>
      <ResponseSetting {...baseProps} />
    </Form>
  );
  const { container, rerender } = utils;

  // JSON 分支：raw 编辑器接线到父组件 ref；mock 预览容器默认隐藏
  const ace = container.querySelector('.interface-editor');
  t.truthy(ace, 'res_body 非 json-schema 时应渲染模板页编辑器');
  t.is(ace.getAttribute('data-data'), '{"a":1}', '编辑器内容应来自 res_body');
  t.is(editorRef.current, ACE_HANDLE, '编辑器实例应写入父组件下传的 ref（handleMockPreview 依赖）');
  t.is(
    container.querySelector('#mock-preview').style.display,
    'none',
    'jsonType=tpl 时 mock 预览容器应隐藏'
  );
  t.is(
    container.querySelectorAll('.json-schema-editor-scope .stub-json-schema-editor').length,
    0,
    '非 json-schema 时不应渲染 schema 编辑器'
  );

  // 页签切换上抛（模板 → 预览）
  await act(async () => {
    const tab = Array.from(container.querySelectorAll('.ant-tabs-tab')).find(
      item => item.textContent === '预览'
    );
    fireEvent.click(tab);
    await sleep(20);
  });
  t.deepEqual(calls[0], ['jsonType', 'preview'], '页签切换应上抛 onJsonTypeChange(key)');

  // json-schema 开：schema 编辑器接管，raw 编辑器退场；jsonType=preview 时预览容器显示
  rerender(
    <Form>
      <ResponseSetting {...baseProps} resBodyIsJsonSchema={true} jsonType="preview" />
    </Form>
  );
  t.is(
    container.querySelectorAll('.json-schema-editor-scope .stub-json-schema-editor').length,
    1,
    'json-schema 开时应在作用域容器内渲染 schema 编辑器'
  );
  t.falsy(container.querySelector('.interface-editor'), 'json-schema 开时不应再渲染 raw 编辑器');
  t.is(
    container.querySelector('#mock-preview').style.display,
    'block',
    'jsonType=preview 时 mock 预览容器应显示'
  );

  // RAW 分支：JSON 编辑区隐藏、raw TextArea 显示，且 res_body 字段仍注册在表单上
  rerender(
    <Form>
      <ResponseSetting {...baseProps} resBodyType="raw" />
    </Form>
  );
  const jsonRow = container.querySelector('#mock-preview').closest('.ant-row');
  t.is(jsonRow.style.display, 'none', 'resBodyType=raw 时 JSON 编辑区应隐藏');
  const rawArea = container.querySelector('.interface-edit-item textarea');
  t.truthy(rawArea, 'resBodyType=raw 时应渲染 res_body TextArea');
  t.is(rawArea.value, '{"a":1}', 'raw TextArea 的值应来自 res_body');
});

// ④ 拖拽排序契约（D-2）：data() 经 Form.useFormInstance 取「表单注册后的实时字段值」
//    （而非父组件传入的 props 快照）；onChange 上抛 → 父组件 setFieldsValue + setState
//    的同序写回 → 行按新顺序受控重渲染。
test.serial('RequestParamsSetting 拖拽 data() 取实时字段值且 onChange 写回后受控重渲染', async t => {
  const noop = () => {};
  const ROWS_A = [
    { name: 'q', required: '1', desc: '查询', example: 'hello' },
    { name: 'opt', required: '0', desc: '', example: '' }
  ];
  // 最近一次渲染传入行的 req_query（用于证明 data() 读的是表单 store 而非该 props 快照）
  let propsRows = null;

  function DragHarness() {
    const [rows, setRows] = React.useState(ROWS_A);
    const [form] = Form.useForm();
    propsRows = rows;
    // 复刻父组件 handleDragMove 的写回顺序（InterfaceEditForm：先 setFieldsValue 再 setState）
    const onDragMove = name => data => {
      form.setFieldsValue({ [name]: data });
      setRows(data);
    };
    return (
      <Form form={form}>
        <RequestParamsSetting
          method="POST"
          req_radio_type="req-query"
          reqHideTabs={{ query: '', headers: 'hide', body: 'hide' }}
          req_query={rows}
          req_headers={[]}
          onRadioChange={noop}
          onAddParams={noop}
          onShowBulk={noop}
          onDragMove={onDragMove}
          onDelParams={noop}
        />
      </Form>
    );
  }

  capturedDragSortProps.length = 0;
  const utils = render(<DragHarness />);
  const { container } = utils;

  // Query / Headers 两个列表都会渲染拖拽容器（headers 为空数组时亦然），Query 先渲染；
  // antd Form 挂载期还会 forceUpdate 一次，故捕获到的是多个渲染轮的 props。
  // 用 data() 的返回值定位 Query 列表——Headers 无注册字段，其 data() 为 undefined。
  t.true(
    capturedDragSortProps.length >= 2,
    '前置条件：Query / Headers 两个列表都应装配拖拽容器'
  );
  const queryDragProps = capturedDragSortProps.filter(
    p => typeof p.data === 'function' && Array.isArray(p.data())
  )[0];
  t.truthy(queryDragProps, 'Query 列表应装配 EasyDragSort 且 data() 返回注册后的字段值');
  t.is(typeof queryDragProps.data, 'function', 'data 应以函数形式下传（EasyDragSort 拖拽期调用）');
  t.deepEqual(
    queryDragProps.data().map((/** @type {any} */ row) => row.name),
    ['q', 'opt'],
    'data() 初值应等于表单字段的注册值'
  );

  // 改第 1 行名称：值写入表单 store，但父 state 的 req_query 不随之变化
  // （本 harness 未挂 onValuesChange，故 props 快照与 store 值此时必然分叉）
  await act(async () => {
    fireEvent.change(container.querySelectorAll('input[placeholder="参数名称"]')[0], {
      target: { value: 'renamed' }
    });
    await sleep(20);
  });
  t.is(propsRows[0].name, 'q', '前置条件：父 state 的 req_query 未随输入同步');
  t.is(
    queryDragProps.data()[0].name,
    'renamed',
    'data() 应返回表单注册后的实时字段值（Form.useFormInstance 取到与父 useForm 同一实例）'
  );

  // 复刻真实 EasyDragSort 的拖拽提交：data() → arrMove → onChange(newValue, from, to)
  const live = queryDragProps.data();
  await act(async () => {
    queryDragProps.onChange([live[1], live[0]], 0, 1);
    await sleep(20);
  });

  const namesAfter = Array.from(container.querySelectorAll('input[placeholder="参数名称"]')).map(
    i => i.value
  );
  t.deepEqual(
    namesAfter,
    ['opt', 'renamed'],
    'onChange 写回后行应按新顺序受控重渲染，且保留拖拽前的实时编辑值'
  );
  t.deepEqual(
    propsRows.map((/** @type {any} */ row) => row.name),
    ['opt', 'renamed'],
    '父 state 应收到 onDragMove 产出并写回的新数组'
  );
});

// ⑤ RequestBodySetting file/raw 分支：file 渲染带占位提示的说明 TextArea，raw 渲染
//    满宽大文本框（antd5 写法 rows/autoSize + span=24，修复收缩成 190px 小方块）
test.serial('RequestBodySetting file 占位提示与 raw 满宽大文本框', async t => {
  const noop = () => {};
  const bodyProps = {
    method: 'POST',
    reqBodyIsJsonSchema: false,
    isJson5: true,
    req_body_other: 'hello',
    req_body_form: [],
    req_body_is_json_schema: false,
    bodyHideTab: '',
    onAddParams: noop,
    onShowBulk: noop,
    onDragMove: noop,
    onDelParams: noop,
    onReqBodyChange: noop,
    onReqBodySchemaChange: noop
  };

  // file 分支：说明 TextArea 带占位提示，不渲染 raw 满宽容器
  let utils = render(
    <Form>
      <RequestBodySetting {...bodyProps} reqBodyType="file" req_body_type="file" />
    </Form>
  );
  let { container } = utils;
  const fileArea = container.querySelector('.interface-edit-item-other-body textarea');
  t.truthy(fileArea, 'file 模式应渲染 req_body_other 说明 TextArea');
  t.is(
    fileArea.getAttribute('placeholder'),
    '请填写该二进制请求体的说明，如文件格式、大小限制等',
    'file TextArea 应展示二进制请求体说明占位提示'
  );
  t.is(
    container.querySelector('.interface-edit-raw-body textarea'),
    null,
    'file 模式不应渲染 raw 满宽文本框'
  );

  // 独立第二次 render（raw 分支）：满宽容器内 TextArea 为 8 行且回填 req_body_other
  cleanup();
  cleanupDom();
  utils = render(
    <Form>
      <RequestBodySetting {...bodyProps} reqBodyType="raw" req_body_type="raw" />
    </Form>
  );
  container = utils.container;
  const rawArea = container.querySelector('.interface-edit-raw-body textarea');
  t.truthy(rawArea, 'raw 模式应渲染满宽容器内的 TextArea');
  t.is(rawArea.getAttribute('rows'), '8', 'raw TextArea 应为 8 行（antd5 rows/autoSize 写法）');
  t.is(rawArea.getAttribute('placeholder'), '请输入 raw 请求体内容', 'raw TextArea 应展示输入占位提示');
  t.is(rawArea.style.width, '100%', 'raw TextArea 应满宽（内联 width:100%，修复收缩成小方块）');
  // 注：源码传入 style.minHeight='174px'，但 rc-textarea autoSize 挂载后会重算并覆盖
  // 内联 min-height（jsdom 无布局，重算值为负），故此处不做 minHeight 的 DOM 断言
  t.is(rawArea.value, 'hello', 'raw TextArea 的值应来自 req_body_other');
  t.is(container.querySelector('#single-file'), null, 'raw 模式不应渲染 file 上传控件');
});
// Postman render 子组件化批次：请求侧子组件单测（UrlBar / RequestParamsPanel / BodyPanel /
// ParamsName），钉住「受控展示 + 事件回调上抛」契约与历史死引用（写死的添加按钮恒 display:none）。
// 请求链路与 ref 契约由既有 test/client/components/Postman.test.js 覆盖，本文件不重复。
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

// AceEditor 为重型编辑器（CodeMirror 6），打桩为可断言 ref 的轻量替身：
// 暴露 className/data-* / readOnly / mode，并经 useImperativeHandle 提供 editor 实例。
const FAKE_ACE_EDITOR = { editor: { insertCode: () => {}, editor: { getCursorIndex: () => 0 } } };
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => FAKE_ACE_EDITOR, []);
    return React.createElement(
      'div',
      {
        className: props.className,
        'data-data': String(props.data == null ? '' : props.data),
        'data-mode': String(props.mode),
        'data-readonly': String(!!props.readOnly)
      },
      'STUB_ACE'
    );
  })
);

const { default: UrlBar } = require('../../../client/components/Postman/PostmanParts/UrlBar.js');
const {
  default: RequestParamsPanel
} = require('../../../client/components/Postman/PostmanParts/RequestParamsPanel.js');
const { default: BodyPanel } = require('../../../client/components/Postman/PostmanParts/BodyPanel.js');
const { default: ParamsName } = require('../../../client/components/Postman/PostmanParts/ParamsName.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').replace(/\s/g, '') === text
  )[0];
}

function itemByClass(container, className) {
  return container.querySelector('.ant-collapse-item.' + className);
}

const ENV = [
  { name: 'local', domain: 'http://localhost:3000', header: [] },
  { name: 'prod', domain: 'https://prod.example.com', header: [] }
];

// ① UrlBar：受控展示 + 环境下拉/环境配置/发送/保存上抛，按钮文案与禁用态随 props
test.serial('UrlBar 受控渲染并在切换环境/发送/保存时上抛对应事件', async t => {
  const calls = [];
  const props = {
    method: 'POST',
    case_env: 'local',
    env: ENV,
    path: '/api/pet/{id}',
    hasPlugin: true,
    loading: false,
    type: 'inter',
    onSelectDomain: v => calls.push(['selectDomain', v]),
    onShowEnvModal: () => calls.push(['showEnvModal']),
    onSend: () => calls.push(['send']),
    onSave: () => calls.push(['save'])
  };
  const utils = render(<UrlBar {...props} />);
  const { container } = utils;

  // 方法下拉被禁用且值为接口定义的方法
  const methodSelect = container.querySelector('.ant-select-disabled');
  t.truthy(methodSelect, '方法选择器应为禁用态（方法不可在运行页修改）');
  t.is(
    methodSelect.querySelector('.ant-select-selection-item').textContent,
    'POST',
    '方法选择器应展示接口定义的 method'
  );
  const pathInput = Array.from(container.querySelectorAll('input')).find(
    i => i.value === '/api/pet/{id}'
  );
  t.truthy(pathInput && pathInput.disabled, '路径输入框应禁用并展示 path');

  t.truthy(buttonByText(container, '发送'), 'hasPlugin=true 应展示可用「发送」按钮');
  t.is(buttonByText(container, '发送').disabled, false, '插件在位时发送按钮可用');

  // 环境下拉：选项文案 = 名称：域名；切换上抛（索引 0 为禁用的方法选择器，1 为环境下拉）
  const selectors = Array.from(container.querySelectorAll('.ant-select-selector'));
  await act(async () => {
    fireEvent.mouseDown(selectors[1], { target: selectors[1] });
    await sleep(30);
  });
  const options = Array.from(document.querySelectorAll('.ant-select-item-option')).map(o =>
    (o.textContent || '').trim()
  );
  t.true(options.indexOf('local：http://localhost:3000') !== -1, '环境选项应展示 名称：域名');
  t.true(options.indexOf('环境配置') !== -1, '环境下拉末项应为「环境配置」入口');
  const prodOption = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
    o => (o.textContent || '').indexOf('prod') === 0
  );
  await act(async () => {
    fireEvent.click(prodOption);
    await sleep(10);
  });
  t.deepEqual(calls, [['selectDomain', 'prod']], '选择环境应上抛 onSelectDomain(环境名)');

  // 发送 / 保存
  await act(async () => {
    fireEvent.click(buttonByText(container, '发送'));
    fireEvent.click(buttonByText(container, '保存'));
    await sleep(10);
  });
  t.deepEqual(
    calls.slice(1),
    [['send'], ['save']],
    '点击发送/保存应分别上抛 onSend / onSave'
  );
  t.truthy(buttonByText(container, '保存'), 'type=inter 的保存按钮文案应为「保存」');
  t.falsy(buttonByText(container, '更新'), 'type=inter 不应展示「更新」');

  utils.unmount();

  // loading 态文案与 noplugin 禁用态
  const utils2 = render(<UrlBar {...props} loading={true} hasPlugin={false} type="case" />);
  t.truthy(buttonByText(utils2.container, '取消'), 'loading 时发送按钮文案应为「取消」');
  t.is(
    buttonByText(utils2.container, '取消').disabled,
    true,
    'hasPlugin=false 时发送按钮应禁用'
  );
  t.truthy(buttonByText(utils2.container, '更新'), 'type=case 的保存按钮文案应为「更新」');
  utils2.unmount();

  // 环境配置入口按钮上抛
  const utils3 = render(<UrlBar {...props} />);
  await act(async () => {
    fireEvent.mouseDown(utils3.container.querySelectorAll('.ant-select-selector')[1], {
      target: utils3.container.querySelectorAll('.ant-select-selector')[1]
    });
    await sleep(30);
  });
  const envConfigBtn = Array.from(document.querySelectorAll('.ant-select-item-option button')).find(
    b => (b.textContent || '').replace(/\s/g, '') === '环境配置'
  );
  t.truthy(envConfigBtn, '环境下拉内应包含「环境配置」按钮');
  await act(async () => {
    fireEvent.click(envConfigBtn);
    await sleep(10);
  });
  t.deepEqual(calls[calls.length - 1], ['showEnvModal'], '点击环境配置应上抛 onShowEnvModal');
  utils3.unmount();
});

// ② RequestParamsPanel：四项受控渲染 + hidden 判定 + 改值/勾选/插入入口上抛
test.serial('RequestParamsPanel 按 props 渲染四项并上抛改值、勾选与插入事件', async t => {
  const calls = [];
  const props = {
    method: 'POST',
    req_params: [{ name: 'id', desc: '路径参数', value: '42' }],
    req_query: [
      { name: 'q', required: '1', example: 'hello', value: 'hello', enable: true },
      { name: 'opt', required: '0', value: 'off', enable: false }
    ],
    req_headers: [
      { name: 'Content-Type', value: 'application/json', abled: true },
      { name: 'X-Extra', value: 'v', abled: false, example: 'ex', desc: 'd' }
    ],
    req_body_type: 'json',
    req_body_form: [],
    req_body_other: '{"a":1}',
    editorRef: React.createRef(),
    onChangeParam: (...args) => calls.push(['changeParam'].concat(args)),
    onShowModal: (...args) => calls.push(['showModal'].concat(args)),
    onBodyChange: (...args) => calls.push(['bodyChange'].concat(args)),
    onFormChange: (...args) => calls.push(['formChange'].concat(args))
  };
  const utils = render(<RequestParamsPanel {...props} />);
  const { container } = utils;

  // 面板标签与行渲染集
  const labels = Array.from(container.querySelectorAll('.ant-collapse-header-text')).map(e =>
    (e.textContent || '').trim()
  );
  t.deepEqual(
    labels,
    ['PATH PARAMETERS', 'QUERY PARAMETERS', 'HEADERS', 'BODY(F9)'],
    '四个面板标签应与抽取前一致'
  );
  t.is(container.querySelectorAll('.key-value-wrap').length, 5, '应渲染 1 path + 2 query + 2 header 共 5 行');
  t.is(itemByClass(container, 'POST').querySelector('.ant-collapse-header').textContent, 'BODY(F9)', 'BODY 面板 method=POST 时应为 POST 类（可见）');
  t.falsy(itemByClass(container, 'hidden'), '四项均有数据时不应有 hidden 面板');

  // 空列表 → hidden
  const emptyUtils = render(
    <RequestParamsPanel {...props} req_params={[]} req_query={[]} req_headers={[]} />
  );
  t.is(
    emptyUtils.container.querySelectorAll('.ant-collapse-item.hidden').length,
    3,
    '空列表的三个面板应带 hidden 类（CSS 隐藏，仍渲染 DOM）'
  );
  t.truthy(
    emptyUtils.container.querySelector('.ant-collapse-item.POST'),
    'method=POST 且 req_body_type=json 时 BODY 面板应保留 POST 类（不 hidden）'
  );
  emptyUtils.unmount();

  // 历史死引用：写死的添加按钮恒 display:none，且不可点
  ['添加Path参数', '添加Query参数', '添加Header'].forEach(text => {
    const btn = buttonByText(container, text);
    t.truthy(btn, '应保留写死的「' + text + '」按钮（历史遗留）');
    t.is(btn.style.display, 'none', '「' + text + '」按钮应保持 display:none');
  });

  // query 必填行：勾选恒为 checked 且禁用
  const checkboxInputs = Array.from(container.querySelectorAll('.params-enable input'));
  t.is(checkboxInputs.length, 2, '仅 query 行带启用勾选（header/path 行不带）');
  t.true(checkboxInputs[0].checked && checkboxInputs[0].disabled, 'required=1 的 query 勾选应恒选中且禁用');
  t.false(checkboxInputs[1].checked, 'required=0 的 query 勾选应受控于 item.enable');

  // 改值上抛
  const queryInput = container.querySelector('#req_query_1');
  await act(async () => {
    fireEvent.change(queryInput, { target: { value: 'on-edited' } });
    await sleep(10);
  });
  t.deepEqual(
    calls[calls.length - 1],
    ['changeParam', 'req_query', 'on-edited', 1],
    'query 改值应上抛 changeParam(name, value, index)'
  );

  // 勾选上抛（第 4 个实参为 enable）
  await act(async () => {
    fireEvent.click(checkboxInputs[1]);
    await sleep(10);
  });
  t.deepEqual(
    calls[calls.length - 1],
    ['changeParam', 'req_query', true, 1, 'enable'],
    'query 勾选应上抛 changeParam(name, checked, index, "enable")'
  );

  // header：abled=true 的行输入禁用且不渲染编辑图标；abled=false 的行可编辑并有图标
  const headerInputs = Array.from(container.querySelectorAll('input[id^="req_headers_"]'));
  t.true(headerInputs[0].disabled, '环境注入的 header（abled）应只读');
  t.false(headerInputs[1].disabled, '普通 header 应可编辑');
  const headerRows = Array.from(container.querySelectorAll('.key-value-wrap'));
  t.is(
    headerRows[4].querySelectorAll('.ant-input-group-addon .anticon-edit').length,
    1,
    '可编辑 header 行应带高级参数插入图标'
  );
  t.is(
    headerRows[3].querySelectorAll('.ant-input-group-addon .anticon-edit').length,
    0,
    '只读 header 行不应带插入图标'
  );

  // 编辑图标上抛 showModal(value, index, type)
  await act(async () => {
    fireEvent.click(headerRows[4].querySelector('.ant-input-group-addon .anticon-edit'));
    await sleep(10);
  });
  t.deepEqual(
    calls[calls.length - 1],
    ['showModal', 'v', 1, 'req_headers'],
    '编辑图标应上抛 showModal(值, 行号, 字段名)'
  );

  // BODY 面板装配：raw 编辑器数据透传 + 高级参数设置入口上抛
  const ace = container.querySelector('.pretty-editor');
  t.is(ace.getAttribute('data-data'), '{"a":1}', 'BODY 编辑器应收到 req_body_other');
  await act(async () => {
    fireEvent.click(buttonByText(container, '高级参数设置'));
    await sleep(10);
  });
  t.deepEqual(
    calls[calls.length - 1],
    ['showModal', '{"a":1}', 0, 'req_body_other'],
    '高级参数设置应上抛 showModal(req_body_other, 0, "req_body_other")'
  );

  utils.unmount();
});

// ③ BodyPanel：raw / form / file 三形态渲染与上抛
test.serial('BodyPanel 按 req_body_type 渲染 raw/form/file 三形态并上抛编辑事件', async t => {
  const calls = [];
  const base = {
    method: 'POST',
    editorRef: React.createRef(),
    onShowModal: (...args) => calls.push(['showModal'].concat(args)),
    onBodyChange: (...args) => calls.push(['bodyChange'].concat(args)),
    onFormChange: (...args) => calls.push(['formChange'].concat(args))
  };

  // raw(json)：高级参数入口 + 编辑器 mode=null
  const rawUtils = render(
    <BodyPanel {...base} req_body_type="json" req_body_form={[]} req_body_other={'{"a":1}'} />
  );
  t.truthy(buttonByText(rawUtils.container, '高级参数设置'), 'json 形态应展示高级参数设置入口');
  const rawAce = rawUtils.container.querySelector('.pretty-editor');
  t.is(rawAce.getAttribute('data-data'), '{"a":1}', 'raw 编辑器应收到 req_body_other');
  t.is(rawAce.getAttribute('data-mode'), 'null', 'json 形态的编辑器 mode 应为 null（json 模式）');
  t.is(
    rawUtils.container.firstElementChild.style.display,
    'block',
    'raw(json) 形态的编辑器容器应为 block（checkRequestBodyIsRaw 为真）'
  );
  rawUtils.unmount();

  // raw(text)：非 json 形态无高级参数入口，编辑器 mode=text，且 req_body_other 变化经 onChange 上抛
  const textUtils = render(
    <BodyPanel {...base} req_body_type="text" req_body_form={[]} req_body_other="hello" />
  );
  t.falsy(buttonByText(textUtils.container, '高级参数设置'), 'text 形态不应展示高级参数设置入口');
  t.is(
    textUtils.container.querySelector('.pretty-editor').getAttribute('data-mode'),
    'text',
    'text 形态的编辑器 mode 应为 text'
  );
  textUtils.unmount();

  // form：file 行提示 Chrome 策略、text 行受控 + 勾选/改值/插入上抛
  const formUtils = render(
    <BodyPanel
      {...base}
      req_body_type="form"
      req_body_form={[
        { name: 'file1', type: 'file', value: '', enable: true },
        { name: 'f1', type: 'text', value: 'v', enable: true, example: 'e', desc: 'd' },
        { name: 'f2', type: 'text', value: '', enable: false, required: '1' }
      ]}
      req_body_other=""
    />
  );
  const formText = formUtils.container.textContent;
  t.is(
    formUtils.container.firstElementChild.style.display,
    'none',
    'form 形态应隐藏 raw 编辑器容器（checkRequestBodyIsRaw 为假）'
  );
  t.true(formText.indexOf('因Chrome最新版安全策略限制，不再支持文件上传') !== -1, 'file 行应展示 Chrome 安全策略提示');
  t.is(formUtils.container.querySelectorAll('#req_body_form_0').length, 0, 'file 行不应渲染文本输入框');
  t.is(formUtils.container.querySelector('#req_body_form_1').value, 'v', 'text 行输入框应为受控值');
  t.is(formUtils.container.querySelectorAll('input[type="file"]').length, 0, 'form 形态不应渲染原生文件选择框');

  const formCheckboxes = Array.from(formUtils.container.querySelectorAll('.params-enable input'));
  t.is(formCheckboxes.length, 3, 'form 每行一个启用勾选');
  t.true(formCheckboxes[2].checked && formCheckboxes[2].disabled, 'required=1 的 form 行勾选应恒选中且禁用');
  await act(async () => {
    fireEvent.change(formUtils.container.querySelector('#req_body_form_1'), { target: { value: 'v2' } });
    await sleep(10);
  });
  t.deepEqual(calls[calls.length - 1], ['formChange', 'v2', 1], 'form 改值应上抛 onFormChange(value, index)');
  await act(async () => {
    fireEvent.click(formCheckboxes[1]);
    await sleep(10);
  });
  t.deepEqual(
    calls[calls.length - 1],
    ['formChange', false, 1, 'enable'],
    'form 勾选应上抛 onFormChange(checked, index, "enable")'
  );
  await act(async () => {
    fireEvent.click(
      Array.from(formUtils.container.querySelectorAll('.ant-input-group-addon .anticon-edit'))[0]
    );
    await sleep(10);
  });
  t.deepEqual(calls[calls.length - 1], ['showModal', 'v', 1, 'req_body_form'], 'form 行插入图标应上抛 showModal');
  formUtils.unmount();

  // file：原生文件选择框
  const fileUtils = render(
    <BodyPanel {...base} req_body_type="file" req_body_form={[]} req_body_other="" />
  );
  t.is(fileUtils.container.querySelectorAll('input[type="file"]').length, 1, 'file 形态应渲染原生文件选择框');
  t.truthy(fileUtils.container.querySelector('#single-file'), 'file 选择框 id 应为 single-file');
  fileUtils.unmount();
});

// ④ ParamsName 与 InsertCodeMap 转出契约
test.serial('ParamsName 渲染只读参数名，Postman.js 仍按原路径转出 InsertCodeMap', t => {
  const nullUtils = render(<ParamsName name="plain" />);
  const nullInput = nullUtils.container.querySelector('input.key');
  t.truthy(nullInput, '应渲染 class=key 的名称输入框');
  t.is(nullInput.value, 'plain', '名称输入框应展示参数名');
  t.true(nullInput.disabled, '参数名来自接口定义，运行页应只读');
  nullUtils.unmount();

  const fullUtils = render(<ParamsName name="withMeta" example="示例值" desc="备注值" />);
  t.is(fullUtils.container.querySelector('input.key').value, 'withMeta', '带 example/desc 时仍展示参数名');
  fullUtils.unmount();

  // InsertCodeMap：常量文件与 Postman.js 转出值一致（CommonSettingModal 等消费方契约）
  const fromConstant = require('../../../client/components/Postman/PostmanParts/insertCodeMap.js')
    .InsertCodeMap;
  const fromPostman = require('../../../client/components/Postman/Postman.js').InsertCodeMap;
  t.is(fromConstant.length, 6, '断言片段表应有 6 条');
  t.deepEqual(
    fromPostman,
    fromConstant,
    'Postman.js 应按原路径转出同一份 InsertCodeMap（消费方零改动）'
  );
  t.deepEqual(
    fromConstant.map(i => i.title),
    [
      '断言 httpCode 等于 200',
      '断言返回数据 code 是 0',
      '断言 httpCode 不是 404',
      '断言返回数据 code 不是 40000',
      '断言对象 body 等于 {"code": 0}',
      '断言对象 body 不等于 {"code": 0}'
    ],
    '片段表内容与顺序应与抽取前一致'
  );
});
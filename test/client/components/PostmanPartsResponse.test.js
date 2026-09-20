// Postman render 子组件化批次：响应侧子组件单测（ResponsePanel / TestPanel / PostmanModals），
// 钉住「受控展示 + 事件回调上抛」契约，含 iframe 预览的安全属性与 Test 面板的片段插入语义。
// 请求链路、ref 契约与防双发由既有 test/client/components/Postman.test.js 覆盖，本文件不重复。
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

const FAKE_ACE_EDITOR = { editor: { insertCode: () => {}, editor: { getCursorIndex: () => 0 } } };
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => FAKE_ACE_EDITOR, []);
    return React.createElement(
      'div',
      {
        className: props.className,
        'data-data': String(props.data),
        'data-mode': String(props.mode),
        'data-readonly': String(!!props.readOnly)
      },
      'STUB_ACE'
    );
  })
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/ModalPostman/index.js'),
  function StubModalPostman(props) {
    return React.createElement(
      'div',
      {
        className: 'stub-modal-postman',
        'data-open': String(!!props.open),
        'data-input-value': String(props.inputValue),
        'data-env-type': String(props.envType),
        'data-id': String(props.id)
      },
      'STUB_MODAL_POSTMAN'
    );
  }
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Setting/ProjectEnv/index.js'),
  function StubProjectEnv(props) {
    return React.createElement(
      'div',
      { className: 'stub-project-env', 'data-project-id': String(props.projectId) },
      'STUB_PROJECT_ENV'
    );
  }
);

const { default: ResponsePanel } = require('../../../client/components/Postman/PostmanParts/ResponsePanel.js');
const { default: TestPanel } = require('../../../client/components/Postman/PostmanParts/TestPanel.js');
const {
  default: PostmanModals
} = require('../../../client/components/Postman/PostmanParts/PostmanModals.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const RESPONSE_PROPS = {
  loading: false,
  resStatusCode: null,
  resStatusText: null,
  test_valid_msg: null,
  autoPreviewHTML: true,
  test_res_header: null,
  test_res_body: null,
  previewHtml: false,
  onAutoPreviewChange: () => {}
};

// ① ResponsePanel：状态行 / 校验告警 / 响应头与响应体 / HTML 预览 iframe / 自动预览勾选
test.serial('ResponsePanel 渲染状态行与响应体，并按 previewHtml 切换 iframe 预览', async t => {
  const calls = [];
  const base = Object.assign({}, RESPONSE_PROPS, {
    onAutoPreviewChange: v => calls.push(['autoPreviewHTML', v])
  });

  // 初始态：状态行隐藏、无告警、无 iframe
  const initUtils = render(<ResponsePanel {...base} />);
  const initH2 = initUtils.container.querySelector('h2.res-code');
  t.is(initH2.style.display, 'none', '无状态码时状态行应隐藏');
  t.is(initUtils.container.querySelectorAll('.ant-alert').length, 0, '无校验信息时不应渲染告警');
  t.is(initUtils.container.querySelectorAll('iframe').length, 0, 'previewHtml=false 时应渲染编辑器而非 iframe');
  t.is(
    initUtils.container.querySelector('.pretty-editor-header').getAttribute('data-data'),
    'null',
    '响应头编辑器应收到 test_res_header（缺省为 null）'
  );
  t.is(
    initUtils.container.querySelector('.pretty-editor-body').getAttribute('data-readonly'),
    'true',
    '响应体编辑器应为只读'
  );
  initUtils.unmount();

  // 成功态：200 → success 配色 + 状态文本
  const okProps = Object.assign({}, base, {
    resStatusCode: 200,
    resStatusText: 'OK',
    test_res_header: { 'Content-Type': 'application/json' },
    test_res_body: '{\n  "a": 1\n}',
    test_valid_msg: ''
  });
  const okUtils = render(<ResponsePanel {...okProps} />);
  const okH2 = okUtils.container.querySelector('h2.res-code');
  t.is(okH2.style.display, '', '有状态码时状态行应展示');
  t.is(okH2.textContent, '200  OK', '状态行文案应为「状态码 + 状态文本」');
  t.true(okH2.className.indexOf('success') !== -1, '2xx 且非 loading 应为 success 配色');
  t.is(
    okUtils.container.querySelector('.pretty-editor-body').getAttribute('data-data'),
    '{\n  "a": 1\n}',
    '响应体编辑器应收到 test_res_body'
  );
  t.is(
    okUtils.container.querySelector('.pretty-editor-body').getAttribute('data-mode'),
    'json',
    '响应体编辑器 mode 应由响应头 Content-Type 推出（handleContentType）'
  );
  t.is(okUtils.container.querySelectorAll('.ant-alert').length, 0, '校验信息为空串时不应渲染告警');
  okUtils.unmount();

  // 失败态 + 校验告警
  const failUtils = render(
    <ResponsePanel
      {...okProps}
      resStatusCode={500}
      resStatusText="Internal Server Error"
      test_valid_msg="返回参数 code 类型不匹配"
    />
  );
  t.true(
    failUtils.container.querySelector('h2.res-code').className.indexOf('fail') !== -1,
    '5xx 应为 fail 配色'
  );
  t.is(failUtils.container.querySelectorAll('.ant-alert').length, 1, '有校验信息时应渲染告警');
  t.true(
    failUtils.container.querySelector('.ant-alert').textContent.indexOf('返回参数 code 类型不匹配') !== -1,
    '告警描述应为 test_valid_msg'
  );
  failUtils.unmount();

  // 自动预览 HTML：iframe sandbox 全量禁用脚本 + srcDoc 直出响应体
  const htmlUtils = render(
    <ResponsePanel
      {...okProps}
      previewHtml={true}
      test_res_body="<html><body>hi</body></html>"
      test_res_header={{ 'Content-Type': 'text/html; charset=utf-8' }}
    />
  );
  const iframe = htmlUtils.container.querySelector('iframe.pretty-editor-body');
  t.truthy(iframe, 'previewHtml=true 应渲染 iframe 预览');
  t.is(iframe.getAttribute('sandbox'), '', 'iframe 应为全量 sandbox（空字符串，禁止脚本执行）');
  t.is(iframe.getAttribute('srcdoc'), '<html><body>hi</body></html>', 'iframe 应以 srcDoc 渲染响应体');
  t.is(
    htmlUtils.container.querySelectorAll('.pretty-editor-body').length,
    1,
    '预览态下不应再渲染响应体编辑器（二者互斥）'
  );

  // 勾选「自动预览HTML」上抛
  const checkbox = htmlUtils.container.querySelector('.ant-checkbox-input');
  t.true(checkbox.checked, 'autoPreviewHTML=true 时勾选应为选中');
  await act(async () => {
    fireEvent.click(checkbox);
    await sleep(10);
  });
  t.deepEqual(calls, [['autoPreviewHTML', false]], '切换勾选应上抛 onAutoPreviewChange(checked)');
  htmlUtils.unmount();
});

// ② TestPanel：脚本开关 / 编辑器数据 / 片段插入（含 '\n' 前缀）/ editorRef 注册
test.serial('TestPanel 受控渲染脚本开关与片段列表，并上抛插入事件', async t => {
  const calls = [];
  const editorRef = React.createRef();
  const onInsertCalls = [];
  const props = {
    enable_script: true,
    test_script: 'assert.equal(status, 200)',
    editorRef,
    onEnableScriptChange: v => calls.push(['enableScript', v]),
    onScriptChange: d => calls.push(['scriptChange', d]),
    onInsertCode: code => onInsertCalls.push(code)
  };
  const utils = render(<TestPanel {...props} />);
  const { container } = utils;

  t.is(container.querySelectorAll('.case-script').length, 1, 'Test 面板应渲染 class=case-script 的编辑器');
  t.is(
    container.querySelector('.case-script').getAttribute('data-data'),
    'assert.equal(status, 200)',
    '脚本编辑器应收到 test_script'
  );
  t.true(container.querySelector('.ant-switch').classList.contains('ant-switch-checked'), 'enable_script=true 时开关应为开启态');
  t.is(container.querySelectorAll('.code-item').length, 6, '应渲染 6 条可插入断言片段');
  t.deepEqual(
    Array.from(container.querySelectorAll('.code-item')).map(e => e.textContent),
    [
      '断言 httpCode 等于 200',
      '断言返回数据 code 是 0',
      '断言 httpCode 不是 404',
      '断言返回数据 code 不是 40000',
      '断言对象 body 等于 {"code": 0}',
      '断言对象 body 不等于 {"code": 0}'
    ],
    '片段列表文案与顺序应与抽取前一致'
  );

  // 开关上抛
  await act(async () => {
    fireEvent.click(container.querySelector('.ant-switch'));
    await sleep(10);
  });
  t.deepEqual(calls, [['enableScript', false]], '切换开关应上抛 onEnableScriptChange(checked)');

  // 片段插入：子组件只上抛带 '\n' 前缀的片段 code（父组件负责写入编辑器实例）
  await act(async () => {
    fireEvent.click(container.querySelectorAll('.code-item')[1]);
    await sleep(10);
  });
  t.deepEqual(onInsertCalls, ['\n' + 'assert.equal(body.code, 0)'], '点击片段应上抛「\\n + code」');

  // 编辑器实例经父组件下传的 ref 注册（与 BodyPanel 共用同一 ref，挂载顺序语义不变）
  t.truthy(editorRef.current, 'editorRef 应被 Test 面板的编辑器注册');
  t.truthy(editorRef.current.editor, 'ref 应暴露 editor 实例（父组件 insertCode 的写入目标）');

  utils.unmount();
});

// ③ PostmanModals：两个弹窗按可见性条件渲染 + 关闭/确认上抛
test.serial('PostmanModals 按可见性条件渲染弹窗并上抛确认与取消', async t => {
  const calls = [];
  const base = {
    modalVisible: false,
    envModalVisible: false,
    inputValue: '',
    dataId: 100,
    type: 'inter',
    data: { _id: 100, project_id: 12 },
    hasPlugin: true,
    onModalCancel: () => calls.push(['modalCancel']),
    onModalOk: () => calls.push(['modalOk']),
    onEnvOk: () => calls.push(['envOk']),
    onEnvCancel: () => calls.push(['envCancel'])
  };

  // 双关闭：不渲染任何弹窗
  const closedUtils = render(<PostmanModals {...base} />);
  t.is(closedUtils.container.querySelectorAll('.stub-modal-postman').length, 0, 'modalVisible=false 时不应渲染插入弹窗');
  t.is(closedUtils.container.querySelectorAll('.env-modal').length, 0, 'envModalVisible=false 时不应渲染环境弹窗');
  closedUtils.unmount();

  // 插入弹窗：open/值/envType/id 透传（id 取正号）
  const modalUtils = render(
    <PostmanModals {...base} modalVisible={true} inputValue="{{token}}" />
  );
  const stub = modalUtils.container.querySelector('.stub-modal-postman');
  t.truthy(stub, 'modalVisible=true 应渲染插入弹窗');
  t.is(stub.getAttribute('data-open'), 'true', 'open 应为 true');
  t.is(stub.getAttribute('data-input-value'), '{{token}}', 'inputValue 应透传');
  t.is(stub.getAttribute('data-env-type'), 'inter', 'envType 应为 props.type');
  t.is(stub.getAttribute('data-id'), '100', 'id 应取 dataId 的正号值');
  modalUtils.unmount();

  // 环境弹窗：Modal 壳 + ProjectEnv 正文（projectId 透传）
  const envUtils = render(<PostmanModals {...base} envModalVisible={true} />);
  // antd Modal 经 portal 渲染到 body（与容器内 DOM 分离），故按 body 查询
  const envModal = document.body.querySelector('.env-modal');
  t.truthy(envModal, 'envModalVisible=true 应渲染环境弹窗');
  t.is(envModal.querySelector('.ant-modal-title').textContent, '环境设置', '环境弹窗标题应为「环境设置」');
  t.is(envModal.querySelector('.ant-modal-footer'), null, '环境弹窗应无 footer（footer={null}）');
  t.is(
    document.body.querySelector('.stub-project-env').getAttribute('data-project-id'),
    '12',
    'ProjectEnv 应收到 projectId'
  );
  envUtils.unmount();
});
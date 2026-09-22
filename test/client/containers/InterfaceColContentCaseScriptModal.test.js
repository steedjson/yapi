// InterfaceColContent 子组件 CaseScriptModal（自定义测试脚本弹窗）单测：
// 受控渲染 + 开关/编辑器回调上抛 + 确定/取消（render 子组件化批次 1 登记的
// 「3 个弹窗契约测试」缺口收尾；其打开入口不可达为在册产品决策项，契约测试不依赖入口）。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { cleanupDom, stubDefaultExport } from '../../helpers/containers';

// CaseScriptModal 经 webpack 别名 client/ 引用 AceEditor，jsdom-setup 只映射 common/ 前缀，
// 这里补 client/ 前缀的等价映射（同 CommonSettingModal.test.js 模式），
// 必须在 require 被测组件之前安装
const path = require('path');
const Module = require('module');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// AceEditor 打桩：把 onChange 载荷入口渲染为按钮，便于在不引入 CodeMirror 的前提下
// 验证「取 .text 后上抛」接线。
const StubAceEditor = React.forwardRef(function StubAceEditor(props) {
  return React.createElement(
    'div',
    {
      className: 'stub-ace-editor' + (props.className ? ' ' + props.className : ''),
      'data-data': String(props.data == null ? '' : props.data)
    },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'stub-ace-change',
        onClick: () => props.onChange && props.onChange({ text: 'assert.equal(status, 201)' })
      },
      'STUB_ACE'
    )
  );
});
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  StubAceEditor
);

const CaseScriptModal = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/CaseScriptModal.js')
  .default;

function renderModal(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      visible: true,
      enableScript: false,
      curScript: 'assert.equal(status, 200)',
      onEnableScriptChange: value => calls.push(['enable', value]),
      onScriptChange: text => calls.push(['script', text]),
      onOk: () => calls.push(['ok']),
      onCancel: () => calls.push(['cancel'])
    },
    overrides
  );
  const utils = render(React.createElement(CaseScriptModal, props));
  return Object.assign({ calls }, utils);
}

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('受控渲染：visible=false 时不渲染弹窗内容', t => {
  renderModal({ visible: false });

  t.is(document.querySelector('.ant-modal'), null, '关闭态不落入 DOM');
});

test.serial('受控渲染：标题/开关状态/脚本内容按 props 回显', t => {
  renderModal({ enableScript: true, curScript: 'assert.equal(status, 404)' });

  const modal = document.querySelector('.ant-modal');
  t.truthy(modal, 'visible=true 应渲染弹窗');
  t.is(modal.querySelector('.ant-modal-title').textContent, '自定义测试脚本');
  t.is(
    modal.querySelector('.ant-switch').getAttribute('aria-checked'),
    'true',
    '开关状态由 props 受控回显'
  );
  t.is(
    modal.querySelector('.stub-ace-editor').getAttribute('data-data'),
    'assert.equal(status, 404)',
    '脚本内容透传给编辑器'
  );
});

test.serial('回调上抛：开关切换与编辑器变更各上抛一次', t => {
  const { calls } = renderModal();

  fireEvent.click(document.querySelector('.ant-switch'));
  fireEvent.click(document.querySelector('.stub-ace-change'));

  t.deepEqual(
    calls,
    [
      ['enable', true],
      ['script', 'assert.equal(status, 201)']
    ],
    '开关上抛目标值，编辑器载荷取 .text 后上抛'
  );
});

test.serial('回调上抛：确定/取消按钮分别触发 onOk / onCancel', t => {
  const { calls } = renderModal();

  const ok = document.querySelector('.ant-modal-footer .ant-btn-primary');
  const cancel = document.querySelector('.ant-modal-footer button:not(.ant-btn-primary)');
  t.truthy(ok, '应渲染确定按钮');
  t.truthy(cancel, '应渲染取消按钮');

  fireEvent.click(ok);
  fireEvent.click(cancel);

  t.deepEqual(calls, [['ok'], ['cancel']], '两个按钮各自回调一次');
});

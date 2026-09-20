// InterfaceColContent 子组件 CommonSettingModal（通用规则配置弹窗）单测：
// 受控渲染 + 编辑动作回调上抛（含抽取时刻意保留的 checkScript 展开行为）。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { cleanupDom, stubDefaultExport } from '../../helpers/containers';

// CommonSettingModal.js 经 webpack 别名 client/ 引用 AceEditor / Postman，
// jsdom-setup 只映射 common/ 前缀，这里补 client/ 前缀的等价映射（同 Postman.test.js 模式），
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

// AceEditor 打桩：暴露精简编辑器实例（insertCode 记录写入内容），并把 onChange 载荷生成
// 入口渲染为按钮，便于在不引入 CodeMirror 的前提下验证 props 接线。
const insertedCodes = [];
const StubAceEditor = React.forwardRef(function StubAceEditor(props, ref) {
  React.useImperativeHandle(ref, () => ({
    get editor() {
      return {
        insertCode: code => insertedCodes.push(code)
      };
    }
  }));
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
        onClick: () => props.onChange && props.onChange({ text: 'assert.equal(status, 404)' })
      },
      'STUB_ACE'
    )
  );
});
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  StubAceEditor
);

const {
  default: CommonSettingModal
} = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/CommonSettingModal.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  insertedCodes.length = 0;
});

const COMMON_SETTING = {
  checkHttpCodeIs200: false,
  checkResponseField: {
    name: 'code',
    value: '0',
    enable: false
  },
  checkResponseSchema: false,
  checkScript: {
    enable: true,
    content: 'assert.equal(status, 200)'
  }
};

function renderModal(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      visible: true,
      commonSetting: COMMON_SETTING,
      onChangeCommonSetting: partial => calls.push(partial),
      onOk: () => calls.push(['ok']),
      onCancel: () => calls.push(['cancel'])
    },
    overrides
  );
  const utils = render(<CommonSettingModal {...props} />);
  return Object.assign({ calls }, utils);
}

function switches() {
  return Array.from(document.querySelectorAll('.common-setting-modal [role="switch"]'));
}

function inputs() {
  return Array.from(document.querySelectorAll('.common-setting-modal input'));
}

test.serial('受控渲染：visible=false 时不渲染弹窗内容', t => {
  renderModal({ visible: false });

  t.is(document.querySelector('.common-setting-modal'), null, '关闭态不落入 DOM');
});

test.serial('受控渲染：四个开关与两个输入框按 commonSetting 回显，脚本内容透传给编辑器', t => {
  renderModal({
    commonSetting: {
      checkHttpCodeIs200: true,
      checkResponseField: { name: 'biz_code', value: '7', enable: true },
      checkResponseSchema: true,
      checkScript: { enable: true, content: 'assert.equal(status, 200)' }
    }
  });

  const sws = switches();
  t.is(sws.length, 4, '共 4 个开关（HttpCode / 返回json / 数据结构 / 全局脚本）');
  t.deepEqual(
    sws.map(sw => sw.getAttribute('aria-checked')),
    ['true', 'true', 'true', 'true'],
    '开关状态全部由 props 受控回显'
  );

  const ins = inputs();
  t.deepEqual(
    ins.map(el => el.value),
    ['biz_code', '7'],
    '字段名/值输入框受控回显'
  );
  t.deepEqual(
    ins.map(el => el.getAttribute('placeholder')),
    ['字段名', '值'],
    '占位符文案不变'
  );

  const ace = document.querySelector('.stub-ace-editor');
  t.is(ace.getAttribute('data-data'), 'assert.equal(status, 200)', '脚本内容经 data prop 透传');
  t.is(ace.className, 'stub-ace-editor case-script', 'className 收发不变（case-script）');
});

test.serial('回调上抛：HttpCode 与返回数据结构开关上抛对应片段', t => {
  const { calls } = renderModal();

  fireEvent.click(switches()[0]);
  fireEvent.click(switches()[2]);

  t.deepEqual(
    calls,
    [{ checkHttpCodeIs200: true }, { checkResponseSchema: true }],
    '两个开关各上抛一个字段片段'
  );
});

test.serial('回调上抛：返回 json 字段开关按 props 嵌套合并（name/value/enable 同一片段结构）', t => {
  const { calls } = renderModal({
    commonSetting: {
      checkHttpCodeIs200: false,
      checkResponseField: { name: 'code', value: '0', enable: false },
      checkResponseSchema: false,
      checkScript: { enable: false, content: '' }
    }
  });

  fireEvent.click(switches()[1]);

  t.deepEqual(
    calls,
    [{ checkResponseField: { name: 'code', value: '0', enable: true } }],
    '开关片段保留其余字段（原实现 ...checkResponseField 语义）'
  );
});

test.serial('回调上抛：字段名/值输入框上抛嵌套片段', t => {
  const { calls } = renderModal();

  fireEvent.change(inputs()[0], { target: { value: 'biz_code' } });
  fireEvent.change(inputs()[1], { target: { value: '7' } });

  t.deepEqual(
    calls,
    [
      { checkResponseField: { name: 'biz_code', value: '0', enable: false } },
      { checkResponseField: { name: 'code', value: '7', enable: false } }
    ],
    '两次编辑各上抛携带新值的 checkResponseField 片段'
  );
});

test.serial('回调上抛（刻意保留的既有行为）：脚本开关片段只含 enable，不携带 content', t => {
  const { calls } = renderModal({
    commonSetting: {
      checkHttpCodeIs200: false,
      checkResponseField: { name: 'code', value: '0', enable: false },
      checkResponseSchema: false,
      checkScript: { enable: false, content: 'assert.equal(status, 200)' }
    }
  });

  fireEvent.click(switches()[3]);

  t.deepEqual(
    calls,
    [{ checkScript: { enable: true } }],
    '抽取前该 handler 展开的是顶层 state.checkScript（不存在），content 随之丢失，本批次按原样保留'
  );
});

test.serial('回调上抛：编辑器 onChange 载荷取 .text 拼入 checkScript.content 片段', t => {
  const { calls } = renderModal();

  fireEvent.click(document.querySelector('.stub-ace-change'));

  t.deepEqual(
    calls,
    [{ checkScript: { enable: true, content: 'assert.equal(status, 404)' } }],
    '编辑器文本变更以 checkScript.content 片段上抛（保留 enable）'
  );
});

test.serial('受控渲染 + 插入代码：6 个代码项，点击后写入编辑器实例', t => {
  renderModal();

  const codeItems = Array.from(document.querySelectorAll('.common-setting-modal .code-item'));
  t.is(codeItems.length, 6, '插入代码列表保持 6 项');
  t.is(codeItems[0].textContent.trim(), '断言 httpCode 等于 200', '首项文案不变');

  fireEvent.click(codeItems[0]);
  t.deepEqual(insertedCodes, ['\nassert.equal(status, 200)'], '插入内容为换行 + 代码片段');
});

test.serial('回调上抛：弹窗确定/取消按钮分别触发 onOk / onCancel', t => {
  const { calls } = renderModal();

  const ok = document.querySelector('.ant-modal-footer .ant-btn-primary');
  const cancel = document.querySelector('.ant-modal-footer button:not(.ant-btn-primary)');
  t.truthy(ok, '应渲染确定按钮');
  t.truthy(cancel, '应渲染取消按钮');

  fireEvent.click(ok);
  fireEvent.click(cancel);

  t.deepEqual(calls, [['ok'], ['cancel']], '两个按钮各自回调一次');
});
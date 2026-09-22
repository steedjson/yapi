// InterfaceColContent 子组件 CaseReportModal（测试报告弹窗）单测：
// 受控渲染 + report 展开透传 CaseReport + 关闭回调（render 子组件化批次 1 登记的
// 「3 个弹窗契约测试」缺口补全；CaseReport 以打桩替代以聚焦 props 透传）。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { cleanupDom, stubDefaultExport } from '../../helpers/containers';

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// CaseReport 打桩：把收到的 props 序列化到 DOM，便于断言 report 展开透传
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Interface/InterfaceCol/CaseReport.js'),
  function StubCaseReport(props) {
    return React.createElement(
      'div',
      { className: 'case-report-stub', 'data-props': JSON.stringify(props) },
      'CASE_REPORT_STUB'
    );
  }
);

const CaseReportModal = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/CaseReportModal.js')
  .default;

const REPORT = {
  code: 0,
  status: 200,
  url: 'http://dev.example.com/api/base/two',
  validRes: []
};

function renderModal(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      visible: true,
      report: REPORT,
      onCancel: () => calls.push(['cancel'])
    },
    overrides
  );
  const utils = render(React.createElement(CaseReportModal, props));
  return Object.assign({ calls }, utils);
}

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('受控渲染：visible=false 时不渲染弹窗内容', t => {
  renderModal({ visible: false });

  t.is(document.querySelector('.case-report-stub'), null, '关闭态不渲染报告内容');
});

test.serial('受控渲染：标题与 report 展开透传给 CaseReport，footer 为 null', t => {
  renderModal();

  const modal = document.querySelector('.ant-modal');
  t.truthy(modal, 'visible=true 应渲染弹窗');
  t.is(modal.querySelector('.ant-modal-title').textContent, '测试报告');
  t.is(modal.querySelector('.ant-modal-footer'), null, 'footer=null 不渲染确定/取消按钮');

  const stub = modal.querySelector('.case-report-stub');
  t.truthy(stub, '正文应渲染 CaseReport');
  t.deepEqual(JSON.parse(stub.getAttribute('data-props')), REPORT, 'report 字段应原样透传');
});

test.serial('report 缺省：CaseReport 以空 props 渲染（JSX 展开 undefined 等价不传）', t => {
  renderModal({ report: undefined });

  const stub = document.querySelector('.case-report-stub');
  t.truthy(stub, '缺省时仍渲染 CaseReport');
  t.deepEqual(JSON.parse(stub.getAttribute('data-props')), {}, '不应携带任何 report 字段');
});

test.serial('回调上抛：关闭按钮触发 onCancel', t => {
  const { calls } = renderModal();

  fireEvent.click(document.querySelector('.ant-modal-close'));

  t.deepEqual(calls, [['cancel']]);
});

// InterfaceColContent 子组件 AutoTestModal（服务端自动化测试弹窗）单测：
// 受控渲染 + 各配置项变更回调上抛 + URL 复制入口（render 子组件化批次 1 登记的
// 「3 个弹窗契约测试（AutoTestModal 优先）」缺口补全）。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/containers';

// AutoTestModal 经 webpack 别名 client/ 引用 CaseEnv，jsdom-setup 只映射 common/ 前缀，
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

const AutoTestModal = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/AutoTestModal.js')
  .default;

const ENV_LIST = [
  {
    _id: 'proj-1',
    name: '演示项目',
    env: [{ _id: 'e1', name: 'dev', domain: 'http://dev.example.com', header: [] }]
  }
];

const HREF = 'http://dev.example.com/api/col/auto?token=1';

function renderModal(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      visible: true,
      envList: ENV_LIST,
      envValue: { 'proj-1': 'dev' },
      collapseKey: '1',
      onEnvChange: (envName, projectId) => calls.push(['env', envName, projectId]),
      onCollapseChange: key => calls.push(['collapse', key]),
      mode: 'html',
      email: false,
      download: false,
      onModeChange: value => calls.push(['mode', value]),
      onEmailChange: value => calls.push(['email', value]),
      onDownloadChange: value => calls.push(['download', value]),
      href: HREF,
      urlText: '自动化测试 URL',
      onCopyUrl: url => calls.push(['copy', url]),
      onCancel: () => calls.push(['cancel'])
    },
    overrides
  );
  const utils = render(React.createElement(AutoTestModal, props));
  return Object.assign({ calls }, utils);
}

// 任何断言失败也保证卸载：避免残留弹窗污染后续用例（模态 portal 挂在 document.body）
test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('受控渲染：visible=false 时不渲染弹窗内容', t => {
  renderModal({ visible: false });

  t.is(document.querySelector('.autoTestsModal'), null, '关闭态不落入 DOM');

  cleanup();
  cleanupDom();
});

test.serial('受控渲染：标题/输出格式/开关/URL 按 props 回显，footer 为 null', t => {
  renderModal({ mode: 'json', email: true, download: true });

  const modal = document.querySelector('.autoTestsModal');
  t.truthy(modal, 'visible=true 应渲染弹窗');
  t.is(modal.querySelector('.ant-modal-title').textContent, '服务端自动化测试');
  // 弹窗内有两处 Select（CaseEnv 环境选择在前）：按「输出格式」标签所在行定位，避免误取 CaseEnv
  const modeLabel = Array.from(modal.querySelectorAll('.label')).find(
    el => el.textContent.trim() === '输出格式：'
  );
  t.truthy(modeLabel, '应渲染输出格式行');
  t.is(
    modeLabel.closest('.ant-row').querySelector('.ant-select-selection-item').textContent,
    'json',
    '输出格式受控回显'
  );

  const sws = modal.querySelectorAll('.ant-switch');
  t.is(sws.length, 2, '消息通知与下载数据两个开关（CaseEnv 无开关）');
  t.deepEqual(
    Array.from(sws).map(sw => sw.getAttribute('aria-checked')),
    ['true', 'true'],
    '开关状态由 props 受控回显'
  );

  const link = modal.querySelector('.autoTestUrl a');
  t.is(link.getAttribute('href'), HREF);
  t.is(link.textContent, '自动化测试 URL');
  t.is(modal.querySelector('.ant-modal-footer'), null, 'footer=null 不渲染确定/取消按钮');

  cleanup();
  cleanupDom();
});

test.serial('回调上抛：两个开关与复制按钮各自回调一次', t => {
  const { calls } = renderModal({ email: true, download: false });

  const modal = document.querySelector('.autoTestsModal');
  const sws = modal.querySelectorAll('.ant-switch');
  fireEvent.click(sws[0]);
  fireEvent.click(sws[1]);
  fireEvent.click(modal.querySelector('.copy-btn'));

  t.deepEqual(
    calls,
    [
      ['email', false],
      ['download', true],
      ['copy', HREF]
    ],
    '开关上抛目标值，复制上抛 href'
  );

  cleanup();
  cleanupDom();
});

test.serial('回调上抛：关闭按钮触发 onCancel（受控弹窗不自行关闭）', t => {
  const { calls } = renderModal();

  fireEvent.click(document.querySelector('.autoTestsModal .ant-modal-close'));

  t.deepEqual(calls, [['cancel']]);
  t.truthy(document.querySelector('.autoTestsModal'), '受控组件保持打开（关闭由父组件决定）');

  cleanup();
  cleanupDom();
});

test.serial('回调上抛：输出格式下拉选择触发 onModeChange', async t => {
  const { calls } = renderModal({ mode: 'html' });

  // 弹窗内 CaseEnv 的 Select 在前，需按「输出格式」行定位模式选择器
  const modeLabel = Array.from(
    document.querySelectorAll('.autoTestsModal .label')
  ).find(el => el.textContent.trim() === '输出格式：');
  const modeSelector = modeLabel.closest('.ant-row').querySelector('.ant-select-selector');

  await act(async () => {
    fireEvent.mouseDown(modeSelector);
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
    o => o.textContent === 'json'
  );
  t.truthy(option, '下拉应含 json 选项');
  await act(async () => {
    fireEvent.click(option);
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  t.deepEqual(calls, [['mode', 'json']]);

  cleanup();
  cleanupDom();
});

// InterfaceColContent 子组件 ColToolbar（顶部区域）单测：受控渲染 + 事件回调上抛。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders } from '../../helpers/containers';

// ColToolbar.js 经 webpack 别名 client/ 引用 CaseEnv，jsdom-setup 只映射 common/ 前缀，
// 这里补 client/ 前缀的等价映射（同 Postman.test.js 模式），必须在 require 被测组件之前安装
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

const {
  default: ColToolbar
} = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/ColToolbar.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

const ENV_LIST = [
  {
    _id: 'proj-1',
    name: '项目环境',
    env: [
      { _id: 'e-dev', name: 'dev', domain: 'http://dev.example.com', header: [] },
      { _id: 'e-test', name: 'test', domain: 'http://test.example.com', header: [] }
    ]
  }
];

function renderToolbar(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      envList: ENV_LIST,
      envValue: {},
      collapseKey: '1',
      onEnvChange: (val, id) => calls.push(['env', val, id]),
      onCollapseChange: key => calls.push(['collapse', key]),
      hasPlugin: true,
      curProjectRole: 'admin',
      onAutoTests: () => calls.push(['autoTests']),
      onOpenCommonSetting: () => calls.push(['commonSetting']),
      onExecuteTests: () => calls.push(['execute'])
    },
    overrides
  );
  const utils = renderWithProviders(<ColToolbar {...props} />, {
    initialPath: '/project/proj-1/interface/col/1'
  });
  return Object.assign({ calls }, utils);
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').trim() === text
  )[0];
}

test.serial('受控渲染：标题文档入口 + 环境选择 + 有插件时的三个操作按钮', t => {
  const { container } = renderToolbar();

  t.is(container.querySelector('h2.interface-title').textContent.indexOf('测试集合'), 0, '标题应含「测试集合」');
  t.is(
    container.querySelector('h2.interface-title a').getAttribute('href'),
    'https://hellosean1025.github.io/yapi/documents/case.html',
    '标题应保留文档入口链接'
  );
  t.truthy(container.querySelector('.case-env'), '应渲染环境选择器');

  const labels = Array.from(container.querySelectorAll('button')).map(b => b.textContent.trim());
  t.deepEqual(labels, ['服务端测试', '通用规则配置', '开始测试'], '按钮顺序与文案应与抽取前一致');
  t.true(
    Array.from(container.querySelectorAll('button')).every(b => b.disabled === false),
    'hasPlugin 为真时三个按钮均可用'
  );
});

test.serial('事件上抛：三个操作按钮分别回调 onAutoTests / onOpenCommonSetting / onExecuteTests', t => {
  const { container, calls } = renderToolbar();

  fireEvent.click(buttonByText(container, '服务端测试'));
  fireEvent.click(buttonByText(container, '通用规则配置'));
  fireEvent.click(buttonByText(container, '开始测试'));

  t.deepEqual(calls, [['autoTests'], ['commonSetting'], ['execute']], '回调应按点击顺序各触发一次');
});

test.serial('受控渲染：hasPlugin 为假时只剩禁用的开始测试按钮（原行为：无服务端测试/通用规则配置）', t => {
  const { container, calls } = renderToolbar({ hasPlugin: false });

  const buttons = Array.from(container.querySelectorAll('button'));
  t.is(buttons.length, 1, '仅渲染一个按钮');
  t.is(buttons[0].textContent.trim(), '开始测试');
  t.true(buttons[0].disabled, '未安装插件时开始测试禁用');

  fireEvent.click(buttons[0]);
  t.deepEqual(calls, [], '禁用按钮不触发回调');
});

test.serial('受控渲染：guest 角色不渲染服务端测试按钮', t => {
  const { container } = renderToolbar({ curProjectRole: 'guest' });

  const labels = Array.from(container.querySelectorAll('button')).map(b => b.textContent.trim());
  t.deepEqual(labels, ['通用规则配置', '开始测试'], 'guest 不渲染服务端测试');
});

test.serial('受控渲染：环境下拉的选中值来自 envValue（受控回显）', t => {
  const { container } = renderToolbar({ envValue: { 'proj-1': 'test' } });

  const items = Array.from(container.querySelectorAll('.case-env .ant-select-selection-item')).map(
    el => el.textContent
  );
  t.deepEqual(items, ['test: http://test.example.com'], '选中值应回显对应环境名与 domain');
});

test.serial('事件上抛：折叠面板切换回调 onCollapseChange', t => {
  const { container, calls } = renderToolbar();

  const header = container.querySelector('.ant-collapse-header');
  t.truthy(header, '应渲染选择测试用例环境的折叠面板头');
  fireEvent.click(header);

  t.is(calls.length, 1, '应触发一次折叠变更回调');
  t.is(calls[0][0], 'collapse');
  t.true(Array.isArray(calls[0][1]), '回调载荷为 antd Collapse 的 activeKey 数组');
});
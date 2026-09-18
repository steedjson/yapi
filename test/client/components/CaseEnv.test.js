// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: CaseEnv } = require('../../../client/components/CaseEnv/index.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ENV_LIST = [
  {
    _id: 'env-project-1',
    name: '开发环境',
    env: [
      { _id: 'env-a', name: 'dev', domain: 'http://dev.example.com' },
      { _id: 'env-b', name: 'test', domain: 'http://test.example.com' }
    ]
  },
  {
    _id: 'env-project-2',
    name: '生产环境',
    env: [{ _id: 'env-c', name: 'prod', domain: 'http://prod.example.com' }]
  }
];

// 渲染组件并记录 currProjectEnvChange / changeClose 调用
function renderCaseEnv(overrides) {
  const envChanges = [];
  const closeChanges = [];
  const props = Object.assign(
    {
      envList: ENV_LIST,
      envValue: { 'env-project-1': 'dev', 'env-project-2': '' },
      collapseKey: ['1'],
      currProjectEnvChange: (val, id) => envChanges.push([val, id]),
      changeClose: key => closeChanges.push(key)
    },
    overrides
  );
  const utils = render(<CaseEnv {...props} />);
  return Object.assign({ envChanges, closeChanges }, utils);
}

// antd Select 的下拉在 selector 内部的搜索输入框上触发 mousedown 才会展开
function openSelect(container, index) {
  const select = container.querySelectorAll('.case-env .ant-select')[index || 0];
  fireEvent.mouseDown(select.querySelector('.ant-select-selection-search-input') || select);
}

test.serial('渲染每个环境项的名称', t => {
  const { container } = renderCaseEnv();

  const labels = Array.from(container.querySelectorAll('.label-name')).map(l => l.textContent);
  t.deepEqual(labels, ['开发环境', '生产环境'], '应渲染每个环境项名称, 实际 DOM: ' + container.innerHTML);
  t.is(container.querySelectorAll('.env-item').length, 2, '应渲染两个环境行');
});

test.serial('渲染 Collapse 面板与每个环境项的 Select 下拉框', t => {
  const { container } = renderCaseEnv();

  t.truthy(container.querySelector('.ant-collapse'), '应渲染 Collapse');
  t.truthy(
    container.textContent.indexOf('选择测试用例环境') !== -1,
    '面板标题应为 选择测试用例环境'
  );
  const selects = container.querySelectorAll('.case-env .ant-select');
  t.is(selects.length, 2, '每个环境项应渲染一个 Select');
});

test.serial('受控回显: 已选环境展示对应名称, 未选环境展示默认环境', t => {
  const { container } = renderCaseEnv();

  const selections = Array.from(
    container.querySelectorAll('.case-env .ant-select-selection-item')
  ).map(s => s.textContent);
  t.deepEqual(
    selections,
    ['dev: http://dev.example.com', '默认环境'],
    '应按 envValue 受控回显'
  );
});

test.serial('Select 下拉包含默认环境与全部子环境选项', async t => {
  const { container } = renderCaseEnv();

  openSelect(container, 0);
  await act(async () => {
    await sleep(20);
  });

  const options = Array.from(
    container.ownerDocument.querySelectorAll('.ant-select-item-option')
  ).map(o => o.textContent);
  t.deepEqual(
    options,
    ['默认环境', 'dev: http://dev.example.com', 'test: http://test.example.com'],
    '下拉应包含默认环境与该项目的全部环境'
  );
});

test.serial('选择某个环境选项触发 currProjectEnvChange(选项值, 项目id)', async t => {
  const { container, envChanges } = renderCaseEnv();

  openSelect(container, 0);
  await act(async () => {
    await sleep(20);
  });
  const option = Array.from(
    container.ownerDocument.querySelectorAll('.ant-select-item-option')
  ).find(o => o.textContent === 'test: http://test.example.com');
  fireEvent.click(option);
  await act(async () => {
    await sleep(20);
  });

  t.deepEqual(envChanges, [['test', 'env-project-1']], '应把环境名与项目 id 交给回调');
});

test.serial('展开/收起面板触发 changeClose 回调', async t => {
  const { container, closeChanges } = renderCaseEnv();

  fireEvent.click(container.querySelector('.ant-collapse-header'));
  await act(async () => {
    await sleep(20);
  });

  t.is(closeChanges.length, 1, '点击面板头应触发一次 changeClose');
  t.deepEqual(closeChanges, [[]], '点击收起面板应传回当前激活 key (空数组折叠状态)');
});

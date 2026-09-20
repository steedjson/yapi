// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock, mockEditorCalls } = require('./setup');

const ADVMOCK_PATH = '../../exts/yapi-plugin-advanced-mock/AdvMock';

const MOCK_LIST = [
  {
    _id: 1,
    name: '期望一',
    ip_enable: false,
    ip: '',
    username: 'alice',
    up_time: 1600000000,
    case_enable: true
  }
];

function seedState() {
  return {
    mockCol: { list: MOCK_LIST },
    inter: { curdata: { _id: 100, title: '接口一', res_body: '{}', res_body_is_json_schema: false, req_body_is_json_schema: false } },
    project: { currProject: { _id: 12, role: 'owner', switch_notice: true } }
  };
}

function renderAdvMock() {
  return renderWithProviders(React.createElement(require(ADVMOCK_PATH).default), {
    seedState: seedState(),
    routePath: '/project/:id/interface/api/:actionId',
    initialPath: '/project/12/interface/api/100'
  });
}

test.serial('AdvMock 挂载：拉取高级 Mock 配置回填 Switch，mockEditor 以容器挂载', async t => {
  axiosMock.setRoutes([
    {
      match: '/api/plugin/advmock/get',
      respond: () => ({ errcode: 0, data: { enable: true, mock_script: 'script-v1' } })
    },
    { match: '/api/plugin/advmock/case/list', respond: () => ({ errcode: 0, data: MOCK_LIST }) }
  ]);
  mockEditorCalls.length = 0;
  const { container } = renderAdvMock();
  await flushEffects(80);

  // 以当前路由 actionId 拉取配置
  const getCalls = axiosMock.filter('/api/plugin/advmock/get');
  t.is(getCalls.length, 1);
  t.regex(getCalls[0].url, /interface_id=100$/);

  // enable=true 回填 Switch
  const switchEl = container.querySelector('[role="switch"]');
  t.truthy(switchEl);
  t.is(switchEl.getAttribute('aria-checked'), 'true');

  // mockEditor 挂到 #mock-script 容器；data 为回填前 state（保持旧实现的读取时机）
  t.is(mockEditorCalls.length, 1);
  t.is(mockEditorCalls[0].container, 'mock-script');
  // 钉住读取时机语义：data 必须是回填前值（空串），而非 get 接口返回的 mock_script
  t.is(mockEditorCalls[0].data, '');

  // 默认期望 tab：MockCol 可见、脚本表单隐藏
  t.regex(container.textContent, /期望一/);
  const scriptWrapper = container.querySelector('#mock-script').closest('form').parentElement;
  t.is(scriptWrapper.style.display, 'none');

  cleanup();
  cleanupDom();
});

test.serial('AdvMock 点击「脚本」tab：脚本表单显出、期望面板隐藏', async t => {
  axiosMock.setRoutes([
    {
      match: '/api/plugin/advmock/get',
      respond: () => ({ errcode: 0, data: { enable: false, mock_script: '' } })
    },
    { match: '/api/plugin/advmock/case/list', respond: () => ({ errcode: 0, data: MOCK_LIST }) }
  ]);
  mockEditorCalls.length = 0;
  const { container } = renderAdvMock();
  await flushEffects(80);

  const scriptRadio = Array.from(container.querySelectorAll('label')).find(
    l => l.textContent.replace(/\s/g, '') === '脚本'
  );
  t.truthy(scriptRadio);
  fireEvent.click(scriptRadio);
  await flushEffects(60);

  // 脚本表单显出（#mock-script 容器可见），期望面板隐藏
  const scriptWrapper = container.querySelector('#mock-script').closest('form').parentElement;
  t.is(scriptWrapper.style.display, '');
  const caseWrapper = scriptWrapper.nextElementSibling;
  t.is(caseWrapper.style.display, 'none');
  // Switch 与保存按钮在脚本表单内
  t.truthy(container.querySelector('[role="switch"]'));
  t.is(container.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  t.truthy(
    Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.replace(/\s/g, '') === '保存'
    )
  );

  cleanup();
  cleanupDom();
});

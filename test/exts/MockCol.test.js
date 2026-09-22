// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock } = require('./setup');

const MOCKCOL_PATH = '../../exts/yapi-plugin-advanced-mock/MockCol/MockCol';

const MOCK_LIST_A = [
  {
    _id: 1,
    interface_id: 100,
    project_id: 12,
    name: '期望一',
    ip_enable: false,
    ip: '',
    username: 'alice',
    uid: 9,
    up_time: 1600000000,
    case_enable: true
  },
  {
    _id: 2,
    interface_id: 100,
    project_id: 12,
    name: '期望二',
    ip_enable: true,
    ip: '10.0.0.1',
    username: 'bob',
    uid: 8,
    up_time: 1600000123,
    case_enable: true
  }
];
const MOCK_LIST_B = MOCK_LIST_A.map(item =>
  item._id === 1 ? Object.assign({}, item, { case_enable: false }) : item
);

const CURDATA = {
  _id: 100,
  title: '接口一',
  method: 'GET',
  res_body: '{"a":1}',
  res_body_type: 'json',
  res_body_is_json_schema: false,
  req_body_is_json_schema: false,
  req_body_other: ''
};

function seedState(role) {
  return {
    mockCol: { list: MOCK_LIST_A },
    inter: { curdata: CURDATA },
    project: { currProject: { _id: 12, role: role, switch_notice: true } }
  };
}

/**
 * helpers/containers 的 makeStore 为固定 reducer（派发不改 state），这里对
 * FETCH_MOCK_COL 做真实收敛，其余分支保持种子 state，供重拉列表断言使用。
 */
function renderMockColWithLiveStore(role) {
  const dispatched = [];
  const record = action => {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
  };
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    record(action);
    if (state === undefined) {
      return seedState(role);
    }
    if (action.type === 'yapi/mockCol/FETCH_MOCK_COL') {
      return { ...state, mockCol: { ...state.mockCol, list: action.payload.data } };
    }
    return state;
  });
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    record(action);
    return originalDispatch(action);
  };
  const utils = render(
    React.createElement(
      Provider,
      { store },
      React.createElement(
        MemoryRouter,
        {
          initialEntries: ['/project/12/interface/api/100'],
          future: { v7_startTransition: true, v7_relativeSplatPath: true }
        },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/project/:id/interface/api/:actionId',
            element: React.createElement(require(MOCKCOL_PATH).default)
          })
        )
      )
    )
  );
  return { ...utils, dispatched };
}

function findButton(container, text) {
  return Array.from(container.querySelectorAll('button')).find(
    b => b.textContent.replace(/\s/g, '') === text
  );
}

test.serial('MockCol guest 角色：挂载拉取期望列表，操作按钮与添加入口不可用', async t => {
  axiosMock.setRoutes([
    { match: '/api/plugin/advmock/case/list', respond: () => ({ errcode: 0, data: MOCK_LIST_A }) }
  ]);
  const { container, dispatched } = renderWithProviders(
    React.createElement(require(MOCKCOL_PATH).default),
    {
      seedState: seedState('guest'),
      routePath: '/project/:id/interface/api/:actionId',
      initialPath: '/project/12/interface/api/100'
    }
  );
  await flushEffects();

  // 挂载期拉取期望列表
  const listCalls = axiosMock.filter('/api/plugin/advmock/case/list');
  t.is(listCalls.length, 1);
  t.regex(listCalls[0].url, /interface_id=100$/);
  t.true(dispatched.some(a => a.type === 'yapi/mockCol/FETCH_MOCK_COL'));

  // guest：添加期望禁用，且操作列不渲染任何按钮
  const addBtn = findButton(container, '添加期望');
  t.truthy(addBtn);
  t.true(addBtn.hasAttribute('disabled'));
  t.falsy(findButton(container, '编辑'));
  t.falsy(findButton(container, '删除'));

  // 列表数据渲染
  t.regex(container.textContent, /期望一/);
  t.regex(container.textContent, /期望二/);

  cleanup();
  cleanupDom();
});

test.serial('MockCol owner 点击「已开启」：hide 请求成功后重拉列表并切换为「未开启」', async t => {
  axiosMock.setRoutes([
    {
      match: '/api/plugin/advmock/case/list',
      respond: () =>
        axiosMock.filter('/api/plugin/advmock/case/list').length <= 1
          ? { errcode: 0, data: MOCK_LIST_A }
          : { errcode: 0, data: MOCK_LIST_B }
    },
    { match: '/api/plugin/advmock/case/hide', respond: () => ({ errcode: 0, data: true }) }
  ]);
  const { container, dispatched } = renderMockColWithLiveStore('owner');
  await flushEffects(60);

  t.truthy(findButton(container, '已开启'));

  fireEvent.click(findButton(container, '已开启'));
  await flushEffects(100);

  // hide 请求体：id=1，原 case_enable=true → enable=false
  const hideCalls = axiosMock.filter('/api/plugin/advmock/case/hide');
  t.is(hideCalls.length, 1);
  t.deepEqual(hideCalls[0].body, { id: 1, enable: false });

  // 重拉列表后按钮切换为「未开启」（MOCK_LIST_B 中期望一 case_enable=false）
  t.regex(container.textContent, /未开启/);
  // 挂载 + 重拉共两次 FETCH_MOCK_COL
  t.is(dispatched.filter(a => a.type === 'yapi/mockCol/FETCH_MOCK_COL').length, 2);

  cleanup();
  cleanupDom();
});

test.serial('MockCol owner 点击「添加期望」：CaseDesModal 按 visible 契约打开（open/visible 回归门禁）', async t => {
  axiosMock.setRoutes([
    { match: '/api/plugin/advmock/case/list', respond: () => ({ errcode: 0, data: MOCK_LIST_A }) }
  ]);
  const { container } = renderMockColWithLiveStore('owner');
  await flushEffects(60);

  const addButton = findButton(container, '添加期望');
  t.truthy(addButton, 'owner 应看到添加期望按钮');

  fireEvent.click(addButton);
  await flushEffects(80);

  const modal = document.body.querySelector('.ant-modal');
  t.truthy(modal, '修复前父组件传 open= 而组件读 visible，弹窗永不渲染');
  t.is(modal.querySelector('.ant-modal-title').textContent, '添加期望');

  cleanup();
  cleanupDom();
});

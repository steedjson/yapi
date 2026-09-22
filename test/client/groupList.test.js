// jsdom 环境必须在任何生产代码之前装载
import '../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { cleanupDom, flushEffects } from '../helpers/containers';

const axios = require('axios');
const { createStore, applyMiddleware } = require('redux');
const promiseMiddleware = require('redux-promise');
const { Provider } = require('react-redux');
const { MemoryRouter, Routes, Route, useLocation } = require('react-router-dom');

// GroupList.js 引入 SCSS，经 jsdom-setup 的资源 stub 后可被 Node 端 AVA 加载
const { default: GroupList } = require('../../client/containers/Group/GroupList/GroupList.js');
// group 切片已迁至 Zustand（批次3）：组件经 useGroupStore 读写，测试直接播种真实 store
const useGroupStore = require('../../client/store/groupStore').default;

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  useGroupStore.setState(INITIAL_GROUP_STATE);
});

const G1 = { _id: 71, group_name: '前端组', group_desc: 'd1', type: 'public' };
const G2 = { _id: 72, group_name: '后端组', group_desc: 'd2', type: 'public' };
const G3 = { _id: 73, group_name: '私有组', group_desc: 'd3', type: 'private' };
const LIST = [G1, G2, G3];

function mockGroupApis(log) {
  axios.get = (url, config) => {
    log.push(['GET', url, config && config.params]);
    if (url === '/api/group/list') {
      return Promise.resolve({ data: { errcode: 0, data: LIST.map(g => ({ ...g })) } });
    }
    if (url === '/api/group/get') {
      const id = (config && config.params && config.params.id) || 71;
      const group = LIST.find(g => g._id === id) || G1;
      return Promise.resolve({ data: { errcode: 0, data: group } });
    }
    if (url === '/api/log/list') {
      return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
    }
    throw new Error('unexpected GET: ' + url);
  };
  axios.post = (url, data) => {
    log.push(['POST', url, data]);
    throw new Error('unexpected POST: ' + url);
  };
}

function renderGroupList(initialPath) {
  // user 切片仍走 redux 固定 reducer；group 切片经真实 Zustand store 播种
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup: G1,
    groupList: LIST,
    role: 'dev'
  });
  const seed = {
    user: { role: 'regular', studyTip: 1, study: true }
  };
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state) {
    if (state === undefined) state = seed;
    return state;
  }, seed);
  // 反向断言用：记录仍流经 redux 的 action（group 切片迁移后不应再有 yapi/group/*）
  const dispatched = [];
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    dispatched.push(action);
    return originalDispatch(action);
  };
  let currentPath = '';
  const PathEcho = () => {
    const loc = useLocation();
    currentPath = loc.pathname;
    return React.createElement('span', { 'data-probe-path': loc.pathname });
  };
  const utils = render(
    React.createElement(
      Provider,
      { store },
      React.createElement(
        MemoryRouter,
        {
          initialEntries: [initialPath || '/group/71'],
          future: { v7_startTransition: true, v7_relativeSplatPath: true }
        },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/group/*', element: React.createElement(GroupList) })
          ),
          React.createElement(PathEcho, null)
        )
      )
    )
  );
  utils.getPath = () => currentPath;
  utils.dispatched = dispatched;
  return utils;
}

test.serial('GroupList 渲染：挂载拉取分组列表并按路由选中分组', async t => {
  const log = [];
  mockGroupApis(log);
  const { container, getPath, dispatched } = renderGroupList('/group/71');
  await flushEffects();

  t.truthy(log.find(entry => entry[0] === 'GET' && entry[1] === '/api/group/list'), '挂载应请求分组列表');
  t.falsy(
    dispatched.find(a => a.type && a.type.indexOf('yapi/group/') === 0),
    'group 切片已迁 Zustand，不应再派发 yapi/group/* redux action'
  );
  const items = Array.from(container.querySelectorAll('.ant-menu-item'));
  t.is(items.length, 3, '应渲染 3 个分组菜单项');
  t.is(items[0].textContent.indexOf('前端组'), 0, '菜单应包含前端组');
  t.truthy(container.querySelector('.ant-menu-item-selected'), '应有选中分组');
  t.is(
    container.querySelector('.ant-menu-item-selected').textContent.indexOf('前端组'),
    0,
    '/group/71 应选中前端组'
  );
  t.is(getPath(), '/group/71', '命中路由分组时保持 URL 不动');
});

test.serial('GroupList 路由：非法分组 id 回退首个分组并 replace 归一化 URL', async t => {
  const log = [];
  mockGroupApis(log);
  const { container, getPath } = renderGroupList('/group/999');
  await flushEffects(60);

  t.is(getPath(), '/group/71', '应 replace 为首个分组的 URL');
  t.is(
    container.querySelector('.ant-menu-item-selected').textContent.indexOf('前端组'),
    0,
    '非法路由应回退选中首个分组'
  );
  t.truthy(
    log.find(entry => entry[1] === '/api/group/get' && entry[2].id === 71),
    '回退后应请求首个分组的详情以同步选中'
  );
});

test.serial('GroupList 搜索：按名称过滤分组菜单', async t => {
  const log = [];
  mockGroupApis(log);
  const { container } = renderGroupList('/group/71');
  await flushEffects();

  const input = container.querySelector('input[placeholder="搜索分类"]');
  fireEvent.change(input, { target: { value: '私有' } });
  await flushEffects();

  const items = Array.from(container.querySelectorAll('.ant-menu-item'));
  t.is(items.length, 1, '过滤后应仅剩匹配分组');
  t.is(items[0].textContent.indexOf('私有组'), 0, '过滤结果应为私有组');
});

test.serial('GroupList 交互：点击分组推送 URL 并按路由同步选中', async t => {
  const log = [];
  mockGroupApis(log);
  const { container, getPath } = renderGroupList('/group/71');
  await flushEffects();

  const items = Array.from(container.querySelectorAll('.ant-menu-item'));
  const target = items.find(li => li.textContent.indexOf('后端组') > -1);
  fireEvent.click(target.querySelector('.group-name-text') || target);
  await flushEffects(80);

  t.is(getPath(), '/group/72', '点击分组应推送 /group/72');
  t.is(
    container.querySelector('.ant-menu-item-selected').textContent.indexOf('后端组'),
    0,
    '路由变化后应选中后端组'
  );
  t.truthy(
    log.find(entry => entry[1] === '/api/group/get' && entry[2].id === 72),
    '选中变化应请求后端组的分组详情'
  );
});

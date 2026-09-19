// jsdom 环境必须在任何生产代码之前装载
import '../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { cleanupDom, flushEffects, stubDefaultExport } from '../helpers/containers';

const axios = require('axios');
const path = require('path');
const Module = require('module');

// Application.js 顶层 require('client/plugin.js')（进而加载 exts 插件），jsdom-setup
// 只映射了 common/ 前缀，这里补 client/ 与 exts/ 前缀的等价映射，
// 必须在 require 被测组件之前安装
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (
    typeof request === 'string' &&
    (request.indexOf('client/') === 0 || request.indexOf('exts/') === 0)
  ) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// /project/:id/* 路由的容器（createAsyncComponent 懒加载）依赖重，
// 以 require.cache 桩替换，聚焦应用外壳自身的 Header/Footer/路由分发结构。
// Home/Login 为静态 import 且轻量，保持真实渲染。
const ProjectStub = () => React.createElement('div', { 'data-stub': 'PROJECT' }, 'PROJECT_STUB');
stubDefaultExport(path.join(REPO_ROOT, 'client/containers/Project/Project.js'), ProjectStub);

const { default: App } = require('../../client/Application.js');
// Application 内部以自己的 HistoryRouter(history 单例)接管路由，不能再包一层
// 外部 Router（v6 禁止嵌套），这里仅提供 redux Provider，location 用 history.push 驱动
const history = require('../../client/history').default;

function makeStore(seedState) {
  const dispatched = [];
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
    return state === undefined ? seedState : state;
  }, seedState);
  return { store, dispatched };
}

function renderApp(seedState) {
  const { store, dispatched } = makeStore(seedState);
  const utils = render(React.createElement(Provider, { store }, React.createElement(App)));
  return Object.assign({ store, dispatched }, utils);
}

const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

const MEMBER_USER = {
  loginState: 2,
  isLogin: true,
  role: 'member',
  userName: 'demo',
  uid: 11,
  email: 'demo@example.com',
  studyTip: 1,
  study: true,
  imageUrl: ''
};

test.serial('已登录成员访问项目路由: 渲染完整外壳(Header/路由出口/Footer)', async t => {
  axios.get = (/** @type {string} */ url) => {
    if (url.indexOf('/api/user/status') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: { role: 'member' } } });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  history.push('/project/12/interface/api');

  const { container, dispatched } = renderApp({
    user: Object.assign({}, MEMBER_USER),
    // Header 内的 Search 组件订阅 group/project 切片，需提供空种子
    group: { groupList: [], currGroup: {} },
    project: { projectList: [], currProject: {} }
  });
  await flushEffects(60);

  t.truthy(
    dispatched.find(a => a.type === 'yapi/user/GET_LOGIN_STATE'),
    '挂载期应派发 checkLoginState 拉取登录态'
  );
  t.truthy(container.querySelector('.m-header'), '已登录应渲染全局 Header');
  t.truthy(
    container.querySelector('[data-stub="PROJECT"]'),
    '应用外壳路由出口应渲染项目路由内容'
  );
  t.truthy(container.querySelector('.footer-wrapper'), '应渲染全局 Footer');
  t.truthy(container.querySelector('.router-container'), '应渲染路由容器结构');
});

test.serial('登录态获取中: 整壳以 Loading 呈现且不渲染 Header', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  history.push('/');

  const { container } = renderApp({ user: { loginState: 0, isLogin: false, role: '' } });
  await flushEffects();

  t.truthy(container.querySelector('.loading-box'), '登录态加载中应渲染全局 Loading');
  t.is(container.querySelector('.m-header'), null, '加载中不应渲染 Header');
  t.is(container.querySelector('.footer-wrapper'), null, '加载中不渲染 Footer');
});

test.serial('游客访问 /login: 登录页渲染且 Header 隐藏', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  history.push('/login');

  const { container } = renderApp({
    user: { loginState: 1, isLogin: false, role: '', userName: null, uid: null }
  });
  await flushEffects(60);

  t.truthy(container.querySelector('.g-body.login-body'), '游客访问 /login 应渲染登录页');
  t.is(container.querySelector('.m-header'), null, '登录页不渲染 Header');
  t.truthy(container.querySelector('.footer-wrapper'), '登录页仍渲染 Footer');
});

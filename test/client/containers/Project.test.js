// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects, stubDefaultExport } from '../../helpers/containers';

const axios = require('axios');
const path = require('path');
const Module = require('module');

// Project.js 里 require('client/plugin.js')（进而加载 exts 插件），jsdom-setup 只映射了
// common/ 前缀，这里补 client/ 与 exts/ 前缀的等价映射，必须在 require 被测组件之前安装
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
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

// 子路由容器（Interface/Activity 等）依赖重，与路由分发逻辑无关，
// 以 require.cache 桩替换默认导出，聚焦 Project 自身的子导航与路由分发结构
const makeStub = name => () =>
  React.createElement('div', { 'data-stub': name }, name + '_STUB');
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Interface/Interface.js'),
  makeStub('INTERFACE')
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Activity/Activity.js'),
  makeStub('ACTIVITY')
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Setting/Setting.js'),
  makeStub('SETTING')
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Setting/ProjectMember/ProjectMember.js'),
  makeStub('MEMBERS')
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Setting/ProjectData/ProjectData.js'),
  makeStub('DATA')
);

const { default: Project } = require('../../../client/containers/Project/Project.js');

// group 切片已迁至 Zustand（批次3）：Project 经 useGroupStore 读取 currGroup
const useGroupStore = require('../../../client/store/groupStore').default;
// user/project 切片已迁至 Zustand（批次4）：currProject 改经 projectStore 播种，
// getProject/setBreadcrumb 改为断言 HTTP 请求与 userStore.breadcrumb
const {
  seedProjectStore,
  resetUserProjectStores,
  useUserStore
} = require('../../helpers/userProjectStores');

const originalAxiosGet = axios.get;

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
  useGroupStore.setState(INITIAL_GROUP_STATE);
  resetUserProjectStores();
});

const CURR_PROJECT = { _id: 12, name: '演示项目', group_id: 1, basepath: '/base' };

// project 切片已迁 Zustand：项目未就绪前组件读取的是 projectStore.currProject
function makeSeed() {
  seedProjectStore({ currProject: CURR_PROJECT });
  return {};
}

// currGroup 播种真实 Zustand store（group 切片不再经 redux 读取）
function seedGroupStore(currGroup) {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup
  });
}

// 记录 GET 调用（供 fetchGroupMsg 迁移后的断言使用）
const apiCalls = [];

function stubApi(groupFixture) {
  apiCalls.length = 0;
  axios.get = (/** @type {string} */ url) => {
    apiCalls.push(url);
    if (url.indexOf('/api/project/get') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: CURR_PROJECT } });
    }
    if (url.indexOf('/api/group/get') === 0) {
      // 真实契约：返回完整分组对象；真实 store 会写入 currGroup（旧冻结 reducer 从不消费）
      return Promise.resolve({
        data: {
          errcode: 0,
          data: Object.assign({ custom_field1: { name: '', enable: false } }, groupFixture)
        }
      });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
}

test.serial('接口子路由: 子导航高亮接口且路由分发到接口桩组件', async t => {
  const groupFixture = { _id: 1, group_name: '分组一', type: 'public', role: 'owner' };
  stubApi(groupFixture);
  seedGroupStore(groupFixture);
  const { container } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/interface/api/lists',
    seedState: makeSeed()
  });
  await flushEffects();

  t.truthy(container.querySelector('.m-subnav'), '应渲染子导航');
  // getProject 仍走 redux；fetchGroupMsg 已迁 Zustand，改为断言其 HTTP 请求发生
  t.truthy(
    apiCalls.some(url => url.indexOf('/api/project/get') === 0),
    '挂载期应经 projectStore 拉取项目信息（getProject）'
  );
  t.truthy(
    apiCalls.some(url => url.indexOf('/api/group/get') === 0),
    '挂载期应经 groupStore 拉取分组信息（fetchGroupMsg）'
  );
  t.deepEqual(
    useUserStore.getState().breadcrumb,
    [{ name: '演示项目' }],
    '加载成功后应经 userStore 设置面包屑'
  );

  const menuItems = Array.from(container.querySelectorAll('.m-subnav .ant-menu-item')).map(
    li => li.textContent.replace(/\s+/g, '')
  );
  // 插件（如 wiki）可能经 sub_nav 钩子追加子导航项，这里只断言 5 个核心项
  t.truthy(
    ['接口', '动态', '数据管理', '成员管理', '设置'].every(name => menuItems.indexOf(name) > -1),
    '公开分组应包含全部 5 个核心子导航项，实际: ' + menuItems.join(',')
  );
  const activeItem = container.querySelector('.m-subnav .ant-menu-item-selected');
  t.truthy(activeItem, '应有选中子导航项');
  t.is(activeItem.textContent.replace(/\s+/g, ''), '接口', '接口子路由应高亮接口项');

  t.truthy(
    container.querySelector('[data-stub="INTERFACE"]'),
    'interface/* 子路由应分发到接口组件'
  );
});

test.serial('动态子路由+私有分组: 高亮动态且子导航过滤成员管理', async t => {
  const groupFixture = { _id: 1, group_name: '分组一', type: 'private', role: 'dev' };
  stubApi(groupFixture);
  seedGroupStore(groupFixture);
  const { container } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/activity',
    seedState: makeSeed()
  });
  await flushEffects();

  const menuItems = Array.from(container.querySelectorAll('.m-subnav .ant-menu-item')).map(li =>
    li.textContent.replace(/\s+/g, '')
  );
  t.truthy(menuItems.indexOf('成员管理') === -1, '私有分组应过滤成员管理子导航');
  t.truthy(menuItems.indexOf('动态') > -1, '动态子导航项应保留');
  const activeItem = container.querySelector('.m-subnav .ant-menu-item-selected');
  t.is(activeItem.textContent.replace(/\s+/g, ''), '动态', '动态子路由应高亮动态项');

  t.truthy(
    container.querySelector('[data-stub="ACTIVITY"]'),
    'activity 子路由应分发到动态组件'
  );
});

test.serial('项目未就绪: currProject 为空时渲染全局 Loading', async t => {
  // 真实 store 会把 /api/project/get 响应写入 currProject，此处令请求挂起以保持「未就绪」前提
  axios.get = (/** @type {string} */ url) => {
    if (url.indexOf('/api/project/get') === 0) {
      return new Promise(() => {});
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  seedGroupStore({ _id: 1, group_name: '分组一', type: 'public' });
  seedProjectStore({});
  const { container } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/setting',
    seedState: {}
  });
  await flushEffects();

  t.truthy(container.querySelector('.loading-box'), '项目未就绪应渲染 Loading');
  t.is(container.querySelector('[data-stub]'), null, '未就绪时不应渲染子路由内容');
});

test.serial('项目 id 变化: 路由内导航触发重拉（对应旧 cWRP 分支）', async t => {
  const projectCalls = [];
  axios.get = url => {
    if (url.indexOf('/api/project/get') === 0) {
      projectCalls.push(url);
      return Promise.resolve({ data: { errcode: 0, data: CURR_PROJECT } });
    }
    if (url.indexOf('/api/group/get') === 0) {
      return Promise.resolve({
        data: {
          errcode: 0,
          data: { _id: 1, group_name: '分组一', type: 'public', role: 'owner', custom_field1: { name: '', enable: false } }
        }
      });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  seedGroupStore({ _id: 1, group_name: '分组一', type: 'public', role: 'owner' });
  seedProjectStore({ currProject: CURR_PROJECT });
  const utils = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/interface/api/lists',
    seedState: {}
  });
  await flushEffects();
  t.is(
    projectCalls.filter(url => url.indexOf('/api/project/get') === 0).length,
    1,
    '挂载期拉取一次'
  );

  utils.navigate('/project/13/interface/api/lists');
  await flushEffects();

  t.is(
    projectCalls.filter(url => url.indexOf('/api/project/get') === 0).length,
    2,
    'id 变化后应再次拉取（旧 cWRP 分支）'
  );
  t.true(
    projectCalls.some(url => url.indexOf('id=13') > -1),
    '第二次拉取应使用新 id，实际: ' + projectCalls.join(',')
  );
  t.truthy(
    utils.container.querySelector('[data-stub="INTERFACE"]'),
    '导航后子路由仍正常分发'
  );
});

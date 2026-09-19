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

const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

const CURR_PROJECT = { _id: 12, name: '演示项目', group_id: 1, basepath: '/base' };

function makeSeed(currGroup) {
  return {
    user: {},
    group: { currGroup },
    project: { currProject: CURR_PROJECT }
  };
}

function stubApi() {
  axios.get = (/** @type {string} */ url) => {
    if (url.indexOf('/api/project/get') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: CURR_PROJECT } });
    }
    if (url.indexOf('/api/group/get') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: { _id: 1, group_name: '分组一' } } });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
}

test.serial('接口子路由: 子导航高亮接口且路由分发到接口桩组件', async t => {
  stubApi();
  const { container, dispatched } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/interface/api/lists',
    seedState: makeSeed({ _id: 1, group_name: '分组一', type: 'public', role: 'owner' })
  });
  await flushEffects();

  t.truthy(container.querySelector('.m-subnav'), '应渲染子导航');
  // getProject / fetchGroupMsg 应按序派发
  t.truthy(
    dispatched.find(a => a.type === 'yapi/project/GET_CURR_PROJECT'),
    '挂载期应派发 getProject'
  );
  t.truthy(
    dispatched.find(a => a.type === 'yapi/group/FETCH_GROUP_MSG'),
    '挂载期应派发 fetchGroupMsg'
  );
  t.truthy(
    dispatched.find(a => a.type === 'yapi/user/SET_BREADCRUMB'),
    '加载成功后应设置面包屑'
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
  stubApi();
  const { container } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/activity',
    seedState: makeSeed({ _id: 1, group_name: '分组一', type: 'private', role: 'dev' })
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
  stubApi();
  const { container } = renderWithProviders(React.createElement(Project), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/setting',
    seedState: {
      user: {},
      group: { currGroup: { _id: 1, group_name: '分组一', type: 'public' } },
      project: { currProject: {} }
    }
  });
  await flushEffects();

  t.truthy(container.querySelector('.loading-box'), '项目未就绪应渲染 Loading');
  t.is(container.querySelector('[data-stub]'), null, '未就绪时不应渲染子路由内容');
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

// ProjectData.js 经 require('client/plugin.js') 加载 exts 插件，jsdom-setup 只映射
// common/ 前缀，这里补 client/ 与 exts/ 前缀的等价映射，必须在 require 被测组件之前安装
const path = require('path');
const Module = require('module');
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

const {
  default: ProjectEnv
} = require('../../../client/containers/Project/Setting/ProjectEnv/index.js');
const {
  default: ProjectMember
} = require('../../../client/containers/Project/Setting/ProjectMember/ProjectMember.js');
const {
  default: ProjectData
} = require('../../../client/containers/Project/Setting/ProjectData/ProjectData.js');

// user/project 切片已迁 Zustand（批次4）：改经真实 store 播种
const {
  seedUserStore,
  seedProjectStore,
  resetUserProjectStores
} = require('../../helpers/userProjectStores');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  resetUserProjectStores();
});

const CURR_PROJECT = {
  _id: 12,
  name: '演示项目',
  desc: '项目描述',
  project_type: '站点',
  group_id: 1,
  basepath: '/base',
  switch_notice: false,
  strice: false,
  is_json5: false,
  tag: [],
  role: 'owner',
  env: [
    { name: '默认环境', domain: 'http://default.api.com', header: [] },
    { name: '预发环境', domain: 'http://pre.api.com', header: [] }
  ]
};

function makeSeed(role) {
  seedUserStore({ uid: 11 });
  seedProjectStore({
    currProject: Object.assign({}, CURR_PROJECT, { role }),
    projectList: [
      { _id: 5, name: '项目五', group_id: 1 },
      { _id: 6, name: '项目六', group_id: 1 }
    ],
    token: 'tk_seed_9f8e7d6c',
    swaggerUrlData: ''
  });
  return {
    group: {
      currGroup: { _id: 1, group_name: '分组一', group_desc: '', custom_field1: { name: '', enable: false } },
      groupList: []
    },
    inter: { curdata: { catid: 3 } },
    news: { updateLogList: [] }
  };
}

function mockApis(overrides) {
  const routes = Object.assign(
    {
      '/api/project/get?id=12': () => ({
        data: { errcode: 0, data: Object.assign({}, CURR_PROJECT) }
      }),
      '/api/project/get_env': () => ({ data: { errcode: 0, data: [] } }),
      '/api/group/get_member_list': () => ({
        data: {
          errcode: 0,
          data: [
            { uid: 11, username: 'alice', role: 'owner', email_notice: true },
            { uid: 22, username: 'bob', role: 'dev', email_notice: false }
          ]
        }
      }),
      '/api/group/get': () => ({
        // 真实契约：返回完整分组对象（含 custom_field1），真实 store 会写入 currGroup
        data: { errcode: 0, data: { group_name: '分组一', _id: 1, custom_field1: { name: '', enable: false } } }
      }),
      '/api/project/get_member_list': () => ({
        data: {
          errcode: 0,
          data: [
            { uid: 11, username: 'alice', role: 'owner', email_notice: true },
            { uid: 33, username: 'carol', role: 'guest', email_notice: true }
          ]
        }
      }),
      '/api/project/list': () => ({ data: { errcode: 0, data: { data: { list: [], count: 0 } } } }),
      '/api/interface/get_cat_tree?project_id=12': () => ({
        data: {
          errcode: 0,
          data: [
            { _id: 1, name: '根分类', children: [{ _id: 2, name: '子分类' }] },
            { _id: 3, name: '第二分类' }
          ]
        }
      }),
      '/api/interface/getCatMenu?project_id=12': () => ({
        data: { errcode: 0, data: [{ _id: 1, name: '兜底分类' }] }
      })
    },
    overrides || {}
  );
  axios.get = url => {
    if (routes[url]) {
      return Promise.resolve(routes[url]());
    }
    return Promise.resolve({ data: { errcode: 0, errmsg: 'mock', data: [] } });
  };
  axios.post = () => Promise.resolve({ data: { errcode: 0, data: {} } });
}

test.serial('ProjectEnv 首帧空列表，加载后渲染环境且支持选中切换', async t => {
  mockApis();
  const { container } = renderWithProviders(React.createElement(ProjectEnv, { projectId: 12 }), {
    seedState: makeSeed('owner')
  });

  // 首帧：项目详情尚未返回，侧边栏无环境项
  t.is(container.querySelectorAll('.menu-item').length, 1, '首帧仅渲染“环境列表”标题行');

  await flushEffects();

  const rows = () => Array.from(container.querySelectorAll('.menu-item'));
  t.is(rows().length, 3, '加载后应渲染标题行与两个环境项');
  t.truthy(rows()[1].textContent.indexOf('默认环境') > -1, '应渲染默认环境');
  t.truthy(rows()[2].textContent.indexOf('预发环境') > -1, '应渲染预发环境');
  t.true(
    rows()[1].className.indexOf('menu-item-checked') > -1,
    '加载后默认选中第一个环境'
  );

  fireEvent.click(rows()[2]);
  await flushEffects(30);

  t.true(
    rows()[2].className.indexOf('menu-item-checked') > -1,
    '点击第二个环境后选中态应切换'
  );
  t.false(
    rows()[1].className.indexOf('menu-item-checked') > -1,
    '第一个环境应取消选中态'
  );
});

test.serial('ProjectMember owner 渲染成员表与分组卡片，并可打开添加成员弹窗', async t => {
  mockApis();
  const { container } = renderWithProviders(React.createElement(ProjectMember), {
    seedState: makeSeed('owner'),
    routePath: '/project/:id/members',
    initialPath: '/project/12/members'
  });
  await flushEffects();

  const rows = container.querySelectorAll('.ant-table-tbody .ant-table-row');
  t.is(rows.length, 2, '项目成员表应渲染 2 名成员');
  t.truthy(rows[0].textContent.indexOf('alice') > -1, '成员表应包含 alice');
  t.truthy(rows[1].textContent.indexOf('carol') > -1, '成员表应包含 carol');
  t.is(
    container.querySelector('.setting-group .ant-card-head-title').textContent,
    '分组一 分组成员 (2) 人',
    '分组卡片应展示分组名与分组成员数'
  );
  t.truthy(
    container.querySelector('.setting-group .item-name').textContent.indexOf('我') > -1,
    '当前登录成员应带“我”标记'
  );

  const addBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent.indexOf('添加成员') > -1
  );
  fireEvent.click(addBtn);
  await flushEffects(600);

  const modalTitle = document.body.querySelector('.ant-modal-title');
  t.truthy(modalTitle, '点击添加成员应弹出模态框');
  t.is(modalTitle.textContent, '添加成员', '模态框标题应为“添加成员”');
});

test.serial('ProjectMember dev 角色只读展示项目角色', async t => {
  mockApis();
  const { container } = renderWithProviders(React.createElement(ProjectMember), {
    seedState: makeSeed('dev'),
    routePath: '/project/:id/members',
    initialPath: '/project/12/members'
  });
  await flushEffects();

  const addBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent.indexOf('添加成员') > -1
  );
  t.is(addBtn, undefined, 'dev 角色不应出现添加成员按钮');

  const firstRow = container.querySelectorAll('.ant-table-tbody .ant-table-row')[0];
  t.truthy(firstRow.textContent.indexOf('组长') > -1, 'alice（owner）应只读展示为组长');
  const secondRow = container.querySelectorAll('.ant-table-tbody .ant-table-row')[1];
  t.truthy(secondRow.textContent.indexOf('访客') > -1, 'carol（guest）应只读展示为访客');
});

test.serial('ProjectData 加载分类树并支持开启 url 导入', async t => {
  mockApis();
  const { container } = renderWithProviders(React.createElement(ProjectData), {
    seedState: makeSeed('owner'),
    routePath: '/project/:id/data',
    initialPath: '/project/12/data'
  });
  await flushEffects();

  t.truthy(container.textContent.indexOf('数据导入') > -1, '应渲染数据导入区');
  t.truthy(container.textContent.indexOf('数据导出') > -1, '应渲染数据导出区');
  t.truthy(
    container.querySelector('.catidSelect .ant-select-selection-item').textContent.indexOf('根分类') > -1,
    '分类树加载后应默认选中首个分类（根分类）'
  );
  t.truthy(
    container.querySelector('button[role="switch"]'),
    'swagger 导入方式下应渲染开启url导入开关'
  );

  fireEvent.click(container.querySelector('.dataSync button[role="switch"]'));
  await flushEffects();

  const urlInput = container.querySelector('.url-import-content input');
  t.truthy(urlInput, '开启后导入区应切换为 url 输入');
  t.is(
    urlInput.getAttribute('placeholder'),
    'http://demo.swagger.io/v2/swagger.json',
    'url 输入框占位文案应保持一致'
  );
});

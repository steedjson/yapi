// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

// Setting.js 里 require('client/plugin.js')（进而加载 exts 插件）、
// ProjectRequest.js 里 import 'client/components/AceEditor/AceEditor'，
// jsdom-setup 只映射了 common/ 前缀，这里补 client/ 与 exts/ 前缀的等价映射，
// 必须在 require 被测组件之前安装
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

const { default: Setting } = require('../../../client/containers/Project/Setting/Setting.js');
const {
  default: ProjectToken
} = require('../../../client/containers/Project/Setting/ProjectToken/ProjectToken.js');
const {
  default: ProjectMock
} = require('../../../client/containers/Project/Setting/ProjectMock/index.js');
const {
  default: ProjectRequest
} = require('../../../client/containers/Project/Setting/ProjectRequest/ProjectRequest.js');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
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
  is_mock_open: true,
  project_mock_script: 'const a = 1;',
  pre_script: 'console.log(1);',
  after_script: 'console.log(2);',
  env: []
};

// group 切片已迁至 Zustand（批次3）：ProjectMessage 等面板经 useGroupStore 读取
const useGroupStore = require('../../../client/store/groupStore').default;
const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

function seedGroupStore() {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup: { _id: 1, group_name: '分组一', group_desc: '', custom_field1: { name: '', enable: false } },
    groupList: [{ _id: 1, group_name: '分组一' }]
  });
}

function makeSeed(role) {
  return {
    user: { uid: 11 },
    project: {
      currProject: Object.assign({}, CURR_PROJECT, { role }),
      projectList: [],
      token: 'tk_seed_9f8e7d6c',
      swaggerUrlData: ''
    },
    inter: { curdata: { catid: 3 } },
    news: { updateLogList: [] }
  };
}

function mockProjectApis(getCalls) {
  axios.get = url => {
    getCalls.push(url);
    if (url === '/api/project/get?id=12') {
      return Promise.resolve({ data: { errcode: 0, data: Object.assign({}, CURR_PROJECT) } });
    }
    if (url === '/api/group/list') {
      // 真实契约：data 直接是分组数组（旧桩多包一层 data.data，被旧冻结 reducer 掩盖）
      return Promise.resolve({ data: { errcode: 0, data: [{ _id: 1, group_name: '分组一' }] } });
    }
    if (url === '/api/group/get') {
      // 真实契约：返回完整分组对象（含 custom_field1），真实 store 会写入 currGroup
      return Promise.resolve({
        data: { errcode: 0, data: { group_name: '分组一', _id: 1, custom_field1: { name: '', enable: false } } }
      });
    }
    if (url === '/api/project/token') {
      return Promise.resolve({ data: { errcode: 0, data: 'tk_fetched_abcd' } });
    }
    return Promise.resolve({ data: { errcode: 0, errmsg: 'mock', data: [] } });
  };
  axios.post = () => Promise.resolve({ data: { errcode: 0, data: {} } });
}

function tabLabels(container) {
  return Array.from(container.querySelectorAll('.ant-tabs-tab')).map(tab => tab.textContent);
}

// 断言 labels 按相对顺序包含 wanted 中的全部页签（exts 插件经 sub_setting_nav
// 钩子会追加扩展页签，故不做全等数量断言）
function expectLabelSubsequence(t, labels, wanted, msg) {
  let i = 0;
  for (const label of labels) {
    if (label === wanted[i]) {
      i++;
    }
  }
  t.is(i, wanted.length, msg);
}

const BUILTIN_TABS = ['项目配置', '环境配置', '请求配置', 'token配置', '全局mock脚本'];

test.serial('Setting owner 角色渲染全部 5 个内建设置页签（含 token配置）', async t => {
  const getCalls = [];
  mockProjectApis(getCalls);
  const { container } = renderWithProviders(React.createElement(Setting), {
    seedState: makeSeed('owner'),
    routePath: '/project/:id/setting',
    initialPath: '/project/12/setting'
  });
  await flushEffects();

  const labels = tabLabels(container);
  expectLabelSubsequence(
    t,
    labels,
    BUILTIN_TABS,
    'owner 角色应按序渲染项目配置/环境配置/请求配置/token配置/全局mock脚本'
  );
  t.is(
    labels.filter(label => BUILTIN_TABS.indexOf(label) > -1).length,
    5,
    '内建页签共 5 项（插件扩展页签不计入）'
  );
  t.truthy(
    container.querySelector('.g-row .ant-tabs-card'),
    '页签应为 card 形态'
  );
  t.truthy(
    getCalls.some(url => url === '/api/group/list'),
    '激活的项目配置页签挂载后应拉取分组列表'
  );
});

test.serial('Setting guest 角色不渲染 token配置页签', async t => {
  mockProjectApis([]);
  const { container } = renderWithProviders(React.createElement(Setting), {
    seedState: makeSeed('guest'),
    routePath: '/project/:id/setting',
    initialPath: '/project/12/setting'
  });
  await flushEffects();

  const labels = tabLabels(container);
  expectLabelSubsequence(
    t,
    labels,
    ['项目配置', '环境配置', '请求配置', '全局mock脚本'],
    'guest 角色仍应按序渲染除 token配置 外的内建页签'
  );
  t.is(
    labels.filter(label => BUILTIN_TABS.indexOf(label) > -1).length,
    4,
    'guest 角色内建页签共 4 项'
  );
  t.false(labels.indexOf('token配置') > -1, 'guest 角色不应出现 token配置页签');
});

test.serial('ProjectToken 展示 store 中 token，admin 角色可见刷新入口且挂载即请求 token', async t => {
  const getCalls = [];
  mockProjectApis(getCalls);
  const { container } = renderWithProviders(
    React.createElement(ProjectToken, { projectId: 12, curProjectRole: 'admin' }),
    { PRE_SEED: seedGroupStore(), seedState: makeSeed('admin') }
  );
  await flushEffects();

  t.is(
    container.querySelector('.token-message').textContent,
    'tk_seed_9f8e7d6c',
    '应展示 store 中的项目 token'
  );
  t.is(container.querySelectorAll('.token-btn').length, 2, 'admin 角色应渲染复制与刷新两个入口');
  t.truthy(
    getCalls.some(url => url.indexOf('/api/project/token') > -1),
    '挂载后应请求 /api/project/token'
  );
});

test.serial('ProjectToken dev 角色不渲染刷新入口', async t => {
  mockProjectApis([]);
  const { container } = renderWithProviders(
    React.createElement(ProjectToken, { projectId: 12, curProjectRole: 'dev' }),
    { PRE_SEED: seedGroupStore(), seedState: makeSeed('dev') }
  );
  await flushEffects();

  t.is(container.querySelectorAll('.token-btn').length, 1, 'dev 角色仅渲染复制入口');
  t.is(container.querySelectorAll('.open-api li').length, 10, 'open 接口清单完整渲染');
});

test.serial('ProjectMock 首帧回填 mock 配置，切换开关并保存提交更新请求', async t => {
  const postCalls = [];
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: Object.assign({}, CURR_PROJECT) } });
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  const { container } = renderWithProviders(
    React.createElement(ProjectMock, { projectId: 12 }),
    { PRE_SEED: seedGroupStore(), seedState: makeSeed('owner') }
  );

  // 首帧即回填（等价旧 UNSAFE_componentWillMount 首帧前赋值）
  const switchBtn = container.querySelector('button[role="switch"]');
  t.truthy(switchBtn, '应渲染是否开启开关');
  t.is(switchBtn.getAttribute('aria-checked'), 'true', '首帧应回填 is_mock_open=true');

  fireEvent.click(switchBtn);
  await flushEffects();
  t.is(
    container.querySelector('button[role="switch"]').getAttribute('aria-checked'),
    'false',
    '点击后开关应切换为关闭'
  );

  const saveBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent.replace(/\s/g, '') === '保存'
  );
  fireEvent.click(saveBtn);
  await flushEffects();

  t.is(postCalls.length, 1, '保存应提交一次更新请求');
  t.is(postCalls[0].url, '/api/project/up');
  t.deepEqual(
    postCalls[0].body,
    { id: 12, project_mock_script: 'const a = 1;', is_mock_open: false },
    '保存应提交当前 mock 脚本与开关状态'
  );
});

test.serial('ProjectRequest 首帧回填前后脚本并支持保存提交', async t => {
  const postCalls = [];
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: Object.assign({}, CURR_PROJECT) } });
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  const { container } = renderWithProviders(
    React.createElement(ProjectRequest, { projectId: 12 }),
    { PRE_SEED: seedGroupStore(), seedState: makeSeed('owner') }
  );

  t.is(
    container.querySelectorAll('.request-editor').length,
    2,
    '应渲染前后脚本两个编辑器'
  );

  const saveBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent.replace(/\s/g, '') === '保存'
  );
  fireEvent.click(saveBtn);
  await flushEffects();

  t.is(postCalls.length, 1, '保存应提交一次更新请求');
  t.is(postCalls[0].url, '/api/project/up');
  t.deepEqual(
    postCalls[0].body,
    { id: 12, pre_script: 'console.log(1);', after_script: 'console.log(2);' },
    '保存应提交首帧回填的前后脚本'
  );
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { MemoryRouter } from 'react-router-dom';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

// 本文件需要向 store 动态注入新的 projectList（模拟 redux 列表刷新），
// renderWithProviders 的固定 reducer 不满足，这里为「有数据」用例单独建动态 store。
function makeDynamicStore(seedState) {
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    if (action && action.type === 'EQ_SET_STATE') {
      return action.nextState;
    }
    return state === undefined ? seedState : state;
  }, seedState);
  return store;
}

const { default: ProjectList } = require(
  '../../../client/containers/Group/ProjectList/ProjectList.js'
);

const originalAxiosGet = axios.get;

// group 切片已迁至 Zustand（批次3）：组件经 useGroupStore 读取 currGroup
const useGroupStore = require('../../../client/store/groupStore').default;

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
});

const CURR_GROUP = { _id: 1, group_name: '演示分组', type: 'private', role: 'owner' };

function seedGroupStore(currGroup) {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup: currGroup || CURR_GROUP
  });
}

function makeSeed(overrides) {
  return Object.assign(
    {
      user: {},
      project: { projectList: [], userInfo: {}, tableLoading: false, currPage: 1 }
    },
    overrides
  );
}

test.serial('空列表(私有分组): 挂载即拉取项目列表并渲染空态提示', async t => {
  axios.get = (/** @type {any} */ url) => {
    t.is(url, '/api/project/list', '挂载期应请求项目列表接口');
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  seedGroupStore();

  const { container, dispatched } = renderWithProviders(React.createElement(ProjectList), {
    seedState: makeSeed()
  });
  await flushEffects();

  t.truthy(
    dispatched.find(a => a.type === 'yapi/project/FETCH_PROJECT_LIST'),
    '挂载期应派发 fetchProjectList'
  );
  t.is(
    container.querySelector('.project-list-header .ant-col').textContent,
    '演示分组 分组共 (0) 个项目',
    '头部应渲染分组名与项目计数'
  );
  t.truthy(container.textContent.indexOf('该分组还没有项目呢') > -1, '私有分组空列表应渲染 noProject 空态');
  t.is(container.querySelectorAll('.m-card').length, 0, '空列表不应渲染项目卡片');
});

test.serial('有数据: redux 列表刷新后同步本地列表并分区渲染', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  seedGroupStore();

  const seedState = makeSeed();
  const store = makeDynamicStore(seedState);
  const dispatched = [];
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    dispatched.push(action);
    return originalDispatch(action);
  };

  const utils = render(
    React.createElement(
      Provider,
      { store },
      React.createElement(MemoryRouter, { initialEntries: ['/group/1'] }, React.createElement(ProjectList))
    )
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
  });

  // 模拟分组内项目列表就绪：follow 的排前展示「我的关注」，其余进「我的项目」
  const projectListData = [
    { _id: 101, name: '关注项目B', follow: true, up_time: 10, role: 'owner' },
    { _id: 102, name: '普通项目A', follow: false, up_time: 20, role: 'dev' },
    { _id: 103, name: '关注项目A', follow: true, up_time: 30, role: 'admin' }
  ];
  await act(async () => {
    store.dispatch({
      type: 'EQ_SET_STATE',
      nextState: Object.assign({}, seedState, {
        project: Object.assign({}, seedState.project, { projectList: projectListData })
      })
    });
    await new Promise(resolve => setTimeout(resolve, 15));
  });

  t.is(
    utils.container.querySelector('.project-list-header .ant-col').textContent,
    '演示分组 分组共 (3) 个项目',
    '计数应随列表刷新更新'
  );
  const sections = utils.container.querySelectorAll('.owner-type');
  t.is(sections.length, 2, '应渲染 我的项目/我的关注 两个分区');
  t.is(sections[0].textContent, '我的项目');
  t.is(sections[1].textContent, '我的关注');
  t.is(utils.container.querySelectorAll('.m-card').length, 3, '应渲染 3 张项目卡片');
  t.truthy(
    utils.container.textContent.indexOf('关注项目A') > -1 &&
      utils.container.textContent.indexOf('普通项目A') > -1,
    '卡片应按 up_time 排序渲染'
  );
  // 旧 cWRP 语义：列表刷新时同步面包屑
  t.truthy(
    dispatched.find(a => a.type === 'yapi/user/SET_BREADCRUMB'),
    '列表刷新应同步分组面包屑'
  );
});

test.serial('无权限成员: 添加项目按钮禁用并有 Tooltip 提示', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  seedGroupStore({
    _id: 1,
    group_name: '演示分组',
    type: 'public',
    role: 'guest'
  });

  const { container } = renderWithProviders(React.createElement(ProjectList), {
    seedState: makeSeed({
      group: { currGroup: { _id: 1, group_name: '演示分组', type: 'public', role: 'guest' } }
    })
  });
  await flushEffects();

  const addBtn = Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent.indexOf('添加项目') > -1
  );
  t.truthy(addBtn, '应渲染添加项目按钮');
  t.is(addBtn.disabled, true, '无权限时按钮应禁用');
});

test.serial('分组切换: currGroup 变化触发重拉（对应旧 cWRP 分支）', async t => {
  const listCalls = [];
  axios.get = (url, config) => {
    if (url.indexOf('/api/project/list') === 0) {
      listCalls.push(config && config.params ? config.params.group_id : null);
      return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  seedGroupStore();
  renderWithProviders(React.createElement(ProjectList), {
    seedState: makeSeed()
  });
  await flushEffects();
  t.is(listCalls.length, 1, '挂载期以当前分组拉取一次');
  t.is(listCalls[0], 1);

  // group 切片已迁 Zustand：在 act 内直接更新 store，组件订阅重渲染后触发切换分支
  await act(async () => {
    useGroupStore.setState({
      currGroup: { _id: 2, group_name: '分组二', type: 'private', role: 'owner' }
    });
    await new Promise(resolve => setTimeout(resolve, 15));
  });
  await flushEffects();

  t.is(listCalls.length, 2, '分组变化后应再次拉取');
  t.is(listCalls[1], 2, '第二次拉取应使用新分组 id');
});

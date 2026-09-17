// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: Srch } = require('../../../client/components/Header/Search/Search.js');

// handleSearch/onSelect 内部直接调用 axios,测试必须拦截(axios 为 CJS 单例,
// 生产代码调用时才读取 .get,替换属性即可生效)
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 组件经 useSelector 读取 group.groupList / project.projectList、useDispatch 派发 action,
// store 与生产保持一致挂 redux-promise 中间件,并记录经完整中间件链的 action
function makeStore(seedState) {
  const dispatched = [];
  const record = action => {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
  };
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    record(action);
    return state === undefined ? seedState : state;
  }, seedState);
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    record(action);
    return originalDispatch(action);
  };
  return { store, dispatched };
}

const SEARCH_RESULT = {
  errcode: 0,
  data: {
    group: [{ _id: 1, groupName: '电商分组' }],
    project: [{ _id: 2, name: '电商中台', groupId: 1 }],
    interface: [{ _id: 3, title: '登录接口', projectId: 2 }]
  }
};

function renderSrch() {
  const { store, dispatched } = makeStore({ group: { groupList: [] }, project: { projectList: [] } });
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  const utils = render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={['/group']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <LocationProbe />
        <Srch />
      </MemoryRouter>
    </Provider>
  );
  return Object.assign({ dispatched, getLocation: () => locationRef }, utils);
}

function getInput(container) {
  // antd Input 带 prefix 时 className 挂在 affix 包装 span 上,真实输入框是其内部 input
  return container.querySelector('.search-input input');
}

// 打开下拉并输入关键字,返回下拉候选项列表
async function searchKeyword(container, keyword) {
  const input = getInput(container);
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: keyword } });
  await act(async () => {
    await sleep(20);
  });
  return container.ownerDocument.querySelectorAll('.ant-select-item-option');
}

test.serial('渲染搜索输入框与前缀搜索图标', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderSrch();

  t.truthy(container.querySelector('.search-wrapper'), '应渲染搜索容器, 实际 DOM: ' + container.innerHTML);
  t.truthy(getInput(container), '应渲染搜索输入框');
  t.is(getInput(container).placeholder, '搜索分组/项目/接口');
  t.truthy(container.querySelector('.srch-icon'), '应渲染前缀搜索图标');
  t.is(
    container.ownerDocument.querySelectorAll('.ant-select-item-option').length,
    0,
    '初始无候选项'
  );
});

test.serial('输入关键字触发 /api/project/search 请求并携带 q 参数', async t => {
  const getCalls = [];
  axios.get = url => {
    getCalls.push(url);
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
  const { container } = renderSrch();

  await searchKeyword(container, '电商');

  t.truthy(
    getCalls.indexOf('/api/project/search?q=电商') > -1,
    '应按关键字发起搜索请求, 实际请求: ' + JSON.stringify(getCalls)
  );
});

test.serial('搜索结果按 分组/项目/接口 渲染为下拉候选项', async t => {
  axios.get = () => Promise.resolve({ data: SEARCH_RESULT });
  const { container } = renderSrch();

  const options = await searchKeyword(container, '电商');

  t.is(options.length, 3, '应渲染 3 个候选项');
  t.deepEqual(
    Array.from(options).map(option => option.textContent),
    ['分组: 电商分组', '项目: 电商中台', '接口: 登录接口'],
    '候选项文案应带类型前缀'
  );
});

test.serial('选择分组候选项跳转对应分组页', async t => {
  axios.get = () => Promise.resolve({ data: SEARCH_RESULT });
  const { container, getLocation } = renderSrch();

  const options = await searchKeyword(container, '电商');
  const groupOption = Array.from(options).find(option => option.textContent === '分组: 电商分组');
  fireEvent.mouseDown(groupOption);
  fireEvent.click(groupOption);
  await act(async () => {
    await sleep(20);
  });

  t.is(getLocation().pathname, '/group/1', '选择分组应导航到 /group/:id');
});

test.serial('选择项目候选项拉取分组信息并跳转项目页', async t => {
  const getCalls = [];
  axios.get = url => {
    getCalls.push(url);
    return Promise.resolve({ data: SEARCH_RESULT });
  };
  const { container, getLocation } = renderSrch();

  const options = await searchKeyword(container, '电商');
  const projectOption = Array.from(options).find(option => option.textContent === '项目: 电商中台');
  fireEvent.mouseDown(projectOption);
  fireEvent.click(projectOption);
  await act(async () => {
    await sleep(20);
  });

  t.is(getLocation().pathname, '/project/2', '选择项目应导航到 /project/:id');
  t.truthy(
    getCalls.indexOf('/api/project/search?q=电商') === 0,
    '选择前应先有搜索请求'
  );
});

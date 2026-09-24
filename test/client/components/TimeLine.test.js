// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { MemoryRouter } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: TimeTree } = require('../../../client/components/TimeLine/TimeLine.js');
// 与 TimeLine.js 共享同一模块实例（babel CJS 转译后命中同一 require 缓存）：
// news 切片已迁 Zustand，动态数据经 useNewsStore 播种/断言
const { default: useNewsStore } = require('../../../client/store/newsStore');
// interface 切片已迁 Zustand（批次5）：fetchInterfaceList 不再经 redux 派发，
// 断言改为反向断言（不再有 yapi/interface/* action）+ 渲染结果断言
const { resetInterfaceStore } = require('../../helpers/interfaceStores');

// fetchNewsData/fetchMoreNews（Zustand）与 fetchInterfaceList（Zustand，批次5）都会在
// 挂载即发请求，因此每个用例都必须先打桩（axios 为 CJS 单例，生产代码调用时才读取
// .get，替换属性即可生效）
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // news 已迁 Zustand：模块级单例，用例间复位避免状态串场
  useNewsStore.setState({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 });
  // interface 已迁 Zustand（批次5）：同样复位
  resetInterfaceStore();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 在 act 中等待异步副作用(axios promise → store 写入 → setState)完成
async function flushEffects(ms) {
  await act(async () => {
    await sleep(ms == null ? 15 : ms);
  });
}

function makeNewsItem(overrides) {
  return Object.assign(
    {
      uid: 11,
      // YApi 线上 add_time 为秒级 Unix 时间戳
      add_time: Math.floor(Date.now() / 1000),
      type: 'project',
      content: '<span>更新了接口 <b>登录</b></span>',
      data: null
    },
    overrides
  );
}

function makeStore(seedState) {
  // 与生产一致挂 redux-promise 中间件(fetchInterfaceList 仍为 async action creator)。
  // 入口 dispatch 包装记录原始 action，reducer 记录中间件二次派发的 fulfilled action
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

const DIFF_DATA = {
  current: { path: '/new/login', title: '登录', method: 'GET', catid: 1 },
  old: { path: '/old/login', title: '登录', method: 'GET', catid: 1 }
};

// redux 种子仅保留 user 切片（TimeLine 保留的历史遗留订阅）；news 切片已迁 Zustand
function makeSeed() {
  return { user: { uid: 11 } };
}

// news 种子改经 Zustand store 播种（等价旧 redux seed 的 news 切片）
function seedNews(list, total, curpage) {
  useNewsStore.setState({
    newsData: { total: total == null ? list.length : total, list },
    curpage: curpage == null ? 1 : curpage,
    newsRequestId: 0
  });
}

function renderTimeTree(props, seedState) {
  const { store, dispatched } = makeStore(seedState);
  const utils = render(
    <Provider store={store}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TimeTree {...props} />
      </MemoryRouter>
    </Provider>
  );
  return Object.assign({ dispatched, store }, utils);
}

test.serial('根据 mock 数据渲染动态列表项、用户头像与动态描述', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  const list = [
    makeNewsItem({ uid: 11, type: 'project' }),
    makeNewsItem({ uid: 22, type: 'group', content: '<span>创建了分组 电商</span>' })
  ];
  seedNews(list);
  const { container, dispatched } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  const items = container.querySelectorAll(
    '.news-content .ant-timeline-item:not(.ant-timeline-item-pending)'
  );
  t.is(items.length, 2, '应渲染 2 条动态, 实际 DOM: ' + container.innerHTML);

  const types = Array.from(container.querySelectorAll('.logtype')).map(el => el.textContent);
  t.deepEqual(types, ['项目动态', '分组动态'], '动态类型文案应按 type 映射');

  const contents = Array.from(container.querySelectorAll('.logcontent')).map(el => el.innerHTML);
  t.truthy(contents[0].indexOf('<b>登录</b>') > -1, '动态描述应按 mock 数据渲染 HTML');
  t.truthy(contents[1].indexOf('创建了分组 电商') > -1, '第二条动态描述应正确');

  const logtime = container.querySelector('.logtime');
  t.truthy(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(logtime.textContent), '秒级时间戳应格式化为日期时间');

  const avatar = container.querySelector('.ant-timeline-item-head img');
  t.is(avatar.getAttribute('src'), '/api/user/avatar?uid=11', '头像应指向动态用户');

  const profileLink = container.querySelector('.ant-timeline-item-head a');
  t.is(profileLink.getAttribute('href'), '/user/profile/11', '头像应链接到用户主页');
  t.falsy(
    dispatched.some(action => action.type && action.type.indexOf('yapi/news/') === 0),
    '不应派发任何 yapi/news/* redux action（已迁 Zustand）'
  );
  t.is(useNewsStore.getState().newsData.list.length, 2, '渲染应走 Zustand store 订阅路径');
  await flushEffects();
});

test.serial('挂载即拉取第一页动态, typeid 变化时重新拉取', async t => {
  const getCalls = [];
  axios.get = (url, config) => {
    getCalls.push({ url, config });
    return Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  };
  seedNews([]);
  const { rerender, dispatched, store } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  const newsCalls = getCalls.filter(c => c.url === '/api/log/list');
  t.truthy(newsCalls.length >= 1, '挂载后应发起 /api/log/list 请求');
  t.deepEqual(
    newsCalls[0].config.params,
    { typeid: 42, type: 'project', page: 1, limit: 10, selectValue: undefined },
    '请求参数应为第一页 10 条'
  );
  t.falsy(
    dispatched.some(action => action.type === 'yapi/news/FETCH_NEWS_DATA'),
    '拉取动态不应再经 redux 派发（已迁 Zustand）'
  );

  // 对应旧 UNSAFE_componentWillReceiveProps: typeid 变化触发重新拉取
  rerender(
    <Provider store={store}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TimeTree typeid={43} type="project" />
      </MemoryRouter>
    </Provider>
  );

  const allNewsCalls = getCalls.filter(c => c.url === '/api/log/list');
  t.truthy(allNewsCalls.length >= 2, 'typeid 变化应再次拉取动态');
  t.is(
    allNewsCalls[allNewsCalls.length - 1].config.params.typeid,
    43,
    '最新一次拉取应使用新 typeid'
  );
  await flushEffects();
});

test.serial('type=project 时拉取接口列表并渲染 Api 查询行', async t => {
  const getCalls = [];
  axios.get = url => {
    getCalls.push(url);
    if (url.indexOf('/api/interface/list') === 0) {
      return Promise.resolve({
        data: { errcode: 0, data: { list: [{ _id: 7, title: '登录', path: '/login', method: 'POST' }] } }
      });
    }
    return Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  };
  seedNews([makeNewsItem()]);
  const { container, dispatched } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  t.truthy(container.textContent.indexOf('选择查询的 Api：') > -1, '应渲染 Api 查询行');
  // fetchInterfaceList 已迁 Zustand（批次5），不再经 redux 派发
  await flushEffects();
  t.falsy(
    dispatched.some(action => String(action.type).indexOf('yapi/interface/') === 0),
    '拉取接口列表不应再经 redux 派发（已迁 Zustand）'
  );
  t.truthy(getCalls.indexOf('/api/interface/list') > -1, '应请求接口列表数据');
  // fetchInterfaceList 已迁 Zustand（批次5）：数据写入 store（渲染进 AutoComplete 需下拉展开，
  // 此处断言 store 状态与组件消费链已接上）
  const { default: useInterfaceStore } = require('../../../client/store/interfaceStore');
  t.is(useInterfaceStore.getState().totalTableList.length, 1, '接口列表数据应写入 interfaceStore');
  t.is(useInterfaceStore.getState().totalTableList[0].title, '登录');

  seedNews([makeNewsItem()]);
  const groupType = renderTimeTree({ typeid: 42, type: 'group' }, makeSeed());
  t.is(
    groupType.container.querySelector('.news-search'),
    null,
    'group 类型不渲染 Api 查询行'
  );
  await flushEffects();
});

test.serial('有更多动态时展示查看更多, 点击防抖拉取下一页', async t => {
  const getCalls = [];
  axios.get = (url, config) => {
    getCalls.push({ url, config });
    return Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  };
  seedNews([makeNewsItem()], 5, 1);
  const { container, dispatched } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  const more = container.querySelector('.loggetMore');
  t.truthy(more, 'total > curpage 应渲染查看更多');
  t.is(more.textContent, '查看更多');

  fireEvent.click(more);
  // 点击同步效果：loading Spin 立即渲染、/api/log/list 请求立即发出（page = curpage+1）
  t.truthy(container.querySelector('.ant-spin'), '点击后应立即渲染 Spin loading');
  // 挂载期首拉 + 点击加载更多共两次 /api/log/list 请求
  const moreCalls = getCalls.filter(c => c.url === '/api/log/list');
  t.is(moreCalls.length, 2, '挂载首拉 + 点击应共发起两次 /api/log/list 请求');
  t.deepEqual(
    moreCalls[1].config.params,
    { typeid: 42, type: 'project', page: 2, limit: 10, selectValue: '' },
    '应拉取 curpage+1=2 页并透传筛选值'
  );
  t.falsy(
    dispatched.some(action => action.type === 'yapi/news/FETCH_MORE_NEWS'),
    '加载下一页不应再经 redux 派发（已迁 Zustand）'
  );

  await flushEffects(30);
  t.falsy(container.querySelector('.ant-spin'), '请求完成后 loading 应复位');
  await flushEffects();
});

test.serial('已到末页时展示"以上为全部内容"且不渲染查看更多', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  seedNews([makeNewsItem()], 1, 1);
  const { container, dispatched } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  t.is(container.querySelector('.loggetMore'), null, '无更多动态时不渲染查看更多');
  t.is(container.querySelector('.logbidden').textContent, '以上为全部内容');
  t.is(
    dispatched.filter(a => a.type === 'yapi/news/FETCH_MORE_NEWS').length,
    0,
    '末页不应有任何加载更多派发'
  );
  await flushEffects();
});

test.serial('点击改动详情打开 diff 弹窗并展示差异内容', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  const list = [makeNewsItem({ data: DIFF_DATA })];
  seedNews(list);
  const { container } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  t.is(container.ownerDocument.querySelector('.ant-modal-wrap'), null, '初始不渲染弹窗');

  const diffBtn = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === '改动详情'
  );
  t.truthy(diffBtn, '带 data 的动态应渲染改动详情按钮');
  fireEvent.click(diffBtn);

  const document = container.ownerDocument;
  const modalTitle = document.querySelector('.ant-modal .ant-modal-title');
  t.truthy(modalTitle, '点击后应渲染弹窗');
  t.is(modalTitle.textContent, 'Api 改动日志');
  const diffTitles = Array.from(document.querySelectorAll('.item-content .title')).map(
    el => el.textContent
  );
  t.deepEqual(diffTitles, ['Api 路径'], 'path 差异应产出 Api 路径 diff 块');
  await flushEffects();
});

test.serial('无动态数据时渲染空状态提示', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  seedNews([]);
  const { container } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed());

  t.is(container.querySelectorAll('.news-content').length, 0, '空数据不渲染时间线');
  t.truthy(container.querySelector('.err-msg'), '应渲染 ErrMsg 空状态');
  await flushEffects();
});

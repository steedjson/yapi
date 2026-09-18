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

// fetchNewsData/fetchMoreNews/fetchInterfaceList 的 payload 都是 axios 请求，
// TimeTree 挂载即会拉取动态，因此每个用例都必须先打桩（axios 为 CJS 单例，
// 生产代码调用时才读取 .get，替换属性即可生效）
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 在 act 中等待异步副作用(axios promise → 中间件 fulfilled 派发 → setState)完成
async function flushEffects(ms) {
  await act(async () => {
    await sleep(ms == null ? 15 : ms);
  });
}

// 动作类型常量取自 client/reducer/modules/news.js / interface.js,按线上契约硬编码断言
const FETCH_NEWS_DATA = 'yapi/news/FETCH_NEWS_DATA';
const FETCH_MORE_NEWS = 'yapi/news/FETCH_MORE_NEWS';
const FETCH_INTERFACE_LIST = 'yapi/interface/FETCH_INTERFACE_LIST';

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
  // 与生产一致挂 redux-promise 中间件(组件会直接 dispatch async action creator)。
  // 入口 dispatch 包装记录原始 action,reducer 记录中间件二次派发的 fulfilled action
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

function makeSeed(list, total, curpage) {
  return {
    user: { uid: 11 },
    news: {
      newsData: { total: total == null ? list.length : total, list },
      curpage: curpage == null ? 1 : curpage
    }
  };
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
  const { container } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed(list));

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
  await flushEffects();
});

test.serial('挂载即拉取第一页动态, typeid 变化时重新拉取', async t => {
  const getCalls = [];
  axios.get = (url, config) => {
    getCalls.push({ url, config });
    return Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  };
  const seed = makeSeed([]);
  const { rerender, dispatched, store } = renderTimeTree({ typeid: 42, type: 'project' }, seed);

  const newsCalls = dispatched.filter(a => a.type === FETCH_NEWS_DATA);
  // act 同步刷新会连带微任务,fulfilled 二次派发可能已入账,故对首条与最新条做稳健断言
  t.truthy(newsCalls.length >= 1, '挂载后应派发 FETCH_NEWS_DATA');
  t.is(newsCalls[0].meta.typeid, 42, 'action 应携带目标 typeid');
  t.is(getCalls[0].url, '/api/log/list');
  t.deepEqual(
    getCalls[0].config.params,
    { typeid: 42, type: 'project', page: 1, limit: 10, selectValue: undefined },
    '请求参数应为第一页 10 条'
  );

  // 对应旧 UNSAFE_componentWillReceiveProps: typeid 变化触发重新拉取
  rerender(
    <Provider store={store}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TimeTree typeid={43} type="project" />
      </MemoryRouter>
    </Provider>
  );

  const allNewsCalls = dispatched.filter(a => a.type === FETCH_NEWS_DATA);
  t.truthy(allNewsCalls.length >= 2, 'typeid 变化应再次派发 FETCH_NEWS_DATA');
  t.is(allNewsCalls[allNewsCalls.length - 1].meta.typeid, 43, '最新一次拉取应使用新 typeid');
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
  const { container, dispatched } = renderTimeTree(
    { typeid: 42, type: 'project' },
    makeSeed([makeNewsItem()])
  );

  t.truthy(container.textContent.indexOf('选择查询的 Api：') > -1, '应渲染 Api 查询行');
  // fetchInterfaceList 是 async 函数,dispatch 发生在微任务中,需等待后再断言
  await flushEffects();
  const listActions = dispatched.filter(a => a.type === FETCH_INTERFACE_LIST);
  t.is(listActions.length, 1, 'project 类型应派发 FETCH_INTERFACE_LIST');
  t.truthy(getCalls.indexOf('/api/interface/list') > -1, '应请求接口列表数据');

  const groupType = renderTimeTree({ typeid: 42, type: 'group' }, makeSeed([makeNewsItem()]));
  t.is(
    groupType.container.querySelector('.news-search'),
    null,
    'group 类型不渲染 Api 查询行'
  );
  await flushEffects();
});

test.serial('有更多动态时展示查看更多, 点击防抖派发加载下一页', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  const { container, dispatched } = renderTimeTree(
    { typeid: 42, type: 'project' },
    makeSeed([makeNewsItem()], 5, 1)
  );

  const more = container.querySelector('.loggetMore');
  t.truthy(more, 'total > curpage 应渲染查看更多');
  t.is(more.textContent, '查看更多');

  fireEvent.click(more);
  const moreActions = dispatched.filter(a => a.type === FETCH_MORE_NEWS);
  // fulfilled 二次派发可能随 act 微任务先行入账,取首条断言原始参数
  t.truthy(moreActions.length >= 1, '点击应派发 FETCH_MORE_NEWS');
  t.is(moreActions[0].meta.typeid, 42);
  await flushEffects();
});

test.serial('已到末页时展示"以上为全部内容"且不渲染查看更多', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  const { container, dispatched } = renderTimeTree(
    { typeid: 42, type: 'project' },
    makeSeed([makeNewsItem()], 1, 1)
  );

  t.is(container.querySelector('.loggetMore'), null, '无更多动态时不渲染查看更多');
  t.is(container.querySelector('.logbidden').textContent, '以上为全部内容');
  t.is(dispatched.filter(a => a.type === FETCH_MORE_NEWS).length, 0);
  await flushEffects();
});

test.serial('点击改动详情打开 diff 弹窗并展示差异内容', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { total: 0, list: [] } } });
  const list = [makeNewsItem({ data: DIFF_DATA })];
  const { container } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed(list));

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
  const { container } = renderTimeTree({ typeid: 42, type: 'project' }, makeSeed([]));

  t.is(container.querySelectorAll('.news-content').length, 0, '空数据不渲染时间线');
  t.truthy(container.querySelector('.err-msg'), '应渲染 ErrMsg 空状态');
  await flushEffects();
});

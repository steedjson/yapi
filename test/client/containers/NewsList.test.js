// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');
// 与 NewsList.js 共享同一模块实例（babel CJS 转译后命中同一 require 缓存）：
// news 切片已迁 Zustand
const { default: useNewsStore } = require('../../../client/store/newsStore');

const { default: NewsList } = require('../../../client/containers/News/NewsList/NewsList.js');

const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // news 已迁 Zustand：模块级单例，用例间复位避免状态串场
  useNewsStore.setState({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 });
});

function seedState() {
  // uid 故意用数字 23：容器内 useSelector 做过 `uid + ''`，点击时再 `+uid` 转回数字。
  // news 切片已迁 Zustand，Redux 种子中不再包含
  return { user: { uid: 23 } };
}

function renderNewsList() {
  const logRequests = [];
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
  };
  const setLoadingCalls = [];
  const utils = renderWithProviders(
    React.createElement(NewsList, { setLoading: value => setLoadingCalls.push(value) }),
    { seedState: seedState() }
  );
  return Object.assign(utils, { logRequests, setLoadingCalls });
}

test.serial('渲染 4 个日志类型菜单项且默认选中第 0 项', async t => {
  const { container } = renderNewsList();
  await flushEffects(); // 等 rc-menu 挂载后的异步测量 setState 完成，避免 act 告警

  const items = container.querySelectorAll('.ant-menu-item.log-item');
  t.is(items.length, 4, '应渲染 4 个菜单项');
  t.deepEqual(
    Array.from(items).map(li => li.textContent),
    ['用户', '分组', '接口', '项目'],
    '菜单项文案应为 用户/分组/接口/项目'
  );
  t.truthy(
    items[0].className.indexOf('ant-menu-item-selected') > -1,
    '默认应选中第 0 项（selectedKeys 初始 0）'
  );
  t.is(items[1].className.indexOf('ant-menu-item-selected'), -1, '其余项默认不选中');
});

test.serial('点击菜单项: 选中态迁移并直调 fetchNewsData(23, 0, 5)', async t => {
  const { container, dispatched, setLoadingCalls, logRequests } = renderNewsList();

  const items = () => Array.from(container.querySelectorAll('.ant-menu-item.log-item'));

  // fetchNewsData 已迁 Zustand store 动作，组件内 .then(...) 正常执行、不会抛 TypeError；
  // 若此处出现未捕获异常，测试会直接失败。
  fireEvent.click(items()[2]); // 「接口」

  // 点击的同步效果：选中态立即迁移、setLoading(true) 立即调用、/api/log/list 请求立即发出
  t.truthy(items()[2].className.indexOf('ant-menu-item-selected') > -1, '点击后第 2 项应选中');
  t.is(items()[0].className.indexOf('ant-menu-item-selected'), -1, '原选中项应取消选中');
  t.deepEqual(setLoadingCalls, [true], '点击后应立即 setLoading(true)');
  t.is(logRequests.length, 1, '应立即发起 /api/log/list 请求');
  t.falsy(
    dispatched.some(action => action.type === 'yapi/news/FETCH_NEWS_DATA'),
    '拉取动态不应再经 redux 派发（已迁 Zustand）'
  );

  await flushEffects();
  // 请求完成后 loading 正常复位：store 动作返回 Promise，.then 中的 setLoading(false) 触发
  t.deepEqual(setLoadingCalls, [true, false], '请求完成后 loading 应经历 [true, false] 状态复位');
  t.is(logRequests[0].url, '/api/log/list');
  t.is(logRequests[0].params.typeid, 23, '请求参数 typeid 应为 +uid 转数字后的 23');
  t.is(logRequests[0].params.type, 0, '请求参数 type 应为 0');
  t.is(logRequests[0].params.page, 5, '请求参数 page 应为 5');
  t.true(useNewsStore.getState().newsRequestId > 0, 'store 应记录本次请求序号');
  t.deepEqual(useNewsStore.getState().newsData, { list: [], total: 0 }, 'store 应接收响应数据');
});

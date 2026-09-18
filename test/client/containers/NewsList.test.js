// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: NewsList } = require('../../../client/containers/News/NewsList/NewsList.js');

const originalAxiosGet = axios.get;
const FETCH_NEWS_DATA = 'yapi/news/FETCH_NEWS_DATA';

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function seedState() {
  // uid 故意用数字 23：容器内 mapState 做过 `uid + ''`，点击时再 `+uid` 转回数字
  return { user: { uid: 23 }, news: { newsData: { list: [], total: 0 }, curpage: 1 } };
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

test.serial('点击菜单项: 选中态迁移并派发 fetchNewsData(23, 0, 5)', async t => {
  const { container, dispatched, setLoadingCalls, logRequests } = renderNewsList();

  const items = () => Array.from(container.querySelectorAll('.ant-menu-item.log-item'));

  // fetchNewsData 已符合 FSA 规范（requestId/typeid 收敛至 meta），payload 为 Promise 时
  // redux-promise 中间件返回标准 Promise，组件内 .then(...) 正常执行、不会抛 TypeError；
  // 若此处出现未捕获异常，测试会直接失败。
  fireEvent.click(items()[2]); // 「接口」

  // 点击的同步效果：选中态立即迁移、setLoading(true) 立即调用、原始 action 立即入队
  t.truthy(items()[2].className.indexOf('ant-menu-item-selected') > -1, '点击后第 2 项应选中');
  t.is(items()[0].className.indexOf('ant-menu-item-selected'), -1, '原选中项应取消选中');
  t.deepEqual(setLoadingCalls, [true], '点击后应立即 setLoading(true)');
  const fetchAction = dispatched.find(action => action.type === FETCH_NEWS_DATA);
  t.truthy(fetchAction, '应派发 FETCH_NEWS_DATA');
  t.is(fetchAction.meta.typeid, 23, 'typeid 应收敛至 meta 且为 +uid 转数字后的 23');
  t.truthy(fetchAction.meta.requestId > 0, 'meta.requestId 应为自增正整数');
  t.is(logRequests.length, 1, '应立即发起 /api/log/list 请求');

  await flushEffects();
  // 请求完成后 loading 正常复位：dispatch 返回 Promise，.then 中的 setLoading(false) 触发
  t.deepEqual(setLoadingCalls, [true, false], '请求完成后 loading 应经历 [true, false] 状态复位');
  t.is(logRequests[0].url, '/api/log/list');
  t.is(logRequests[0].params.typeid, 23, '请求参数 typeid 应为 23');
  t.is(logRequests[0].params.type, 0, '请求参数 type 应为 0');
  t.is(logRequests[0].params.page, 5, '请求参数 page 应为 5');
});

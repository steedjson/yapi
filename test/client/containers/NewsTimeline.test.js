// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: NewsTimeline } = require('../../../client/containers/News/NewsTimeline/NewsTimeline.js');

const originalAxiosGet = axios.get;
const FETCH_NEWS_DATA = 'yapi/news/FETCH_NEWS_DATA';

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

const LOG_ITEMS = [
  { add_time: 1700000000, username: '张三', type: 'project', content: '更新了项目' },
  { add_time: 1700000100, username: '李四', type: 'group', content: '添加了分组' }
];

function seedState(newsData) {
  return {
    news: Object.assign({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 }, newsData)
  };
}

function mockLogList(logRequests, list) {
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: (list || LOG_ITEMS).slice(), total: 1 } }
    });
  };
}

test.serial('挂载即拉取动态并渲染 Timeline 列表项', async t => {
  const logRequests = [];
  mockLogList(logRequests);
  // 测试 store 为固定 reducer，动态数据直接以种子 state 预置，渲染走 store 订阅路径
  const { container, dispatched } = renderWithProviders(React.createElement(NewsTimeline), {
    seedState: seedState({ newsData: { list: LOG_ITEMS.slice(), total: 2 }, curpage: 1 })
  });
  await flushEffects();

  t.is(logRequests.length, 1, '挂载应发起一次 /api/log/list 请求');
  t.is(logRequests[0].url, '/api/log/list');
  t.is(logRequests[0].params.typeid, 21, 'typeid 固定为 21');
  t.is(logRequests[0].params.type, 'project', 'type 固定为 project');
  t.is(logRequests[0].params.page, 1, 'page 应取 store 的 curpage');
  t.is(logRequests[0].params.limit, 8, 'limit 固定为 8');
  t.truthy(dispatched.find(action => action.type === FETCH_NEWS_DATA), '应派发 FETCH_NEWS_DATA');

  // antd5 Timeline 会把 pending 节点渲染为额外的 .ant-timeline-item，故按内容元素计数
  const usernames = Array.from(container.querySelectorAll('.logusername')).map(
    el => el.textContent
  );
  t.is(usernames.length, 2, '应渲染 2 条动态');
  t.deepEqual(usernames, ['张三', '李四'], '用户名应与种子数据一致');
  const types = Array.from(container.querySelectorAll('.logtype')).map(el => el.textContent);
  t.deepEqual(types, ['project', 'group'], '动态类型应与种子数据一致');
  const contents = Array.from(container.querySelectorAll('.logcontent')).map(el => el.textContent);
  t.deepEqual(contents, ['更新了项目', '添加了分组'], '动态内容应与种子数据一致');
  t.truthy(container.querySelector('.loggetMore'), 'pending 区应展示「查看更多」');
  t.is(container.querySelector('.loggetMore').textContent, '查看更多');
});

test.serial('点击「查看更多」触发 fetchNewsData 并短暂进入 loading', async t => {
  const logRequests = [];
  mockLogList(logRequests);
  // total=5 且 curpage=3：total + 1 !== curpage，点击拉取后仍应停留在「查看更多」
  const { container, dispatched } = renderWithProviders(React.createElement(NewsTimeline), {
    seedState: seedState({ newsData: { list: LOG_ITEMS.slice(), total: 5 }, curpage: 3 })
  });
  await flushEffects(); // 先等挂载请求完成，避免 act 告警干扰点击断言
  t.is(logRequests.length, 1, '挂载应已发起一次请求');

  const getMoreLink = () => container.querySelector('.loggetMore');
  t.truthy(getMoreLink(), '点击前应展示「查看更多」');
  fireEvent.click(getMoreLink());

  // 点击同步效果：立即进入 loading 并发起请求（page 取点击时的 curpage）
  t.truthy(container.querySelector('.ant-spin'), '点击后应立即渲染 Spin loading');
  t.is(logRequests.length, 2, '点击应立即发起请求');
  t.is(logRequests[1].params.page, 3, 'page 应为点击时的 curpage=3');
  t.is(logRequests[1].params.limit, 8);
  t.truthy(
    dispatched.find(action => action.type === FETCH_NEWS_DATA),
    '点击应触发 fetchNewsData 派发（挂载 + 点击均有记录）'
  );

  await flushEffects();
  t.is(logRequests.length, 2, '等待期间不应重复请求');
  t.falsy(container.querySelector('.ant-spin'), '请求完成后 loading 应复位');
  t.truthy(
    container.querySelector('.loggetMore'),
    '未到末页时（total+1 !== curpage）仍应展示「查看更多」'
  );
});

test.serial('返回末页时点击后 pending 区变为「以上为全部内容」', async t => {
  const logRequests = [];
  mockLogList(logRequests);
  // total=0 且 curpage=1 时命中 bidden 分支（total + 1 === curpage）
  const { container } = renderWithProviders(React.createElement(NewsTimeline), {
    seedState: seedState({ newsData: { list: LOG_ITEMS.slice(), total: 0 }, curpage: 1 })
  });
  await flushEffects(); // 先等挂载请求完成

  fireEvent.click(container.querySelector('.loggetMore'));
  await flushEffects();

  const bidden = container.querySelector('.logbidden');
  t.truthy(bidden, '末页应展示 logbidden 提示');
  t.is(bidden.textContent, '以上为全部内容', '末页文案应为「以上为全部内容」');
  t.falsy(container.querySelector('.loggetMore'), '末页不应再展示「查看更多」');
});

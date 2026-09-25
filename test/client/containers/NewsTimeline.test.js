// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');
// 与 NewsTimeline.js 共享同一模块实例（babel CJS 转译后命中同一 require 缓存）：
// news 切片已迁 Zustand，动态数据经 useNewsStore 播种/断言
const { default: useNewsStore } = require('../../../client/store/newsStore');

const { default: NewsTimeline } = require('../../../client/containers/News/NewsTimeline/NewsTimeline.js');

const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // news 已迁 Zustand：模块级单例，用例间复位避免状态串场
  useNewsStore.setState({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 });
});

// 真实 store 收敛会按 add_time 降序排序，种子数据按降序排列以对齐渲染顺序
const LOG_ITEMS = [
  { add_time: 1700000100, username: '李四', type: 'group', content: '添加了分组' },
  { add_time: 1700000000, username: '张三', type: 'project', content: '更新了项目' }
];

// news 种子改经 Zustand store 播种（等价旧 redux seed 的 news 切片）
function seedNews(newsData, curpage) {
  useNewsStore.setState({
    newsData: Object.assign({ list: [], total: 0 }, newsData),
    curpage: curpage == null ? 1 : curpage,
    newsRequestId: 0
  });
}

function mockLogList(logRequests, list, total) {
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: (list || LOG_ITEMS).slice(), total: total == null ? 1 : total } }
    });
  };
}

test.serial('挂载即拉取动态并渲染 Timeline 列表项', async t => {
  const logRequests = [];
  mockLogList(logRequests);
  seedNews({ list: LOG_ITEMS.slice(), total: 2 }, 1);
  const { container } = renderWithProviders(React.createElement(NewsTimeline));
  await flushEffects();

  t.is(logRequests.length, 1, '挂载应发起一次 /api/log/list 请求');
  t.is(logRequests[0].url, '/api/log/list');
  t.is(logRequests[0].params.typeid, 21, 'typeid 固定为 21');
  t.is(logRequests[0].params.type, 'project', 'type 固定为 project');
  t.is(logRequests[0].params.page, 1, 'page 应取 store 的 curpage');
  t.is(logRequests[0].params.limit, 8, 'limit 固定为 8');
  // 原「不再经 redux 派发」反向断言随 Redux 机制退役移除：拉取走 Zustand store 动作
  t.true(useNewsStore.getState().newsRequestId > 0, 'store 应记录挂载期请求序号');

  // antd5 Timeline 会把 pending 节点渲染为额外的 .ant-timeline-item，故按内容元素计数
  const usernames = Array.from(container.querySelectorAll('.logusername')).map(
    el => el.textContent
  );
  t.is(usernames.length, 2, '应渲染 2 条动态');
  t.deepEqual(usernames, ['李四', '张三'], '用户名应与数据一致（add_time 降序）');
  const types = Array.from(container.querySelectorAll('.logtype')).map(el => el.textContent);
  t.deepEqual(types, ['group', 'project'], '动态类型应与数据一致');
  const contents = Array.from(container.querySelectorAll('.logcontent')).map(el => el.textContent);
  t.deepEqual(contents, ['添加了分组', '更新了项目'], '动态内容应与数据一致');
  t.truthy(container.querySelector('.loggetMore'), 'pending 区应展示「查看更多」');
  t.is(container.querySelector('.loggetMore').textContent, '查看更多');
});

test.serial('点击「查看更多」触发 fetchNewsData 并短暂进入 loading', async t => {
  const logRequests = [];
  mockLogList(logRequests);
  seedNews({ list: LOG_ITEMS.slice(), total: 5 }, 3);
  const { container } = renderWithProviders(React.createElement(NewsTimeline));
  await flushEffects(); // 先等挂载请求完成，避免 act 告警干扰点击断言
  t.is(logRequests.length, 1, '挂载应已发起一次请求');

  // 挂载期请求已用真实响应覆写 store（curpage 归 1），此处重新播种模拟「已翻到第 3 页」
  // 场景；须在 act 内播种以触发订阅组件同步重渲染，点击回调才能读到 curpage=3
  await act(async () => {
    seedNews({ list: LOG_ITEMS.slice(), total: 5 }, 3);
  });

  const getMoreLink = () => container.querySelector('.loggetMore');
  t.truthy(getMoreLink(), '点击前应展示「查看更多」');
  fireEvent.click(getMoreLink());

  // 点击同步效果：立即进入 loading 并发起请求（page 取点击时的 curpage）
  t.truthy(container.querySelector('.ant-spin'), '点击后应立即渲染 Spin loading');
  t.is(logRequests.length, 2, '点击应立即发起请求');
  t.is(logRequests[1].params.page, 3, 'page 应为点击时的 curpage=3');
  t.is(logRequests[1].params.limit, 8);
  // 原「不再经 redux 派发」反向断言随 Redux 机制退役移除：点击拉取走 Zustand store 动作

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
  // 响应取 total=0 的末页形态：真实 store 收敛后 .then 内 total+1 === curpage 成立。
  // 列表保留非空内容，保证末页提示渲染在 Timeline pending 区（空列表时 Timeline 整体不渲染）
  mockLogList(logRequests, LOG_ITEMS, 0);
  seedNews({ list: LOG_ITEMS.slice(), total: 0 }, 1);
  const { container } = renderWithProviders(React.createElement(NewsTimeline));
  await flushEffects(); // 先等挂载请求完成

  t.is(logRequests[0].params.page, 1);

  fireEvent.click(container.querySelector('.loggetMore'));
  await flushEffects();

  const bidden = container.querySelector('.logbidden');
  t.truthy(bidden, '末页应展示 logbidden 提示');
  t.is(bidden.textContent, '以上为全部内容', '末页文案应为「以上为全部内容」');
  t.falsy(container.querySelector('.loggetMore'), '末页不应再展示「查看更多」');
});

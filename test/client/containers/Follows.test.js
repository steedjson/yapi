// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: Follows } = require('../../../client/containers/Follows/Follows.js');

const originalAxiosGet = axios.get;
const GET_FOLLOW_LIST = 'yapi/follow/GET_FOLLOW_LIST';
const SET_BREADCRUMB = 'yapi/user/SET_BREADCRUMB';

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function seedState() {
  // project.currPage 为 ProjectCard 订阅的历史遗留 selector 所需
  return { user: { uid: 11 }, follow: { data: [] }, project: { currPage: 1 } };
}

test.serial('有关注项目时渲染卡片列表并按更新时间降序排列', async t => {
  const followRequests = [];
  axios.get = (url, config) => {
    followRequests.push({ url, params: config && config.params });
    return Promise.resolve({
      data: {
        errcode: 0,
        data: {
          list: [
            { _id: 101, name: '项目A', icon: 'star-o', color: 'blue', up_time: 1700000001 },
            { _id: 102, name: '项目B', icon: 'star-o', color: 'red', up_time: 1700000002 }
          ]
        }
      }
    });
  };
  const { container, dispatched } = renderWithProviders(React.createElement(Follows), {
    seedState: seedState()
  });
  await flushEffects();

  t.is(followRequests.length, 1, '应发起一次关注列表请求');
  t.is(followRequests[0].url, '/api/follow/list', '请求地址应为 /api/follow/list');
  t.is(followRequests[0].params.uid, 11, 'uid 应取自 store 的 user.uid');
  t.truthy(
    dispatched.find(action => action.type === SET_BREADCRUMB),
    '挂载时应派发 SET_BREADCRUMB（我的关注）'
  );
  const breadcrumb = dispatched.find(action => action.type === SET_BREADCRUMB);
  t.deepEqual(breadcrumb.data, [{ name: '我的关注' }], '面包屑应为「我的关注」');
  t.truthy(
    dispatched.find(action => action.type === GET_FOLLOW_LIST),
    '应派发 GET_FOLLOW_LIST（fulfilled）'
  );

  const cards = container.querySelectorAll('.card-container');
  t.is(cards.length, 2, '应渲染 2 张项目卡片');
  const titles = Array.from(container.querySelectorAll('.ui-title')).map(el => el.textContent);
  t.deepEqual(titles, ['项目B', '项目A'], '应按 up_time 降序排列');
  t.truthy(
    cards[0].querySelector('.icon.active'),
    '关注页卡片应展示「取消关注」激活星标'
  );
});

test.serial('无关注项目时展示 noFollow 空态提示', async t => {
  const followRequests = [];
  axios.get = (url, config) => {
    followRequests.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  const { container } = renderWithProviders(React.createElement(Follows), {
    seedState: seedState()
  });
  await flushEffects();

  t.is(followRequests.length, 1, '仍应发起一次关注列表请求');
  t.falsy(container.querySelector('.card-container'), '不应渲染任何项目卡片');
  t.truthy(container.querySelector('.err-msg'), '应渲染 ErrMsg 空态');
  t.is(
    container.querySelector('.err-msg .title').textContent,
    '你还没有关注项目呢',
    '空态文案应为 noFollow 提示'
  );
});

test.serial('接口返回非 0 errcode 时保持空态且不崩溃', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: '请登录' } });
  const { container } = renderWithProviders(React.createElement(Follows), {
    seedState: seedState()
  });
  await flushEffects();

  t.truthy(container.querySelector('.err-msg'), '拉取失败时仍展示空态提示');
  t.falsy(container.querySelector('.card-container'), '失败时不应渲染卡片');
});

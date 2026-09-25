// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');
const dayjs = require('dayjs');

const { default: List } = require('../../../client/containers/User/List.js');
// user 切片已迁 Zustand（批次4）：role/uid 改经 useUserStore 播种；
// SET_BREADCRUMB 改为断言 userStore.breadcrumb
const {
  seedUserStore,
  resetUserProjectStores,
  useUserStore
} = require('../../helpers/userProjectStores');

const originalAxiosGet = axios.get;

const USERS = [
  { _id: 1, username: '管理员甲', email: 'admin@test.com', role: 'admin', disabled: false, up_time: 1700000000 },
  { _id: 2, username: '成员乙', email: 'member@test.com', role: 'member', disabled: true, up_time: 1700000100 }
];

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

// Redux 已退役（收尾批）：seedState 只做 userStore 播种，原 redux 种子返回值移除
function seedState(userRole, uid) {
  seedUserStore({ role: userRole, uid: uid == null ? 999 : uid });
}

function mockUserList(logRequests) {
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    if (url === '/api/user/list') {
      return Promise.resolve({
        data: { errcode: 0, data: { list: USERS.map(u => Object.assign({}, u)), count: 25 } }
      });
    }
    throw new Error('unexpected url: ' + url);
  };
}

test.serial('admin 视角渲染用户表格（用户名/邮箱/角色/状态/更新日期）与分页', async t => {
  const logRequests = [];
  mockUserList(logRequests);
  seedState('admin', 1);
  const { container } = renderWithProviders(React.createElement(List));
  await flushEffects();

  t.is(logRequests.length, 1, '挂载应发起一次用户列表请求');
  t.is(logRequests[0].url, '/api/user/list');
  t.is(logRequests[0].params.page, 1, '首页请求 page 应为 1');
  t.is(logRequests[0].params.limit, 20, 'limit 固定为 20');
  t.is(logRequests[0].params.keyword, undefined, '无关键词时不应传 keyword');
  t.deepEqual(
    useUserStore.getState().breadcrumb,
    [{ name: '用户管理' }],
    '挂载时应经 userStore 设置面包屑（用户管理）'
  );

  const headers = Array.from(container.querySelectorAll('.ant-table-thead th')).map(
    th => th.textContent
  );
  t.deepEqual(
    headers,
    ['用户名', 'Email', '用户角色', '状态', '更新日期', '功能'],
    'admin 视角表头应完整（含功能列）'
  );

  const names = Array.from(container.querySelectorAll('.ant-table-tbody a'))
    .filter(a => (a.getAttribute('href') || '').indexOf('/user/profile/') === 0)
    .map(a => a.textContent);
  t.deepEqual(names, ['管理员甲', '成员乙'], '用户名应渲染为个人主页链接');

  // querySelectorAll 按行优先顺序收集：第 1 行(管理员/启用)、第 2 行(成员/已禁用)
  const tags = Array.from(container.querySelectorAll('.ant-tag')).map(tag => tag.textContent);
  t.deepEqual(tags, ['管理员', '启用', '成员', '已禁用'], '角色与状态 Tag 应正确渲染');

  const rowText = container.querySelector('.ant-table-tbody').textContent;
  t.is(
    rowText.indexOf('admin@test.com') > -1,
    true,
    'Email 列应渲染邮箱'
  );
  const expectedTime = dayjs.unix(1700000000).format('YYYY-MM-DD HH:mm:ss');
  t.truthy(
    rowText.indexOf(expectedTime) > -1,
    '更新日期应为 formatTime(unix 秒) 格式化结果: ' + expectedTime
  );

  t.is(container.querySelector('.user-count').textContent, '用户总数：25位', '标题应展示用户总数');
  t.truthy(container.querySelector('.ant-pagination'), 'count=25 > pageSize=20 应渲染分页');
  t.truthy(
    Array.from(container.querySelectorAll('.ant-pagination-item')).find(
      item => item.textContent === '2'
    ),
    '分页应包含第 2 页'
  );
  t.truthy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加用户'),
    'admin 视角应提供「添加用户」按钮'
  );
});

test.serial('非 admin 视角隐藏功能列与添加用户按钮', async t => {
  const logRequests = [];
  mockUserList(logRequests);
  seedState('member', 999);
  const { container } = renderWithProviders(React.createElement(List));
  await flushEffects();

  const headers = Array.from(container.querySelectorAll('.ant-table-thead th')).map(
    th => th.textContent
  );
  t.deepEqual(
    headers,
    ['用户名', 'Email', '用户角色', '状态', '更新日期'],
    '非 admin 视角表头不含功能列'
  );
  t.falsy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加用户'),
    '非 admin 视角不应有「添加用户」按钮'
  );
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: MemberList } = require('../../../client/containers/Group/MemberList/MemberList.js');

const originalAxiosGet = axios.get;

const MEMBERS = [
  { uid: 11, username: '张三', email: 'zhangsan@test.com', role: 'owner' },
  { uid: 22, username: '李四', email: 'lisi@test.com', role: 'dev' },
  { uid: 33, username: '王五', email: 'wangwu@test.com', role: 'guest' }
];

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function seedState() {
  return {
    user: { uid: 11 },
    group: { currGroup: { _id: 71, group_name: '测试分组' }, role: 'dev' }
  };
}

function mockGroupApis(logRequests, groupRole) {
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    if (url === '/api/group/get') {
      return Promise.resolve({ data: { errcode: 0, data: { role: groupRole } } });
    }
    if (url === '/api/group/get_member_list') {
      return Promise.resolve({ data: { errcode: 0, data: MEMBERS.slice() } });
    }
    throw new Error('unexpected url: ' + url);
  };
}

test.serial('owner 视角渲染成员表格（用户名/角色）并提供添加成员入口', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'owner');
  const { container } = renderWithProviders(React.createElement(MemberList), {
    seedState: seedState()
  });
  await flushEffects();

  t.truthy(
    logRequests.find(req => req.url === '/api/group/get' && req.params.id === 71),
    '挂载应以 currGroup._id 请求 /api/group/get'
  );
  t.truthy(
    logRequests.find(req => req.url === '/api/group/get_member_list' && req.params.id === 71),
    '挂载应以 currGroup._id 请求 /api/group/get_member_list'
  );

  // 成员列表按 owner → dev → guest 排序渲染
  const names = Array.from(container.querySelectorAll('.m-user-name')).map(el => el.textContent);
  t.deepEqual(names, ['张三', '李四', '王五'], '成员应按 owner/dev/guest 顺序渲染');
  t.is(
    container.querySelector('.ant-table-thead th').textContent,
    '测试分组 分组成员 (3) 人',
    '表头应展示分组名与成员数'
  );

  // owner 视角：角色列渲染可切换的 Select，选中项展示角色文案
  const selects = Array.from(container.querySelectorAll('.member-opration .ant-select'));
  t.is(selects.length, 3, 'owner 视角应为每个成员渲染角色 Select');
  const roleTexts = selects.map(select => select.querySelector('.ant-select-selection-item').textContent);
  t.deepEqual(roleTexts, ['组长', '开发者', '访客'], '角色 Select 选中项应为组长/开发者/访客');

  t.truthy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加成员'),
    'owner 视角应提供「添加成员」按钮'
  );
});

test.serial('点击「添加成员」展开 Modal（用户名自动补全 + 权限选择）', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'owner');
  const { container } = renderWithProviders(React.createElement(MemberList), {
    seedState: seedState()
  });
  await flushEffects();

  t.falsy(document.body.querySelector('.ant-modal'), '初始不应渲染 Modal');
  const addBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent === '添加成员'
  );
  fireEvent.click(addBtn);
  await flushEffects();

  const modal = document.body.querySelector('.ant-modal');
  t.truthy(modal, '点击后应展开添加成员 Modal');
  t.is(modal.querySelector('.ant-modal-title').textContent, '添加成员', 'Modal 标题应为「添加成员」');
  t.truthy(
    modal.querySelector('.ant-select .ant-select-selection-placeholder'),
    'Modal 内应渲染用户名自动补全输入框（UsernameAutoComplete 占位）'
  );
  t.is(
    modal.querySelector('.ant-select .ant-select-selection-placeholder').textContent,
    '请输入用户名',
    '自动补全输入框占位文案应为「请输入用户名」'
  );
  t.truthy(modal.querySelector('.usernameauth'), 'Modal 内应渲染权限选择行');
});

test.serial('非管理员视角仅展示角色文案且无添加成员入口', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'member');
  const { container } = renderWithProviders(React.createElement(MemberList), {
    seedState: seedState()
  });
  await flushEffects();

  const names = Array.from(container.querySelectorAll('.m-user-name')).map(el => el.textContent);
  t.deepEqual(names, ['张三', '李四', '王五'], '成员列表正常渲染');
  // 列 className 同时作用于表头 th；非管理员视角表头为空串，正文单元格才是角色文案
  const roleCells = Array.from(
    container.querySelectorAll('.ant-table-tbody .member-opration')
  ).map(td => td.textContent);
  t.deepEqual(roleCells, ['组长', '开发者', '访客'], '非管理员应只读展示角色文案');
  t.falsy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加成员'),
    '非管理员不应有「添加成员」入口'
  );
});

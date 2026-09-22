// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: Profile } = require('../../../client/containers/User/Profile.js');
const { formatTime } = require('../../../client/common.js');
// user 切片已迁 Zustand（批次4）：curUid/userType/curRole 改经 useUserStore 播种；
// setBreadcrumb 改为断言 userStore.breadcrumb（不再派发 yapi/user/* redux action）
const {
  seedUserStore,
  resetUserProjectStores,
  useUserStore
} = require('../../helpers/userProjectStores');

// Profile 挂载即请求 /api/user/find（axios 为 CJS 单例，生产代码调用时读取 .get）
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

const ALICE = {
  uid: 9,
  username: 'alice',
  email: 'a@b.c',
  role: 'member',
  type: 'site',
  add_time: 1700000000,
  up_time: 1700000100
};

function mockFind(expectedId) {
  axios.get = url => {
    if (url === '/api/user/find?id=' + expectedId) {
      // 深拷贝：实现会就地修改 userinfo，避免用例间数据污染
      return Promise.resolve({ data: { errcode: 0, data: JSON.parse(JSON.stringify(ALICE)) } });
    }
    return Promise.reject(new Error('unexpected request: ' + url));
  };
}

function renderProfile(uid, seedUser) {
  seedUserStore(seedUser);
  return renderWithProviders(React.createElement(Profile), {
    routePath: '/user/profile/:uid',
    initialPath: '/user/profile/' + uid
  });
}

function findRow(container, label) {
  return Array.from(container.querySelectorAll('.user-profile .user-item')).find(row =>
    row.textContent.indexOf(label) > -1
  );
}

test.serial('本人访问渲染个人设置（头像上传、资料行、密码修改入口）', async t => {
  mockFind(9);
  const { container } = renderProfile(9, { uid: 9, type: 'site', role: 'member' });
  await flushEffects();

  t.is(container.querySelector('.user-profile h3').textContent, '个人设置', '本人访问应渲染个人设置标题');
  t.truthy(
    container.querySelector('.user-profile .avatar-box img.avatar[src="/api/user/avatar?uid=9"]'),
    '本人访问应渲染头像上传组件'
  );

  const rows = Array.from(container.querySelectorAll('.user-profile .user-item'));
  t.is(rows.length, 8, '站点登陆用户应渲染 8 行资料（含密码行）');

  const texts = rows.map(row => row.textContent);
  t.truthy(texts.some(text => text.indexOf('用户id') > -1 && text.indexOf('9') > -1), '应展示用户 id');
  t.is(
    container.querySelector('.user-profile .text').textContent,
    'alice',
    '用户名行应展示接口返回的用户名'
  );
  t.is(
    Array.from(container.querySelectorAll('.user-profile .text'))[1].textContent,
    'a@b.c',
    'Email 行应展示接口返回的邮箱'
  );
  t.truthy(texts.some(text => text.indexOf('站点登陆') > -1), '登陆方式应展示站点登陆');
  t.truthy(
    texts.some(
      text =>
        text.indexOf('创建账号时间') > -1 && text.indexOf(formatTime(ALICE.add_time)) > -1
    ),
    '创建账号时间应按 formatTime 展示'
  );
  t.truthy(
    texts.some(
      text => text.indexOf('更新账号时间') > -1 && text.indexOf(formatTime(ALICE.up_time)) > -1
    ),
    '更新账号时间应按 formatTime 展示'
  );

  // member 角色：角色行渲染但隐藏（display: none），无角色编辑入口
  const roleRow = findRow(container, '角色');
  t.is(roleRow.getAttribute('style'), 'display: none;', 'member 访问时角色行应隐藏');

  // 站点登陆本人：密码行展示修改入口
  const secureRow = findRow(container, '密码');
  t.truthy(secureRow, '站点登陆用户应渲染密码行');
  t.truthy(
    Array.from(secureRow.querySelectorAll('button')).find(
      button => button.textContent.replace(/\s/g, '') === '修改'
    ),
    '密码行应渲染修改按钮'
  );

  // 本人（非 admin）在用户名/Email 行渲染编辑按钮
  const editButtons = Array.from(container.querySelectorAll('button')).filter(
    button => button.textContent.replace(/\s/g, '') === '修改'
  );
  t.is(editButtons.length, 3, '用户名/Email/密码三处均应有修改按钮');

  t.deepEqual(
    useUserStore.getState().breadcrumb,
    [{ name: 'alice' }],
    '本人访问面包屑不应带管理前缀（经 userStore 写入）'
  );
});

test.serial('管理员查看他人渲染资料设置（管理前缀面包屑、角色行可见）', async t => {
  mockFind(9);
  const { container } = renderProfile(9, { uid: 11, type: 'site', role: 'admin' });
  await flushEffects();

  t.is(
    container.querySelector('.user-profile h3').textContent,
    'alice 资料设置',
    '非本人访问应渲染 "用户名 资料设置" 标题'
  );
  t.truthy(
    container.querySelector('.user-profile .avatarImg img[src="/api/user/avatar?uid=9"]'),
    '非本人访问应渲染对方头像（无上传入口）'
  );
  t.is(container.querySelector('.avatar-box'), null, '非本人访问不应渲染头像上传组件');

  const roleRow = findRow(container, '角色');
  t.is(roleRow.getAttribute('style'), null, 'admin 访问时角色行应可见');

  // 管理员可编辑他人：用户名/Email 行渲染修改按钮
  const editButtons = Array.from(container.querySelectorAll('button')).filter(
    button => button.textContent.replace(/\s/g, '') === '修改'
  );
  t.is(editButtons.length, 3, 'admin 访问他人时仍应有三处修改按钮');

  t.deepEqual(
    useUserStore.getState().breadcrumb,
    [{ name: '管理: alice' }],
    '管理员查看他人面包屑应带管理前缀（经 userStore 写入）'
  );
});

test.serial('用户名编辑链路：进入编辑态、受控输入、取消还原', async t => {
  mockFind(9);
  const { container } = renderProfile(9, { uid: 9, type: 'site', role: 'member' });
  await flushEffects();

  const editButtons = () =>
    Array.from(container.querySelectorAll('button')).filter(
      button => button.textContent.replace(/\s/g, '') === '修改'
    );
  fireEvent.click(editButtons()[0]);
  await flushEffects();

  const usernameInput = container.querySelector('input[placeholder="用户名"]');
  t.truthy(usernameInput, '进入编辑态应渲染用户名输入框');
  t.is(usernameInput.value, 'alice', '输入框应回填当前用户名');

  fireEvent.change(usernameInput, { target: { value: 'alice2' } });
  await flushEffects();
  t.is(
    container.querySelector('input[placeholder="用户名"]').value,
    'alice2',
    '受控输入应同步 changeUserinfo 的草稿值'
  );

  const cancel = Array.from(container.querySelectorAll('button')).find(
    button => button.textContent.replace(/\s/g, '') === '取消'
  );
  fireEvent.click(cancel);
  await flushEffects();

  t.is(container.querySelector('input[placeholder="用户名"]'), null, '取消后应退出编辑态');
  t.is(container.querySelector('.user-profile .text').textContent, 'alice', '取消后用户名应保持原值');
});

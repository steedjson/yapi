// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: User } = require('../../../client/containers/User/User.js');
// user 切片已迁 Zustand（批次4）：List/Profile 改经 useUserStore 读取，种子随之迁移
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

// List/Profile 挂载即请求接口（axios 为 CJS 单例，生产代码调用时读取 .get）
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

function seedState() {
  seedUserStore({ uid: 11, type: 'site', role: 'admin' });
  return {};
}

test.serial('/user/list 子路由渲染用户管理表格', async t => {
  axios.get = url => {
    if (url === '/api/user/list') {
      return Promise.resolve({
        data: {
          errcode: 0,
          data: {
            list: [
              { _id: 9, username: 'alice', email: 'a@b.c', role: 'member', up_time: 1700000000 }
            ],
            count: 1
          }
        }
      });
    }
    return Promise.reject(new Error('unexpected request: ' + url));
  };

  const { container } = renderWithProviders(React.createElement(User), {
    seedState: seedState(),
    routePath: '/user/*',
    initialPath: '/user/list'
  });
  await flushEffects();

  t.truthy(container.querySelector('.user-table'), '应渲染用户列表表格');
  t.is(
    container.querySelector('.user-count').textContent,
    '用户总数：1位',
    '表格头应展示接口返回的用户总数'
  );
  const profileLink = Array.from(container.querySelectorAll('.user-table a')).find(
    a => a.textContent === 'alice'
  );
  t.truthy(profileLink, '表格应渲染用户名行内链接');
  t.is(profileLink.getAttribute('href'), '/user/profile/9', '用户名链接应指向资料页');
  t.truthy(
    Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.indexOf('添加用户') > -1
    ),
    'admin 角色应渲染添加用户按钮'
  );
});

test.serial('/user/profile/:uid 子路由渲染资料页', async t => {
  axios.get = url => {
    if (url === '/api/user/find?id=9') {
      return Promise.resolve({
        data: {
          errcode: 0,
          data: {
            uid: 9,
            username: 'alice',
            email: 'a@b.c',
            role: 'member',
            type: 'site',
            add_time: 1700000000,
            up_time: 1700000000
          }
        }
      });
    }
    return Promise.reject(new Error('unexpected request: ' + url));
  };

  const { container } = renderWithProviders(React.createElement(User), {
    seedState: seedState(),
    routePath: '/user/*',
    initialPath: '/user/profile/9'
  });
  await flushEffects();

  t.truthy(container.querySelector('.user-profile'), '应渲染资料页');
  t.is(
    container.querySelector('.user-profile h3').textContent,
    'alice 资料设置',
    '非本人访问应渲染 "用户名 资料设置" 标题'
  );
  t.truthy(
    container.querySelector('.user-profile img[src="/api/user/avatar?uid=9"]'),
    '非本人访问应渲染对方头像'
  );
  t.truthy(
    container.querySelector('.user-profile').textContent.indexOf('站点登陆') > -1,
    '资料页应展示登陆方式为站点登陆'
  );
  t.is(
    container.querySelector('.user-profile #old_password'),
    null,
    'ProfileWithRouter 未注入 userType props（沿用既有行为），密码区块不应渲染'
  );
});

test.serial('未匹配的子路由不渲染列表或资料页', t => {
  const { container } = renderWithProviders(React.createElement(User), {
    seedState: seedState(),
    routePath: '/user/*',
    initialPath: '/user/other'
  });

  t.truthy(container.querySelector('.user-box'), 'User 容器本身应渲染');
  t.is(container.querySelector('.user-table'), null, 'list 子路由不应匹配');
  t.is(container.querySelector('.user-profile'), null, 'profile 子路由不应匹配');
});

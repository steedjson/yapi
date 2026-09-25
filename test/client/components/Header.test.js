// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');

// Header.js 里有一处 webpack 别名引用 require('client/plugin.js'),
// jsdom-setup 只映射了 common/ 前缀,这里补一层 client/ 前缀的等价映射,
// 必须在 require Header 组件之前安装
const path = require('path');
const Module = require('module');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { default: HeaderCom } = require('../../../client/components/Header/Header.js');
// user 切片已迁 Zustand（批次4）：Header/Breadcrumb 改经 useUserStore 读取，
// Search 的 interface 动作亦已迁 store（批次5）——Redux 退役（收尾批）后 Provider 一并移除
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

// 退出登录等 action 的 payload 是 axios 请求，测试统一拦截（axios 为 CJS 单例）
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  // 皮肤用例可能改动 documentElement / localStorage,统一还原
  globalThis.document.documentElement.removeAttribute('data-skin');
  globalThis.window.localStorage.removeItem('yapi-skin');
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Header 经 useUserStore 读取 user 切片(userName/uid/role/isLogin/studyTip/study/imageUrl),
// 内嵌 Breadcrumb(user.breadcrumb)与 Srch(group.groupList)
function renderHeader(userState, opts) {
  const options = opts || {};
  seedUserStore(
    Object.assign(
      {
        userName: 'admin',
        uid: 11,
        role: 'admin',
        isLogin: true,
        studyTip: 0,
        study: true,
        imageUrl: '',
        breadcrumb: []
      },
      userState
    )
  );
  // Redux 已退役（收尾批）：原 Provider 占位包装移除，Zustand 无需 Provider
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  const utils = render(
    <MemoryRouter
      initialEntries={[options.initialPath || '/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <HeaderCom />
    </MemoryRouter>
  );
  return Object.assign({ getLocation: () => locationRef }, utils);
}

test.serial('渲染 Logo 与面包屑容器', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader();

  t.truthy(container.querySelector('.m-header'), '应渲染 antd Header 布局');
  t.truthy(container.querySelector('.logo'), '应渲染 Logo 链接');
  t.is(container.querySelector('.logo').getAttribute('href'), '/group', 'Logo 链接指向 /group');
  t.truthy(container.querySelector('.logo svg'), 'Logo 内应渲染 SVG 图形');
  t.truthy(container.querySelector('.breadcrumb-container'), '应渲染面包屑');
});

test.serial('登录态渲染搜索框、导航入口与用户头像', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader();

  t.truthy(container.querySelector('.item-search .search-input'), '工具栏应内嵌全局搜索框');
  const links = Array.from(container.querySelectorAll('.user-toolbar a')).map(a =>
    a.getAttribute('href')
  );
  t.truthy(links.indexOf('/follow') > -1, '应渲染我的关注入口');
  t.truthy(links.indexOf('/add-project') > -1, '应渲染新建项目入口');
  t.truthy(
    links.indexOf('https://hellosean1025.github.io/yapi') > -1,
    '应渲染使用文档外链'
  );

  const avatar = container.querySelector('.avatar-image img');
  t.truthy(avatar, '应渲染用户头像');
  t.is(avatar.getAttribute('src'), '/api/user/avatar?uid=11', '头像默认取用户 uid 对应地址');
});

test.serial('imageUrl 存在时头像优先使用自定义地址', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader({ imageUrl: '/api/user/custom_avatar.png' });

  t.is(
    container.querySelector('.avatar-image img').getAttribute('src'),
    '/api/user/custom_avatar.png'
  );
});

test.serial('未登录不渲染用户工具栏', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader({ isLogin: false });

  t.is(container.querySelectorAll('.toolbar-li').length, 0, '未登录不应渲染工具栏');
  t.is(container.querySelector('.avatar-image'), null, '未登录不渲染头像');
});

test.serial('点击头像打开用户菜单: 个人中心/用户管理/退出', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader({ role: 'admin' });

  // .dropdown-link 有多个(星标/新建/文档图标),头像锚点通过 avatar-image 定位
  const avatarLink = container.querySelector('.avatar-image').closest('a');
  fireEvent.click(avatarLink);
  await act(async () => {
    await sleep(20);
  });

  const document = container.ownerDocument;
  const menu = document.querySelector('.user-menu');
  t.truthy(menu, '点击头像应弹出用户菜单, 实际 DOM: ' + document.body.innerHTML.slice(0, 500));

  const profileLink = Array.from(menu.querySelectorAll('a')).find(
    a => a.textContent === '个人中心'
  );
  t.truthy(profileLink, '应渲染个人中心入口');
  t.is(profileLink.getAttribute('href'), '/user/profile/11', '个人中心应带当前 uid');

  const adminLink = Array.from(menu.querySelectorAll('a')).find(a => a.textContent === '用户管理');
  t.truthy(adminLink, 'admin 角色应渲染用户管理入口');
  t.is(adminLink.getAttribute('href'), '/user/list');

  t.truthy(
    Array.from(menu.querySelectorAll('li')).find(li => li.textContent.indexOf('退出') > -1),
    '应渲染退出菜单项'
  );
});

test.serial('普通角色不显示用户管理入口', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader({ role: 'member' });

  fireEvent.click(container.querySelector('.avatar-image').closest('a'));
  await act(async () => {
    await sleep(20);
  });

  const menu = container.ownerDocument.querySelector('.user-menu');
  t.truthy(menu);
  t.truthy(Array.from(menu.querySelectorAll('a')).find(a => a.textContent === '个人中心'));
  t.is(
    Array.from(menu.querySelectorAll('a')).find(a => a.textContent === '用户管理'),
    undefined,
    '非 admin 不渲染用户管理'
  );
});

test.serial('皮肤菜单默认仅展示未隐藏皮肤且当前皮肤带勾选', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader();

  fireEvent.click(container.querySelector('.avatar-image').closest('a'));
  await act(async () => {
    await sleep(20);
  });

  const document = container.ownerDocument;
  const submenuTitle = Array.from(document.querySelectorAll('.ant-dropdown-menu-submenu-title')).find(
    li => li.textContent.indexOf('界面皮肤') > -1
  );
  t.truthy(submenuTitle, '用户菜单应渲染界面皮肤子菜单');

  // 默认皮肤 enterprise 未隐藏,hidden 皮肤(政务风/暗色)不展示;
  // rc-motion 弹层内容约 150ms 后挂载,等待须足够
  fireEvent.mouseEnter(submenuTitle);
  await act(async () => {
    await sleep(250);
  });

  const skinOptions = Array.from(
    document.querySelectorAll('.ant-dropdown-menu-submenu-popup a')
  ).filter(a => ['默认', '政务风', '二次元', '暗色'].indexOf(a.textContent) > -1);
  const skinNames = skinOptions.map(a => a.textContent);
  t.deepEqual(
    skinNames,
    ['默认', '二次元'],
    'hidden 皮肤不应出现在菜单中, 实际: ' + JSON.stringify(skinNames)
  );

  const defaultCheck = skinOptions.find(a => a.textContent === '默认').querySelector('.anticon-check');
  t.truthy(defaultCheck, '当前皮肤(enterprise)应带勾选标记');
  t.is(defaultCheck.style.visibility, 'visible', '当前皮肤勾选可见');

  const animeCheck = skinOptions.find(a => a.textContent === '二次元').querySelector('.anticon-check');
  t.is(animeCheck.style.visibility, 'hidden', '非当前皮肤勾选隐藏');
});

test.serial('选择皮肤立即生效并写入偏好', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container } = renderHeader();

  fireEvent.click(container.querySelector('.avatar-image').closest('a'));
  await act(async () => {
    await sleep(20);
  });
  const document = container.ownerDocument;
  const submenuTitle = Array.from(document.querySelectorAll('.ant-dropdown-menu-submenu-title')).find(
    li => li.textContent.indexOf('界面皮肤') > -1
  );
  fireEvent.mouseEnter(submenuTitle);
  await act(async () => {
    await sleep(250);
  });

  const anime = Array.from(document.querySelectorAll('.ant-dropdown-menu-submenu-popup a')).find(
    a => a.textContent === '二次元'
  );
  t.truthy(anime, '弹出的皮肤子菜单中应有二次元选项');
  fireEvent.click(anime);
  await act(async () => {
    await sleep(20);
  });

  t.is(
    document.documentElement.getAttribute('data-skin'),
    'anime',
    '选择皮肤后 data-skin 应立即生效'
  );
  t.is(globalThis.window.localStorage.getItem('yapi-skin'), 'anime', '偏好应写入 localStorage');
});

test.serial('退出登录成功后跳转首页', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: {} } });
  const { container, getLocation } = renderHeader({}, { initialPath: '/project/1' });

  t.is(getLocation().pathname, '/project/1', '用例前置: 初始应位于项目页');

  fireEvent.click(container.querySelector('.avatar-image').closest('a'));
  await act(async () => {
    await sleep(20);
  });

  const document = container.ownerDocument;
  const menu = document.querySelector('.user-menu');
  t.truthy(menu, '点击头像应弹出用户菜单');

  const logoutLink = Array.from(menu.querySelectorAll('a')).find(a => a.textContent === '退出');
  t.truthy(logoutLink, '用户菜单应包含退出入口');
  fireEvent.click(logoutLink);
  await act(async () => {
    await sleep(50);
  });

  t.is(getLocation().pathname, '/', '退出成功(errcode=0)后应跳转首页 /');
});

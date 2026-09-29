// Home 游客落地页「使用文档」站内化（DocDrawer prop 桥接）单测：
// 覆盖 HomeGuest 导航入口与 row-tip 按钮两条 openDoc 桥接链路 + 登录态重定向回归。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

// Home.js 经 webpack 别名引用 require('client/plugin.js')，
// jsdom-setup 只映射 common/ 前缀，这里补 client/ 前缀的等价映射
// （同 Header.test.js 模式），必须在 require 被测组件之前安装
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

const { default: Home } = require('../../../client/containers/Home/Home.js');
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Home 经 useUserStore 读取 isLogin：游客态渲染落地页，登录态 <Navigate to="/group" />
function renderHome() {
  seedUserStore({ isLogin: false });
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Home />
    </MemoryRouter>
  );
}

function findNavDocsTrigger(container) {
  return Array.from(container.querySelectorAll('.home-header a.item')).find(
    a => a.textContent === '使用文档'
  );
}

test.serial('游客落地页「使用文档」两条入口均不再是外链', t => {
  const { container } = renderHome();

  t.truthy(container.querySelector('.home-main'), '游客态应渲染落地页');

  const navDocsLink = findNavDocsTrigger(container);
  t.truthy(navDocsLink, '游客导航应渲染使用文档入口');
  t.is(
    navDocsLink.getAttribute('href'),
    null,
    '导航使用文档不应再是外链, 实际 DOM: ' + container.innerHTML.slice(0, 600)
  );
  t.is(navDocsLink.style.cursor, 'pointer', '站内入口应有 pointer 光标提示可点击');

  const guestBtn = container.querySelector('.row-tip .btn-home.btn-home-normal');
  t.truthy(guestBtn, 'row-tip 应渲染使用文档按钮');
  t.is(guestBtn.textContent.trim(), '使用文档', '按钮文案应保留');

  t.falsy(container.ownerDocument.querySelector('.ant-drawer'), '初始不应渲染 Drawer');
});

test.serial('点击游客导航使用文档入口打开站内文档抽屉', async t => {
  const { container } = renderHome();

  const navDocsLink = findNavDocsTrigger(container);
  t.truthy(navDocsLink, '使用文档导航入口应存在');

  fireEvent.click(navDocsLink);
  await act(async () => {
    await sleep(50);
  });

  const drawer = container.ownerDocument.querySelector('.ant-drawer');
  t.truthy(drawer, '点击后应渲染 Drawer, 实际 DOM: ' + container.ownerDocument.body.innerHTML.slice(0, 800));

  const iframe = container.ownerDocument.querySelector('.ant-drawer iframe[title="使用文档"]');
  t.truthy(iframe, 'Drawer 内应渲染使用文档 iframe');
  t.is(iframe.getAttribute('src'), '/docs/index.html', 'iframe 应加载站内文档首页');

  fireEvent.click(container.ownerDocument.querySelector('.ant-drawer-close'));
  await act(async () => {
    await sleep(100);
  });
  t.falsy(
    container.ownerDocument.querySelector('.ant-drawer-open'),
    '点击关闭后 Drawer 应退出 open 状态'
  );
});

test.serial('点击 row-tip 使用文档按钮同样打开站内文档抽屉', async t => {
  const { container } = renderHome();

  const guestBtn = container.querySelector('.row-tip .btn-home.btn-home-normal');
  t.truthy(guestBtn, '使用文档按钮应存在');

  fireEvent.click(guestBtn);
  await act(async () => {
    await sleep(50);
  });

  const iframe = container.ownerDocument.querySelector('.ant-drawer iframe[title="使用文档"]');
  t.truthy(iframe, '点击按钮后应渲染文档抽屉 iframe');
  t.is(iframe.getAttribute('src'), '/docs/index.html', 'iframe 应加载站内文档首页');
});

test.serial('登录态访问首页立即重定向 /group 不渲染落地页', t => {
  seedUserStore({ isLogin: true });
  let pathname = null;
  function LocationProbe() {
    pathname = useLocation().pathname;
    return null;
  }
  const { container } = render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <Home />
    </MemoryRouter>
  );

  t.is(pathname, '/group', '登录态应立即离开游客落地页');
  t.falsy(container.querySelector('.home-main'), '登录态不应渲染游客落地页');
});

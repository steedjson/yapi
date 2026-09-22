// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { requireAuthentication } = require('../../../client/components/AuthenticatedComponent');
// 与 AuthenticatedComponent.js 共享同一模块实例（babel CJS 转译后命中同一 require 缓存）
const { default: useMenuStore } = require('../../../client/store/menuStore');
// user 切片已迁 Zustand（批次4）：isLogin 改经 userStore 播种，组件测试不再需要 redux Provider
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  // menu/user 均已迁 Zustand：模块级单例，用例间复位避免状态串场
  useMenuStore.setState({ curKey: '/' });
  resetUserProjectStores();
});

// LocationProbe 渲染当前路由 location，用于断言 <Navigate> 的跳转效果
function LocationProbe(props) {
  props.onLocation(useLocation());
  return null;
}

// 未登录：重置菜单高亮 + <Navigate replace> 携带 from 跳转登录页，不渲染内层组件
test.serial('AuthenticatedComponent 未登录时重置菜单并重定向登录页携带 from', async t => {
  const InnerStub = () => React.createElement('div', { 'data-inner': 'rendered' }, 'AUTHED_CONTENT');
  const AuthenticatedComponent = requireAuthentication(InnerStub);
  seedUserStore({ isLogin: false });
  useMenuStore.setState({ curKey: '/project/12' });

  let locations = [];
  const utils = render(
    React.createElement(
      MemoryRouter,
      {
        initialEntries: ['/project/12?a=1#tab'],
        future: { v7_startTransition: true, v7_relativeSplatPath: true }
      },
      React.createElement(LocationProbe, {
        onLocation: l => {
          locations = locations.concat(l);
        }
      }),
      React.createElement(AuthenticatedComponent, {
        location: { pathname: '/project/12', search: '?a=1', hash: '#tab' }
      })
    )
  );

  // 手工传入的 location props 只用于 Navigate 的 from 计算，实际跳转由路由完成
  t.is(utils.container.innerHTML, '', '未登录不应渲染内层组件');
  t.is(useMenuStore.getState().curKey, '/', '未登录应经 Zustand changeMenuItem 重置菜单高亮');
  t.true(locations.length >= 2, '应发生导航');
  t.is(locations[0].pathname, '/project/12', '初始路由为深链接');
  t.is(locations[locations.length - 1].pathname, '/login', '应跳转到登录页');
  t.deepEqual(
    locations[locations.length - 1].state,
    { from: { pathname: '/project/12', search: '?a=1', hash: '#tab' } },
    '应携带站内来源供登录后回跳恢复深链接'
  );
  utils.unmount();
});

// 未登录且当前已在登录页：from 为 null，重定向不携带 state
test.serial('AuthenticatedComponent 未登录且位于登录页时重定向不携带 from', async t => {
  const InnerStub = () => React.createElement('div', null, 'AUTHED_CONTENT');
  const AuthenticatedComponent = requireAuthentication(InnerStub);
  seedUserStore({ isLogin: false });

  let lastLocation = null;
  const utils = render(
    React.createElement(
      MemoryRouter,
      {
        initialEntries: ['/login'],
        future: { v7_startTransition: true, v7_relativeSplatPath: true }
      },
      React.createElement(LocationProbe, {
        onLocation: l => {
          lastLocation = l;
        }
      }),
      React.createElement(AuthenticatedComponent, {
        location: { pathname: '/login', search: '', hash: '' }
      })
    )
  );

  t.is(lastLocation.pathname, '/login');
  t.falsy(lastLocation.state, 'from 为 null 时不应携带 state');
  utils.unmount();
});

// 已登录：透传渲染内层组件，不重置菜单高亮
test.serial('AuthenticatedComponent 已登录时透传渲染内层组件', t => {
  const InnerStub = props =>
    React.createElement(
      'div',
      { 'data-pathname': String(props.location && props.location.pathname) },
      'AUTHED_CONTENT'
    );
  const AuthenticatedComponent = requireAuthentication(InnerStub);
  seedUserStore({ isLogin: true });
  useMenuStore.setState({ curKey: '/group/7' });

  const utils = render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/group/7'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(AuthenticatedComponent, {
        location: { pathname: '/group/7', search: '', hash: '' }
      })
    )
  );

  t.truthy(utils.container.querySelector('[data-inner], [data-pathname]'), '应渲染内层组件');
  t.true(utils.container.innerHTML.indexOf('AUTHED_CONTENT') !== -1);
  t.is(
    utils.container.querySelector('[data-pathname]').getAttribute('data-pathname'),
    '/group/7',
    'location 应透传给内层组件'
  );
  t.is(useMenuStore.getState().curKey, '/group/7', '已登录不应重置菜单高亮');
  utils.unmount();
});

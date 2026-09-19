// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { requireAuthentication } = require('../../../client/components/AuthenticatedComponent');

const CHANGE_MENU_ITEM = 'yapi/menu/CHANGE_MENU_ITEM';

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function makeStore(seedState) {
  const dispatched = [];
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
    return state === undefined ? seedState : state;
  }, seedState);
  return { store, dispatched };
}

// LocationProbe 渲染当前路由 location，用于断言 <Navigate> 的跳转效果
function LocationProbe(props) {
  props.onLocation(useLocation());
  return null;
}

// 未登录：重置菜单高亮 + <Navigate replace> 携带 from 跳转登录页，不渲染内层组件
test.serial('AuthenticatedComponent 未登录时重置菜单并重定向登录页携带 from', async t => {
  const InnerStub = () => React.createElement('div', { 'data-inner': 'rendered' }, 'AUTHED_CONTENT');
  const AuthenticatedComponent = requireAuthentication(InnerStub);
  const { store, dispatched } = makeStore({ user: { isLogin: false } });

  let locations = [];
  const utils = render(
    React.createElement(
      Provider,
      { store },
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
    )
  );

  // 手工传入的 location props 只用于 Navigate 的 from 计算，实际跳转由路由完成
  t.is(utils.container.innerHTML, '', '未登录不应渲染内层组件');
  t.true(
    dispatched.some(a => a.type === CHANGE_MENU_ITEM && a.data === '/'),
    '应派发 changeMenuItem(\'/\') 重置菜单高亮'
  );
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
  const { store } = makeStore({ user: { isLogin: false } });

  let lastLocation = null;
  const utils = render(
    React.createElement(
      Provider,
      { store },
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
    )
  );

  t.is(lastLocation.pathname, '/login');
  t.falsy(lastLocation.state, 'from 为 null 时不应携带 state');
  utils.unmount();
});

// 已登录：透传渲染内层组件，不派发菜单重置
test.serial('AuthenticatedComponent 已登录时透传渲染内层组件', t => {
  const InnerStub = props =>
    React.createElement(
      'div',
      { 'data-pathname': String(props.location && props.location.pathname) },
      'AUTHED_CONTENT'
    );
  const AuthenticatedComponent = requireAuthentication(InnerStub);
  const { store, dispatched } = makeStore({ user: { isLogin: true } });

  const utils = render(
    React.createElement(
      Provider,
      { store },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/group/7'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
        React.createElement(AuthenticatedComponent, {
          location: { pathname: '/group/7', search: '', hash: '' }
        })
      )
    )
  );

  t.truthy(utils.container.querySelector('[data-inner], [data-pathname]'), '应渲染内层组件');
  t.true(utils.container.innerHTML.indexOf('AUTHED_CONTENT') !== -1);
  t.is(
    utils.container.querySelector('[data-pathname]').getAttribute('data-pathname'),
    '/group/7',
    'location 应透传给内层组件'
  );
  t.is(dispatched.length, 0, '已登录不应派发菜单重置');
  utils.unmount();
});

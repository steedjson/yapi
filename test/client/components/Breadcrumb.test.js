// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: BreadcrumbNavigation } = require('../../../client/components/Breadcrumb/Breadcrumb.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// Breadcrumb 用 useSelector 取 state.user.breadcrumb，故 store 只需提供该切片
function renderBreadcrumb(breadcrumb) {
  const store = createStore(function(state) {
    return state || { user: { breadcrumb: breadcrumb } };
  });
  const utils = render(
    <Provider store={store}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BreadcrumbNavigation />
      </MemoryRouter>
    </Provider>
  );
  const items = utils.container.querySelectorAll('.ant-breadcrumb-item');
  return Object.assign({ items }, utils);
}

test.serial('无 href 的条目只渲染文本, 不渲染链接', t => {
  const { container, items } = renderBreadcrumb([{ name: '当前页面' }]);

  t.is(items.length, 1, '应渲染 1 个面包屑条目, 实际 DOM: ' + container.innerHTML);
  t.truthy(screen.getByText('当前页面'), '应渲染条目名称');
  t.is(container.querySelector('a'), null, '无 href 时不应渲染 <a>');
});

test.serial('有 href 的条目渲染为可跳转链接, 且指向该 href', t => {
  const { container, items } = renderBreadcrumb([{ name: '分组A', href: '/group/12' }]);

  t.is(items.length, 1, '实际 DOM: ' + container.innerHTML);

  const link = container.querySelector('a');
  t.truthy(link, '有 href 时应渲染链接');
  t.is(link.getAttribute('href'), '/group/12', '链接应指向条目 href');
  t.is(link.textContent, '分组A', '链接文本应为条目名称');
});

test.serial('多条目混合: 仅带 href 的条目渲染链接, 末项保持纯文本', t => {
  const { container, items } = renderBreadcrumb([
    { name: '分组A', href: '/group/12' },
    { name: '项目B', href: '/project/34' },
    { name: '接口C' }
  ]);

  t.is(items.length, 3, '3 个条目应全部渲染, 实际 DOM: ' + container.innerHTML);

  const links = container.querySelectorAll('a');
  t.is(links.length, 2, '仅前两个条目应渲染链接');
  t.is(links[0].getAttribute('href'), '/group/12');
  t.is(links[1].getAttribute('href'), '/project/34');

  t.deepEqual(
    Array.from(links).map(function(a) {
      return a.textContent;
    }),
    ['分组A', '项目B'],
    '链接文本应保持原顺序'
  );
});

test.serial('空数组与未初始化 breadcrumb 均不抛错且不渲染条目', t => {
  const empty = renderBreadcrumb([]);
  t.is(empty.items.length, 0, '空数组不应渲染条目, 实际 DOM: ' + empty.container.innerHTML);
  t.truthy(empty.container.querySelector('.breadcrumb-container'), '外层容器仍应存在');

  // reducer 初始态 breadcrumb 为 undefined 的等价场景
  t.notThrows(() => {
    const uninitialized = renderBreadcrumb(undefined);
    t.is(uninitialized.items.length, 0, 'undefined 不应渲染条目');
  }, 'breadcrumb 未初始化时不应抛错');
});

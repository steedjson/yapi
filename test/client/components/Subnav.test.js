// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Subnav } = require('../../../client/components/Subnav/Subnav.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// Subnav 内部渲染 react-router 的 Link, 必须包在 Router 内;
// 注意 Subnav 会原地改写两字名称(加空格), 因此每个用例都传新数组
function renderSubnav(data, defaultKey) {
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  const utils = render(
    <MemoryRouter
      initialEntries={['/project/1/interface']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <Subnav data={data} default={defaultKey} />
    </MemoryRouter>
  );
  return Object.assign({ getLocation: () => locationRef }, utils);
}

function makeNavData() {
  return [
    { name: '接口', path: '/project/1/interface' },
    { name: '测试集合', path: '/project/1/col' },
    { name: '设置', path: '/project/1/setting' }
  ];
}

test.serial('传入导航数组正确渲染导航项与链接', t => {
  const { container } = renderSubnav(makeNavData(), '接口');

  const items = container.querySelectorAll('.m-subnav-menu .ant-menu-item');
  t.is(items.length, 3, '应渲染 3 个导航项, 实际 DOM: ' + container.innerHTML);

  const links = container.querySelectorAll('.m-subnav-menu a');
  t.is(links.length, 3, '每个导航项应渲染一个 Link');
  t.deepEqual(
    Array.from(links).map(function(a) {
      return a.getAttribute('href');
    }),
    ['/project/1/interface', '/project/1/col', '/project/1/setting'],
    '链接 href 应与传入 path 一致'
  );
});

test.serial('两字名称自动加空格展示, 其余名称原样渲染', t => {
  const { container } = renderSubnav(makeNavData(), '');

  const links = container.querySelectorAll('.m-subnav-menu a');
  t.is(links[0].textContent, '接 口', '两字名称应在中间加空格');
  t.is(links[1].textContent, '测试集合', '非两字名称保持原样');
  t.is(links[2].textContent, '设 置', '两字名称自动加空格');
});

test.serial('default 命中的导航项带选中态', t => {
  const { container } = renderSubnav(makeNavData(), '接口');

  const selected = container.querySelectorAll('.m-subnav-menu .ant-menu-item-selected');
  t.is(selected.length, 1, '应只有一个选中项');
  t.is(selected[0].textContent, '接 口', '选中的应为 default 对应项');
});

test.serial('点击导航项通过 Link 跳转到对应路径', t => {
  const { container, getLocation } = renderSubnav(makeNavData(), '接口');

  const links = container.querySelectorAll('.m-subnav-menu a');
  fireEvent.click(links[2]);

  t.is(getLocation().pathname, '/project/1/setting', '点击“设置”应导航到对应 path');
});

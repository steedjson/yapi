// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: ErrMsg } = require('../../../client/components/ErrMsg/ErrMsg.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// ErrMsg 迁移后通过 useNavigate 跳转, 必须包在 Router 内;
// LocationProbe 记录当前 location, 用于断言导航结果
function renderErrMsg(ui, initialEntries) {
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  const utils = render(
    <MemoryRouter
      initialEntries={initialEntries || ['/project/1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      {ui}
    </MemoryRouter>
  );
  return Object.assign({ getLocation: () => locationRef }, utils);
}

test.serial('type="noProject" 渲染对应标题与描述文案', t => {
  const { container } = renderErrMsg(<ErrMsg type="noProject" />);

  t.truthy(screen.getByText('该分组还没有项目呢'), '标题应为 noProject 预设文案');
  t.truthy(screen.getByText('请点击右上角添加项目按钮新建项目'), '描述应为 noProject 预设文案');
  t.truthy(container.querySelector('.err-msg .icon'), '应渲染错误图标');
});

test.serial('自定义 title 与 desc 原样渲染', t => {
  renderErrMsg(<ErrMsg title="页面不存在" desc="请检查网址是否正确" />);

  t.truthy(screen.getByText('页面不存在'), '应渲染自定义标题');
  t.truthy(screen.getByText('请检查网址是否正确'), '应渲染自定义描述');
  t.is(screen.queryByText('该分组还没有项目呢'), null, '不应出现任何预设文案');
});

test.serial('type="noChange" 渲染预设文案且操作区为空', t => {
  const { container } = renderErrMsg(<ErrMsg type="noChange" />);

  t.truthy(screen.getByText('没有改动'));
  t.truthy(screen.getByText('该操作未改动 Api 数据'));
  t.is(container.querySelector('.opration').textContent, '', '未传 opration 时操作区为空');
});

test.serial('noFollow 点击“项目广场”后导航到 /group（useNavigate 迁移回归）', t => {
  const { getLocation } = renderErrMsg(<ErrMsg type="noFollow" />);

  t.is(getLocation().pathname, '/project/1', '初始路径不应变化');
  t.truthy(screen.getByText('你还没有关注项目呢'), '标题应为 noFollow 预设文案');

  fireEvent.click(screen.getByText('“项目广场”'));

  t.is(getLocation().pathname, '/group', '点击“项目广场”应导航到 /group');
});

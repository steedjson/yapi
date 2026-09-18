// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import path from 'path';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, stubDefaultExport } from '../../helpers/containers';

// TimeLine 挂载即发网络请求，这里打桩为回显 props 的静态组件：
// 断言对象是容器自身的映射逻辑（store 分组 id → TimeLine typeid），而非 TimeLine 内部实现
function StubTimeTree(props) {
  return React.createElement(
    'section',
    {
      className: 'stub-timeline',
      'data-type': String(props.type),
      'data-typeid': String(props.typeid)
    },
    'STUB_TIMELINE'
  );
}
stubDefaultExport(
  path.resolve(__dirname, '../../../client/components/TimeLine/TimeLine.js'),
  StubTimeTree
);

const { default: GroupLog } = require('../../../client/containers/Group/GroupLog/GroupLog.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function seedState(currGroupId) {
  return { user: { uid: 11 }, group: { currGroup: { _id: currGroupId } } };
}

test.serial('渲染分组动态面板并将 store 当前分组 id 传给 TimeLine', t => {
  const { container } = renderWithProviders(React.createElement(GroupLog), {
    seedState: seedState(101)
  });

  t.truthy(container.querySelector('.g-row'), '应渲染 .g-row 外层容器');
  const panel = container.querySelector('section.news-box.m-panel');
  t.truthy(panel, '应渲染 news-box m-panel 面板');
  const timeline = panel.querySelector('.stub-timeline');
  t.truthy(timeline, '面板内应渲染 TimeLine');
  t.is(timeline.getAttribute('data-type'), 'group', 'TimeLine type 固定为 group');
  t.is(
    timeline.getAttribute('data-typeid'),
    '101',
    'TimeLine typeid 应取自 state.group.currGroup._id'
  );
});

test.serial('store 中分组变化时传给 TimeLine 的 typeid 跟随变化', t => {
  const { container } = renderWithProviders(React.createElement(GroupLog), {
    seedState: seedState(205)
  });
  const timeline = container.querySelector('.stub-timeline');
  t.is(timeline.getAttribute('data-typeid'), '205', 'typeid 应跟随 currGroup._id 变化');
});

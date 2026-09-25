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
// group 切片已迁至 Zustand（批次3）：组件经 useGroupStore 读取，测试直接播种真实 store
const useGroupStore = require('../../../client/store/groupStore').default;

const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  useGroupStore.setState(INITIAL_GROUP_STATE);
});

// currGroup 播种真实 Zustand store（旧 redux group 种子已随迁移失效）
function seedGroupStore(currGroupId) {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup: { _id: currGroupId }
  });
}

test.serial('渲染分组动态面板并将 store 当前分组 id 传给 TimeLine', t => {
  seedGroupStore(101);
  const { container } = renderWithProviders(React.createElement(GroupLog));

  t.truthy(container.querySelector('.g-row'), '应渲染 .g-row 外层容器');
  const panel = container.querySelector('section.news-box.m-panel');
  t.truthy(panel, '应渲染 news-box m-panel 面板');
  const timeline = panel.querySelector('.stub-timeline');
  t.truthy(timeline, '面板内应渲染 TimeLine');
  t.is(timeline.getAttribute('data-type'), 'group', 'TimeLine type 固定为 group');
  t.is(
    timeline.getAttribute('data-typeid'),
    '101',
    'TimeLine typeid 应取自 store 当前分组 _id'
  );
});

test.serial('store 中分组变化时传给 TimeLine 的 typeid 跟随变化', t => {
  seedGroupStore(205);
  const { container } = renderWithProviders(React.createElement(GroupLog));
  const timeline = container.querySelector('.stub-timeline');
  t.is(timeline.getAttribute('data-typeid'), '205', 'typeid 应跟随 currGroup._id 变化');
});

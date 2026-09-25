// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import path from 'path';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, stubDefaultExport } from '../../helpers/containers';

// TimeLine 挂载即发网络请求，这里打桩为回显 props 的静态组件，
// 以断言容器把路由参数 id 转数字后传给 TimeLine 的映射逻辑
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

const { default: Activity } = require('../../../client/containers/Project/Activity/Activity.js');
// 复刻 Application.js 的挂载方式：经兼容 HOC 注入路由 props（迁移后组件改用 useParams）
const withRouter = require('../../../client/withRouter.jsx').default;
const ActivityWithRouter = withRouter(Activity);

// project 切片已迁 Zustand（批次4）：currProject 改经 projectStore 播种；
// interface 切片历史遗留订阅（仅声明未消费）随批次5 迁移移除，种子里不再包含
const { seedProjectStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  resetUserProjectStores();
});

// Redux 已退役（收尾批）：seedState 只做 projectStore 播种，原 redux 种子返回值移除
function seedState() {
  seedProjectStore({ currProject: { _id: 12, basepath: '/mock-path' } });
}

test.serial('渲染项目动态面板: mock 地址/下载链接/TimeLine 参数均来自路由与 store', t => {
  seedState();
  const { container } = renderWithProviders(React.createElement(ActivityWithRouter), {
    routePath: '/project/:id/*',
    initialPath: '/project/12/activity'
  });

  t.truthy(container.querySelector('.g-row'), '应渲染 .g-row 外层容器');
  t.truthy(container.querySelector('section.news-box.m-panel'), '应渲染 news-box m-panel 面板');
  t.is(
    container.querySelector('.Mockurl p').textContent,
    'http://localhost/mock/12/mock-path/yourPath',
    'mock 地址由 currProject 拼接'
  );
  const link = container.querySelector('.Mockurl a');
  t.truthy(link, '应渲染下载 Mock 数据链接');
  t.is(link.textContent, '下载Mock数据');
  t.is(
    link.getAttribute('href'),
    '/api/project/download?project_id=12',
    '下载链接应取路由参数 id'
  );
  const timeline = container.querySelector('.stub-timeline');
  t.truthy(timeline, '面板内应渲染 TimeLine');
  t.is(timeline.getAttribute('data-type'), 'project', 'TimeLine type 固定为 project');
  t.is(timeline.getAttribute('data-typeid'), '12', 'TimeLine typeid 应为路由参数 id 转数字');
});

test.serial('路由参数变化时下载链接与 TimeLine typeid 跟随变化', t => {
  seedState();
  const { container } = renderWithProviders(React.createElement(ActivityWithRouter), {
    routePath: '/project/:id/*',
    initialPath: '/project/77/activity'
  });
  t.is(
    container.querySelector('.Mockurl a').getAttribute('href'),
    '/api/project/download?project_id=77',
    '下载链接应跟随路由参数 id'
  );
  t.is(container.querySelector('.stub-timeline').getAttribute('data-typeid'), '77');
});

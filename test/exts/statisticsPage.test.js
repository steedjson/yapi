// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock } = require('./setup');
// user 切片已迁 Zustand（批次4）：setBreadcrumb 改为断言 userStore.breadcrumb
const { resetUserProjectStores, useUserStore } = require('../helpers/userProjectStores');

const STAT_PATH = '../../exts/yapi-plugin-statistics/statisticsClientPage';

function renderStatistics() {
  return renderWithProviders(React.createElement(require(STAT_PATH).default), {
    routePath: '/statistic',
    initialPath: '/statistic'
  });
}

test.serial.afterEach.always(() => {
  resetUserProjectStores();
});

test.serial('statistics 挂载：派发系统信息面包屑并回填三类统计数据', async t => {
  axiosMock.setRoutes([
    {
      match: '/api/plugin/statismock/count',
      respond: () => ({ errcode: 0, data: { groupCount: 3, projectCount: 8, interfaceCount: 66, interfaceCaseCount: 90 } })
    },
    {
      match: '/api/plugin/statismock/get_system_status',
      respond: () => ({ errcode: 0, data: { mail: 'true', systemName: 'darwin', totalmem: '16', freemem: '8' } })
    },
    {
      match: '/api/plugin/statismock/group_data_statis',
      respond: () => ({ errcode: 0, data: [{ name: 'group1', project: 2, interface: 10, mock: 5 }] })
    },
    {
      match: '/api/plugin/statismock/get',
      respond: () => ({ errcode: 0, data: { mockCount: 12345, mockDateList: [] } })
    }
  ]);
  const { container } = renderStatistics();
  await flushEffects(100);

  // 面包屑 action：setBreadcrumb([{ name: '系统信息' }])（批次4 起写入 userStore）
  t.deepEqual(useUserStore.getState().breadcrumb, [{ name: '系统信息' }]);

  // 四个统计接口均已请求（get 用精确匹配避免误算 get_system_status）
  t.is(axiosMock.filter('/api/plugin/statismock/count').length, 1);
  t.is(axiosMock.filter('/api/plugin/statismock/get_system_status').length, 1);
  t.is(axiosMock.filter('/api/plugin/statismock/group_data_statis').length, 1);
  t.is(axiosMock.filter(/^\/api\/plugin\/statismock\/get$/).length, 1);

  // 数据统计回填（CountOverview + StatisTable）：
  // 前 4 个 gutter-box 为系统状况（StatusOverview），后 4 个为数据统计（CountOverview）
  const boxes = Array.from(container.querySelectorAll('h2.gutter-box')).map(h => h.textContent);
  t.deepEqual(boxes.slice(4, 8), ['3', '8', '66', '90']);
  // 夹具未提供 load 字段，cpu 负载显示为 ' %'
  t.deepEqual(boxes.slice(0, 4), ['darwin', ' %', '8 G / 16 G ', 'true']);
  t.regex(container.textContent, /group1/);

  cleanup();
  cleanupDom();
});

test.serial('statistics 接口 errcode 非 0：保持初始零值且仍写入面包屑', async t => {
  axiosMock.setRoutes([
    { match: '/api/plugin/statismock/count', respond: () => ({ errcode: 400, errmsg: 'no perm' }) },
    { match: '/api/plugin/statismock/get_system_status', respond: () => ({ errcode: 400, errmsg: 'no perm' }) },
    { match: '/api/plugin/statismock/group_data_statis', respond: () => ({ errcode: 400, errmsg: 'no perm' }) },
    { match: '/api/plugin/statismock/get', respond: () => ({ errcode: 400, errmsg: 'no perm' }) }
  ]);
  const { container } = renderStatistics();
  await flushEffects(100);

  t.deepEqual(useUserStore.getState().breadcrumb, [{ name: '系统信息' }]);

  const boxes = Array.from(container.querySelectorAll('h2.gutter-box')).map(h => h.textContent);
  // 数据统计保持初始零值；系统信息保持空串占位。
  // 第 4 项亦为 '0'：缺陷打捞批修正了初始键拼写（interfactCaseCount →
  // interfaceCaseCount），与其余三项卡片一致显示零值
  t.deepEqual(boxes.slice(4, 8), ['0', '0', '0', '0']);
  t.deepEqual(boxes.slice(0, 4), ['', ' %', ' G /  G ', '']);
  // 表格无分组数据行
  t.falsy(container.textContent.includes('group1'));

  cleanup();
  cleanupDom();
});

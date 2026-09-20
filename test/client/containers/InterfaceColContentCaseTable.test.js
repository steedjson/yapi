// InterfaceColContent 子组件 CaseTable（用例表格区）单测：受控渲染 + 事件回调上抛，
// 以及 dnd-kit 行接线的静态证据（可拖拽语义属性）。
// 注意：真正发起一次拖拽会激活 dnd-kit PointerSensor 的 document 级 click 抑制监听，
// jsdom 下 pointer 序列无法完整收尾导致该监听残留、后续 click 全部被 stopPropagation，
// 故拖拽激活用例隔离在 InterfaceColContentCaseTableDnd.test.js 单独进程执行。
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom, renderWithProviders } from '../../helpers/containers';

const {
  default: CaseTable
} = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent/CaseTable.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

const LONG_CASENAME = '用例一（超长用例名称用于验证省略号截断行为的边界用例）';
const LONG_PATH = '/api/base/very/long/interface/path/for/truncation/check';

function makeRow(id, overrides) {
  return Object.assign(
    {
      _id: id,
      id: id,
      casename: '用例' + id,
      path: '/api/base/' + id,
      project_id: 'proj-1',
      interface_id: 'if-' + id,
      test_status: ''
    },
    overrides
  );
}

const ROWS = [
  makeRow('case-1', { casename: LONG_CASENAME, path: LONG_PATH }),
  makeRow('case-2', { test_status: 'loading' }),
  makeRow('case-3'),
  makeRow('case-4'),
  makeRow('case-5')
];

const REPORT_MAP = {
  'case-1': { code: 0, url: 'http://dev.example.com/api/base/case-1' },
  'case-3': { code: 400, url: 'http://dev.example.com/api/base/case-3' },
  'case-4': { code: 1, url: 'http://dev.example.com/api/base/case-4' }
};

function renderTable(overrides) {
  const calls = [];
  const props = Object.assign(
    {
      rows: ROWS,
      reportMap: REPORT_MAP,
      currProjectId: 'proj-1',
      onOpenReport: id => calls.push(['openReport', id]),
      onDragOver: () => calls.push(['dragOver']),
      onDragEnd: () => calls.push(['dragEnd'])
    },
    overrides
  );
  const utils = renderWithProviders(<CaseTable {...props} />, {
    initialPath: '/project/proj-1/interface/col/1'
  });
  return Object.assign({ calls }, utils);
}

function tableRows(container) {
  return Array.from(container.querySelectorAll('.interface-col-table tbody tr'));
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').trim() === text
  )[0];
}

test.serial('受控渲染：每个用例渲染为一行 tr（SortableRow 未引入包装元素）', t => {
  const { container } = renderTable();

  const trs = tableRows(container);
  t.is(trs.length, 5, '应渲染 5 行');
  t.deepEqual(
    trs.map(tr => tr.getAttribute('data-row-key')),
    ['case-1', 'case-2', 'case-3', 'case-4', 'case-5'],
    '行 key 应取 rowKey=id'
  );
  t.true(
    trs.every(tr => tr.tagName === 'TR'),
    '行元素必须是 tr（DndContext/SortableContext 不产出包装 DOM）'
  );
});

test.serial('dnd-kit 接线不回退：行由 useSortable 接管（可拖拽语义属性齐备）', t => {
  const { container } = renderTable();

  const trs = tableRows(container);
  t.deepEqual(
    trs.map(tr => tr.getAttribute('aria-roledescription')),
    ['sortable', 'sortable', 'sortable', 'sortable', 'sortable'],
    '每行应带 dnd-kit 的可排序语义属性（SortableRow 生效）'
  );
  t.true(
    trs.every(tr => tr.getAttribute('role') === 'button' && tr.getAttribute('tabindex') === '0'),
    '每行应可聚焦（dnd-kit listeners 已接线）'
  );
  t.true(
    trs.every(tr => (tr.getAttribute('aria-describedby') || '').indexOf('DndDescribedBy') === 0),
    'DndContext 的拖拽说明 id 已注入（DndContext 包裹生效）'
  );
});

test.serial('受控渲染：用例名称与接口路径按记录渲染，超长文本截断为 23 字符', t => {
  const { container } = renderTable();

  const firstRow = tableRows(container)[0];
  const nameLink = firstRow.querySelectorAll('td')[0].querySelector('a');
  t.is(nameLink.getAttribute('href'), '/project/proj-1/interface/case/case-1', '名称链接指向用例详情');
  t.is(nameLink.textContent, LONG_CASENAME.substr(0, 20) + '...', '超长用例名称截断规则不变');
  t.is(nameLink.textContent.length, 23, '截断后长度为 20 + 3');

  const pathLink = firstRow.querySelectorAll('td')[3].querySelector('a');
  t.is(
    pathLink.getAttribute('href'),
    '/project/proj-1/interface/api/if-case-1',
    '接口路径链接按 record.project_id/interface_id 拼装'
  );
  t.is(pathLink.textContent, LONG_PATH.substr(0, 20) + '...', '超长接口路径截断规则不变');

  const secondRow = tableRows(container)[1];
  t.is(secondRow.querySelectorAll('td')[0].querySelector('a').textContent, '用例case-2', '短名称不截断');
  t.is(secondRow.querySelectorAll('td')[1].textContent, 'case-2', 'Key 列直接展示 _id');
});

test.serial('受控渲染：状态列按 test_status / reportMap 分支渲染图标', t => {
  const { container } = renderTable();

  const trs = tableRows(container);
  const statusCell = tr => tr.querySelectorAll('td')[2];

  t.is(statusCell(trs[1]).querySelectorAll('.ant-spin').length, 1, 'test_status=loading 渲染 Spin');
  t.is(
    statusCell(trs[0]).querySelectorAll('[aria-label="check-circle"]').length,
    1,
    '报告 code=0 渲染 Pass 图标'
  );
  t.is(
    statusCell(trs[2]).querySelectorAll('[aria-label="info-circle"]').length,
    1,
    '报告 code=400 渲染请求异常图标'
  );
  t.is(
    statusCell(trs[3]).querySelectorAll('[aria-label="exclamation-circle"]').length,
    1,
    '报告 code=1 渲染验证失败图标'
  );
  t.is(
    statusCell(trs[4]).querySelectorAll('[aria-label="check-circle"]').length,
    1,
    '无报告时走默认分支（Pass 图标）'
  );
});

test.serial('受控渲染 + 事件上抛：仅存在报告的用例渲染测试报告按钮', t => {
  const { container, calls } = renderTable();

  const buttons = Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').trim() === '测试报告'
  );
  t.is(buttons.length, 3, '3 条有报告的用例各渲染一个报告按钮');

  const trs = tableRows(container);
  t.is(trs[1].querySelectorAll('button').length, 0, '无报告的用例不渲染按钮');
  t.truthy(
    trs[0].querySelector('.interface-col-table-action'),
    '报告按钮容器类名保持 interface-col-table-action'
  );

  fireEvent.click(buttonByText(container, '测试报告'));
  t.deepEqual(calls, [['openReport', 'case-1']], '点击报告按钮上抛 record.id');
});

test.serial('受控渲染：空 rows 时表格无数据行且不抛错', t => {
  const { container } = renderTable({ rows: [] });

  t.is(container.querySelectorAll('.interface-col-table tbody tr.ant-table-row').length, 0);
  t.is(container.querySelectorAll('button').length, 0);
  t.truthy(container.querySelector('.ant-table-placeholder, .ant-empty'), '渲染空态占位');
});
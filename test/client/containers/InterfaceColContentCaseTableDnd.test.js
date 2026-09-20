// InterfaceColContent 子组件 CaseTable 的「拖拽语义不回退」用例，单独一个测试文件执行。
//
// 为什么隔离：本用例真实激活 dnd-kit PointerSensor（pointerdown → 越过 5px 激活距离），
// 传感器一旦激活就会在 document 上挂 capture 阶段 click 抑制监听（activationConstraints
// 达标后阻止拖拽后的 click 误触）。jsdom 没有真实指针与布局，pointer 序列无法完整收尾，
// 该监听会残留在本进程的 document 上，导致同进程后续所有 click 被 stopPropagation 吞掉。
// 因此本用例必须与本文件以外的用例隔离（AVA 每个测试文件独立进程），且不得在本文件内
// 追加其它用例。
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

const ROWS = [
  {
    _id: 'case-1',
    id: 'case-1',
    casename: '用例一',
    path: '/api/base/one',
    project_id: 'proj-1',
    interface_id: 'if-1',
    test_status: ''
  },
  {
    _id: 'case-2',
    id: 'case-2',
    casename: '用例二',
    path: '/api/base/two',
    project_id: 'proj-1',
    interface_id: 'if-2',
    test_status: ''
  }
];

test.serial('拖拽语义：pointer 拖拽经 dnd-kit 到达 onDragEnd，active.id 取 data-row-key', t => {
  const events = [];
  const { container } = renderWithProviders(
    <CaseTable
      rows={ROWS}
      reportMap={{}}
      currProjectId="proj-1"
      onOpenReport={() => {}}
      onDragOver={e => events.push(['dragOver', e.active && e.active.id])}
      onDragEnd={e =>
        events.push(['dragEnd', e.active && e.active.id, e.over && e.over && e.over.id])
      }
    />,
    { initialPath: '/project/proj-1/interface/col/1' }
  );

  const trs = Array.from(container.querySelectorAll('.interface-col-table tbody tr'));
  t.is(trs.length, 2, '前置条件：渲染 2 行');

  // PointerSensor：pointerdown 后越过 5px 激活距离才进入拖拽
  fireEvent.pointerDown(trs[0], { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(trs[0], { button: 0, isPrimary: true, pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerMove(trs[1], { button: 0, isPrimary: true, pointerId: 1, clientX: 40, clientY: 60 });
  fireEvent.pointerUp(trs[1], { button: 0, isPrimary: true, pointerId: 1, clientX: 40, clientY: 60 });

  const dragEnds = events.filter(e => e[0] === 'dragEnd');
  t.is(dragEnds.length, 1, '拖拽结束应恰好回调一次 onDragEnd，实际: ' + JSON.stringify(events));
  t.is(
    dragEnds[0][1],
    'case-1',
    'active.id 应等于被拖拽行的 data-row-key（SortableRow 的 useSortable id 接线未回退）'
  );
  t.is(
    dragEnds[0][2],
    null,
    'jsdom 无布局测量，over 为 null（等价真实环境无有效落点时的行为，DndContext 仍完成一次拖拽周期）'
  );
});
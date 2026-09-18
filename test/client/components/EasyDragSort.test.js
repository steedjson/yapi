// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: EasyDragSort } = require('../../../client/components/EasyDragSort/EasyDragSort.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 渲染普通（整行可拖拽）模式，记录 onChange/onDragEnd 调用
function renderPlainSort(items, overrides) {
  const changes = [];
  const dragEnds = [];
  const utils = render(
    <EasyDragSort
      data={() => items}
      onChange={newValue => changes.push(newValue)}
      onDragEnd={() => dragEnds.push(true)}
      {...overrides}
    >
      {items.map(item => (
        <div key={item} className="sort-item">
          {item}
        </div>
      ))}
    </EasyDragSort>
  );
  const children = Array.from(utils.container.querySelectorAll('.sort-item'));
  return Object.assign({ changes, dragEnds, children }, utils);
}

test.serial('每个列表子元素带 data-ref 标记且整行可拖拽', t => {
  const { container, children } = renderPlainSort(['a', 'b', 'c']);

  t.is(children.length, 3, '应渲染 3 个子元素, 实际 DOM: ' + container.innerHTML);
  t.deepEqual(
    children.map(el => el.getAttribute('data-ref')),
    ['x0', 'x1', 'x2'],
    '子元素应带 data-ref 标记'
  );
  t.deepEqual(
    children.map(el => el.getAttribute('draggable')),
    ['true', 'true', 'true'],
    '未配置 onlyChild 时整行 draggable=true'
  );
  t.deepEqual(
    children.map(el => el.textContent),
    ['a', 'b', 'c'],
    '子元素内容保持原序渲染'
  );
});

test.serial('拖拽开始后进入另一行: 按新顺序触发 onChange', async t => {
  const items = ['a', 'b', 'c'];
  const { changes, children } = renderPlainSort(items);

  fireEvent.dragStart(children[0]);
  fireEvent.dragEnter(children[2]);
  await act(async () => {
    await sleep(10);
  });

  t.deepEqual(changes, [['b', 'c', 'a']], '应把 from=0 移动到 to=2 后的新数组交给 onChange');
});

test.serial('onDragEnter 更新拖拽游标: 连续进入多行按最终位置计算', async t => {
  const items = ['a', 'b', 'c'];
  const { changes, children } = renderPlainSort(items);

  fireEvent.dragStart(children[0]);
  fireEvent.dragEnter(children[1]);
  fireEvent.dragEnter(children[2]);
  await act(async () => {
    await sleep(10);
  });

  // 第一跳 from=0,to=1；第二跳的 from 是上一次进入的 index=1（父组件未重排时 data() 仍为原数组）
  t.deepEqual(changes, [['b', 'a', 'c'], ['a', 'c', 'b']], '游标应随每次 dragEnter 更新');
});

test.serial('拖拽进入自身不触发 onChange', async t => {
  const { changes, children } = renderPlainSort(['a', 'b']);

  fireEvent.dragStart(children[0]);
  fireEvent.dragEnter(children[0]);

  t.deepEqual(changes, [], 'from === to 时不应触发 onChange');
});

test.serial('拖拽结束触发 onDragEnd', async t => {
  const { dragEnds, children } = renderPlainSort(['a', 'b']);

  fireEvent.dragEnd(children[0]);

  t.deepEqual(dragEnds, [true], '应回调 onDragEnd');
});

// 渲染 onlyChild（拖拽柄）模式：行内以带 onlyChild 属性的元素作为拖拽柄
function renderHandleSort(items) {
  const changes = [];
  const utils = render(
    <EasyDragSort data={() => items} onChange={newValue => changes.push(newValue)} onlyChild="drag_handle">
      {items.map(item => (
        <div key={item} className="sort-row">
          {/* 自定义属性用 spread 注入，避开 react/no-unknown-property 对字面属性名的检查 */}
          <span className="handle" {...{ drag_handle: 'true' }}>
            {item}
          </span>
          <span className="body">{item}</span>
        </div>
      ))}
    </EasyDragSort>
  );
  const rows = Array.from(utils.container.querySelectorAll('.sort-row'));
  return Object.assign({ changes, rows }, utils);
}

test.serial('onlyChild 模式: 行初始不可拖拽但带 data-ref', t => {
  const { rows } = renderHandleSort(['a', 'b']);

  t.deepEqual(
    rows.map(el => el.getAttribute('data-ref')),
    ['x0', 'x1'],
    '行元素应带 data-ref'
  );
  t.deepEqual(
    rows.map(el => el.getAttribute('draggable')),
    ['false', 'false'],
    'onlyChild 模式行初始 draggable=false'
  );
});

test.serial('onlyChild 模式: 在拖拽柄上按下鼠标后行变为可拖拽（替代 findDOMNode 方案）', t => {
  const { rows } = renderHandleSort(['a', 'b']);

  fireEvent.mouseDown(rows[0].querySelector('.handle'));
  t.is(rows[0].draggable, true, '从拖拽柄按下应把所在行 draggable 置为 true');

  fireEvent.mouseDown(rows[1].querySelector('.body'));
  t.is(rows[1].draggable, false, '从非拖拽柄按下应保持 draggable=false');
});

test.serial('onlyChild 模式: 在行空白处按下鼠标不改变可拖拽状态', t => {
  const { rows } = renderHandleSort(['a', 'b']);

  fireEvent.mouseDown(rows[0].querySelector('.handle'));
  t.is(rows[0].draggable, true, '前置: 拖拽柄按下后行可拖拽');

  fireEvent.mouseDown(rows[0]);
  t.is(rows[0].draggable, false, '直接在行上按下（目标无 onlyChild 属性）应置回 false');
});

test.serial('onlyChild 模式: 拖拽逻辑与普通模式一致', async t => {
  const items = ['a', 'b', 'c'];
  const { changes, rows } = renderHandleSort(items);

  fireEvent.dragStart(rows[0]);
  fireEvent.dragEnter(rows[2]);
  await act(async () => {
    await sleep(10);
  });

  t.deepEqual(changes, [['b', 'c', 'a']], 'onlyChild 模式同样按新顺序触发 onChange');
});

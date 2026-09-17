// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Label } = require('../../../client/components/Label/Label.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// onChange 调用记录与重渲染工具：desc 覆盖传入以支持属性变化场景
function renderLabel(desc) {
  const calls = [];
  const props = { desc: desc, onChange: value => calls.push(value) };
  const utils = render(<Label {...props} />);
  return Object.assign(
    {
      calls: calls,
      rerenderWithDesc: function(newDesc) {
        utils.rerender(<Label {...props} desc={newDesc} />);
      }
    },
    utils
  );
}

test.serial('默认展示 desc 文本与编辑图标, 不渲染输入框', t => {
  const { container } = renderLabel('接口简介');

  t.truthy(screen.getByText('接口简介'), '应展示 desc 文本, 实际 DOM: ' + container.innerHTML);
  const editIcon = container.querySelector('.anticon-edit');
  t.truthy(editIcon, '应渲染编辑图标');
  t.truthy(
    editIcon.className.indexOf('interface-delete-icon') !== -1,
    '编辑图标应带 interface-delete-icon 类'
  );
  t.is(container.querySelector('.ant-input'), null, '默认不应渲染输入框');
});

test.serial('desc 为空时不渲染任何内容', t => {
  const { container } = renderLabel('');

  t.is(container.querySelector('.component-label'), null, 'desc 为空不应渲染组件主体');
});

test.serial('点击编辑展开输入框, 修改后点确定触发 onChange 并收起', t => {
  const { container, calls } = renderLabel('接口简介');

  fireEvent.click(container.querySelector('.anticon-edit'));
  const input = container.querySelector('.ant-input');
  t.truthy(input, '点击编辑图标应展开输入框');
  t.is(input.value, '接口简介', '输入框默认值应为原 desc');

  fireEvent.change(input, { target: { value: '新的简介' } });
  fireEvent.click(container.querySelector('.anticon-check'));

  t.deepEqual(calls, ['新的简介'], '点确定应把修改后的值传给 onChange');
  t.is(container.querySelector('.ant-input'), null, '确定后应收起输入框');
});

test.serial('点击取消收起输入框且不触发 onChange', t => {
  const { container, calls } = renderLabel('接口简介');

  fireEvent.click(container.querySelector('.anticon-edit'));
  t.truthy(container.querySelector('.ant-input'));

  fireEvent.change(container.querySelector('.ant-input'), { target: { value: '改了一半' } });
  fireEvent.click(container.querySelector('.anticon-close'));

  t.deepEqual(calls, [], '取消不得触发 onChange');
  t.is(container.querySelector('.ant-input'), null, '取消后应收起输入框');
  t.truthy(container.querySelector('.anticon-edit'), '收起后回到展示态');
});

test.serial('desc 变化时收起编辑态（useEffect 替代旧 cWRP 的回归）', t => {
  const { container, rerenderWithDesc } = renderLabel('旧简介');

  fireEvent.click(container.querySelector('.anticon-edit'));
  t.truthy(container.querySelector('.ant-input'), '前置: 编辑态已展开');

  rerenderWithDesc('新简介');

  t.is(container.querySelector('.ant-input'), null, 'desc 变化后应自动收起输入框');
  t.truthy(screen.getByText('新简介'), '应展示新的 desc');
});

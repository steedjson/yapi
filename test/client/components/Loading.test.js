// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Loading } = require('../../../client/components/Loading/Loading.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function getLoadingBox(container) {
  return container.querySelector('.loading-box');
}

test.serial('visible 缺省时隐藏 (display: none)', t => {
  const { container } = render(<Loading />);

  const box = getLoadingBox(container);
  t.truthy(box, '应渲染 .loading-box 容器, 实际 DOM: ' + container.innerHTML);
  t.is(box.style.display, 'none', '缺省 visible 不应展示遮罩');
});

test.serial('visible=false 时隐藏, visible=true 时展示 (display: flex)', t => {
  const hidden = render(<Loading visible={false} />);
  t.is(getLoadingBox(hidden.container).style.display, 'none');
  hidden.unmount();

  const shown = render(<Loading visible />);
  t.is(getLoadingBox(shown.container).style.display, 'flex', 'visible=true 应以 flex 展示');
});

test.serial('visible 由 false 更新为 true 时立即同步展示', t => {
  // 旧实现依赖 UNSAFE_componentWillReceiveProps 把 props.visible 同步进 state.show,
  // 现由渲染期直接驱动, 属性变化应立即反映到样式
  const { container, rerender } = render(<Loading visible={false} />);
  t.is(getLoadingBox(container).style.display, 'none');

  rerender(<Loading visible />);
  t.is(getLoadingBox(container).style.display, 'flex');

  rerender(<Loading visible={false} />);
  t.is(getLoadingBox(container).style.display, 'none');
});

test.serial('内部结构完整: 背景层与 8 个动画子元素', t => {
  const { container } = render(<Loading visible />);

  t.truthy(container.querySelector('.loading-box-bg'), '应渲染背景层');
  const bars = container.querySelectorAll('.loading-box-inner > div');
  t.is(bars.length, 8, '应渲染 8 个动画子元素');
});

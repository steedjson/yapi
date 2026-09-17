import '../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

test.afterEach.always(() => {
  cleanup();
});

test('smoke: jsdom 环境可用且能渲染 React 组件并断言文本', t => {
  function Hello(props) {
    return <span data-testid="greeting">hello {props.name}</span>;
  }

  render(<Hello name="yapi" />);

  t.is(screen.getByTestId('greeting').textContent, 'hello yapi');
  t.is(document.body.querySelectorAll('[data-testid="greeting"]').length, 1);
});

test('smoke: 未打桩的网络请求被测试网络拦截器捕获', t => {
  // XMLHttpRequest 由 jsdom-setup 挂到 global 并已布防，open 应立即抛错
  const error = t.throws(() => {
    new XMLHttpRequest().open('GET', 'https://example.com');
  });
  t.regex(error.message, /\[测试网络拦截\]/);
});

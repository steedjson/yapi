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

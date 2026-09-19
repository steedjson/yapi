// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders } from '../../helpers/containers';

const { default: LoginWrap } = require('../../../client/containers/Login/LoginWrap.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('渲染登录/注册 Tabs 外壳: 默认激活 key 与登录表单', t => {
  const { container } = renderWithProviders(React.createElement(LoginWrap), {
    seedState: { user: { loginWrapActiveKey: '1', canRegister: true } }
  });

  const tabs = container.querySelectorAll('.ant-tabs-tab');
  t.is(tabs.length, 2, '应渲染 登录/注册 两个 Tab');
  t.is(tabs[0].textContent, '登录');
  t.is(tabs[1].textContent, '注册');
  t.truthy(container.querySelector('.login-form'), '应带 login-form 类名');
  t.is(
    container.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn').textContent,
    '登录',
    'loginWrapActiveKey=1 时默认激活登录 Tab'
  );
  t.truthy(
    container.querySelector('.ant-tabs-tabpane-active form input#email'),
    '激活面板应渲染登录表单 Email 输入框'
  );
});

test.serial('canRegister=false 时注册 Tab 展示禁用注册提示而非注册表单', t => {
  const { container } = renderWithProviders(React.createElement(LoginWrap), {
    seedState: { user: { loginWrapActiveKey: '2', canRegister: false } }
  });

  t.is(
    container.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn').textContent,
    '注册',
    'loginWrapActiveKey=2 时默认激活注册 Tab'
  );
  const activePanel = container.querySelector('.ant-tabs-tabpane-active');
  t.is(
    activePanel.textContent.trim(),
    '管理员已禁止注册，请联系管理员',
    '禁止注册时应展示提示文案'
  );
  t.is(activePanel.querySelector('form'), null, '禁止注册时不应渲染注册表单');
});

test.serial('canRegister=true 时注册 Tab 渲染注册表单', t => {
  const { container } = renderWithProviders(React.createElement(LoginWrap), {
    seedState: { user: { loginWrapActiveKey: '2', canRegister: true } }
  });

  const activePanel = container.querySelector('.ant-tabs-tabpane-active');
  t.truthy(activePanel.querySelector('form'), '允许注册时应渲染注册表单');
  t.truthy(activePanel.querySelector('input[placeholder="Username"]'), '应渲染用户名输入');
  t.is(activePanel.querySelectorAll('input[type="password"]').length, 2, '应渲染两个密码输入');
});

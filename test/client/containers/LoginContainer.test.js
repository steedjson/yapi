// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders } from '../../helpers/containers';

const { default: LoginContainer } = require('../../../client/containers/Login/LoginContainer.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('渲染登录页: 背景遮罩/标题/Logo/卡片/登录表单结构', t => {
  const { container } = renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '1', canRegister: true } }
  });

  t.truthy(container.querySelector('.g-body.login-body'), '应渲染登录页 body');
  t.is(container.querySelectorAll('.m-bg-mask').length, 4, '应渲染 4 层背景遮罩');
  t.truthy(container.querySelector('.m-bg-mask.m-bg-mask3'), '遮罩应含 mask0~mask3 分层');
  t.is(container.querySelector('.login-title').textContent, 'YAPI', '应渲染 YAPI 标题');
  const logo = container.querySelector('.login-logo svg');
  t.truthy(logo, '应渲染 LogoSVG');
  t.is(logo.getAttribute('width'), '100px', 'Logo 尺寸应为 100px');
  t.truthy(container.querySelector('.card-login'), '应渲染 antd Card 登录卡片');

  const tabs = container.querySelectorAll('.ant-tabs-tab');
  t.is(tabs.length, 2, '应渲染 登录/注册 两个 Tab');
  t.is(tabs[0].textContent, '登录');
  t.is(tabs[1].textContent, '注册');
  t.truthy(
    container.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn'),
    '默认高亮 loginWrapActiveKey 对应 Tab'
  );
  t.is(
    container.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn').textContent,
    '登录',
    'loginWrapActiveKey=1 时默认激活登录 Tab'
  );
  t.truthy(container.querySelector('form input#email'), '登录表单应渲染 Email 输入框');
  t.truthy(container.querySelector('form input[type="password"]'), '登录表单应渲染密码输入框');
  t.truthy(
    Array.from(container.querySelectorAll('form button')).find(b =>
      b.textContent.indexOf('登 录') > -1
    ),
    '登录表单应渲染提交按钮'
  );
});

test.serial('canRegister=false 时注册 Tab 展示禁用注册提示', t => {
  const { container } = renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '2', canRegister: false } }
  });

  t.is(
    container.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn').textContent,
    '注册',
    'loginWrapActiveKey=2 时默认激活注册 Tab'
  );
  const activePanel = container.querySelector('.ant-tabs-tabpane-active');
  t.truthy(activePanel, '注册面板应处于激活态');
  t.is(
    activePanel.textContent.trim(),
    '管理员已禁止注册，请联系管理员',
    '禁止注册时注册面板应展示提示文案'
  );
  t.is(activePanel.querySelector('form'), null, '禁止注册时不应渲染注册表单');
});

test.serial('canRegister=true 时注册 Tab 渲染注册表单', t => {
  const { container } = renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '2', canRegister: true } }
  });

  const activePanel = container.querySelector('.ant-tabs-tabpane-active');
  t.truthy(activePanel, '注册面板应处于激活态');
  t.truthy(activePanel.querySelector('form'), '允许注册时应渲染注册表单');
  t.truthy(activePanel.querySelector('input[placeholder="Username"]'), '注册表单应渲染用户名输入');
  t.truthy(activePanel.querySelector('input[placeholder="Email"]'), '注册表单应渲染邮箱输入');
  t.is(activePanel.querySelectorAll('input[type="password"]').length, 2, '注册表单应渲染两个密码输入');
});

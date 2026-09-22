// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');
// 与 NewsTimeline.js 共享同一模块实例（babel CJS 转译后命中同一 require 缓存）：
// news 切片已迁 Zustand
const { default: useNewsStore } = require('../../../client/store/newsStore');

const { default: News } = require('../../../client/containers/News/News.js');

// News 挂载即经子组件 NewsTimeline 请求 /api/log/list（axios 为 CJS 单例）
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  // news 已迁 Zustand：模块级单例，用例间复位避免状态串场
  useNewsStore.setState({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 });
});

test.serial('挂载渲染动态页结构（Subnav/Mock地址/下载按钮/动态列表子组件）', async t => {
  const logRequests = [];
  axios.get = (url, config) => {
    if (url === '/api/log/list') {
      logRequests.push({ url, params: config && config.params });
      return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
    }
    return Promise.reject(new Error('unexpected request: ' + url));
  };

  const { container } = renderWithProviders(React.createElement(News), {
    // news 切片已迁 Zustand，Redux 种子中不再包含（动态数据由挂载期 fetchMock 经 store 收敛）
    seedState: { user: { uid: 11 } }
  });
  await flushEffects();

  // Subnav：默认选中「动态」，三个导航项
  // 注：旧实现将两位标题就地改写为「动 态」（中间加空格），Link 文案随之带空格
  t.truthy(container.querySelector('.m-subnav'), '应渲染 Subnav 导航');
  const navLinks = Array.from(container.querySelectorAll('.m-subnav a')).map(a => a.textContent);
  t.deepEqual(navLinks, ['动 态', '测 试', '设 置'], 'Subnav 应渲染三个导航项');
  const selected = container.querySelector('.m-subnav .ant-menu-item-selected');
  t.truthy(selected, '应默认选中「动态」项');
  t.is(selected.textContent, '动 态', '选中项应为「动态」');

  // 动态面板骨架
  t.truthy(container.querySelector('section.news-box.m-panel'), '应渲染动态面板');
  t.truthy(container.querySelector('.news-box .logHead'), '面板应包含 logHead 区块');

  // Mock 地址区（旧 mockURL state 恒为空串，直接展示空值）
  const mockUrlBlock = container.querySelector('.news-box .Mockurl');
  t.truthy(mockUrlBlock, '应渲染 Mockurl 区块');
  t.is(mockUrlBlock.querySelector('span').textContent, 'Mock地址：', '应展示 Mock地址 标签');
  t.is(mockUrlBlock.querySelector('p').textContent, '', 'mockURL 恒为空串');
  t.truthy(
    Array.from(mockUrlBlock.querySelectorAll('button')).find(
      button => button.textContent === '下载Mock数据'
    ),
    '应渲染下载Mock数据按钮'
  );

  // 子组件 NewsTimeline 挂载即拉取动态
  t.is(logRequests.length, 1, '挂载应经 NewsTimeline 发起一次 /api/log/list 请求');
  t.is(logRequests[0].params.typeid, 21, 'NewsTimeline typeid 固定为 21');
  t.truthy(
    container.querySelector('.news-box .breadcrumb-container'),
    'logHead 应渲染 Breadcrumb'
  );
});

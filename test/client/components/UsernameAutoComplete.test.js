// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: UsernameAutoComplete } = require('../../../client/components/UsernameAutoComplete/UsernameAutoComplete.js');

// handleSearch 内部直接调用 axios,测试必须拦截(axios 为 CJS 单例,
// 生产代码调用时才读取 .get,替换属性即可生效)
const originalAxiosGet = axios.get;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 渲染组件并记录 callbackState 调用
function renderAutoComplete() {
  const selected = [];
  const utils = render(
    <UsernameAutoComplete callbackState={value => selected.push(value)} />
  );
  return Object.assign({ selected }, utils);
}

function getSearchInput(container) {
  return container.querySelector('.ant-select-selection-search-input');
}

function getOptions(container) {
  return Array.from(container.ownerDocument.querySelectorAll('.ant-select-item-option'));
}

// antd 下拉默认挂载在 document.body 而非组件容器内
function getDropdownText(container) {
  const dropdown = container.ownerDocument.querySelector('.ant-select-dropdown');
  return dropdown ? dropdown.textContent : '';
}

// 打开下拉并输入关键字触发 onSearch
async function typeKeyword(container, keyword) {
  fireEvent.mouseDown(getSearchInput(container));
  fireEvent.change(getSearchInput(container), { target: { value: keyword } });
  await act(async () => {
    await sleep(30);
  });
}

test.serial('渲染多选用户名选择框与占位文案', t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [] } });
  const { container } = renderAutoComplete();

  const select = container.querySelector('.ant-select');
  t.truthy(select, '应渲染 antd Select, 实际 DOM: ' + container.innerHTML);
  t.truthy(select.className.indexOf('ant-select-multiple') !== -1, '应为多选模式');
  t.is(container.querySelector('.ant-select-selection-placeholder').textContent, '请输入用户名');
  t.truthy(getSearchInput(container), '应渲染搜索输入框');
});

test.serial('输入关键字发起 /api/user/search 搜索并携带 q 参数', async t => {
  const getCalls = [];
  axios.get = (url, config) => {
    getCalls.push({ url: url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: [] } });
  };
  const { container } = renderAutoComplete();

  await typeKeyword(container, 'al');

  t.deepEqual(
    getCalls,
    [{ url: '/api/user/search', params: { q: 'al' } }],
    '应按关键字请求用户搜索接口'
  );
});

test.serial('请求进行中下拉展示 loading 提示，请求返回后渲染候选用户', async t => {
  let resolveSearch;
  axios.get = () => new Promise(resolve => (resolveSearch = resolve));
  const { container } = renderAutoComplete();

  fireEvent.mouseDown(getSearchInput(container));
  fireEvent.change(getSearchInput(container), { target: { value: 'al' } });
  await act(async () => {
    await sleep(10);
  });

  t.truthy(
    getDropdownText(container).indexOf('当前用户不存在') !== -1,
    'fetching 期间应展示 notFoundContent 提示'
  );

  await act(async () => {
    resolveSearch({
      data: {
        errcode: 0,
        data: [
          { uid: 11, username: 'allen' },
          { uid: 12, username: 'bob' }
        ]
      }
    });
    await sleep(20);
  });

  const options = getOptions(container);
  t.deepEqual(
    options.map(option => option.textContent),
    ['allen', 'bob'],
    '应按接口返回渲染候选用户'
  );
  t.is(
    getDropdownText(container).indexOf('当前用户不存在'),
    -1,
    '有候选用户时不应再展示不存在提示'
  );
});

test.serial('接口返回空数据时不渲染候选项', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: null } });
  const { container } = renderAutoComplete();

  await typeKeyword(container, 'nobody');

  t.is(getOptions(container).length, 0, 'data 为空不应渲染候选项');
});

test.serial('选中候选用户后触发 callbackState 并清空候选项', async t => {
  axios.get = () =>
    Promise.resolve({
      data: {
        errcode: 0,
        data: [
          { uid: 11, username: 'allen' },
          { uid: 12, username: 'bob' }
        ]
      }
    });
  const { container, selected } = renderAutoComplete();

  await typeKeyword(container, 'al');
  const allen = getOptions(container).find(option => option.textContent === 'allen');
  t.truthy(allen, '前置: 候选用户已渲染');

  fireEvent.mouseDown(allen);
  fireEvent.click(allen);
  await act(async () => {
    await sleep(20);
  });

  t.deepEqual(selected, [['11']], '应把选中用户的 id（字符串数组）交给 callbackState');
  t.is(getOptions(container).length, 0, '选中后应清空候选项');
  t.truthy(
    screen.getByText('allen'),
    '选中用户应以标签形式回显在选择框中'
  );
});

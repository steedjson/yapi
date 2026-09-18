// jsdom 环境必须在任何生产代码之前装载
import '../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { cleanupDom, flushEffects } from '../helpers/containers';

const axios = require('axios');
const { createStore, applyMiddleware } = require('redux');
const promiseMiddleware = require('redux-promise');
const { Provider } = require('react-redux');

// GroupSetting.js 引入 SCSS，经 jsdom-setup 的资源 stub 后可被 Node 端 AVA 加载
const { default: GroupSetting } = require('../../client/containers/Group/GroupSetting/GroupSetting.js');
const groupReducer = require('../../client/reducer/modules/group.js').default;

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

const GROUP_A = {
  _id: 71,
  group_name: 'A组',
  group_desc: '这是A组的描述',
  type: 'public',
  role: 'owner',
  custom_field1: { name: '渠道', enable: true }
};

function seedState(userRole) {
  return {
    group: {
      currGroup: GROUP_A,
      groupList: [GROUP_A],
      role: 'owner'
    },
    user: { role: userRole }
  };
}

// group 切片走真实 reducer（SET_CURR_GROUP 等真实生效），user 切片固定
function renderGroupSetting(userRole) {
  const seed = seedState(userRole);
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    if (state === undefined) state = seed;
    return { group: groupReducer(state.group, action), user: state.user };
  }, seed);
  return render(
    React.createElement(
      Provider,
      { store },
      React.createElement(GroupSetting)
    )
  );
}

async function toggleDanger(utils) {
  const btn = Array.from(utils.container.querySelectorAll('button')).find(
    b => b.textContent.indexOf('查 看') === 0
  );
  fireEvent.click(btn);
  await flushEffects();
}

test.serial('GroupSetting 渲染：admin 首帧以当前分组回填表单并展示危险操作入口', async t => {
  const { container } = renderGroupSetting('admin');

  const nameInput = container.querySelector('input[placeholder="请输入分组名称"]');
  const descArea = container.querySelector('textarea[placeholder="请输入分组描述"]');
  const customInput = container.querySelector('input[placeholder="请输入自定义字段名称"]');
  t.is(nameInput.value, 'A组', '分组名应回填当前分组名称');
  t.is(descArea.value, '这是A组的描述', '简介应回填当前分组描述');
  t.is(customInput.value, '渠道', '自定义字段名应回填当前分组配置');
  t.truthy(container.querySelector('.ant-switch.ant-switch-checked'), '开启状态应回填为开');

  t.truthy(container.querySelector('.danger-container'), 'admin 应渲染危险操作区');
  t.falsy(container.querySelector('.card-danger'), '未展开时不应渲染危险卡片');

  await toggleDanger({ container });
  t.truthy(container.querySelector('.card-danger'), '点击查看后应渲染危险卡片');
  t.truthy(container.querySelector('.card-danger-btn'), '危险卡片应提供删除按钮');
});

test.serial('GroupSetting 渲染：非 admin 不渲染危险操作区', async t => {
  const { container } = renderGroupSetting('dev');

  t.truthy(container.querySelector('input[placeholder="请输入分组名称"]'), '表单正常渲染');
  t.falsy(container.querySelector('.danger-container'), '非 admin 不应渲染危险操作区');
});

test.serial('GroupSetting 交互：修改名称后保存应携带新值请求 /api/group/up 并联动刷新', async t => {
  const log = [];
  axios.get = (url, config) => {
    log.push(['GET', url, config && config.params]);
    if (url === '/api/group/list') {
      return Promise.resolve({ data: { errcode: 0, data: [GROUP_A] } });
    }
    if (url === '/api/group/get') {
      return Promise.resolve({ data: { errcode: 0, data: GROUP_A } });
    }
    if (url === '/api/log/list') {
      return Promise.resolve({ data: { errcode: 0, data: { data: [], total: 0 } } });
    }
    throw new Error('unexpected GET: ' + url);
  };
  axios.post = (url, data) => {
    log.push(['POST', url, data]);
    if (url === '/api/group/up') {
      return Promise.resolve({ data: { errcode: 0, data: {} } });
    }
    throw new Error('unexpected POST: ' + url);
  };

  const { container } = renderGroupSetting('admin');
  const nameInput = container.querySelector('input[placeholder="请输入分组名称"]');
  fireEvent.change(nameInput, { target: { value: 'A组改' } });
  await flushEffects();

  fireEvent.click(container.querySelector('.btn-save'));
  await flushEffects(120);

  const up = log.find(entry => entry[0] === 'POST' && entry[1] === '/api/group/up');
  t.truthy(up, '保存应请求 /api/group/up');
  t.is(up[2].group_name, 'A组改', '请求应携带修改后的分组名');
  t.is(up[2].id, 71, '请求应携带当前分组 id');
  t.is(up[2].custom_field1.name, '渠道', '请求应携带自定义字段名');
  t.truthy(log.find(entry => entry[0] === 'GET' && entry[1] === '/api/group/list'), '保存成功后应刷新分组列表');
  t.truthy(log.find(entry => entry[0] === 'GET' && entry[1] === '/api/group/get'), '保存成功后应重新拉取分组信息');
});

test.serial('GroupSetting 交互：删除分组需通过名称确认弹窗', async t => {
  const log = [];
  axios.post = (url, data) => {
    log.push(['POST', url, data]);
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };

  const { container } = renderGroupSetting('admin');
  await toggleDanger({ container });
  fireEvent.click(container.querySelector('.card-danger-btn'));
  await flushEffects();

  const modal = document.body.querySelector('.ant-modal-confirm');
  t.truthy(modal, '点击删除应弹出二次确认框');
  t.truthy(
    modal.textContent.indexOf('确认删除 A组 分组吗') > -1,
    '确认框标题应包含当前分组名称'
  );
  t.falsy(log.find(entry => entry[1] === '/api/group/del'), '未确认前不应真正删除');
});

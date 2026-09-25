// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';

const axios = require('axios');

const { default: MemberList } = require('../../../client/containers/Group/MemberList/MemberList.js');
// group 切片已迁至 Zustand（批次3）：组件经 useGroupStore 读写，测试直接播种真实 store
const useGroupStore = require('../../../client/store/groupStore').default;

const originalAxiosGet = axios.get;

const MEMBERS = [
  { uid: 11, username: '张三', email: 'zhangsan@test.com', role: 'owner' },
  { uid: 22, username: '李四', email: 'lisi@test.com', role: 'dev' },
  { uid: 33, username: '王五', email: 'wangwu@test.com', role: 'guest' }
];

const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  useGroupStore.setState(INITIAL_GROUP_STATE);
});

// Redux 死种子（user/group 切片）随 Redux 退役移除（收尾批）；组件读取 currGroup 走 Zustand
function seedGroupStore() {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    currGroup: { _id: 71, group_name: '测试分组' },
    role: 'dev'
  });
}

function mockGroupApis(logRequests, groupRole) {
  axios.get = (url, config) => {
    logRequests.push({ url, params: config && config.params });
    if (url === '/api/group/get') {
      // 真实契约：/api/group/get 按请求 id 返回完整分组对象（含 custom_field1），
      // 真实 store 会将其写入 currGroup，故 _id 必须与请求参数一致，否则会触发
      // 「分组回跳 → 成员列表重拉」的连锁反应（旧冻结 reducer 从不消费故未暴露）
      const id = (config && config.params && config.params.id) || 71;
      return Promise.resolve({
        data: {
          errcode: 0,
          data: {
            _id: id,
            group_name: id === 71 ? '测试分组' : '新分组',
            type: 'public',
            role: groupRole,
            custom_field1: { name: '', enable: false }
          }
        }
      });
    }
    if (url === '/api/group/get_member_list') {
      return Promise.resolve({ data: { errcode: 0, data: MEMBERS.slice() } });
    }
    throw new Error('unexpected url: ' + url);
  };
}

test.serial('owner 视角渲染成员表格（用户名/角色）并提供添加成员入口', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'owner');
  seedGroupStore();
  const { container } = renderWithProviders(React.createElement(MemberList));
  await flushEffects();

  t.truthy(
    logRequests.find(req => req.url === '/api/group/get' && req.params.id === 71),
    '挂载应以 currGroup._id 请求 /api/group/get'
  );
  t.truthy(
    logRequests.find(req => req.url === '/api/group/get_member_list' && req.params.id === 71),
    '挂载应以 currGroup._id 请求 /api/group/get_member_list'
  );

  // 成员列表按 owner → dev → guest 排序渲染
  const names = Array.from(container.querySelectorAll('.m-user-name')).map(el => el.textContent);
  t.deepEqual(names, ['张三', '李四', '王五'], '成员应按 owner/dev/guest 顺序渲染');
  t.is(
    container.querySelector('.ant-table-thead th').textContent,
    '测试分组 分组成员 (3) 人',
    '表头应展示分组名与成员数'
  );

  // owner 视角：角色列渲染可切换的 Select，选中项展示角色文案
  const selects = Array.from(container.querySelectorAll('.member-opration .ant-select'));
  t.is(selects.length, 3, 'owner 视角应为每个成员渲染角色 Select');
  const roleTexts = selects.map(select => select.querySelector('.ant-select-selection-item').textContent);
  t.deepEqual(roleTexts, ['组长', '开发者', '访客'], '角色 Select 选中项应为组长/开发者/访客');

  t.truthy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加成员'),
    'owner 视角应提供「添加成员」按钮'
  );
});

test.serial('点击「添加成员」展开 Modal（用户名自动补全 + 权限选择）', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'owner');
  seedGroupStore();
  const { container } = renderWithProviders(React.createElement(MemberList));
  await flushEffects();

  t.falsy(document.body.querySelector('.ant-modal'), '初始不应渲染 Modal');
  const addBtn = Array.from(container.querySelectorAll('button')).find(
    btn => btn.textContent === '添加成员'
  );
  fireEvent.click(addBtn);
  await flushEffects();

  const modal = document.body.querySelector('.ant-modal');
  t.truthy(modal, '点击后应展开添加成员 Modal');
  t.is(modal.querySelector('.ant-modal-title').textContent, '添加成员', 'Modal 标题应为「添加成员」');
  t.truthy(
    modal.querySelector('.ant-select .ant-select-selection-placeholder'),
    'Modal 内应渲染用户名自动补全输入框（UsernameAutoComplete 占位）'
  );
  t.is(
    modal.querySelector('.ant-select .ant-select-selection-placeholder').textContent,
    '请输入用户名',
    '自动补全输入框占位文案应为「请输入用户名」'
  );
  t.truthy(modal.querySelector('.usernameauth'), 'Modal 内应渲染权限选择行');
});

test.serial('非管理员视角仅展示角色文案且无添加成员入口', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'member');
  seedGroupStore();
  const { container } = renderWithProviders(React.createElement(MemberList));
  await flushEffects();

  const names = Array.from(container.querySelectorAll('.m-user-name')).map(el => el.textContent);
  t.deepEqual(names, ['张三', '李四', '王五'], '成员列表正常渲染');
  // 列 className 同时作用于表头 th；非管理员视角表头为空串，正文单元格才是角色文案
  const roleCells = Array.from(
    container.querySelectorAll('.ant-table-tbody .member-opration')
  ).map(td => td.textContent);
  t.deepEqual(roleCells, ['组长', '开发者', '访客'], '非管理员应只读展示角色文案');
  t.falsy(
    Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '添加成员'),
    '非管理员不应有「添加成员」入口'
  );
});

test.serial('分组切换: currGroup 变化触发成员列表重拉（先成员列表后分组信息）', async t => {
  const logRequests = [];
  mockGroupApis(logRequests, 'owner');
  seedGroupStore();
  renderWithProviders(React.createElement(MemberList));
  await flushEffects();
  t.is(
    logRequests.filter(req => req.url === '/api/group/get_member_list').length,
    1,
    '挂载期拉取一次成员列表'
  );

  // group 切片已迁 Zustand：在 act 内直接更新 store，组件订阅重渲染后触发切换分支
  await act(async () => {
    useGroupStore.setState({ currGroup: { _id: 72, group_name: '新分组' } });
    await new Promise(resolve => setTimeout(resolve, 15));
  });
  await flushEffects();

  const memberCalls = logRequests.filter(req => req.url === '/api/group/get_member_list');
  t.is(memberCalls.length, 2, '分组变化后应再次拉取成员列表');
  t.is(memberCalls[1].params.id, 72, '第二次拉取应使用新分组 id');
  const groupCalls = logRequests.filter(req => req.url === '/api/group/get');
  t.is(groupCalls.length, 2, '分组切换分支同样重拉分组信息');
  t.is(groupCalls[1].params.id, 72);
});

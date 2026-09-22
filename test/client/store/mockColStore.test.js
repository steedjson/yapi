// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';

const { default: useMockColStore } = require('../../../client/store/mockColStore');

const originalAxiosGet = axios.get;

// Zustand store 为模块级单例，每条用例前复位到初始状态
test.beforeEach(() => {
  useMockColStore.setState({ list: [] });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
});

const caseItem = id => ({
  _id: id,
  interface_id: 100,
  project_id: 12,
  name: '期望' + id,
  ip_enable: false,
  ip: '',
  username: 'alice',
  up_time: 1600000000 + id,
  case_enable: true
});

test('初始状态：list 为空数组，状态形状仅 list 一个字段', t => {
  const state = useMockColStore.getState();
  t.deepEqual(state.list, [], '初始 list 应为 []');
  t.deepEqual(Object.keys(state).sort(), ['fetchMockCol', 'list'], '状态+动作应仅有 list 与 fetchMockCol');
});

test.serial('fetchMockCol 成功：以 interface_id 拼 URL 查询串并写入 res.data.data', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({ data: { errcode: 0, data: [caseItem(1), caseItem(2)] } });
  };

  const res = await useMockColStore.getState().fetchMockCol(100);

  t.deepEqual(gets, ['/api/plugin/advmock/case/list?interface_id=100'], '应 GET advmock case/list');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  t.deepEqual(useMockColStore.getState().list, [caseItem(1), caseItem(2)], 'list 应为接口返回的用例数组');
});

test.serial('fetchMockCol 写入为新数组引用（不可变替换）', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(1)] } });
  await useMockColStore.getState().fetchMockCol(100);

  const prevList = useMockColStore.getState().list;
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(9)] } });
  await useMockColStore.getState().fetchMockCol(100);

  const state = useMockColStore.getState();
  t.not(state.list, prevList, 'list 应为 new 数组引用');
  t.deepEqual(prevList, [caseItem(1)], '旧数组内容不应被原地变更');
});

test.serial('fetchMockCol errcode 非 0（HTTP 200）：保持旧版无条件写入语义', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(1)] } });
  await useMockColStore.getState().fetchMockCol(100);

  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: '请登录' } });
  await useMockColStore.getState().fetchMockCol(100);

  t.is(useMockColStore.getState().list, undefined, '旧 reducer 无 errcode 守卫，body.data(undefined) 原样写入');
});

test.serial('fetchMockCol 连续拉取：整体替换不合并', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(1), caseItem(2)] } });
  await useMockColStore.getState().fetchMockCol(100);

  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(3)] } });
  await useMockColStore.getState().fetchMockCol(100);

  t.deepEqual(useMockColStore.getState().list, [caseItem(3)], '后一次拉取应整体替换前一次结果');
});

test.serial('fetchMockCol 请求被拒绝：异常向上传播且保留旧列表', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [caseItem(1)] } });
  await useMockColStore.getState().fetchMockCol(100);

  axios.get = () => Promise.reject(new Error('network down'));
  const err = await t.throwsAsync(() => useMockColStore.getState().fetchMockCol(100));
  t.is(err.message, 'network down');
  t.deepEqual(useMockColStore.getState().list, [caseItem(1)], '网络层失败时保留旧列表（不写入 undefined）');
});

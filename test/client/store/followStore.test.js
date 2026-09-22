// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 newsReducer.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';

const { default: useFollowStore } = require('../../../client/store/followStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// Zustand store 为模块级单例，每条用例前复位到初始状态
test.beforeEach(() => {
  useFollowStore.setState({ data: [], loading: false, _uid: null });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

const listBody = list => ({ data: { errcode: 0, data: { list } } });
const item = id => ({ _id: id, name: '项目' + id, up_time: id });

test('初始状态：data 为空数组、loading 为 false、未记录 uid', t => {
  const state = useFollowStore.getState();
  t.deepEqual(state.data, [], '初始 data 应为 []');
  t.is(state.loading, false, '初始 loading 应为 false');
  t.is(state._uid, null, '初始不应记录 uid');
});

test.serial('getFollowList 成功：写入列表、复位 loading、记录 uid，响应层级为 res.data', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve(listBody([item(1), item(2)]));
  };

  const prevData = useFollowStore.getState().data;
  const res = await useFollowStore.getState().getFollowList(11);

  t.deepEqual(gets, [{ url: '/api/follow/list', params: { uid: 11 } }], '应以 GET /api/follow/list?uid 拉取');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  const state = useFollowStore.getState();
  t.deepEqual(state.data, [item(1), item(2)], 'data 应为接口返回的 list 数组');
  t.not(state.data, prevData, 'data 应为 new 数组引用（不可变替换）');
  t.is(state.loading, false, '完成后 loading 应复位');
  t.is(state._uid, 11, '应记录最近一次拉取的 uid');
});

test.serial('getFollowList errcode 非 0：不写入 data、不记录 uid、loading 复位', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: '请登录' } });

  await useFollowStore.getState().getFollowList(11);

  const state = useFollowStore.getState();
  t.deepEqual(state.data, [], 'errcode 非 0 时不应写入 data');
  t.is(state._uid, null, 'errcode 非 0 时不应记录 uid');
  t.is(state.loading, false, 'loading 仍应复位');
});

test.serial('getFollowList 已有数据时 errcode 非 0：保留旧数据', async t => {
  axios.get = () => Promise.resolve(listBody([item(1)]));
  await useFollowStore.getState().getFollowList(11);

  axios.get = () => Promise.resolve({ data: { errcode: 500, errmsg: '服务器错误' } });
  await useFollowStore.getState().getFollowList(11);

  t.deepEqual(useFollowStore.getState().data, [item(1)], '失败时保留旧列表');
});

test.serial('getFollowList 请求被拒绝：loading 复位且异常向上传播', async t => {
  axios.get = () => Promise.reject(new Error('network down'));

  const err = await t.throwsAsync(() => useFollowStore.getState().getFollowList(11));
  t.is(err.message, 'network down');
  t.is(useFollowStore.getState().loading, false, 'reject 后 loading 仍应复位');
});

test.serial('addFollow 成功：POST 参数透传并自动重拉列表', async t => {
  const calls = [];
  axios.post = (url, body) => {
    calls.push({ kind: 'post', url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  axios.get = (url, config) => {
    calls.push({ kind: 'get', url, params: config && config.params });
    return Promise.resolve(listBody([item(9)]));
  };

  const param = { uid: 11, projectid: 101, projectname: '电商中台', icon: 'code-o', color: 'blue' };
  const res = await useFollowStore.getState().addFollow(param);

  t.is(res.data.errcode, 0, '返回添加接口的 axios 响应');
  t.deepEqual(calls, [
    { kind: 'post', url: '/api/follow/add', body: param },
    { kind: 'get', url: '/api/follow/list', params: { uid: 11 } }
  ], '应先 POST /api/follow/add，成功后以记录的 uid 重拉列表');
  t.deepEqual(useFollowStore.getState().data, [item(9)], '重拉后 data 应更新');
  t.is(useFollowStore.getState()._uid, 11, '重拉会刷新记录的 uid');
});

test.serial('addFollow errcode 非 0：不重拉列表', async t => {
  let getCalled = 0;
  axios.post = () => Promise.resolve({ data: { errcode: 400, errmsg: '请登录' } });
  axios.get = () => {
    getCalled++;
    return Promise.resolve(listBody([]));
  };

  await useFollowStore.getState().addFollow({ uid: 11, projectid: 101 });

  t.is(getCalled, 0, '失败时不应重拉列表');
});

test.serial('delFollow 成功：以 {projectid} 提交并自动重拉列表', async t => {
  // 先拉取一次以记录 uid
  axios.get = () => Promise.resolve(listBody([item(1), item(2)]));
  await useFollowStore.getState().getFollowList(11);

  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  axios.get = () => Promise.resolve(listBody([item(1)]));

  const res = await useFollowStore.getState().delFollow(101);

  t.is(res.data.errcode, 0, '返回删除接口的 axios 响应');
  t.deepEqual(posts, [{ url: '/api/follow/del', body: { projectid: 101 } }], '取关参数应为 {projectid}');
  t.deepEqual(useFollowStore.getState().data, [item(1)], '重拉后 data 应更新');
});

test.serial('delFollow errcode 非 0：不重拉列表', async t => {
  axios.get = () => Promise.resolve(listBody([item(1)]));
  await useFollowStore.getState().getFollowList(11);

  let getCalled = 0;
  axios.post = () => Promise.resolve({ data: { errcode: 403, errmsg: '无权限' } });
  axios.get = () => {
    getCalled++;
    return Promise.resolve(listBody([]));
  };

  await useFollowStore.getState().delFollow(101);

  t.is(getCalled, 0, '失败时不应重拉列表');
  t.deepEqual(useFollowStore.getState().data, [item(1)], '失败时保留旧列表');
});

test.serial('delFollow 在从未拉取过列表（_uid 为 null）时不重拉也不报错', async t => {
  let getCalled = 0;
  axios.post = () => Promise.resolve({ data: { errcode: 0 } });
  axios.get = () => {
    getCalled++;
    return Promise.resolve(listBody([]));
  };

  const res = await useFollowStore.getState().delFollow(101);

  t.is(res.data.errcode, 0);
  t.is(getCalled, 0, '未知 uid 时应跳过重拉');
  t.is(useFollowStore.getState()._uid, null);
});

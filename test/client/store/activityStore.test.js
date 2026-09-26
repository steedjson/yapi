// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';
import variable from '../../../client/constants/variable';

const { default: useActivityStore } = require('../../../client/store/activityStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// Zustand store 为模块级单例，每条用例前复位到初始状态
test.beforeEach(() => {
  useActivityStore.setState({ activityData: { list: [], total: 0 }, curpage: 1, activityRequestId: 0 });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

const item = (id, add_time) => ({ uid: id, add_time, type: 'project', content: '动态' + id });

test('初始状态：activityData/curpage/activityRequestId 与旧 reducer initialState 一致', t => {
  const state = useActivityStore.getState();
  t.deepEqual(state.activityData, { list: [], total: 0 }, '初始 activityData 应为 {list:[], total:0}');
  t.is(state.curpage, 1, '初始 curpage 应为 1');
  t.is(state.activityRequestId, 0, '初始 activityRequestId 应为 0');
});

test.serial('fetchActivityData 成功：默认 limit 透传、按 add_time 降序、curpage 归 1、记录 requestId', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: [item(1, 300), item(2, 100), item(3, 200)], total: 3 } }
    });
  };

  const res = await useActivityStore.getState().fetchActivityData(42, 'project', 1);

  t.is(gets[0].url, '/api/log/list', '应 GET /api/log/list');
  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 1, limit: variable.PAGE_LIMIT, selectValue: undefined },
    'limit 缺省应回退 PAGE_LIMIT，参数与旧 action creator 一致'
  );
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');

  const state = useActivityStore.getState();
  t.deepEqual(
    state.activityData.list.map(i => i.add_time),
    [300, 200, 100],
    'list 应按 add_time 降序排列'
  );
  t.is(state.activityData.total, 3, 'total 应取自响应体');
  t.is(state.curpage, 1, '首屏拉取后 curpage 应归 1');
  t.true(state.activityRequestId > 0, '应记录本次请求序号');
});

test.serial('fetchActivityData limit/selectValue 透传', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
  };

  await useActivityStore.getState().fetchActivityData(42, 'project', 2, 8, 'wiki');

  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 2, limit: 8, selectValue: 'wiki' },
    'limit 与 selectValue 应原样透传'
  );
});

test.serial('fetchActivityData errcode 非 0：不写入且 activityRequestId 不推进', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 100)], total: 1 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);
  const seeded = useActivityStore.getState();

  axios.get = () => Promise.resolve({ data: { errcode: 500, errmsg: '服务器错误' } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 2);

  const state = useActivityStore.getState();
  t.deepEqual(state.activityData, seeded.activityData, 'errcode 非 0 时应保留旧数据');
  t.is(state.curpage, seeded.curpage, 'errcode 非 0 时 curpage 不变');
  t.is(state.activityRequestId, seeded.activityRequestId, 'errcode 非 0 时 activityRequestId 不推进');
});

test.serial('fetchActivityData 请求被拒绝：吞掉异常（旧 redux-promise 必达语义），状态保留', async t => {
  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useActivityStore.getState().fetchActivityData(42, 'project', 1);
  t.is(res, null, '网络错误时返回 null（不向上抛，消费方 .then 必达）');
  t.deepEqual(useActivityStore.getState().activityData, { list: [], total: 0 }, '失败时保留初始状态');
});

test.serial('过期响应守卫：后发先至时旧响应被丢弃', async t => {
  const pending = [];
  axios.get = (url, config) =>
    new Promise(resolve => {
      pending.push({ resolve, params: config && config.params });
    });

  const p1 = useActivityStore.getState().fetchActivityData(42, 'project', 1); // 序号 A（先发）
  const p2 = useActivityStore.getState().fetchActivityData(42, 'project', 2); // 序号 B（后发）
  t.is(pending[0].params.page, 1);
  t.is(pending[1].params.page, 2);

  // 后发的 B 先返回并入账
  pending[1].resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 1 } } });
  await p2;
  const ridAfterP2 = useActivityStore.getState().activityRequestId;

  // 先发的 A 后返回（过期：requestId < activityRequestId）
  pending[0].resolve({ data: { errcode: 0, data: { list: [item(1, 999)], total: 99 } } });
  await p1;

  const state = useActivityStore.getState();
  t.deepEqual(state.activityData.list, [item(2, 100)], '过期响应不应覆盖新数据');
  t.is(state.activityData.total, 1, '过期响应不应覆盖 total');
  t.is(state.activityRequestId, ridAfterP2, '过期响应不应推进 activityRequestId');
});

test.serial('fetchMoreActivity 追加数据、整体降序、curpage+1', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500), item(2, 300)], total: 4 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);

  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: [item(3, 600), item(4, 100)], total: 4 } }
    });
  };
  await useActivityStore.getState().fetchMoreActivity(42, 'project', 2, 10, 'wiki');

  const state = useActivityStore.getState();
  t.deepEqual(
    state.activityData.list.map(i => i.uid),
    [3, 1, 2, 4],
    '追加后应按 add_time 整体降序'
  );
  t.is(state.activityData.total, 4);
  t.is(state.curpage, 2, '新数据非空时 curpage 应 +1');
  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 2, limit: 10, selectValue: 'wiki' },
    'fetchMoreActivity 参数语义与旧 action creator 一致'
  );
});

test.serial('fetchMoreActivity 新数据为空：total 更新但 curpage 不变', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 1 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);
  const before = useActivityStore.getState();

  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [], total: 1 } } });
  await useActivityStore.getState().fetchMoreActivity(42, 'project', 2);

  const state = useActivityStore.getState();
  t.is(state.curpage, before.curpage, '空页追加不应推进 curpage');
  t.deepEqual(state.activityData.list, [item(1, 500)], '空页追加不改变已有列表');
  t.true(state.activityRequestId > before.activityRequestId, 'activityRequestId 仍应推进');
});

// —— 以下 2 条为旧 newsReducer.test.js 的覆盖移植（Redux 退役删除旧文件，语义不得丢弃）——

test.serial('fetchMoreActivity 忽略过期分页响应', async t => {
  const pending = [];
  axios.get = (url, config) =>
    new Promise(resolve => {
      pending.push({ resolve, params: config && config.params });
    });

  const pFresh = useActivityStore.getState().fetchActivityData(42, 'project', 1); // 序号 1（先发，用于铺底）
  pending[0].resolve({ data: { errcode: 0, data: { list: [item(2, 200)], total: 1 } } });
  await pFresh;

  const pStale = useActivityStore.getState().fetchMoreActivity(42, 'project', 2); // 序号 2
  const pNewer = useActivityStore.getState().fetchActivityData(42, 'project', 3); // 序号 3（后发先至）
  pending[2].resolve({ data: { errcode: 0, data: { list: [item(3, 300)], total: 1 } } });
  await pNewer;
  const ridAfterNewer = useActivityStore.getState().activityRequestId;

  // 过期的分页响应（序号 2 < 3）后返回，不得覆盖
  pending[1].resolve({ data: { errcode: 0, data: { list: [item(1, 100)], total: 99 } } });
  await pStale;

  const state = useActivityStore.getState();
  t.deepEqual(state.activityData.list, [item(3, 300)], '过期分页响应不应覆盖新数据');
  t.is(state.activityRequestId, ridAfterNewer, '过期分页响应不应推进 activityRequestId');
});

test.serial('fetchActivityData 响应体异常（缺失 data）不写入', async t => {
  // 旧用例为 action 无 payload：store 等价形态为响应体缺失/为 null
  axios.get = () => Promise.resolve({});
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);

  const state = useActivityStore.getState();
  t.deepEqual(state.activityData, { list: [], total: 0 }, '异常响应保留初始状态');
  t.is(state.curpage, 1);
});

// —— fetchUpdateLogData（收尾批自旧 news.js 迁入，ProjectData 数据同步差异用）——

test.serial('fetchUpdateLogData 成功：POST /api/log/list_by_update 原样透传参数并返回响应', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: { diff: [{ content: '<p>x</p>' }] } } });
  };
  const params = { type: 'project', typeid: 12, apis: [{ method: 'GET', path: '/a' }] };

  const res = await useActivityStore.getState().fetchUpdateLogData(params);

  t.is(posts[0].url, '/api/log/list_by_update', '请求地址与旧 action creator 一致');
  t.is(posts[0].body, params, '请求体应原样透传');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 result.payload.data）');
  t.deepEqual(res.data.data, { diff: [{ content: '<p>x</p>' }] }, '消费方按 res.data.data 解包差异列表');
});

test.serial('fetchUpdateLogData errcode 非 0：显式 throw（镜像旧 messageMiddleware，消费方 catch 依赖）', async t => {
  axios.post = () =>
    Promise.resolve({ data: { errcode: 400, errmsg: '无权限操作', data: null } });

  await t.throwsAsync(
    () => useActivityStore.getState().fetchUpdateLogData({ type: 'project', typeid: 12 }),
    { message: '无权限操作' },
    '旧链路 messageMiddleware 对业务错误 toast + throw，ProjectData catch 提示「获取同步差异失败」'
  );
});

test.serial('fetchUpdateLogData errcode=40011：豁免透传响应（旧 messageMiddleware 同款豁免）', async t => {
  axios.post = () =>
    Promise.resolve({ data: { errcode: 40011, errmsg: '请登录', data: null } });

  const res = await useActivityStore.getState().fetchUpdateLogData({ type: 'project', typeid: 12 });
  t.is(res.data.errcode, 40011);
});

test.serial('fetchUpdateLogData 网络层 reject：原样透传（纯请求动作不吞错）', async t => {
  axios.post = () => Promise.reject(new Error('network down'));

  await t.throwsAsync(
    () => useActivityStore.getState().fetchUpdateLogData({ type: 'project', typeid: 12 }),
    { message: 'network down' }
  );
});

test.serial('fetchActivityData 在 fetchMoreActivity 之后调用：整表替换并归位 curpage', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 9 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 9 } } });
  await useActivityStore.getState().fetchMoreActivity(42, 'project', 2);

  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(9, 800)], total: 1 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);

  const state = useActivityStore.getState();
  t.deepEqual(state.activityData.list, [item(9, 800)], '首屏拉取应为整表替换，不与旧列表合并');
  t.is(state.curpage, 1, '整表替换后 curpage 归 1');
});

test.serial('activityData 为不可变替换：旧对象与旧数组均不被原地变更', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 1 } } });
  await useActivityStore.getState().fetchActivityData(42, 'project', 1);

  const prevActivityData = useActivityStore.getState().activityData;
  const prevList = prevActivityData.list;

  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 2 } } });
  await useActivityStore.getState().fetchMoreActivity(42, 'project', 2);

  const state = useActivityStore.getState();
  t.not(state.activityData, prevActivityData, 'activityData 应为 new 对象引用');
  t.not(state.activityData.list, prevList, 'list 应为 new 数组引用');
  t.deepEqual(prevActivityData, { list: [item(1, 500)], total: 1 }, '旧 activityData 内容不应被原地变更');
});

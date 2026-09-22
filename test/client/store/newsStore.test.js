// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';
import variable from '../../../client/constants/variable';

const { default: useNewsStore } = require('../../../client/store/newsStore');

const originalAxiosGet = axios.get;

// Zustand store 为模块级单例，每条用例前复位到初始状态
test.beforeEach(() => {
  useNewsStore.setState({ newsData: { list: [], total: 0 }, curpage: 1, newsRequestId: 0 });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
});

const item = (id, add_time) => ({ uid: id, add_time, type: 'project', content: '动态' + id });

test('初始状态：newsData/curpage/newsRequestId 与旧 reducer initialState 一致', t => {
  const state = useNewsStore.getState();
  t.deepEqual(state.newsData, { list: [], total: 0 }, '初始 newsData 应为 {list:[], total:0}');
  t.is(state.curpage, 1, '初始 curpage 应为 1');
  t.is(state.newsRequestId, 0, '初始 newsRequestId 应为 0');
});

test.serial('fetchNewsData 成功：默认 limit 透传、按 add_time 降序、curpage 归 1、记录 requestId', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: [item(1, 300), item(2, 100), item(3, 200)], total: 3 } }
    });
  };

  const res = await useNewsStore.getState().fetchNewsData(42, 'project', 1);

  t.is(gets[0].url, '/api/log/list', '应 GET /api/log/list');
  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 1, limit: variable.PAGE_LIMIT, selectValue: undefined },
    'limit 缺省应回退 PAGE_LIMIT，参数与旧 action creator 一致'
  );
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');

  const state = useNewsStore.getState();
  t.deepEqual(
    state.newsData.list.map(i => i.add_time),
    [300, 200, 100],
    'list 应按 add_time 降序排列'
  );
  t.is(state.newsData.total, 3, 'total 应取自响应体');
  t.is(state.curpage, 1, '首屏拉取后 curpage 应归 1');
  t.true(state.newsRequestId > 0, '应记录本次请求序号');
});

test.serial('fetchNewsData limit/selectValue 透传', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0 } } });
  };

  await useNewsStore.getState().fetchNewsData(42, 'project', 2, 8, 'wiki');

  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 2, limit: 8, selectValue: 'wiki' },
    'limit 与 selectValue 应原样透传'
  );
});

test.serial('fetchNewsData errcode 非 0：不写入且 newsRequestId 不推进', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 100)], total: 1 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);
  const seeded = useNewsStore.getState();

  axios.get = () => Promise.resolve({ data: { errcode: 500, errmsg: '服务器错误' } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 2);

  const state = useNewsStore.getState();
  t.deepEqual(state.newsData, seeded.newsData, 'errcode 非 0 时应保留旧数据');
  t.is(state.curpage, seeded.curpage, 'errcode 非 0 时 curpage 不变');
  t.is(state.newsRequestId, seeded.newsRequestId, 'errcode 非 0 时 newsRequestId 不推进');
});

test.serial('fetchNewsData 请求被拒绝：吞掉异常（旧 redux-promise 必达语义），状态保留', async t => {
  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useNewsStore.getState().fetchNewsData(42, 'project', 1);
  t.is(res, null, '网络错误时返回 null（不向上抛，消费方 .then 必达）');
  t.deepEqual(useNewsStore.getState().newsData, { list: [], total: 0 }, '失败时保留初始状态');
});

test.serial('过期响应守卫：后发先至时旧响应被丢弃', async t => {
  const pending = [];
  axios.get = (url, config) =>
    new Promise(resolve => {
      pending.push({ resolve, params: config && config.params });
    });

  const p1 = useNewsStore.getState().fetchNewsData(42, 'project', 1); // 序号 A（先发）
  const p2 = useNewsStore.getState().fetchNewsData(42, 'project', 2); // 序号 B（后发）
  t.is(pending[0].params.page, 1);
  t.is(pending[1].params.page, 2);

  // 后发的 B 先返回并入账
  pending[1].resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 1 } } });
  await p2;
  const ridAfterP2 = useNewsStore.getState().newsRequestId;

  // 先发的 A 后返回（过期：requestId < newsRequestId）
  pending[0].resolve({ data: { errcode: 0, data: { list: [item(1, 999)], total: 99 } } });
  await p1;

  const state = useNewsStore.getState();
  t.deepEqual(state.newsData.list, [item(2, 100)], '过期响应不应覆盖新数据');
  t.is(state.newsData.total, 1, '过期响应不应覆盖 total');
  t.is(state.newsRequestId, ridAfterP2, '过期响应不应推进 newsRequestId');
});

test.serial('fetchMoreNews 追加数据、整体降序、curpage+1', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500), item(2, 300)], total: 4 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);

  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({
      data: { errcode: 0, data: { list: [item(3, 600), item(4, 100)], total: 4 } }
    });
  };
  await useNewsStore.getState().fetchMoreNews(42, 'project', 2, 10, 'wiki');

  const state = useNewsStore.getState();
  t.deepEqual(
    state.newsData.list.map(i => i.uid),
    [3, 1, 2, 4],
    '追加后应按 add_time 整体降序'
  );
  t.is(state.newsData.total, 4);
  t.is(state.curpage, 2, '新数据非空时 curpage 应 +1');
  t.deepEqual(
    gets[0].params,
    { typeid: 42, type: 'project', page: 2, limit: 10, selectValue: 'wiki' },
    'fetchMoreNews 参数语义与旧 action creator 一致'
  );
});

test.serial('fetchMoreNews 新数据为空：total 更新但 curpage 不变', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 1 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);
  const before = useNewsStore.getState();

  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [], total: 1 } } });
  await useNewsStore.getState().fetchMoreNews(42, 'project', 2);

  const state = useNewsStore.getState();
  t.is(state.curpage, before.curpage, '空页追加不应推进 curpage');
  t.deepEqual(state.newsData.list, [item(1, 500)], '空页追加不改变已有列表');
  t.true(state.newsRequestId > before.newsRequestId, 'newsRequestId 仍应推进');
});

test.serial('fetchNewsData 在 fetchMoreNews 之后调用：整表替换并归位 curpage', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 9 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 9 } } });
  await useNewsStore.getState().fetchMoreNews(42, 'project', 2);

  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(9, 800)], total: 1 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);

  const state = useNewsStore.getState();
  t.deepEqual(state.newsData.list, [item(9, 800)], '首屏拉取应为整表替换，不与旧列表合并');
  t.is(state.curpage, 1, '整表替换后 curpage 归 1');
});

test.serial('newsData 为不可变替换：旧对象与旧数组均不被原地变更', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(1, 500)], total: 1 } } });
  await useNewsStore.getState().fetchNewsData(42, 'project', 1);

  const prevNewsData = useNewsStore.getState().newsData;
  const prevList = prevNewsData.list;

  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [item(2, 100)], total: 2 } } });
  await useNewsStore.getState().fetchMoreNews(42, 'project', 2);

  const state = useNewsStore.getState();
  t.not(state.newsData, prevNewsData, 'newsData 应为 new 对象引用');
  t.not(state.newsData.list, prevList, 'list 应为 new 数组引用');
  t.deepEqual(prevNewsData, { list: [item(1, 500)], total: 1 }, '旧 newsData 内容不应被原地变更');
});

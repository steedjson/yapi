// 纯 store 单测：无 DOM 依赖，不引入 jsdom
import test from 'ava';
import axios from 'axios';

const { default: useInterfaceStore } = require('../../../client/store/interfaceStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// 旧 initialState（client/reducer/modules/interface.js）
const INITIAL_STATE = {
  curdata: {},
  list: [],
  editStatus: false,
  totalTableList: [],
  catTableList: [],
  count: 0,
  totalCount: 0,
  interfaceRequestId: 0
};

// Zustand store 为模块级单例，每条用例前复位（interfaceRequestSequence 为模块级单调递增，
// 与旧 reducer 共享同一变量语义；守卫基准 interfaceRequestId 随用例复位）
test.beforeEach(() => {
  useInterfaceStore.setState({ ...INITIAL_STATE });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

const detailPayload = id => ({ data: { errcode: 0, data: { _id: id, title: '接口 ' + id } } });

test('初始状态：与旧 reducer initialState 严格一致', t => {
  const state = useInterfaceStore.getState();
  t.deepEqual(state.curdata, {});
  t.deepEqual(state.list, []);
  t.is(state.editStatus, false);
  t.deepEqual(state.totalTableList, []);
  t.deepEqual(state.catTableList, []);
  t.is(state.count, 0);
  t.is(state.totalCount, 0);
  t.is(state.interfaceRequestId, 0);
});

test.serial('fetchInterfaceData 成功：写入 curdata 并记录 requestId', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve(detailPayload(9));
  };

  const res = await useInterfaceStore.getState().fetchInterfaceData(9);

  t.is(gets[0], '/api/interface/get?id=9');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  t.is(useInterfaceStore.getState().curdata._id, 9);
  t.true(useInterfaceStore.getState().interfaceRequestId > 0, '成功入账后记录请求序号');
});

test.serial('fetchInterfaceData 忽略先发后至的旧响应（竞态守卫）', async t => {
  let resolvers = [];
  axios.get = () =>
    new Promise(resolve => {
      resolvers.push(resolve);
    });

  // 先后发起两个请求：2 号后发先至
  const p1 = useInterfaceStore.getState().fetchInterfaceData(1);
  const p2 = useInterfaceStore.getState().fetchInterfaceData(2);
  resolvers[1](detailPayload(2));
  await p2;
  resolvers[0](detailPayload(1));
  await p1;

  t.is(useInterfaceStore.getState().curdata._id, 2, '旧响应不得覆盖新响应');
  t.is(resolvers.length, 2);
});

test.serial('fetchInterfaceData errcode 非 0：不写入，保留已有详情', async t => {
  axios.get = () => Promise.resolve(detailPayload(1));
  await useInterfaceStore.getState().fetchInterfaceData(1);
  const seeded = useInterfaceStore.getState().curdata;

  axios.get = () =>
    Promise.resolve({ data: { errcode: 400, errmsg: '接口不存在', data: null } });
  const res = await useInterfaceStore.getState().fetchInterfaceData(2);

  t.is(res.data.errcode, 400, '返回响应供消费方读取 errmsg');
  t.is(useInterfaceStore.getState().curdata, seeded, '失败响应不污染 curdata');
});

test.serial('fetchInterfaceData 网络层 reject：返回 null 且不写状态', async t => {
  const seeded = useInterfaceStore.getState().curdata;
  axios.get = () => Promise.reject(new Error('network down'));

  const res = await useInterfaceStore.getState().fetchInterfaceData(3);

  t.is(res, null);
  t.is(useInterfaceStore.getState().curdata, seeded);
});

test.serial('fetchInterfaceListMenu 成功：写入分类树 list', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({ data: { errcode: 0, data: [{ _id: 1, name: '默认分类' }] } });
  };

  const res = await useInterfaceStore.getState().fetchInterfaceListMenu(77);

  t.is(gets[0], '/api/interface/get_cat_tree?project_id=77');
  t.is(res.data.errcode, 0);
  t.deepEqual(useInterfaceStore.getState().list, [{ _id: 1, name: '默认分类' }]);
});

test.serial('fetchInterfaceListMenu errcode 非 0：不写入，保留旧分类树', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [{ _id: 1 }] } });
  await useInterfaceStore.getState().fetchInterfaceListMenu(77);
  const seeded = useInterfaceStore.getState().list;

  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: '无权限', data: null } });
  const res = await useInterfaceStore.getState().fetchInterfaceListMenu(77);

  t.is(res.data.errcode, 400);
  t.is(useInterfaceStore.getState().list, seeded);
});

test.serial('fetchInterfaceList 成功：写入 totalTableList/totalCount 并透传 qs 序列化', async t => {
  /** @type {any} */
  let captured = null;
  axios.get = (url, config) => {
    captured = { url, config };
    return Promise.resolve({
      data: { errcode: 0, data: { list: [{ _id: 1 }], count: 21 } }
    });
  };

  const res = await useInterfaceStore.getState().fetchInterfaceList({
    page: 2,
    limit: 20,
    project_id: 3
  });

  t.is(captured.url, '/api/interface/list');
  t.is(typeof captured.config.paramsSerializer, 'function');
  t.is(captured.config.paramsSerializer({ a: [1, 2] }), 'a=1&a=2', '保留旧 indices:false 序列化');
  t.is(res.data.errcode, 0);
  t.deepEqual(useInterfaceStore.getState().totalTableList, [{ _id: 1 }]);
  t.is(useInterfaceStore.getState().totalCount, 21);
});

test.serial('fetchInterfaceCatList 成功：写入 catTableList/count', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({
      data: { errcode: 0, data: { list: [{ _id: 5 }], count: 7 } }
    });
  };

  await useInterfaceStore.getState().fetchInterfaceCatList({ catid: 9, page: 1 });

  t.is(gets[0], '/api/interface/list_cat');
  t.deepEqual(useInterfaceStore.getState().catTableList, [{ _id: 5 }]);
  t.is(useInterfaceStore.getState().count, 7);
});

test.serial('changeEditStatus / initInterface / updateInterfaceData 同步动作', t => {
  useInterfaceStore.getState().changeEditStatus(true);
  t.is(useInterfaceStore.getState().editStatus, true);

  useInterfaceStore.getState().updateInterfaceData({ title: '改名', path: '/a' });
  t.is(useInterfaceStore.getState().curdata.title, '改名');
  t.is(useInterfaceStore.getState().curdata.path, '/a');

  // updateInterfaceData 为浅合并：已有字段保留
  useInterfaceStore.getState().updateInterfaceData({ title: '再改' });
  t.is(useInterfaceStore.getState().curdata.path, '/a');

  useInterfaceStore.getState().initInterface();
  t.deepEqual(useInterfaceStore.getState().curdata, {});
  t.is(useInterfaceStore.getState().editStatus, false);
});

test.serial('deleteInterfaceData 成功：POST /api/interface/del 返回响应', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: { ok: true } } });
  };

  const res = await useInterfaceStore.getState().deleteInterfaceData(12);

  t.is(posts[0].url, '/api/interface/del');
  t.deepEqual(posts[0].body, { id: 12 });
  t.is(res.data.errcode, 0);
});

test.serial('deleteInterfaceData 网络层 reject：原样透传（消费方 catch 依赖）', async t => {
  axios.post = () => Promise.reject(new Error('network down'));

  await t.throwsAsync(() => useInterfaceStore.getState().deleteInterfaceData(12), {
    message: 'network down'
  });
});

test.serial('deleteInterfaceCatData 网络层 reject：原样透传', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.reject(new Error('boom'));
  };

  await t.throwsAsync(() => useInterfaceStore.getState().deleteInterfaceCatData(3), {
    message: 'boom'
  });
  t.is(posts[0].url, '/api/interface/del_cat');
  t.deepEqual(posts[0].body, { catid: 3 });
});

test.serial('saveImportData：POST /api/interface/save 透传（无消费方的保留接口）', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };

  await useInterfaceStore.getState().saveImportData({ project_id: 1 });

  t.is(posts[0].url, '/api/interface/save');
  t.deepEqual(posts[0].body, { project_id: 1 });
});

test.serial('fetchInterfaceListMenu 网络层 reject：返回 null 且不写状态', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [{ _id: 1 }] } });
  await useInterfaceStore.getState().fetchInterfaceListMenu(77);
  const seeded = useInterfaceStore.getState().list;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useInterfaceStore.getState().fetchInterfaceListMenu(77);

  t.is(res, null);
  t.is(useInterfaceStore.getState().list, seeded, '网络错误保留旧分类树');
});

test.serial('fetchInterfaceList 网络层 reject：返回 null 且不写状态', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [{ _id: 1 }], count: 3 } } });
  await useInterfaceStore.getState().fetchInterfaceList({ project_id: 3 });
  const seededList = useInterfaceStore.getState().totalTableList;
  const seededCount = useInterfaceStore.getState().totalCount;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useInterfaceStore.getState().fetchInterfaceList({ project_id: 3 });

  t.is(res, null);
  t.is(useInterfaceStore.getState().totalTableList, seededList);
  t.is(useInterfaceStore.getState().totalCount, seededCount);
});

test.serial('fetchInterfaceCatList 网络层 reject：返回 null 且不写状态', async t => {
  axios.get = () =>
    Promise.resolve({ data: { errcode: 0, data: { list: [{ _id: 5 }], count: 7 } } });
  await useInterfaceStore.getState().fetchInterfaceCatList({ catid: 9 });
  const seededList = useInterfaceStore.getState().catTableList;
  const seededCount = useInterfaceStore.getState().count;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useInterfaceStore.getState().fetchInterfaceCatList({ catid: 9 });

  t.is(res, null);
  t.is(useInterfaceStore.getState().catTableList, seededList);
  t.is(useInterfaceStore.getState().count, seededCount);
});

test.serial('saveImportData 网络层 reject：原样透传（纯请求动作不吞错）', async t => {
  axios.post = () => Promise.reject(new Error('save failed'));

  await t.throwsAsync(() => useInterfaceStore.getState().saveImportData({ project_id: 1 }), {
    message: 'save failed'
  });
});
// 纯 store 单测：无 DOM 依赖，不引入 jsdom
import test from 'ava';
import axios from 'axios';

const { default: useAddInterfaceStore } = require('../../../client/store/addInterfaceStore');

const originalAxiosGet = axios.get;

// Zustand store 为模块级单例，每条用例前复位到旧 reducer initialState
test.beforeEach(() => {
  useAddInterfaceStore.setState({
    interfaceName: '',
    url: '',
    method: 'GET',
    seqGroup: [
      {
        id: 0,
        name: '',
        value: ''
      }
    ],
    reqParams: '',
    resParams: '',
    project: {},
    clipboard: () => {}
  });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
});

test('初始状态：与旧 reducer initialState 严格一致', t => {
  const state = useAddInterfaceStore.getState();
  t.is(state.interfaceName, '');
  t.is(state.url, '');
  t.is(state.method, 'GET');
  t.deepEqual(state.seqGroup, [{ id: 0, name: '', value: '' }], '默认请求头部有一条数据');
  t.is(state.reqParams, '');
  t.is(state.resParams, '');
  t.deepEqual(state.project, {});
  t.is(typeof state.clipboard, 'function', 'clipboard 初始为函数');
});

test.serial('同步动作逐个写入对应切片', t => {
  const s = useAddInterfaceStore.getState();
  s.pushInputValue('/api/a');
  s.pushInterfaceName('接口一');
  s.pushInterfaceMethod('POST');
  s.getReqParams('req body');
  s.getResParams('res body');
  s.reqTagValue(['tag1']);
  s.reqHeaderValue(['header1']);
  s.addInterfaceClipboard(() => 'clip');

  const state = useAddInterfaceStore.getState();
  t.is(state.url, '/api/a', 'pushInputValue 应写入 url');
  t.is(state.interfaceName, '接口一', 'pushInterfaceName 应写入 interfaceName');
  t.is(state.method, 'POST', 'pushInterfaceMethod 应写入 method');
  t.is(state.reqParams, 'req body', 'getReqParams 应写入 reqParams');
  t.is(state.resParams, 'res body', 'getResParams 应写入 resParams');
  t.deepEqual(state.tagValue, ['tag1'], 'reqTagValue 动态写入 tagValue（旧 reducer 同款）');
  t.deepEqual(state.headerValue, ['header1'], 'reqHeaderValue 动态写入 headerValue（旧 reducer 同款）');
  t.is(state.clipboard(), 'clip', 'addInterfaceClipboard 应存入函数引用');
});

test.serial('addReqHeader / deleteReqHeader 整表替换 seqGroup', t => {
  const next = [
    { id: 0, name: 'Content-Type', value: 'application/json' },
    { id: 1, name: 'X-Token', value: 'abc' }
  ];
  useAddInterfaceStore.getState().addReqHeader(next);
  t.deepEqual(useAddInterfaceStore.getState().seqGroup, next, 'addReqHeader 应替换 seqGroup');

  const rest = [next[0]];
  useAddInterfaceStore.getState().deleteReqHeader(rest);
  t.deepEqual(useAddInterfaceStore.getState().seqGroup, rest, 'deleteReqHeader 应替换 seqGroup');
});

test.serial('fetchInterfaceProject 成功：GET /api/project/get 并写入 project', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { _id: 12, name: '项目A' } } });
  };

  const res = await useAddInterfaceStore.getState().fetchInterfaceProject(12);

  t.is(gets[0].url, '/api/project/get', '应请求项目详情接口');
  t.deepEqual(gets[0].params, { id: 12 }, '应以 params 携带 id（与旧 action creator 一致）');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  t.deepEqual(useAddInterfaceStore.getState().project, { _id: 12, name: '项目A' });
});

test.serial('fetchInterfaceProject 网络层 reject：返回 null 并保留旧 project', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: { _id: 1 } } });
  await useAddInterfaceStore.getState().fetchInterfaceProject(1);
  const seeded = useAddInterfaceStore.getState().project;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useAddInterfaceStore.getState().fetchInterfaceProject(2);
  t.is(res, null, '网络错误返回 null');
  t.is(useAddInterfaceStore.getState().project, seeded, '失败时保留旧 project');
});

test('同步动作为不可变替换：旧 seqGroup 引用不被原地变更', t => {
  const prev = useAddInterfaceStore.getState().seqGroup;
  useAddInterfaceStore.getState().addReqHeader([{ id: 1, name: 'a', value: 'b' }]);
  t.not(useAddInterfaceStore.getState().seqGroup, prev, 'seqGroup 应为 new 数组引用');
  t.deepEqual(prev, [{ id: 0, name: '', value: '' }], '旧 seqGroup 内容不变');
});

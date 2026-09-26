// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore/activityStore 单测风格）
import test from 'ava';
import axios from 'axios';

const { default: useInterfaceColStore } = require('../../../client/store/interfaceColStore');

const originalAxiosGet = axios.get;

// Zustand store 为模块级单例，每条用例前复位到旧 reducer initialState
test.beforeEach(() => {
  useInterfaceColStore.setState({
    interfaceColList: [
      {
        _id: 0,
        name: '',
        uid: 0,
        project_id: 0,
        desc: '',
        add_time: 0,
        up_time: 0,
        caseList: [{}]
      }
    ],
    isShowCol: true,
    isRender: false,
    currColId: 0,
    currCaseId: 0,
    currCase: {},
    currCaseList: [],
    variableParamsList: [],
    envList: []
  });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
});

const COL = { _id: 5, name: '集合A', caseList: [] };
const CASE = { _id: 100, casename: '用例一' };

test('初始状态：与旧 reducer initialState 严格一致', t => {
  const state = useInterfaceColStore.getState();
  t.is(state.isShowCol, true);
  t.is(state.isRender, false);
  t.is(state.currColId, 0);
  t.is(state.currCaseId, 0);
  t.deepEqual(state.currCase, {});
  t.deepEqual(state.currCaseList, []);
  t.deepEqual(state.variableParamsList, []);
  t.deepEqual(state.envList, []);
  t.is(state.interfaceColList.length, 1, '初始 interfaceColList 为单条占位集合');
  t.deepEqual(state.interfaceColList[0].caseList, [{}]);
});

test.serial('fetchInterfaceColList 成功：URL 与旧 action creator 一致并整表写入', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({ data: { errcode: 0, data: [COL] } });
  };

  const res = await useInterfaceColStore.getState().fetchInterfaceColList(12);

  t.is(gets[0], '/api/col/list?project_id=12', '应按旧拼接方式请求集合列表');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  t.deepEqual(useInterfaceColStore.getState().interfaceColList, [COL]);
});

test.serial('fetchCaseData / fetchCaseList / fetchCaseEnvList / fetchVariableParamsList 写入对应切片', async t => {
  const urls = [];
  axios.get = (url, config) => {
    urls.push({ url, params: config && config.params });
    if (url.indexOf('/api/col/case?') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: CASE } });
    }
    if (url.indexOf('/api/col/case_list/?') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: [CASE], colData: {} } });
    }
    if (url === '/api/col/case_env_list') {
      return Promise.resolve({ data: { errcode: 0, data: [{ _id: 'p1' }] } });
    }
    return Promise.resolve({ data: { errcode: 0, data: [CASE] } });
  };
  const { fetchCaseData, fetchCaseList, fetchCaseEnvList, fetchVariableParamsList } =
    useInterfaceColStore.getState();

  await fetchCaseData(100);
  await fetchCaseList(5);
  await fetchCaseEnvList(5);
  await fetchVariableParamsList(5);

  const state = useInterfaceColStore.getState();
  t.deepEqual(state.currCase, CASE, 'fetchCaseData 应写入 currCase');
  t.deepEqual(state.currCaseList, [CASE], 'fetchCaseList 应写入 currCaseList');
  t.deepEqual(state.envList, [{ _id: 'p1' }], 'fetchCaseEnvList 应写入 envList');
  t.deepEqual(state.variableParamsList, [CASE], 'fetchVariableParamsList 应写入 variableParamsList');

  t.deepEqual(
    urls.map(u => u.url),
    [
      '/api/col/case?caseid=100',
      '/api/col/case_list/?col_id=5',
      '/api/col/case_env_list',
      '/api/col/case_list_by_var_params?col_id=5'
    ],
    '四个请求的 URL 与旧 action creator 逐字一致'
  );
  t.deepEqual(urls[2].params, { col_id: 5 }, 'case_env_list 应以 params 携带 col_id');
});

test.serial('无 errcode 守卫：HTTP 200 但 errcode 非 0 时仍写入（旧 reducer 同款语义）', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 500, errmsg: '服务器错误' } });
  await useInterfaceColStore.getState().fetchInterfaceColList(12);
  t.is(
    useInterfaceColStore.getState().interfaceColList,
    undefined,
    '旧 reducer 无守卫，errcode 非 0 时写入 payload.data.data（此处为 undefined）'
  );
});

test.serial('网络层 reject：吞掉异常返回 null 并保留旧状态', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [COL] } });
  await useInterfaceColStore.getState().fetchInterfaceColList(12);
  const seeded = useInterfaceColStore.getState().interfaceColList;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useInterfaceColStore.getState().fetchInterfaceColList(12);
  t.is(res, null, '网络错误返回 null（消费方 .then 必达）');
  t.is(useInterfaceColStore.getState().interfaceColList, seeded, '失败时保留旧列表');
});

test.serial('setColData：浅合并片段且允许动态新增 key（等价旧 SET_COL_DATA）', t => {
  const before = useInterfaceColStore.getState();
  useInterfaceColStore.getState().setColData({ currCaseId: 100, currColId: 5, isRander: true });

  const state = useInterfaceColStore.getState();
  t.is(state.currCaseId, 100);
  t.is(state.currColId, 5);
  t.is(state.isRander, true, 'isRander 为历史遗留动态 key，应与旧 reducer 一样被合并写入');
  t.is(state.isShowCol, before.isShowCol, '未指定的字段保留旧值');
  t.is(state.interfaceColList, before.interfaceColList, '未指定的字段引用不变');
});

test.serial('数组为不可变替换：新响应生成新引用，不原地变更旧数组', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [COL] } });
  await useInterfaceColStore.getState().fetchInterfaceColList(12);
  const prevList = useInterfaceColStore.getState().interfaceColList;

  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [{ ...COL, name: '集合B' }] } });
  await useInterfaceColStore.getState().fetchInterfaceColList(12);

  const state = useInterfaceColStore.getState();
  t.not(state.interfaceColList, prevList, '新响应应替换数组引用');
  t.is(prevList[0].name, '集合A', '旧数组内容不应被原地变更');
});

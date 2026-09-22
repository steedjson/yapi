// 纯 store 单测：无 DOM 依赖，不引入 jsdom
import test from 'ava';
import axios from 'axios';

const { default: useGroupStore } = require('../../../client/store/groupStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// 旧 initialState
const INITIAL_CURR_GROUP = {
  group_name: '',
  group_desc: '',
  custom_field1: {
    name: '',
    enable: false
  }
};

// Zustand store 为模块级单例，每条用例前复位（groupRequestSequence 为模块级单调递增，
// 与旧 reducer 共享同一变量语义；守卫基准 groupRequestId 随用例复位）
test.beforeEach(() => {
  useGroupStore.setState({
    groupList: [],
    currGroup: INITIAL_CURR_GROUP,
    field: { name: '', enable: false },
    member: [],
    role: '',
    groupRequestId: 0
  });
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

const groupPayload = id => ({
  _id: id,
  group_name: '分组 ' + id,
  group_desc: '',
  custom_field1: { name: '渠道', enable: true },
  role: 'dev'
});

test('初始状态：与旧 reducer initialState 严格一致', t => {
  const state = useGroupStore.getState();
  t.deepEqual(state.groupList, []);
  t.deepEqual(state.currGroup, INITIAL_CURR_GROUP);
  t.deepEqual(state.field, { name: '', enable: false });
  t.deepEqual(state.member, []);
  t.is(state.role, '');
  t.is(state.groupRequestId, 0);
});

test.serial('fetchGroupList 成功：GET /api/group/list 并整表写入', async t => {
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({ data: { errcode: 0, data: [groupPayload(1), groupPayload(2)] } });
  };

  const res = await useGroupStore.getState().fetchGroupList();

  t.is(gets[0], '/api/group/list');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  t.is(useGroupStore.getState().groupList.length, 2);
});

test.serial('fetchGroupList 网络层 reject：返回 null 并保留旧列表', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [groupPayload(1)] } });
  await useGroupStore.getState().fetchGroupList();
  const seeded = useGroupStore.getState().groupList;

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useGroupStore.getState().fetchGroupList();
  t.is(res, null);
  t.is(useGroupStore.getState().groupList, seeded);
});

test.serial('fetchGroupList 无 errcode 守卫：HTTP 200 但 errcode 非 0 仍写入（旧 reducer 同款）', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 500, errmsg: '服务器错误' } });
  await useGroupStore.getState().fetchGroupList();
  t.is(useGroupStore.getState().groupList, undefined);
});

test.serial('setCurrGroup 成功：携带 id 请求分组详情并写入 currGroup 与 groupRequestId', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: groupPayload(71) } });
  };

  const res = await useGroupStore.getState().setCurrGroup({ _id: 71, group_name: 'x' });

  t.deepEqual(gets[0], { url: '/api/group/get', params: { id: 71 } });
  t.deepEqual(useGroupStore.getState().currGroup, groupPayload(71));
  t.true(useGroupStore.getState().groupRequestId > 0, '应入账本次请求序号');
  t.is(res.data.errcode, 0);
});

test.serial('setCurrGroup errcode 非 0：不写入且 groupRequestId 不推进', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: groupPayload(71) } });
  await useGroupStore.getState().setCurrGroup({ _id: 71 });
  const seeded = useGroupStore.getState();

  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: '无权限' } });
  await useGroupStore.getState().setCurrGroup({ _id: 72 });

  const state = useGroupStore.getState();
  t.is(state.currGroup, seeded.currGroup, '失败响应不污染已有 currGroup');
  t.is(state.groupRequestId, seeded.groupRequestId, '失败响应不推进 groupRequestId');
});

test.serial('setCurrGroup 网络层 reject：返回 null 且状态保留', async t => {
  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useGroupStore.getState().setCurrGroup({ _id: 71 });
  t.is(res, null);
  t.deepEqual(useGroupStore.getState().currGroup, INITIAL_CURR_GROUP);
});

test.serial('fetchGroupMsg 成功：写入 role/currGroup/field/groupRequestId', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: groupPayload(71) } });
  await useGroupStore.getState().fetchGroupMsg(71);

  const state = useGroupStore.getState();
  t.is(state.role, 'dev');
  t.deepEqual(state.currGroup, groupPayload(71));
  t.deepEqual(state.field, { name: '渠道', enable: true }, 'field 应镜像 custom_field1');
  t.true(state.groupRequestId > 0);
});

test.serial('fetchGroupMsg 过期响应守卫：后发先至时旧响应被丢弃', async t => {
  const pending = [];
  axios.get = (url, config) =>
    new Promise(resolve => {
      pending.push({ resolve, id: config && config.params && config.params.id });
    });

  const p1 = useGroupStore.getState().fetchGroupMsg(71); // 先发（序号 A）
  const p2 = useGroupStore.getState().setCurrGroup({ _id: 72 }); // 后发（序号 B，共用同一序列）
  t.is(pending[0].id, 71);
  t.is(pending[1].id, 72);

  pending[1].resolve({ data: { errcode: 0, data: groupPayload(72) } });
  await p2;
  const ridAfterP2 = useGroupStore.getState().groupRequestId;

  // 先发的 A 后返回：requestId(A) < groupRequestId(B) → 丢弃
  pending[0].resolve({ data: { errcode: 0, data: groupPayload(71) } });
  await p1;

  const state = useGroupStore.getState();
  t.is(state.currGroup._id, 72, '过期响应不应覆盖新分组');
  t.is(state.groupRequestId, ridAfterP2, '过期响应不应推进 groupRequestId');
  t.is(state.role, '', '过期响应不应写入 role');
});

test.serial('fetchGroupMemberList 成功写入 member；网络错误返回 null', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: [{ uid: 11 }, { uid: 22 }] } });
  };
  await useGroupStore.getState().fetchGroupMemberList(71);
  t.deepEqual(gets[0], { url: '/api/group/get_member_list', params: { id: 71 } });
  t.is(useGroupStore.getState().member.length, 2);

  axios.get = () => Promise.reject(new Error('network down'));
  const res = await useGroupStore.getState().fetchGroupMemberList(71);
  t.is(res, null, '网络错误返回 null');
});

test.serial('成员与分组写请求为纯请求动作：不触达状态并原样返回响应', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: { add_members: [], exist_members: [] } } });
  };
  const s = useGroupStore.getState();
  const snapshot = JSON.stringify({
    groupList: s.groupList,
    currGroup: s.currGroup,
    field: s.field,
    member: s.member,
    role: s.role,
    groupRequestId: s.groupRequestId
  });

  const param = { id: 71, member_uids: [11], role: 'dev' };
  const addRes = await s.addMember(param);
  const delRes = await s.delMember({ id: 71, member_uid: 11 });
  const changeRes = await s.changeMemberRole({ id: 71, member_uid: 11, role: 'owner' });
  const upRes = await s.changeGroupMsg({ id: 71, group_name: 'x' });
  const delGroupRes = await s.deleteGroup({ id: 71 });

  t.deepEqual(
    posts.map(p => p.url),
    ['/api/group/add_member', '/api/group/del_member', '/api/group/change_member_role', '/api/group/up', '/api/group/del'],
    '五个写请求的 URL 与旧 action creator 一致'
  );
  t.is(addRes.data.errcode, 0);
  t.is(delRes.data.errcode, 0);
  t.is(changeRes.data.errcode, 0);
  t.is(upRes.data.errcode, 0);
  t.is(delGroupRes.data.errcode, 0);
  t.truthy(posts[0].body === param, '请求体应原样透传');

  const after = useGroupStore.getState();
  t.is(
    JSON.stringify({
      groupList: after.groupList,
      currGroup: after.currGroup,
      field: after.field,
      member: after.member,
      role: after.role,
      groupRequestId: after.groupRequestId
    }),
    snapshot,
    '旧 reducer 无对应 case 分支，写请求不应触达任何状态'
  );
});

test.serial('updateGroupList：同步整表替换 groupList', t => {
  const list = [groupPayload(1)];
  useGroupStore.getState().updateGroupList(list);
  t.is(useGroupStore.getState().groupList, list);
});

test.serial('网络层 reject 的写请求：返回 null 不向上抛', async t => {
  axios.post = () => Promise.reject(new Error('network down'));
  const res = await useGroupStore.getState().addMember({ id: 71 });
  t.is(res, null);
});

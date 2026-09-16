import test from 'ava';
import axios from 'axios';
import reducer, { setCurrGroup, fetchGroupMsg } from '../../client/reducer/modules/group';

// 分组选中竞态回归测试：SET_CURR_GROUP 与 FETCH_GROUP_MSG 都写 currGroup，
// 共用 groupRequestSequence，最后发起的请求获胜；过期与失败响应不污染状态。

const SET_CURR_GROUP = 'yapi/group/SET_CURR_GROUP';
const FETCH_GROUP_MSG = 'yapi/group/FETCH_GROUP_MSG';

const groupPayload = id => ({
  data: {
    errcode: 0,
    data: {
      _id: id,
      group_name: '分组 ' + id,
      group_desc: '',
      role: 'owner',
      custom_field1: {name: '环境', enable: false}
    }
  }
});

test('SET_CURR_GROUP 应用最新响应并记录请求号', t => {
  const initial = reducer(undefined, {});
  t.is(initial.groupRequestId, 0);

  const current = reducer(initial, {
    type: SET_CURR_GROUP,
    requestId: 2,
    payload: groupPayload(2)
  });

  t.is(current.currGroup._id, 2);
  t.is(current.groupRequestId, 2);
});

test('SET_CURR_GROUP 忽略先发后至的旧响应（两请求乱序）', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: SET_CURR_GROUP,
    requestId: 2,
    payload: groupPayload(2)
  });
  const stale = reducer(current, {
    type: SET_CURR_GROUP,
    requestId: 1,
    payload: groupPayload(1)
  });

  t.is(stale.currGroup._id, 2);
  t.is(stale.groupRequestId, 2);
});

test('SET_CURR_GROUP 失败（errcode 非 0）保留已有分组', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: SET_CURR_GROUP,
    requestId: 1,
    payload: groupPayload(1)
  });
  const failed = reducer(current, {
    type: SET_CURR_GROUP,
    requestId: 2,
    payload: {data: {errcode: 400, errmsg: '分组不存在', data: null}}
  });

  t.is(failed.currGroup._id, 1);
  t.is(failed.groupRequestId, 1);
});

test('SET_CURR_GROUP payload 异常（缺失）保留已有分组', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: SET_CURR_GROUP,
    requestId: 1,
    payload: groupPayload(1)
  });
  const broken = reducer(current, {type: SET_CURR_GROUP, requestId: 2});

  t.is(broken.currGroup._id, 1);
});

test('FETCH_GROUP_MSG 正常响应写入 role/currGroup/field', t => {
  const initial = reducer(undefined, {});
  const next = reducer(initial, {
    type: FETCH_GROUP_MSG,
    requestId: 3,
    payload: groupPayload(3)
  });

  t.is(next.currGroup._id, 3);
  t.is(next.role, 'owner');
  t.deepEqual(next.field, {name: '环境', enable: false});
  t.is(next.groupRequestId, 3);
});

test('FETCH_GROUP_MSG 旧响应不覆盖更新的 SET_CURR_GROUP 结果（跨类型乱序）', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: SET_CURR_GROUP,
    requestId: 5,
    payload: groupPayload(5)
  });
  const staleMsg = reducer(current, {
    type: FETCH_GROUP_MSG,
    requestId: 4,
    payload: groupPayload(4)
  });

  t.is(staleMsg.currGroup._id, 5);
  t.is(staleMsg.groupRequestId, 5);
});

test('FETCH_GROUP_MSG 失败不污染 role/currGroup/field', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: FETCH_GROUP_MSG,
    requestId: 1,
    payload: groupPayload(1)
  });
  const failed = reducer(current, {
    type: FETCH_GROUP_MSG,
    requestId: 2,
    payload: {data: {errcode: 403, errmsg: '无权限', data: null}}
  });

  t.is(failed.currGroup._id, 1);
  t.is(failed.role, 'owner');
  t.deepEqual(failed.field, {name: '环境', enable: false});
  t.is(failed.groupRequestId, 1);
});

test.serial('setCurrGroup/fetchGroupMsg 每次调用分配递增请求号（共用序列）', async t => {
  const originalGet = axios.get;
  axios.get = async () => ({data: {errcode: 0, data: {_id: 9}}});
  try {
    const first = await setCurrGroup({_id: 9});
    const second = await fetchGroupMsg(9);
    const third = await setCurrGroup({_id: 9});

    t.is(first.type, SET_CURR_GROUP);
    t.is(second.type, FETCH_GROUP_MSG);
    t.is(second.requestId, first.requestId + 1);
    t.is(third.requestId, second.requestId + 1);
  } finally {
    axios.get = originalGet;
  }
});

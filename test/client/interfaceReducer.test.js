import test from 'ava';
import reducer from '../../client/reducer/modules/interface';

const FETCH_INTERFACE_DATA = 'yapi/interface/FETCH_INTERFACE_DATA';

const payload = id => ({data: {data: {_id: id, title: '接口 ' + id}}});

test('接口详情 reducer 忽略先发后至的旧响应', t => {
  const initial = reducer(undefined, {});
  const current = reducer(initial, {
    type: FETCH_INTERFACE_DATA,
    requestId: 2,
    payload: payload(2)
  });
  const stale = reducer(current, {
    type: FETCH_INTERFACE_DATA,
    requestId: 1,
    payload: payload(1)
  });

  t.is(current.curdata._id, 2);
  t.is(stale.curdata._id, 2);
});

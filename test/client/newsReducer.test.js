import test from 'ava';
import reducer from '../../client/reducer/modules/news';

const FETCH_NEWS_DATA = 'yapi/news/FETCH_NEWS_DATA';
const FETCH_MORE_NEWS = 'yapi/news/FETCH_MORE_NEWS';
const payload = list => ({data: {errcode: 0, data: {list, total: list.length}}});
const item = (id, add_time) => ({id, add_time});

test('忽略乱序旧响应', t => {
  const current = reducer(undefined, {type: FETCH_NEWS_DATA, requestId: 2, payload: payload([item(2, 2)])});
  const stale = reducer(current, {type: FETCH_NEWS_DATA, requestId: 1, payload: payload([item(1, 1)])});
  t.is(stale, current);
});

test('失败响应不污染列表', t => {
  const current = reducer(undefined, {type: FETCH_NEWS_DATA, requestId: 1, payload: payload([item(1, 1)])});
  t.is(reducer(current, {type: FETCH_NEWS_DATA, requestId: 2, payload: {data: {errcode: 1}}}), current);
  t.is(reducer(current, {type: FETCH_NEWS_DATA, requestId: 2}), current);
});

test('正常应用并排序', t => {
  const next = reducer(undefined, {type: FETCH_NEWS_DATA, requestId: 3, payload: payload([item(1, 1), item(2, 2)])});
  t.is(next.newsRequestId, 3);
  t.deepEqual(next.newsData.list.map(x => x.id), [2, 1]);
});

test('分页追加保持不可变', t => {
  const current = reducer(undefined, {type: FETCH_NEWS_DATA, requestId: 1, payload: payload([item(1, 1)])});
  const oldList = current.newsData.list;
  const next = reducer(current, {type: FETCH_MORE_NEWS, requestId: 2, payload: payload([item(2, 2)])});
  t.not(next.newsData.list, oldList);
  t.deepEqual(next.newsData.list.map(x => x.id), [2, 1]);
});

test('忽略过期分页响应', t => {
  const current = reducer(undefined, {type: FETCH_NEWS_DATA, requestId: 2, payload: payload([item(2, 2)])});
  const stale = reducer(current, {type: FETCH_MORE_NEWS, requestId: 1, payload: payload([item(1, 1)])});
  t.is(stale, current);
});

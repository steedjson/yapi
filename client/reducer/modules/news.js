// @ts-check
// Actions
const FETCH_NEWS_DATA = 'yapi/news/FETCH_NEWS_DATA';
const FETCH_MORE_NEWS = 'yapi/news/FETCH_MORE_NEWS';
let newsRequestSequence = 0;
// Reducer
const initialState = {
  newsData: {
    list: [],
    total: 0
  },
  curpage: 1,
  newsRequestId: 0
};

/**
 * @param {Record<string, any>} [state]
 * @param {any} [action]
 */
export default (state = initialState, action) => {
  switch (action.type) {
    case FETCH_NEWS_DATA: {
      const requestId = (action.meta && action.meta.requestId) || action.requestId;
      if (requestId && requestId < state.newsRequestId) return state;
      if (!action.payload || !action.payload.data || action.payload.data.errcode !== 0) return state;
      const data = action.payload.data.data;
      const list = [...data.list].sort((a, b) => b.add_time - a.add_time);
      return {
        ...state,
        newsData: { total: data.total, list },
        curpage: 1,
        newsRequestId: requestId
      };
    }
    case FETCH_MORE_NEWS: {
      const requestId = (action.meta && action.meta.requestId) || action.requestId;
      if (requestId && requestId < state.newsRequestId) return state;
      if (!action.payload || !action.payload.data || action.payload.data.errcode !== 0) return state;
      const data = action.payload.data.data;
      const list = [...state.newsData.list, ...data.list].sort((a, b) => b.add_time - a.add_time);
      return {
        ...state,
        newsData: { total: data.total, list },
        curpage: data.list && data.list.length ? state.curpage + 1 : state.curpage,
        newsRequestId: requestId
      };
    }
    default:
      return state;
  }
};

// Action Creators
import axios from 'axios';
import variable from '../../constants/variable';

/**
 * @param {any} typeid
 * @param {any} type
 * @param {any} page
 * @param {any} limit
 * @param {any} selectValue
 * @returns {{ type: string, payload: any, meta: { requestId: number, typeid: any } }}
 */
export function fetchNewsData(typeid, type, page, limit, selectValue) {
  const requestId = ++newsRequestSequence;
  const param = { typeid, type, page, limit: limit ? limit : variable.PAGE_LIMIT, selectValue };
  return {
    type: FETCH_NEWS_DATA,
    payload: axios.get('/api/log/list', { params: param }),
    meta: { requestId, typeid }
  };
}
/**
 * @param {any} typeid
 * @param {any} type
 * @param {any} page
 * @param {any} limit
 * @param {any} selectValue
 * @returns {{ type: string, payload: any, meta: { requestId: number, typeid: any } }}
 */
export function fetchMoreNews(typeid, type, page, limit, selectValue) {
  const requestId = ++newsRequestSequence;
  const param = { typeid, type, page, limit: limit ? limit : variable.PAGE_LIMIT, selectValue };
  return {
    type: FETCH_MORE_NEWS,
    payload: axios.get('/api/log/list', { params: param }),
    meta: { requestId, typeid }
  };
}

/** @param {any} project_id @returns {{ type: string, payload: any }} */
export function getMockUrl(project_id) {
  const params = { id: project_id };
  return { type: '', payload: axios.get('/api/project/get', { params: params }) };
}

/** @param {any} params @returns {{ type: string, payload: any }} */
export function fetchUpdateLogData(params) {
  return { type: '', payload: axios.post('/api/log/list_by_update', params) };
}

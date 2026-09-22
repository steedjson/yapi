// @ts-check
import { create } from 'zustand';
import axios from 'axios';
import variable from '../constants/variable';

/**
 * news 模块 Zustand store（Redux 迁移批次 2，与 menu/mockCol 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/news.js）的语义对应：
 * - 状态形状与旧 initialState 一致：newsData({list,total}) / curpage / newsRequestId，
 *   无新增/删除；
 * - 旧 redux-promise 链路：action 为 `{type, payload: axiosPromise, meta: {requestId}}`，
 *   payload resolve 后 reducer 收 `action.payload.data.data`；本 store 动作内直接
 *   await axios，按 `res.data.data` 解构，层级等价；
 * - 旧 reducer 的三段逻辑原样内聚到 applyNewsResponse：
 *   1) 过期响应守卫：requestId < 已入账 newsRequestId 时丢弃（"后发先至"竞态）；
 *   2) errcode 守卫：非 0 不写入，保留旧状态；
 *   3) 排序与翻页：按 add_time 降序；FETCH_NEWS_DATA 整表替换且 curpage 归 1，
 *      FETCH_MORE_NEWS 追加且仅在新数据非空时 curpage+1；
 * - 旧链路经 messageMiddleware 会在 errcode 非 0 时全局 toast 并抛错；本 store 静默
 *   失败：TimeLine/News 页有 ErrMsg 空态兜底，NewsTimeline 空数据优雅渲染，且旧抛错
 *   会使消费方 `.then` 中的 loading 复位永不执行（卡死），静默化同时修复该缺陷；
 * - 旧模块文件 client/reducer/modules/news.js 保留在盘上：ProjectData 仍以其
 *   fetchUpdateLogData（type 为 '' 的纯 promise 助手，不触达 news 状态）经 redux
 *   派发；newsReducer.test.js 亦直接覆盖该文件。
 */

// 模块级自增序列（旧 news.js 同名变量）：requestId 单调递增，配合守卫丢弃过期响应
let newsRequestSequence = 0;

/**
 * 应用 /api/log/list 响应（旧 reducer FETCH_NEWS_DATA / FETCH_MORE_NEWS 分支的等价实现）。
 * @param {(partial: any) => void} set
 * @param {() => any} get
 * @param {number} requestId 本次请求的自增序号
 * @param {any} res axios 响应（取值层级对应旧 action.payload）
 * @param {boolean} isMore true = FETCH_MORE_NEWS（追加），false = FETCH_NEWS_DATA（整表替换）
 */
const applyNewsResponse = (set, get, requestId, res, isMore) => {
  // 过期响应守卫（旧 reducer 同款判断）
  if (requestId && requestId < get().newsRequestId) {
    return;
  }
  // errcode 守卫：非 0 不写入，保留旧状态（旧 reducer 同款判断）
  if (!res || !res.data || res.data.errcode !== 0) {
    return;
  }
  const data = res.data.data;
  if (isMore) {
    // 追加后整体降序拷贝排序，严禁原地 sort 变更 store 内数组
    const list = [...get().newsData.list, ...data.list].sort(
      (/** @type {any} */ a, /** @type {any} */ b) => b.add_time - a.add_time
    );
    set({
      newsData: { total: data.total, list },
      curpage: data.list && data.list.length ? get().curpage + 1 : get().curpage,
      newsRequestId: requestId
    });
  } else {
    const list = [...data.list].sort(
      (/** @type {any} */ a, /** @type {any} */ b) => b.add_time - a.add_time
    );
    set({
      newsData: { total: data.total, list },
      curpage: 1,
      newsRequestId: requestId
    });
  }
};

/**
 * @param {any} typeid
 * @param {any} type
 * @param {any} page
 * @param {any} limit
 * @param {any} selectValue
 * @returns {Record<string, any>} 请求参数（limit 缺省回退 PAGE_LIMIT，旧 action creator 同款）
 */
const buildParams = (typeid, type, page, limit, selectValue) => {
  return { typeid, type, page, limit: limit ? limit : variable.PAGE_LIMIT, selectValue };
};

const useNewsStore = create((set, get) => ({
  /** @type {{ list: any[], total: number }} 动态列表与总数 */
  newsData: {
    list: [],
    total: 0
  },
  /** @type {number} 当前页码 */
  curpage: 1,
  /** @type {number} 最近一次成功入账的请求序号（过期响应守卫基准） */
  newsRequestId: 0,

  // 拉取第一页/指定页动态（整表替换）
  // 返回 axios 响应：取值层级与旧 `dispatch(fetchNewsData(...)).then(res => res.payload)`
  // 对应——`res.data` 即旧 `res.payload.data`
  /**
   * @param {any} typeid
   * @param {any} type
   * @param {any} page
   * @param {any} [limit]
   * @param {any} [selectValue]
   * @returns {Promise<any>}
   */
  fetchNewsData: async (typeid, type, page, limit, selectValue) => {
    const requestId = ++newsRequestSequence;
    try {
      const res = await axios.get('/api/log/list', {
        params: buildParams(typeid, type, page, limit, selectValue)
      });
      applyNewsResponse(set, get, requestId, res, false);
      return res;
    } catch (err) {
      // 旧 redux-promise 对 reject 的 payload 有中间件捕获，消费方 .then 必达；
      // 新 store 直抛会让消费方 .then 不执行——此处吞掉异常返回 null 保持必达语义
      return null;
    }
  },

  // 追加加载下一页动态（fetchMoreNews 与 fetchNewsData 仅追加/替换与 curpage 语义不同）
  /**
   * @param {any} typeid
   * @param {any} type
   * @param {any} page
   * @param {any} [limit]
   * @param {any} [selectValue]
   * @returns {Promise<any>}
   */
  fetchMoreNews: async (typeid, type, page, limit, selectValue) => {
    const requestId = ++newsRequestSequence;
    try {
      const res = await axios.get('/api/log/list', {
        params: buildParams(typeid, type, page, limit, selectValue)
      });
      applyNewsResponse(set, get, requestId, res, true);
      return res;
    } catch (err) {
      return null;
    }
  }
}));

export default useNewsStore;

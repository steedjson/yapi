// @ts-check
import { create } from 'zustand';
import axios from 'axios';
import variable from '../constants/variable';

/**
 * activity（动态）模块 Zustand store（Redux 迁移批次 2，与 menu/mockCol 同批；前身名 news，
 * 2026-09 随孤儿 News 页组件群删除一并更名，对齐 UI「动态」语义）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/news.js）的语义对应：
 * - 状态形状与旧 initialState 一致：activityData({list,total}) / curpage / activityRequestId，
 *   无新增/删除；
 * - 旧 redux-promise 链路：action 为 `{type, payload: axiosPromise, meta: {requestId}}`，
 *   payload resolve 后 reducer 收 `action.payload.data.data`；本 store 动作内直接
 *   await axios，按 `res.data.data` 解构，层级等价；
 * - 旧 reducer 的三段逻辑原样内聚到 applyActivityResponse：
 *   1) 过期响应守卫：requestId < 已入账 activityRequestId 时丢弃（"后发先至"竞态）；
 *   2) errcode 守卫：非 0 不写入，保留旧状态；
 *   3) 排序与翻页：按 add_time 降序；FETCH_ACTIVITY_DATA 整表替换且 curpage 归 1，
 *      FETCH_MORE_ACTIVITY 追加且仅在新数据非空时 curpage+1；
 * - 旧链路经 messageMiddleware 会在 errcode 非 0 时全局 toast 并抛错；本 store 静默
 *   失败：TimeLine 页有 ErrMsg 空态兜底，且旧抛错
 *   会使消费方 `.then` 中的 loading 复位永不执行（卡死），静默化同时修复该缺陷；
 * - fetchUpdateLogData（收尾批迁入）是例外：旧链路 ProjectData 依赖 messageMiddleware
 *   「errcode 非 0 且非 40011 → toast + throw」与 redux-promise「网络错误 reject」双双
 *   进入消费方 catch 分支提示「获取同步差异失败」，且旧 action 为 type '' 的纯 promise
 *   助手、不触达 news 状态——故该动作保持透传（网络错误原样 reject，业务错误显式
 *   throw Error(errmsg)，同批次 5 deleteInterfaceData 的「消费方 catch 依赖」先例），
 *   不套用本 store 其余动作的「吞错返回 null」口径。
 * - 旧模块文件 client/reducer/modules/news.js 已随 Redux 退役删除（收尾批），
 *   语义对照留存于本文档注释与 docs/zustand-migration-pattern.md。
 */

// 模块级自增序列（旧 news.js 同名变量）：requestId 单调递增，配合守卫丢弃过期响应
let newsRequestSequence = 0;

/**
 * 应用 /api/log/list 响应（旧 reducer FETCH_ACTIVITY_DATA / FETCH_MORE_ACTIVITY 分支的等价实现）。
 * @param {(partial: any) => void} set
 * @param {() => any} get
 * @param {number} requestId 本次请求的自增序号
 * @param {any} res axios 响应（取值层级对应旧 action.payload）
 * @param {boolean} isMore true = FETCH_MORE_ACTIVITY（追加），false = FETCH_ACTIVITY_DATA（整表替换）
 */
const applyActivityResponse = (set, get, requestId, res, isMore) => {
  // 过期响应守卫（旧 reducer 同款判断）
  if (requestId && requestId < get().activityRequestId) {
    return;
  }
  // errcode 守卫：非 0 不写入，保留旧状态（旧 reducer 同款判断）
  if (!res || !res.data || res.data.errcode !== 0) {
    return;
  }
  const data = res.data.data;
  if (isMore) {
    // 追加后整体降序拷贝排序，严禁原地 sort 变更 store 内数组
    const list = [...get().activityData.list, ...data.list].sort(
      (/** @type {any} */ a, /** @type {any} */ b) => b.add_time - a.add_time
    );
    set({
      activityData: { total: data.total, list },
      curpage: data.list && data.list.length ? get().curpage + 1 : get().curpage,
      activityRequestId: requestId
    });
  } else {
    const list = [...data.list].sort(
      (/** @type {any} */ a, /** @type {any} */ b) => b.add_time - a.add_time
    );
    set({
      activityData: { total: data.total, list },
      curpage: 1,
      activityRequestId: requestId
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

const useActivityStore = create((set, get) => ({
  /** @type {{ list: any[], total: number }} 动态列表与总数 */
  activityData: {
    list: [],
    total: 0
  },
  /** @type {number} 当前页码 */
  curpage: 1,
  /** @type {number} 最近一次成功入账的请求序号（过期响应守卫基准） */
  activityRequestId: 0,

  // 拉取第一页/指定页动态（整表替换）
  // 返回 axios 响应：取值层级与旧 `dispatch(fetchActivityData(...)).then(res => res.payload)`
  // 对应——`res.data` 即旧 `res.payload.data`
  /**
   * @param {any} typeid
   * @param {any} type
   * @param {any} page
   * @param {any} [limit]
   * @param {any} [selectValue]
   * @returns {Promise<any>}
   */
  fetchActivityData: async (typeid, type, page, limit, selectValue) => {
    const requestId = ++newsRequestSequence;
    try {
      const res = await axios.get('/api/log/list', {
        params: buildParams(typeid, type, page, limit, selectValue)
      });
      applyActivityResponse(set, get, requestId, res, false);
      return res;
    } catch (err) {
      // 旧 redux-promise 对 reject 的 payload 有中间件捕获，消费方 .then 必达；
      // 新 store 直抛会让消费方 .then 不执行——此处吞掉异常返回 null 保持必达语义
      return null;
    }
  },

  // 追加加载下一页动态（fetchMoreActivity 与 fetchActivityData 仅追加/替换与 curpage 语义不同）
  /**
   * @param {any} typeid
   * @param {any} type
   * @param {any} page
   * @param {any} [limit]
   * @param {any} [selectValue]
   * @returns {Promise<any>}
   */
  fetchMoreActivity: async (typeid, type, page, limit, selectValue) => {
    const requestId = ++newsRequestSequence;
    try {
      const res = await axios.get('/api/log/list', {
        params: buildParams(typeid, type, page, limit, selectValue)
      });
      applyActivityResponse(set, get, requestId, res, true);
      return res;
    } catch (err) {
      return null;
    }
  },

  // 拉取数据同步差异（旧 news.js 同名 action creator 的等价迁移，收尾批）
  // 旧形态为 type '' 的纯 promise 助手：reducer 无对应分支（不触达 news 状态），
  // 仅经 redux-promise 解包后返回响应本体。语义对齐（见文件头 JSDoc）：
  // - 成功：返回 axios 响应本体，取值层级与旧 `result.payload.data` 对应——
  //   消费方从 `result.payload.data.data` 改为 `result.data.data`；
  // - errcode 非 0 且非 40011：显式 throw Error(errmsg)（镜像旧 messageMiddleware
  //   的 toast + throw，ProjectData catch 分支依赖该 reject 语义）；
  // - 网络层错误：原样 reject 透传（同批次 5 纯请求动作的「消费方 catch 依赖」先例）。
  /**
   * @param {any} params 含 type/typeid/apis
   * @returns {Promise<any>} axios 响应
   * @throws {Error} errcode 非 0 且非 40011 时抛出（errmsg 取自响应体）
   */
  fetchUpdateLogData: async params => {
    const res = await axios.post('/api/log/list_by_update', params);
    const errcode = res && res.data && res.data.errcode;
    if (errcode && errcode !== 40011) {
      throw new Error(res.data.errmsg);
    }
    return res;
  }
}));

export default useActivityStore;

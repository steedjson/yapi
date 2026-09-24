// @ts-check
import { create } from 'zustand';
import axios from 'axios';
import qs from 'qs';

/**
 * interface（inter）模块 Zustand store（Redux 迁移批次 5，收官批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/interface.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：curdata/list/editStatus/totalTableList/
 *   catTableList/count/totalCount/interfaceRequestId，无新增/删除；
 * - FETCH_INTERFACE_DATA 的守卫原样内聚到 fetchInterfaceData：
 *   1) 过期响应守卫：requestId < 已入账 interfaceRequestId 时丢弃（快速切换接口时
 *      忽略先发后至的旧响应）；
 *   2) errcode 守卫：非 0（或响应体异常）不写入，保留旧状态；
 * - fetchInterfaceListMenu / fetchInterfaceList / fetchInterfaceCatList：旧链路
 *   messageMiddleware 在 errcode 非 0 且非 40011 时先 toast 再 throw（reducer 不可达），
 *   故等价语义为「errcode === 0 才写入」；40011 特例旧版不 throw 会写入
 *   errmsg 对应的空数据（缺陷行为），新版一律保留旧状态（守卫修正）；
 * - deleteInterfaceData / deleteInterfaceCatData / saveImportData 在旧 reducer 中
 *   本就不触达状态（无对应 case 分支），此处为纯请求动作，返回 axios 响应；
 *   网络层错误原样 reject 透传 —— 消费方（InterfaceMenu 删除确认）的 catch 分支
 *   依赖 reject 走「接口删除失败」提示，不得吞成 null；
 * - 其余 fetch* 动作网络层 reject 时返回 null（groupStore 批次同款）并保留旧状态；
 * - 旧链路 messageMiddleware 的 errcode 全局 toast 随迁移静默化：消费方自带
 *   errcode 分支与本地提示（InterfaceList/InterfaceMenu/InterfaceContent 等），
 *   旧版「中间件 toast + 消费方 toast」双提示收敛为单提示（已知轻微 UX 差异）；
 * - 旧模块文件 client/reducer/modules/interface.js 保留在盘上：interfaceReducer.test.js
 *   仍直接覆盖该文件，待 redux 三件套收尾批次统一清理。
 */

// 模块级自增序列（旧 interface.js 同名变量）：requestId 单调递增，配合守卫丢弃过期响应
let interfaceRequestSequence = 0;

const initialState = {
  /** @type {Record<string, any>} 当前接口详情 */
  curdata: {},
  /** @type {any[]} 分类树（接口列表菜单） */
  list: [],
  /** @type {boolean} 记录编辑页面是否有编辑 */
  editStatus: false,
  /** @type {any[]} 全部接口分页表格数据 */
  totalTableList: [],
  /** @type {any[]} 分类接口分页表格数据 */
  catTableList: [],
  /** @type {number} 分类接口总数 */
  count: 0,
  /** @type {number} 全部接口总数 */
  totalCount: 0,
  /** @type {number} 最近一次成功入账的详情请求序号（过期响应守卫基准） */
  interfaceRequestId: 0
};

const useInterfaceStore = create((/** @type {any} */ set, /** @type {any} */ get) => ({
  ...initialState,

  // 获取接口详情（守卫内聚，同旧 FETCH_INTERFACE_DATA）
  /**
   * @param {any} interfaceId
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchInterfaceData: async interfaceId => {
    const requestId = ++interfaceRequestSequence;
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/interface/get?id=' + interfaceId);
    } catch (err) {
      return null;
    }
    // 过期响应守卫：快速切换接口时忽略先发后至的旧响应（旧 reducer 同款判断）
    if (requestId && requestId < get().interfaceRequestId) {
      return res;
    }
    // errcode 守卫：失败响应不污染已有详情（旧 reducer 同款判断）
    if (!res || !res.data || res.data.errcode !== 0) {
      return res;
    }
    set({
      curdata: res.data.data,
      interfaceRequestId: requestId || get().interfaceRequestId
    });
    return res;
  },

  // 获取分类树（接口列表菜单），errcode === 0 才写入
  /**
   * @param {any} projectId
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchInterfaceListMenu: async projectId => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/interface/get_cat_tree?project_id=' + projectId);
    } catch (err) {
      return null;
    }
    if (!res || !res.data || res.data.errcode !== 0) {
      return res;
    }
    set({ list: res.data.data });
    return res;
  },

  // 获取全部接口分页列表，errcode === 0 才写入
  /**
   * @param {any} params
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchInterfaceList: async params => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/interface/list', {
        params,
        paramsSerializer: (/** @type {any} */ params) => {
          return qs.stringify(params, { indices: false });
        }
      });
    } catch (err) {
      return null;
    }
    if (!res || !res.data || res.data.errcode !== 0) {
      return res;
    }
    set({
      totalTableList: res.data.data.list,
      totalCount: res.data.data.count
    });
    return res;
  },

  // 获取分类接口分页列表，errcode === 0 才写入
  /**
   * @param {any} params
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchInterfaceCatList: async params => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/interface/list_cat', {
        params,
        paramsSerializer: (/** @type {any} */ params) => {
          return qs.stringify(params, { indices: false });
        }
      });
    } catch (err) {
      return null;
    }
    if (!res || !res.data || res.data.errcode !== 0) {
      return res;
    }
    set({
      catTableList: res.data.data.list,
      count: res.data.data.count
    });
    return res;
  },

  // 记录编辑页面是否有编辑（同旧 CHANGE_EDIT_STATUS）
  /**
   * @param {any} status
   */
  changeEditStatus: status => {
    set({ editStatus: status });
  },

  // 重置接口状态（同旧 INIT_INTERFACE_DATA 返回 initialState）
  initInterface: () => {
    set({ ...initialState });
  },

  // 更新接口详情（同旧 UPDATE_INTERFACE_DATA 浅合并语义）
  /**
   * @param {any} updata
   */
  updateInterfaceData: updata => {
    set({ curdata: Object.assign({}, get().curdata, updata) });
  },

  // 删除接口（旧 reducer 无状态写入，纯请求动作；网络错误原样透传）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应
   */
  deleteInterfaceData: async id => {
    return await axios.post('/api/interface/del', { id: id });
  },

  // 删除接口分类（纯请求动作；网络错误原样透传）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应
   */
  deleteInterfaceCatData: async id => {
    return await axios.post('/api/interface/del_cat', { catid: id });
  },

  // 保存导入数据（纯请求动作；网络错误原样透传）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应
   */
  saveImportData: async data => {
    return await axios.post('/api/interface/save', data);
  }
}));

export default useInterfaceStore;
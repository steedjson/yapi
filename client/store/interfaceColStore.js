// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * interfaceCol 模块 Zustand store（Redux 迁移批次 3，与 addInterface/group 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/interfaceCol.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：interfaceColList/isShowCol/isRender/currColId/
 *   currCaseId/currCase/currCaseList/variableParamsList/envList，无新增/删除；
 *   （注：消费方经 setColData 写入的 isRander 是历史遗留的动态新增 key，与 initialState
 *   的 isRender 拼写不一致，此处保持两者并存、与旧行为逐字节一致）；
 * - 旧 redux-promise 链路：action 为 `{type, payload: axiosPromise}`，payload resolve 后
 *   reducer 收 `action.payload.data.data`；本 store 动作内直接 await axios，按
 *   `res.data.data` 解构，层级等价；
 * - 旧 reducer 对五个 fetch 均「无 errcode 守卫」（HTTP 200 即写入，与 mockCol 批次同款），
 *   errcode 非 0 时写入 undefined 值，消费方自行判断 errcode（如 InterfaceColContent 的
 *   fetchCaseList 分支）；此处原样保留该语义；
 * - 网络层 reject 的差异：旧版经 redux-promise error action 后 reducer 读取
 *   `payload.data.data` 直接抛 TypeError（未处理 rejection）；本 store 捕获后返回 null
 *   并保留旧状态（mockCol 批次同款修正）；
 * - 旧链路 messageMiddleware 的 errcode 全局 toast 随迁移静默化：InterfaceCol 页面
 *   消费方自带 errcode 分支/本地提示，无对全局 toast 的行为依赖；
 * - setColData 为同步动作，等价旧 SET_COL_DATA 的浅合并 `{...state, ...payload}`
 *   （zustand 的 set 对象入参默认浅合并，允许动态新增 key）；
 * - 旧模块文件 client/reducer/modules/interfaceCol.js 已随 Redux 退役删除（收尾批，
 *   全部消费方迁移后已无 import 方）。
 */

const initialState = {
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
};

/**
 * GET 请求的通用包装：网络层 reject 时返回 null（保留旧状态），
 * HTTP 200 一律返回 axios 响应交给调用方写入（无 errcode 守卫，与旧 reducer 一致）。
 * @param {string} url
 * @param {any} [config]
 * @returns {Promise<any>}
 */
const getOrThrow = async (url, config) => {
  try {
    return await axios.get(url, config);
  } catch (err) {
    return null;
  }
};

const useInterfaceColStore = create((/** @type {any} */ set) => ({
  ...initialState,

  // 拉取项目测试集合列表（无 errcode 守卫，同旧 FETCH_INTERFACE_COL_LIST）
  /**
   * @param {any} projectId
   * @returns {Promise<any>} axios 响应；取值层级对应旧 `res.payload.data`；网络错误返回 null
   */
  fetchInterfaceColList: async projectId => {
    const res = await getOrThrow('/api/col/list?project_id=' + projectId);
    if (res) {
      set({ interfaceColList: res.data.data });
    }
    return res;
  },

  // 拉取单个用例数据（无 errcode 守卫，同旧 FETCH_CASE_DATA）
  /**
   * @param {any} caseId
   * @returns {Promise<any>}
   */
  fetchCaseData: async caseId => {
    const res = await getOrThrow('/api/col/case?caseid=' + caseId);
    if (res) {
      set({ currCase: res.data.data });
    }
    return res;
  },

  // 拉取集合用例列表（无 errcode 守卫，同旧 FETCH_CASE_LIST；响应体含 colData 供消费方读取）
  /**
   * @param {any} colId
   * @returns {Promise<any>}
   */
  fetchCaseList: async colId => {
    const res = await getOrThrow('/api/col/case_list/?col_id=' + colId);
    if (res) {
      set({ currCaseList: res.data.data });
    }
    return res;
  },

  // 拉取集合下各项目环境变量列表（无 errcode 守卫，同旧 FETCH_CASE_ENV_LIST）
  /**
   * @param {any} col_id
   * @returns {Promise<any>}
   */
  fetchCaseEnvList: async col_id => {
    const res = await getOrThrow('/api/col/case_env_list', {
      params: { col_id }
    });
    if (res) {
      set({ envList: res.data.data });
    }
    return res;
  },

  // 拉取变量参数列表（无 errcode 守卫，同旧 FETCH_VARIABLE_PARAMS_LIST）
  /**
   * @param {any} colId
   * @returns {Promise<any>}
   */
  fetchVariableParamsList: async colId => {
    const res = await getOrThrow('/api/col/case_list_by_var_params?col_id=' + colId);
    if (res) {
      set({ variableParamsList: res.data.data });
    }
    return res;
  },

  // 同步浅合并片段（等价旧 SET_COL_DATA 的 `{...state, ...payload}`，允许动态新增 key）
  /**
   * @param {Record<string, any>} data
   */
  setColData: data => {
    set(data);
  }
}));

export default useInterfaceColStore;

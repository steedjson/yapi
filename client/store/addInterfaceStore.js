// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * addInterface 模块 Zustand store（Redux 迁移批次 3，与 interfaceCol/group 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/addInterface.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：interfaceName/url/method/seqGroup/reqParams/
 *   resParams/project/clipboard，无新增/删除（tagValue/headerValue 为旧 reducer 经
 *   action 动态写入的 key，此处由 zustand set 同机制动态新增）；
 * - 除 fetchInterfaceProject 外全部为同步动作，等价替代旧 redux action creator；
 * - fetchInterfaceProject：旧 redux-promise 链路无 errcode 守卫（HTTP 200 即写入
 *   `payload.data.data`），此处原样保留；网络层 reject 时返回 null 并保留旧状态；
 * - clipboard 字段存函数（旧 initialState 即为 `() => {}`），zustand set 原样存引用；
 * - 旧模块文件 client/reducer/modules/addInterface.js 已随 Redux 退役删除（收尾批）；
 *   该模块在删除前已无任何 import 方与状态读取方，注销 combineReducers
 *   无行为影响，待后续批次清理。
 */

const useAddInterfaceStore = create((/** @type {any} */ set) => ({
  /** @type {string} 接口名称 */
  interfaceName: '',
  /** @type {string} 接口路径 */
  url: '',
  /** @type {string} 请求方法 */
  method: 'GET',
  /** @type {any[]} 默认请求头部有一条数据 */
  seqGroup: [
    {
      id: 0,
      name: '',
      value: ''
    }
  ],
  /** @type {string} 请求参数编辑器内容 */
  reqParams: '',
  /** @type {string} 响应参数编辑器内容 */
  resParams: '',
  /** @type {Record<string, any>} 所属项目信息 */
  project: {},
  /** @type {() => void} 剪切板回调 */
  clipboard: () => {},

  /**
   * @param {any} value
   */
  pushInputValue: value => {
    set({ url: value });
  },

  /**
   * @param {any} value
   */
  reqTagValue: value => {
    set({ tagValue: value });
  },

  /**
   * @param {any} value
   */
  reqHeaderValue: value => {
    set({ headerValue: value });
  },

  /**
   * @param {any} value
   */
  addReqHeader: value => {
    set({ seqGroup: value });
  },

  /**
   * @param {any} value
   */
  deleteReqHeader: value => {
    set({ seqGroup: value });
  },

  /**
   * @param {any} value
   */
  getReqParams: value => {
    set({ reqParams: value });
  },

  /**
   * @param {any} value
   */
  getResParams: value => {
    set({ resParams: value });
  },

  /**
   * @param {any} value
   */
  pushInterfaceName: value => {
    set({ interfaceName: value });
  },

  /**
   * @param {any} value
   */
  pushInterfaceMethod: value => {
    set({ method: value });
  },

  // 拉取项目信息（无 errcode 守卫，同旧 FETCH_INTERFACE_PROJECT）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；取值层级对应旧 `res.payload.data`；网络错误返回 null
   */
  fetchInterfaceProject: async id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/get', { params: { id } });
    } catch (err) {
      return null;
    }
    set({ project: res.data.data });
    return res;
  },

  /**
   * @param {any} func
   */
  addInterfaceClipboard: func => {
    set({ clipboard: func });
  }
}));

export default useAddInterfaceStore;

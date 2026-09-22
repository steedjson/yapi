// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * follow 模块 Zustand store（Redux 迁移试点）。
 * 迁移模式与redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/follow.js）的语义对应：
 * - 旧 redux-promise action 为 `{type, payload: axiosPromise}`，reducer 收到
 *   `action.payload.data.data`（axios 响应体含一层 data 包裹）；本 store 在 action
 *   函数内直接 await axios，按 `res.data.data` 解构，层级等价；
 * - data 收紧为「列表数组」：旧 reducer 存整个 `body.data`（`{list: [...]}`），
 *   但全仓无任何 `state.follow` 读取方，页面渲染实际使用 `body.data.list`，
 *   故此处直接存 list 数组，与初始值 `[]` 类型一致；
 * - errcode !== 0 时不写入 data（旧页面层以 `errcode === 0` 守卫，行为一致）；
 * - loading 为显式新增语义：请求期间 true，finally 复位（旧版无 loading）。
 */
const useFollowStore = create((set, get) => ({
  /** @type {any[]} 关注的项目列表 */
  data: [],
  /** @type {boolean} 列表请求是否进行中 */
  loading: false,
  /** @type {number | null} 最近一次拉取列表的 uid，供 add/del 成功后重拉列表 */
  _uid: null,

  // 获取关注列表
  // 返回 axios 响应：取值层级与旧 `dispatch(getFollowList(uid)).then(res => res.payload)`
  // 对应——`res.data` 即旧 `res.payload.data`
  /**
   * @param {any} uid
   * @returns {Promise<any>}
   */
  getFollowList: async uid => {
    set({ loading: true });
    try {
      const res = await axios.get('/api/follow/list', {
        params: { uid }
      });
      if (res.data.errcode === 0) {
        set({ data: res.data.data.list, _uid: uid });
      }
      return res;
    } finally {
      set({ loading: false });
    }
  },

  // 添加关注；成功后重拉列表（旧版由 ProjectCard callbackResult 驱动重拉，此处内聚）
  /**
   * @param {any} param 含 uid/projectid/projectname/icon/color
   * @returns {Promise<any>}
   */
  addFollow: async param => {
    const res = await axios.post('/api/follow/add', param);
    if (res.data.errcode === 0) {
      // 重拉 uid 与刚写入的关注记录保持一致：优先取 param.uid，
      // 缺省时回退最近一次拉取列表记录的 _uid；两者皆无则跳过重拉
      const uid = param && param.uid != null ? param.uid : get()._uid;
      if (uid != null) {
        await get().getFollowList(uid);
      }
    }
    return res;
  },

  // 删除关注；成功后重拉列表
  /**
   * @param {any} id projectid
   * @returns {Promise<any>}
   */
  delFollow: async id => {
    const res = await axios.post('/api/follow/del', { projectid: id });
    if (res.data.errcode === 0) {
      const uid = get()._uid;
      if (uid !== null) {
        await get().getFollowList(uid);
      }
    }
    return res;
  }
}));

export default useFollowStore;

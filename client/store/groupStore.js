// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * group 模块 Zustand store（Redux 迁移批次 3，与 interfaceCol/addInterface 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/group.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：groupList/currGroup/field/member/role/
 *   groupRequestId，无新增/删除；
 * - SET_CURR_GROUP 与 FETCH_GROUP_MSG 共用模块级自增序号 groupRequestSequence，
 *   「最后发起的分组请求获胜」，与旧 reducer 完全同款；
 * - 两个守卫原样内聚到 applyGroupResponse（旧 reducer 同款判断）：
 *   1) 过期响应守卫：requestId < 已入账 groupRequestId 时丢弃；
 *   2) errcode 守卫：非 0（或响应体异常）不写入，保留旧状态；
 * - fetchGroupList/fetchGroupMemberList 沿用旧 reducer「无 errcode 守卫」语义
 *   （HTTP 200 即写入）；网络层 reject 时返回 null 并保留旧状态（mockCol 批次同款）；
 * - addMember/delMember/changeMemberRole/changeGroupMsg/deleteGroup 在旧 reducer 中
 *   本就不触达状态（无对应 case 分支），此处为纯请求动作，返回 axios 响应；
 * - 旧链路 messageMiddleware 的 errcode 全局 toast 随迁移静默化：消费方自带
 *   errcode 分支与本地提示（MemberList/GroupSetting/GroupList 等），无对全局
 *   toast 的行为依赖；
 * - 旧模块文件 client/reducer/modules/group.js 已随 Redux 退役删除（收尾批），
 *   groupReducer.test.js 的用例语义先移植到本文件单测后随文件删除。
 */

// 模块级自增序列（旧 group.js 同名变量）：requestId 单调递增，配合守卫丢弃过期响应
let groupRequestSequence = 0;

/**
 * SET_CURR_GROUP / FETCH_GROUP_MSG 共用的响应守卫（旧 reducer 同款判断）。
 * @param {() => any} get
 * @param {number} requestId 本次请求的自增序号
 * @param {any} res axios 响应（取值层级对应旧 action.payload）
 * @returns {boolean} false = 命中守卫，调用方应跳过写入
 */
const isStaleOrFailed = (get, requestId, res) => {
  // 过期响应守卫：快速切换分组时忽略先发后至的旧响应
  if (requestId && requestId < get().groupRequestId) {
    return true;
  }
  // errcode 守卫：失败响应不污染已有状态
  if (!res || !res.data || res.data.errcode !== 0) {
    return true;
  }
  return false;
};

const useGroupStore = create((/** @type {any} */ set, /** @type {any} */ get) => ({
  /** @type {any[]} 分组列表 */
  groupList: [],
  /** @type {Record<string, any>} 当前选中分组 */
  currGroup: {
    group_name: '',
    group_desc: '',
    custom_field1: {
      name: '',
      enable: false
    }
  },
  /** @type {Record<string, any>} 当前分组的自定义字段（currGroup.custom_field1 的镜像） */
  field: {
    name: '',
    enable: false
  },
  /** @type {any[]} 当前分组成员列表 */
  member: [],
  /** @type {string} 当前用户在当前分组中的角色 */
  role: '',
  /** @type {number} 最近一次成功入账的分组请求序号（过期响应守卫基准） */
  groupRequestId: 0,

  // 获取分组列表（无 errcode 守卫，同旧 FETCH_GROUP_LIST）
  /**
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchGroupList: async () => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/group/list');
    } catch (err) {
      return null;
    }
    set({ groupList: res.data.data });
    return res;
  },

  // 更新左侧的分组列表（同步动作，等价旧 UPDATE_GROUP_LIST 的整表替换）
  /**
   * @param {any} param
   */
  updateGroupList: param => {
    set({ groupList: param });
  },

  // 选中分组（守卫内聚：过期/失败响应不写入，同旧 SET_CURR_GROUP）
  /**
   * @param {any} group
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  setCurrGroup: async group => {
    const requestId = ++groupRequestSequence;
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/group/get', {
        params: { id: group._id }
      });
    } catch (err) {
      return null;
    }
    if (isStaleOrFailed(get, requestId, res)) {
      return res;
    }
    set({
      currGroup: res.data.data,
      groupRequestId: requestId || get().groupRequestId
    });
    return res;
  },

  // 获取分组信息（含权限），守卫内聚同旧 FETCH_GROUP_MSG
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchGroupMsg: async id => {
    const requestId = ++groupRequestSequence;
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/group/get', {
        params: { id }
      });
    } catch (err) {
      return null;
    }
    if (isStaleOrFailed(get, requestId, res)) {
      return res;
    }
    const data = res.data.data;
    set({
      role: data.role,
      currGroup: data,
      field: {
        name: data.custom_field1.name,
        enable: data.custom_field1.enable
      },
      groupRequestId: requestId || get().groupRequestId
    });
    return res;
  },

  // 获取分组成员列表（无 errcode 守卫，同旧 FETCH_GROUP_MEMBER）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchGroupMemberList: async id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/group/get_member_list', {
        params: { id }
      });
    } catch (err) {
      return null;
    }
    set({ member: res.data.data });
    return res;
  },

  // 添加分组成员（旧 reducer 无状态写入，纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  addMember: async param => {
    try {
      return await axios.post('/api/group/add_member', param);
    } catch (err) {
      return null;
    }
  },

  // 删除分组成员（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>}
   */
  delMember: async param => {
    try {
      return await axios.post('/api/group/del_member', param);
    } catch (err) {
      return null;
    }
  },

  // 修改分组成员权限（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>}
   */
  changeMemberRole: async param => {
    try {
      return await axios.post('/api/group/change_member_role', param);
    } catch (err) {
      return null;
    }
  },

  // 修改分组信息（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>}
   */
  changeGroupMsg: async param => {
    try {
      return await axios.post('/api/group/up', param);
    } catch (err) {
      return null;
    }
  },

  // 删除分组（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>}
   */
  deleteGroup: async param => {
    try {
      return await axios.post('/api/group/del', param);
    } catch (err) {
      return null;
    }
  }
}));

export default useGroupStore;

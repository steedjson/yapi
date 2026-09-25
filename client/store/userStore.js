// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * user 模块 Zustand store（Redux 迁移批次 4，与 project 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/user.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：isLogin/canRegister/isLDAP/userName/uid/
 *   email/loginState/loginWrapActiveKey/role/type/breadcrumb/studyTip/study/imageUrl，
 *   无新增/删除；
 * - 登录态三态门禁（Application.js route(status) 依赖）保持不变：
 *   LOADING_STATUS(0) → GUEST_STATUS(1) / MEMBER_STATUS(2)；
 * - checkLoginState 仅在 errcode === 0 或 40011（未登录）时写入：旧链路中其余
 *   errcode 会被 messageMiddleware 拦截（toast + throw），reducer 从未收到；
 *   GET_LOGIN_STATE 的字段映射逐字段保留（含 `ladp` 历史拼写，读的是响应体的
 *   ladp 字段，非 isLDAP）；
 * - loginActions/loginLdapActions/regActions 沿旧 LOGIN/REGISTER case 的
 *   errcode === 0 守卫，非 0 不写状态（旧链路被 messageMiddleware 拦截）；
 * - logoutActions/finishStudy 沿旧 LOGIN_OUT/FINISH_STUDY case「不读 payload、
 *   请求落地即写状态」语义：网络错误也不阻断状态复位，返回 null；
 * - 旧链路 messageMiddleware 的 errcode 全局 toast 随迁移静默化：登录/注册页
 *   自带 errmsg 提示与 catch 分支（Login/Reg），Header 退出有 errcode 分支，
 *   无对全局 toast 的行为依赖；
 * - 动作命名与旧 action creator 一致（loginActions/logoutActions 等），消费方
 *   以 `loginActions(p).then(res => res.data…)` 直调；
 * - 旧模块文件 client/reducer/modules/user.js 已随 Redux 退役删除（收尾批，
 *   删除前已无状态读取方与派发方）。
 */

// 登录态三态（旧 user.js 同名常量）：0 加载中 / 1 游客 / 2 成员
const LOADING_STATUS = 0;
const GUEST_STATUS = 1;
const MEMBER_STATUS = 2;

const useUserStore = create((/** @type {any} */ set) => ({
  /** @type {boolean} 是否已登录（/api/user/status 或登录/注册动作写入） */
  isLogin: false,
  /** @type {boolean} 是否允许注册（服务端下发） */
  canRegister: true,
  /** @type {boolean} 是否启用 LDAP 登录（注意：旧代码读响应体的 ladp 字段） */
  isLDAP: false,
  /** @type {string | null} 用户名 */
  userName: null,
  /** @type {number | null} 当前用户 uid */
  uid: null,
  /** @type {string} 当前用户邮箱 */
  email: '',
  /** @type {number} 登录态门禁：0 加载中 / 1 游客 / 2 成员 */
  loginState: LOADING_STATUS,
  /** @type {string} 登录/注册 Tabs 初始激活页 */
  loginWrapActiveKey: '1',
  /** @type {string} 当前用户全局角色（admin/member 等） */
  role: '',
  /** @type {string} 账号类型（site/ldap） */
  type: '',
  /** @type {any[]} 面包屑条目 */
  breadcrumb: [],
  /** @type {number} 新手引导当前步 */
  studyTip: 0,
  /** @type {boolean} 新手引导是否已完成 */
  study: false,
  /** @type {string} 自定义头像（base64） */
  imageUrl: '',

  // 获取登录状态（对应旧 GET_LOGIN_STATE；errcode 守卫见文件头说明）
  /**
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  checkLoginState: async () => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/user/status');
    } catch (err) {
      return null;
    }
    const body = res.data;
    // 旧链路仅 errcode 0（成员）/40011（游客）能到达 reducer，其余被
    // messageMiddleware 拦截不写状态；此处同款守卫
    if (!body || (body.errcode !== 0 && body.errcode !== 40011)) {
      return res;
    }
    set({
      isLogin: body.errcode == 0,
      // 保留旧 reducer 的 ladp 拼写（读响应体 ladp 字段）
      isLDAP: body.ladp,
      canRegister: body.canRegister,
      role: body.data ? body.data.role : null,
      loginState: body.errcode == 0 ? MEMBER_STATUS : GUEST_STATUS,
      userName: body.data ? body.data.username : null,
      uid: body.data ? body.data._id : null,
      type: body.data ? body.data.type : null,
      study: body.data ? body.data.study : false
    });
    return res;
  },

  // 站内账号登录（对应旧 LOGIN；errcode 非 0 不写状态）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  loginActions: async data => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.post('/api/user/login', data);
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0 && res.data.data) {
      set({
        isLogin: true,
        loginState: MEMBER_STATUS,
        uid: res.data.data.uid,
        userName: res.data.data.username,
        role: res.data.data.role,
        type: res.data.data.type,
        study: res.data.data.study
      });
    }
    return res;
  },

  // LDAP 登录（对应旧 LOGIN，端点不同）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  loginLdapActions: async data => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.post('/api/user/login_by_ldap', data);
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0 && res.data.data) {
      set({
        isLogin: true,
        loginState: MEMBER_STATUS,
        uid: res.data.data.uid,
        userName: res.data.data.username,
        role: res.data.data.role,
        type: res.data.data.type,
        study: res.data.data.study
      });
    }
    return res;
  },

  // 注册（对应旧 REGISTER；errcode === 0 才写状态）
  /**
   * @param {any} data 含 email/password/userName
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  regActions: async data => {
    const { email, password, userName } = data;
    const param = {
      email,
      password,
      username: userName
    };
    let res = /** @type {any} */ (null);
    try {
      res = await axios.post('/api/user/reg', param);
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0 && res.data.data) {
      set({
        isLogin: true,
        loginState: MEMBER_STATUS,
        uid: res.data.data.uid,
        userName: res.data.data.username,
        type: res.data.data.type,
        study: res.data.data ? res.data.data.study : false
      });
    }
    return res;
  },

  // 退出登录（对应旧 LOGIN_OUT：请求落地即复位为游客态，网络错误亦复位）
  /**
   * @returns {Promise<any>} axios 响应；网络错误返回 null（状态仍复位）
   */
  logoutActions: async () => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/user/logout');
    } catch (err) {
      res = null;
    }
    set({
      isLogin: false,
      loginState: GUEST_STATUS,
      userName: null,
      uid: null,
      role: '',
      type: ''
    });
    return res;
  },

  // 切换登录/注册 Tabs（同步动作，对应旧 LOGIN_TYPE）
  /**
   * @param {any} index
   */
  loginTypeAction: index => {
    set({ loginWrapActiveKey: index });
  },

  // 设置面包屑（同步动作，对应旧 SET_BREADCRUMB）
  /**
   * @param {any} data
   */
  setBreadcrumb: data => {
    set({ breadcrumb: data });
  },

  // 设置自定义头像（同步动作，对应旧 SET_IMAGE_URL）
  /**
   * @param {any} data
   */
  setImageUrl: data => {
    set({ imageUrl: data });
  },

  // 新手引导进入下一步（同步动作，对应旧 CHANGE_STUDY_TIP）
  changeStudyTip: () => {
    set((/** @type {any} */ state) => ({ studyTip: state.studyTip + 1 }));
  },

  // 完成新手引导（对应旧 FINISH_STUDY：请求落地即写状态，网络错误亦写）
  /**
   * @returns {Promise<any>} axios 响应；网络错误返回 null（状态仍写入）
   */
  finishStudy: async () => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/user/up_study');
    } catch (err) {
      res = null;
    }
    set({ study: true, studyTip: 0 });
    return res;
  }
}));

export default useUserStore;

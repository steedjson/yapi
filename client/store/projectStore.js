// @ts-check
import { create } from 'zustand';
import axios from 'axios';
import variable from '../constants/variable';
import { htmlFilter } from '../common';

/**
 * project 模块 Zustand store（Redux 迁移批次 4，与 user 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/project.js）的语义对应：
 * - 状态形状与旧 initialState 严格一致：isUpdateModalShow/handleUpdateIndex/
 *   projectList/projectMsg/userInfo/tableLoading/total/currPage/token/currProject/
 *   projectEnv/swaggerUrlData，无新增/删除（注意：projectMsg 无独立存储，消费方
 *   读取的 projectMsg 即 currProject，与旧 @connect 映射一致）；
 * - 有状态写入的动作（fetchProjectList/getProject/getToken/updateToken/getEnv/
 *   handleSwaggerUrlData）沿用旧 reducer 写入映射，并内聚 errcode === 0 守卫：
 *   旧链路其余 errcode 会被 messageMiddleware 拦截（toast + throw），reducer 从未
 *   收到，守卫后失败保留旧状态；
 * - 旧 reducer 无 case 分支的动作（addProject/updateProject/updateProjectScript/
 *   updateProjectMock/updateEnv/upsetProject/delProject/copyProjectMsg/addMember/
 *   delMember/changeMemberRole/changeMemberEmailNotice/getProjectMemberList/
 *   checkProjectName）本就不触达状态，此处为纯请求动作，返回 axios 响应；
 * - addProject/updateProject 沿用旧实现的 htmlFilter(name) 过滤与参数重组；
 * - 旧链路 messageMiddleware 的 errcode 全局 toast 随迁移静默化：各消费方
 *   （ProjectMessage/ProjectMember/ProjectEnv 等）自带 errcode 分支与本地提示，
 *   无对全局 toast 的行为依赖；
 * - 动作命名与旧 action creator 一致（getProject/getToken/fetchProjectList 等），
 *   消费方以 `getProject(id).then(res => res.data…)` 直调；
 * - 旧模块文件 client/reducer/modules/project.js 保留在盘上（本批次禁止删除旧
 *   reducer 文件）：已无状态读取方与派发方，待后续批次清理。
 */

const useProjectStore = create((/** @type {any} */ set) => ({
  /** @type {boolean} 更新项目弹窗开关（旧 initialState 字段，现无消费方，形状保留） */
  isUpdateModalShow: false,
  /** @type {number} 更新项目弹窗目标索引（旧 initialState 字段，现无消费方，形状保留） */
  handleUpdateIndex: -1,
  /** @type {any[]} 当前分组下的项目列表 */
  projectList: [],
  /** @type {Record<string, any>} 旧 initialState 字段（现无消费方，形状保留） */
  projectMsg: {},
  /** @type {Record<string, any>} 项目列表接口返回的 userinfo（历史遗留字段） */
  userInfo: {},
  /** @type {boolean} 列表加载态（历史遗留字段，无消费方维护，保持初始 true） */
  tableLoading: true,
  /** @type {number} 项目总数 */
  total: 0,
  /** @type {number} 当前页码 */
  currPage: 1,
  /** @type {string} 项目 token */
  token: '',
  /** @type {Record<string, any>} 当前项目（消费方惯用名 projectMsg 即此字段） */
  currProject: {},
  /** @type {Record<string, any>} 当前项目环境配置 */
  projectEnv: {
    env: [
      {
        header: []
      }
    ]
  },
  /** @type {string | Record<string, any>} swagger 导入地址数据 */
  swaggerUrlData: '',

  // 获取某分组下的项目列表（对应旧 FETCH_PROJECT_LIST）
  /**
   * @param {any} id 分组 id
   * @param {any} [pageNum] 页码，缺省 1
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  fetchProjectList: async (id, pageNum) => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/list', {
        params: {
          group_id: id,
          page: pageNum || 1,
          limit: variable.PAGE_LIMIT
        }
      });
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({
        projectList: res.data.data.list,
        total: res.data.data.total,
        userInfo: res.data.data.userinfo
      });
    }
    return res;
  },

  // 复制项目（旧 reducer 无状态写入，纯请求动作）
  /**
   * @param {any} params
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  copyProjectMsg: async params => {
    try {
      return await axios.post('/api/project/copy', params);
    } catch (err) {
      return null;
    }
  },

  // 添加项目成员（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  addMember: async param => {
    try {
      return await axios.post('/api/project/add_member', param);
    } catch (err) {
      return null;
    }
  },

  // 删除项目成员（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  delMember: async param => {
    try {
      return await axios.post('/api/project/del_member', param);
    } catch (err) {
      return null;
    }
  },

  // 修改项目成员权限（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  changeMemberRole: async param => {
    try {
      return await axios.post('/api/project/change_member_role', param);
    } catch (err) {
      return null;
    }
  },

  // 修改项目成员是否收到消息通知（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  changeMemberEmailNotice: async param => {
    try {
      return await axios.post('/api/project/change_member_email_notice', param);
    } catch (err) {
      return null;
    }
  },

  // 获取项目成员列表（纯请求动作，旧 reducer 无 case 分支）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  getProjectMemberList: async id => {
    try {
      return await axios.get('/api/project/get_member_list', {
        params: { id }
      });
    } catch (err) {
      return null;
    }
  },

  // 添加项目（纯请求动作；沿用旧实现的 htmlFilter(name) 过滤与参数重组）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  addProject: async data => {
    let { name, prd_host, basepath, desc, group_id, group_name, protocol, icon, color, project_type } = data;

    // 过滤项目名称中有html标签存在的情况
    name = htmlFilter(name);
    const param = {
      name,
      prd_host,
      protocol,
      basepath,
      desc,
      group_id,
      group_name,
      icon,
      color,
      project_type
    };
    try {
      return await axios.post('/api/project/add', param);
    } catch (err) {
      return null;
    }
  },

  // 修改项目（纯请求动作；沿用旧实现的 htmlFilter(name) 过滤与参数重组）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  updateProject: async data => {
    let { name, project_type, basepath, desc, _id, env, group_id, switch_notice, strice, is_json5, tag } = data;

    // 过滤项目名称中有html标签存在的情况
    name = htmlFilter(name);
    const param = {
      name,
      project_type,
      basepath,
      switch_notice,
      desc,
      id: _id,
      env,
      group_id,
      strice,
      is_json5,
      tag
    };
    try {
      return await axios.post('/api/project/up', param);
    } catch (err) {
      return null;
    }
  },

  // 修改项目脚本（纯请求动作）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  updateProjectScript: async data => {
    try {
      return await axios.post('/api/project/up', data);
    } catch (err) {
      return null;
    }
  },

  // 修改全局mock（纯请求动作）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  updateProjectMock: async data => {
    try {
      return await axios.post('/api/project/up', data);
    } catch (err) {
      return null;
    }
  },

  // 修改项目环境配置（纯请求动作）
  /**
   * @param {any} data
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  updateEnv: async data => {
    const { env, _id } = data;
    const param = {
      id: _id,
      env
    };
    try {
      return await axios.post('/api/project/up_env', param);
    } catch (err) {
      return null;
    }
  },

  // 获取项目环境配置（对应旧 PROJECT_GET_ENV）
  /**
   * @param {any} project_id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  getEnv: async project_id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/get_env', { params: { project_id } });
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({ projectEnv: res.data.data });
    }
    return res;
  },

  // 修改项目头像（纯请求动作）
  /**
   * @param {any} param
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  upsetProject: async param => {
    try {
      return await axios.post('/api/project/upset', param);
    } catch (err) {
      return null;
    }
  },

  // 删除项目（纯请求动作）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  delProject: async id => {
    const param = { id };
    try {
      return await axios.post('/api/project/del', param);
    } catch (err) {
      return null;
    }
  },

  // 获取当前项目信息（对应旧 GET_CURR_PROJECT）
  /**
   * @param {any} id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  getProject: async id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/get?id=' + id);
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({ currProject: res.data.data });
    }
    return res;
  },

  // 获取项目 token（对应旧 GET_TOKEN）
  /**
   * @param {any} project_id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  getToken: async project_id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/token', {
        params: { project_id }
      });
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({ token: res.data.data });
    }
    return res;
  },

  // 重置项目 token（对应旧 UPDATE_TOKEN）
  /**
   * @param {any} project_id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  updateToken: async project_id => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/update_token', {
        params: { project_id }
      });
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({ token: res.data.data.token });
    }
    return res;
  },

  // 校验项目名称是否重复（纯请求动作，旧 reducer case 仅浅拷贝无写入）
  /**
   * @param {any} name
   * @param {any} group_id
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  checkProjectName: async (name, group_id) => {
    try {
      return await axios.get('/api/project/check_project_name', {
        params: { name, group_id }
      });
    } catch (err) {
      return null;
    }
  },

  // 获取 swagger 导入地址数据（对应旧 GET_SWAGGER_URL_DATA）
  /**
   * @param {any} url
   * @returns {Promise<any>} axios 响应；网络错误返回 null
   */
  handleSwaggerUrlData: async url => {
    let res = /** @type {any} */ (null);
    try {
      res = await axios.get('/api/project/swagger_url?url=' + encodeURI(encodeURI(url)));
    } catch (err) {
      return null;
    }
    if (res.data && res.data.errcode === 0) {
      set({ swaggerUrlData: res.data.data });
    }
    return res;
  }
}));

export default useProjectStore;

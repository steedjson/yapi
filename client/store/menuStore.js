// @ts-check
import { create } from 'zustand';

/**
 * menu 模块 Zustand store（Redux 迁移批次 2，与 mockCol/news 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/menu.js）的语义对应：
 * - 状态形状与旧 initialState 一致，仅 curKey 一个字段，无新增/删除；
 * - 旧初始值读取 window.location.hash（'#/<第一段>/...' → '/<第一段>'），此处保持一致；
 *   纯 node 环境（store 单测）无 window，回退 '/'——旧 reducer 该场景无法在 node 下加载，
 *   属测试可用性修正，浏览器行为不变；
 * - changeMenuItem 为同步动作，等价替代旧 redux action creator；全仓无 state.menu
 *   状态读取方（写入后仅作菜单高亮占位），注销 combineReducers 无行为影响；
 * - 旧模块文件 client/reducer/modules/menu.js 保留在盘上（本批次禁止删除旧 reducer
 *   文件），其同步 action creator 已无消费方，待后续批次清理。
 */

/**
 * @returns {string} 初始菜单高亮 key
 */
const getInitialCurKey = () => {
  if (typeof window === 'undefined' || !window.location) {
    return '/';
  }
  return '/' + window.location.hash.split('/')[1];
};

const useMenuStore = create(set => ({
  /** @type {string} 当前菜单高亮 key（路由第一段，如 '/group'） */
  curKey: getInitialCurKey(),

  // 重置/切换菜单高亮（同步动作）
  /**
   * @param {string} curKey
   */
  changeMenuItem: curKey => {
    set({ curKey });
  }
}));

export default useMenuStore;

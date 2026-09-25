// @ts-check
import { create } from 'zustand';
import axios from 'axios';

/**
 * mockCol 模块 Zustand store（Redux 迁移批次 2，与 menu/news 同批）。
 * 迁移模式与 redux-promise 语义差异说明见 docs/zustand-migration-pattern.md。
 *
 * 与旧 Redux 版（client/reducer/modules/mockCol.js）的语义对应：
 * - 状态形状与旧 initialState 一致，仅 list 一个字段，无新增/删除；
 * - 旧 redux-promise action 为 `{type, payload: result.data}`（result 为 axios 响应），
 *   reducer 无条件写 `list: action.payload.data`，即 `res.data.data`；本 store 保持
 *   **无 errcode 守卫**的旧语义：HTTP 200 即写入 `res.data.data`（errcode 非 0 时与旧版
 *   同样写入，消费方 MockCol 以 `Array.isArray(list)` 兜底）；
 * - 唯一差异：axios 网络层 reject 时旧版经 redux-promise 仍会以 error action 写入
 *   `list: undefined`，本版保留旧列表不写入（异常向上传播，行为更收敛）；
 * - 旧链路经 messageMiddleware 会在 errcode 非 0 时全局 toast 并抛错；本 store 静默
 *   失败（MockCol 页面对列表无额外错误 UI，写/删/改操作各自已有 message 反馈，与
 *   follow 试点同一模式）；
 * - 旧模块文件 client/reducer/modules/mockCol.js 已随 Redux 退役删除（收尾批）；
 *   历史注册点为插件 add_reducer 钩子（exts/yapi-plugin-advanced-mock/client.js，
 *   已于批次 2 随迁移注销）。
 */
const useMockColStore = create(set => ({
  /** @type {any[]} 高级 Mock 期望用例列表 */
  list: [],

  // 拉取指定接口的期望用例列表
  // 返回 axios 响应：取值层级与旧 `dispatch(fetchMockCol(id)).then(res => res.payload)`
  // 对应——`res.data` 即旧 `res.payload.data`
  /**
   * @param {any} interfaceId
   * @returns {Promise<any>}
   */
  fetchMockCol: async interfaceId => {
    const res = await axios.get('/api/plugin/advmock/case/list?interface_id=' + interfaceId);
    // 与旧 reducer 一致：无条件写入 payload.data（不做 errcode 守卫）
    set({ list: res.data.data });
    return res;
  }
}));

export default useMockColStore;

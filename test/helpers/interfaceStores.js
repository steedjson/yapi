/**
 * interface 切片（批次5）Zustand store 测试播种辅助。
 *
 * 背景：interface 已从 combineReducers 迁至 client/store/interfaceStore.js，
 * 组件不再经 redux 读取该切片。历史组件测试以 seedState: { inter: {...} }
 * 播种 redux store 的方式随之失效，统一改用本模块在渲染前播种真实 store
 * （与批次3 useGroupStore / 批次4 userProjectStores 同模式）。
 *
 * 用法：
 *   const { seedInterfaceStore, resetInterfaceStore } =
 *     require('../helpers/interfaceStores');
 *   test.serial.afterEach.always(() => { resetInterfaceStore(); });
 *   // 渲染前
 *   seedInterfaceStore({ curdata: {...}, list: [...] });
 *
 * 模块级单例不复位会串场（与 followStore 试点结论一致），务必在 afterEach 复位。
 */
const useInterfaceStore = require('../../client/store/interfaceStore').default;

// 与 store initialState 逐字段一致（新增字段时此处同步）
const INITIAL_INTERFACE_STATE = {
  curdata: {},
  list: [],
  editStatus: false,
  totalTableList: [],
  catTableList: [],
  count: 0,
  totalCount: 0,
  interfaceRequestId: 0
};

function seedInterfaceStore(patch) {
  useInterfaceStore.setState({ ...INITIAL_INTERFACE_STATE, ...(patch || {}) });
}

function resetInterfaceStore() {
  useInterfaceStore.setState({ ...INITIAL_INTERFACE_STATE });
}

module.exports = { seedInterfaceStore, resetInterfaceStore, INITIAL_INTERFACE_STATE };
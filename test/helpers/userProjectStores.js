/**
 * user/project 切片（批次4）Zustand store 测试播种辅助。
 *
 * 背景：user/project 已从 combineReducers 迁至 client/store/userStore.js /
 * projectStore.js，组件不再经 redux 读取这两块切片。历史组件测试以
 * seedState: { user: {...}, project: {...} } 播种 redux store 的方式随之失效，
 * 统一改用本模块在渲染前播种真实 store（与批次3 useGroupStore.setState 同模式）。
 *
 * 用法：
 *   const { seedUserStore, seedProjectStore, resetUserProjectStores } =
 *     require('../helpers/userProjectStores');
 *   test.serial.afterEach.always(() => { resetUserProjectStores(); });
 *   // 渲染前
 *   seedUserStore({ uid: 11 });
 *   seedProjectStore({ currProject: { _id: 12 } });
 *
 * 模块级单例不复位会串场（与 followStore 试点结论一致），务必在 afterEach 复位。
 */
const useUserStore = require('../../client/store/userStore').default;
const useProjectStore = require('../../client/store/projectStore').default;

// 与两个 store 的 initialState 逐字段一致（新增 store 字段时此处同步）
const INITIAL_USER_STATE = {
  isLogin: false,
  canRegister: true,
  isLDAP: false,
  userName: null,
  uid: null,
  email: '',
  loginState: 0,
  loginWrapActiveKey: '1',
  role: '',
  type: '',
  breadcrumb: [],
  studyTip: 0,
  study: false,
  imageUrl: ''
};

const INITIAL_PROJECT_STATE = {
  isUpdateModalShow: false,
  handleUpdateIndex: -1,
  projectList: [],
  projectMsg: {},
  userInfo: {},
  tableLoading: true,
  total: 0,
  currPage: 1,
  token: '',
  currProject: {},
  projectEnv: {
    env: [
      {
        header: []
      }
    ]
  },
  swaggerUrlData: ''
};

/**
 * 以完整初始态 + patch 播种 userStore（避免上一用例残留字段串场）。
 * @param {Record<string, any>} [patch]
 */
function seedUserStore(patch) {
  useUserStore.setState(Object.assign({}, INITIAL_USER_STATE, patch || {}));
}

/**
 * 以完整初始态 + patch 播种 projectStore。
 * @param {Record<string, any>} [patch]
 */
function seedProjectStore(patch) {
  useProjectStore.setState(Object.assign({}, INITIAL_PROJECT_STATE, patch || {}));
}

/** 复位两个 store 至初始态（afterEach 调用）。 */
function resetUserProjectStores() {
  useUserStore.setState(INITIAL_USER_STATE);
  useProjectStore.setState(INITIAL_PROJECT_STATE);
}

module.exports = {
  useUserStore,
  useProjectStore,
  INITIAL_USER_STATE,
  INITIAL_PROJECT_STATE,
  seedUserStore,
  seedProjectStore,
  resetUserProjectStores
};

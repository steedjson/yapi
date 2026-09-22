# Zustand 迁移模式（follow 试点 + 批次2 + 批次3，供后续 reducer 模块复制）

状态：follow 试点、批次2（menu/mockCol/news）与批次3（interfaceCol/addInterface/group）均已完成（2026-09，分支 `codex/refactor-foundation`）。
试点对象：`follow`（`client/reducer/modules/follow.js` → `client/store/followStore.js`）。
批次2 对象：`menu`（→ `client/store/menuStore.js`）、`mockCol`（→ `client/store/mockColStore.js`）、`news`（→ `client/store/newsStore.js`）。
批次3 对象：`interfaceCol`（→ `client/store/interfaceColStore.js`）、`addInterface`（→ `client/store/addInterfaceStore.js`）、`group`（→ `client/store/groupStore.js`）。

## 1. 背景与总体策略

- 现架构为 Redux + `combineReducers` + `redux-promise` 中间件，其中 redux-promise 已停止维护，是迁移动机。
- **渐进式并行共存**：Zustand store 与 Redux store 并行存在；已迁移的模块不再注册进 `combineReducers`，未迁移的 14 个模块保持不动。
- 全部模块迁移完毕后才卸载 Redux / react-redux / redux-promise（属后续批次，本期不动这三个包）。

## 2. 命名与文件约定

| 项 | 约定 | 试点实例 |
| --- | --- | --- |
| store 文件 | `client/store/<module>Store.js` | `client/store/followStore.js` |
| 导出 | `export default useXxxStore`（hook 单例） | `useFollowStore` |
| 状态形态 | `{ data: ..., loading: false, ... }`，动作函数与状态平级 | `{ data: [], loading: false, _uid: null }` |
| 测试 | store 单测放 `test/client/store/<module>Store.test.js`（纯 node，无需 jsdom） | `test/client/store/followStore.test.js` |

新 store 文件为 JS + `// @ts-check`，与仓库既有风格一致。注意：`tsconfig.json` 的 `include` 为显式清单，新 store 文件如需直接纳入覆盖需补一行。不过 follow 试点实测：带 `// @ts-check` 的文件经消费方 import 传递后已自动纳入编译程序（tsc --listFilesOnly 可确认），不补 include 也不会漏检。后续仍建议新增 store 时同步补 include 以获得不依赖消费方的直接覆盖。

## 3. Store 动作设计模板（对照旧 reducer）

以 `followStore.js` 为例，要点：

- **在动作函数内直接 `await axios`**，不再返回 `{type, payload: promise}`；
- **errcode 守卫内聚**：`res.data.errcode === 0` 才写状态（旧版守卫散在页面层的 `.then` 里）；
- **loading 显式化**：请求前置 `true`，`finally` 复位——旧版 redux-promise 无此语义，属新增；
- **写请求成功后重拉列表**（旧版由消费方回调驱动重拉，新版内聚到 store 动作）。需要 uid 时优先取动作参数里自带的，缺省回退最近一次 GET 记录的 `_uid`，两者皆无则跳过；
- **动作函数返回 axios 响应本身**，供调用方按需读取 `res.data`。

```js
const useFollowStore = create((set, get) => ({
  data: [],
  loading: false,
  _uid: null,                                  // 最近一次拉取列表的 uid（写后重拉用）
  getFollowList: async uid => {
    set({ loading: true });
    try {
      const res = await axios.get('/api/follow/list', { params: { uid } });
      if (res.data.errcode === 0) {
        set({ data: res.data.data.list, _uid: uid });
      }
      return res;
    } finally {
      set({ loading: false });
    }
  },
  // addFollow / delFollow：POST → errcode===0 时 await get().getFollowList(uid) → return res
}));
```

## 4. redux-promise 语义差异速查

| 旧（Redux + redux-promise） | 新（Zustand） |
| --- | --- |
| action creator 返回 `{type, payload: axiosPromise}` | store 动作即 async 函数，内部直接 axios |
| reducer 收 `action.payload.data.data`（响应体一层 data 包裹） | 动作内直接解构 `res.data.data`，层级等价 |
| `dispatch(xxx(p)).then(res => res.payload.data.errcode)` | `xxx(p).then(res => res.data.errcode)` |
| reducer 无条件写 `payload.data.data` | `errcode === 0` 才写，失败保留旧状态 |
| 刷新列表靠消费方 `.then` 回调驱动 | store 动作成功后自行重拉（消费方回调仍可用） |
| 无 loading | `loading` 显式状态，`finally` 复位 |

### ⚠️ messageMiddleware 通道差异（迁移必查）

旧链路中所有经 `dispatch` 的 action 流经 `client/reducer/middleware/messageMiddleware.js`：`payload.data.errcode` 非 0 且非 40011 时弹 antd `message.error` 并 throw。新 Zustand store 动作内直接 `await axios`，**完全绕过该中间件**——迁移时必须逐模块核对原错误反馈路径：
- 页面有 ErrMsg 空态兜底或自身 catch → store 动作静默失败即可（follow 试点即此模式）；
- 页面无兜底、依赖全局 toast → store 动作内显式 `message.error(errmsg)`（从 antd 导入）；
- 混合场景 → 动作返回 errcode，消费方决定展示策略。

## 5. 消费方迁移步骤（每模块逐文件执行）

1. `rg -n "reducer/modules/<module>|state\.<module>\b" client/ test/` 摸清消费方清单（**区分「读状态切片」与「只用 action creators」两类**，见 §6）；
2. 组件内：`useSelector(state => state.<module>.x)` → `useXxxStore(state => state.x)`；`dispatch(action(p)).then(res => res.payload...)` → `action(p).then(res => res.data...)`；
3. **store 数组状态禁止原地变更**：消费方拿到 `data` 后如需排序须先拷贝（`data.slice().sort(...)`）——`sort`/`splice`/`push` 原地操作会绕过 `set` 直接改 store；
4. hook 返回值如有回调（sort/map 的参数）报 TS7006，用 JSDoc 显式收窄：`/** @type {any[]} */ (useXxxStore(s => s.data))`（zustand 经 allowJs 推断的类型是有损的，试点在 Follows.js 实测踩到）；
5. 组件如还消费其他未迁移模块（如 Follows.js 的 `setBreadcrumb` 属 user 模块），保留 `useDispatch` 混用，互不影响。

## 6. 从 combineReducers 注销的步骤与安全前提

1. **安全前提（必须 grep 验证）**：全仓无任何 `state.<module>` 状态切片读取方。`combineReducers` 注册只影响状态树形状；仅被 dispatch 的 action creators 不受注销影响（`client/reducer/modules/<module>.js` 模块文件保留在盘上，导入方照常工作）。
2. `client/reducer/modules/reducer.js`：删该模块 import 与 `reducerModules` 注册项，并在原位留注释说明迁出去向与保留原因；
3. **模块文件本体不删**，直到其全部导出的消费方清零（follow 试点即因 `ProjectCard.js` 仍用旧 `addFollow`/`delFollow` 而保留文件）；
4. 项目无 `client/reducer/index.js` 汇总层，store 创建在 `client/reducer/create.js`，无需额外改动。

## 7. 测试模式

- **store 单测**（纯 node，无 jsdom）：axios 以属性替换拦截（`axios.get = ...`，CJS 单例与生产代码共享）；每条用例前 `useXxxStore.setState({...初始态})` 复位（**模块级单例，不复位会串场**）；覆盖：初始值 / 成功写入 / errcode 非 0 不写入 / 请求 reject 后 loading 复位 / 写后重拉的调用序列与参数 / data 不可变替换。
- **组件测试适配**：`renderWithProviders` 无需包 Provider（Zustand 无 Provider）；断言从「redux dispatched 里找 action」改为「`useXxxStore.getState()` 查状态」；`afterEach` 里同样要复位 store；可加反向断言「不再派发 `yapi/<module>/*` redux action」防回迁。
- **注意**：`flushEffects` 的等待窗口需覆盖 store 动作的完整 promise 链（axios → set → 可能的写后重拉）。

## 8. follow 试点的遗留与边界（后续批次注意）

- `client/components/ProjectCard/ProjectCard.js` 仍经 redux-promise 派发旧 `addFollow`/`delFollow`（不在试点边界内）；迁移 ProjectCard 时：`dispatch(addFollow(p)).then(res => res.payload.data.errcode === 0 && cb())` → `addFollow(p).then(res => res.data.errcode === 0 && cb())`，且其 `callbackResult` 重拉可交由 store 内聚（保留 `cb` 供 ProjectList 等非关注页场景刷新星标态）。
- `client/reducer/modules/follow.js` 暂保留（ProjectCard 依赖其导出）；ProjectCard 迁移完成后即可删除。
- `tsconfig.json` include 清单未加 `client/store/followStore.js`（试点边界禁止改 tsconfig）；该文件有 `// @ts-check` 但不在 include 内，已经由消费方 import 传递纳入编译程序并获得 @ts-check 检查。后续批次建议：新增 store 即同步补 include。
- 非关注页（如分组 ProjectList）的加关注场景：store 未拉过列表时 `_uid` 为 null，`delFollow` 跳过重拉、`addFollow` 回退 `param.uid` 重拉——均为无害请求。

## 9. 试点验证数据

- `npx ava test/client/store/followStore.test.js test/client/containers/Follows.test.js test/client/components/ProjectCard.test.js`：19 passed；
- `npm test` 全量冷库：976 passed，0 failed；
- `npx tsc --noEmit`：0 错误；`npm run lint`：0/0；`npm run audit`：通过（各 severity delta 0，zustand@5.0.15 零运行时依赖）。

## 10. 批次2 实例记录（menu / mockCol / news，2026-09）

### 10.1 迁移内容与注册点差异

| 模块 | store 文件 | 状态字段（与旧 initialState 完全一致） | 动作 | combineReducers 注销点 |
| --- | --- | --- | --- | --- |
| menu | `client/store/menuStore.js` | `curKey` | `changeMenuItem`（同步） | `client/reducer/modules/reducer.js` |
| mockCol | `client/store/mockColStore.js` | `list` | `fetchMockCol` | **插件 add_reducer 钩子**（`exts/yapi-plugin-advanced-mock/client.js`）——该切片本就不在 reducer.js 内，全仓仅 `state.mockCol.list` 一个读取方（MockCol.js） |
| news | `client/store/newsStore.js` | `newsData({list,total})` / `curpage` / `newsRequestId` | `fetchNewsData` / `fetchMoreNews` | `client/reducer/modules/reducer.js` |

- 旧 reducer 模块文件全部保留在盘：`news.js` 的 `fetchUpdateLogData`/`getMockUrl`（`type: ''` 纯 promise 助手，不触达 news 状态）仍被 ProjectData 经 redux 派发；`mockCol.js`（client/reducer 侧）与 `exts/**/mockColReducer.js` 已无消费方，留待后续批次清理。
- **tsconfig include 未补**（本批边界未含 tsconfig）：三个 store 均经消费方 import 传递纳入编译（tsc 0 错误验证通过）。后续批次建议补 include 以获得直接覆盖。

### 10.2 与 follow 试点的语义差异（后续批次按需复用）

1. **不新增 loading 字段**：本批要求状态形状与旧 initialState 严格一致（不新增/删除字段），故未套用 §3 的 loading 显式化模板。加载态仍由消费方本地 state 承担。
2. **news 的竞态守卫内聚**：旧 reducer 的 `requestId < newsRequestId` 过期响应丢弃、`errcode !== 0` 不写入、`add_time` 降序、FETCH_MORE 追加且空页不推进 `curpage` 等逻辑，原样搬进 store 动作（`applyNewsResponse`）。模块级自增序列 `newsRequestSequence` 保留在 store 文件内。
3. **messageMiddleware 通道全部静默化**：menu 同步动作无该问题；mockCol 保持旧 reducer「无 errcode 守卫」语义（HTTP 200 即写 `res.data.data`，errcode 非 0 时写入 undefined，消费方以 `Array.isArray(list)` 兜底）；news 静默失败——TimeLine/News 页有 ErrMsg 兜底，且旧链路抛错会使消费方 `.then` 中的 loading 复位永不执行（卡死），静默化同时修复该缺陷。**唯一差异**：mockCol 在 axios 网络层 reject 时保留旧列表不写入（旧版经 redux-promise error action 会写入 undefined）。
4. **menu 初始值**：`window.location.hash` 在 store 模块加载时求值（与旧 reducer 一致）；纯 node 单测环境回退 `'/'`（旧 reducer 在 node 下无法加载）。
5. **混合消费方普遍存在**：Search/Header/TimeLine/GroupList/GroupSetting 同时消费未迁移模块（group/user/inter/project），保留 `useDispatch` 混用；AuthenticatedComponent/MockCol/NewsList/NewsTimeline 的 dispatch 派发项全部迁移后已移除 `useDispatch`。

### 10.3 测试适配要点（批次2 新踩的坑）

- **真实 store 会收敛挂载期请求**：旧组件测试靠「固定 reducer」让种子数据在 fulfilled action 后存活；切到真实 store 后挂载期 fetch 会覆写种子。需要「点击时处于某状态」的用例须在 flushEffects 之后**在 act 内重新 `useXxxStore.setState` 播种**（否则订阅组件不重渲染，点击回调读到旧闭包值）。
- **真实 store 会执行排序**：news store 按 `add_time` 降序收敛，种子数据与断言顺序须按降序对齐（旧固定 reducer 不排序）。
- **反向断言防回迁**：`dispatched` 数组断言「不再派发 `yapi/news/*`、`yapi/menu/*`、`yapi/mockCol/*`」；lazyClientChains 钉住插件钩子 `hooks.add_reducer === undefined`。
- **测试桩的真实契约收紧**：groupList/groupSetting/antd5 旧测试把 `/api/log/list` 响应错写成 `{data:{data:[],total:0}}`（旧固定 reducer 从不消费故未暴露），真实 store 消费 `res.data.data.list` 后即抛 `data.list is not iterable`（unhandled rejection）——已统一修正为真实契约 `{data:{list:[],total:0}}`。后续迁移遇到同类 unhandled rejection，优先怀疑历史测试桩的响应形状。
- **exts 插件引用 store 用相对路径**：`'client/*'` 别名无 tsconfig paths 映射，旧 reducer 模块靠 global.d.ts 环境声明解析；store 文件不走该机制，MockCol.js 改用 `../../../client/store/mockColStore`（同文件 `../../../client/common` 先例）。

### 10.4 批次2 验证数据

- 新增 store 单测 20 条（menu 4 / mockCol 6 / news 10）全绿；
- `npm test` 全量冷库：996 passed（976 基线 + 20 新增），0 failed，0 unhandled rejection；
- `npx tsc --noEmit`：0 错误；`npm run lint`：0/0；`npm run audit:ci`：通过（各 severity 与 total 均不高于基线）；
- grep 终态：全仓无 `state.news` / `state.menu` / `state.mockCol` 状态读取方；combineReducers 仅剩 user/group/project/inter/interfaceCol/addInterface。

## 11. 批次3 实例记录（interfaceCol / addInterface / group，2026-09）

### 11.1 迁移内容

| 模块 | store 文件 | 状态字段（与旧 initialState 完全一致） | 动作 | combineReducers 注销点 |
| --- | --- | --- | --- | --- |
| interfaceCol | `client/store/interfaceColStore.js` | `interfaceColList`（单条占位）/ `isShowCol` / `isRender` / `currColId` / `currCaseId` / `currCase` / `currCaseList` / `variableParamsList` / `envList` | 5 个 fetch + `setColData`（同步浅合并） | `client/reducer/modules/reducer.js` |
| addInterface | `client/store/addInterfaceStore.js` | `interfaceName` / `url` / `method` / `seqGroup` / `reqParams` / `resParams` / `project` / `clipboard`（存函数） | 10 个同步动作 + `fetchInterfaceProject` | 同上 |
| group | `client/store/groupStore.js` | `groupList` / `currGroup` / `field` / `member` / `role` / `groupRequestId` | `fetchGroupList` / `updateGroupList`（同步）/ `setCurrGroup` / `fetchGroupMsg` / `fetchGroupMemberList` + 4 个纯请求 POST | 同上 |

- 模块级 `groupRequestSequence` 保留在 store 文件内，SET_CURR_GROUP 与 FETCH_GROUP_MSG 共用「最后发起获胜」序号，与旧 reducer 同一模式；两动作的过期守卫 + errcode 守卫内聚为 `isStaleOrFailed`。
- **isRander/isRender 拼写分裂**：旧 initialState 是 `isRender`，而消费方经 `setColData({isRander})` 动态写入/读取 `isRander`。store 保持 initialState 原样 + `setColData` 允许动态新增 key（zustand set 对象入参默认浅合并，等价旧 `{...state, ...payload}`），行为逐字节一致。
- interfaceCol 五个 fetch 沿用旧 reducer「无 errcode 守卫」语义（HTTP 200 即写 `res.data.data`）；group 的 `fetchGroupList`/`fetchGroupMemberList` 同款。addMember/delMember/changeMemberRole/changeGroupMsg/deleteGroup 在旧 reducer 本就无状态写入，迁为纯请求动作。
- 三个旧 reducer 模块文件保留在盘上（`client/reducer/modules/{interfaceCol,addInterface,group}.js`）：addInterface 迁移前已无任何 import 方；interfaceCol 全部消费方随本批切换；`groupReducer.test.js` 仍直接覆盖 group.js。批次 4 可视消费方清零情况清理。
- tsconfig include 未补（本批边界未含 tsconfig），三个 store 均经消费方 import 传递纳入编译（tsc 0 错误验证）。

### 11.2 消费方迁移要点（批次3 新增语义）

1. **响应解包层级统一换挡**：`dispatch(xxx(p)).then(res => res.payload.data…)` → `xxx(p).then(res => res.data…)`；`await dispatch(xxx(p))` → `await xxx(p)`，取值层级 `payload.data` → `data`。
2. **混合消费方大量存在**：ProjectMember（group fetch + project 成员动作）、ProjectMessage/AddProject（connect 保留 project 映射与 project/user 动作注入，group 状态/动作改走 useGroupStore——**注意 connect 移除某字段后，组件内解构 `const { groupList } = props` 会遮蔽同名 hook 变量，必须一并删除**）、ProjectList/Project（保留 useDispatch 驱动 project/user 动作）。
3. **纯消费方彻底移除 react-redux**：VariablesSelect/AddColModal/Interface.js/MemberList/GroupLog 完全移除 useSelector/useDispatch（含「历史遗留仅声明未消费」的 user 切片订阅——其存在不影响行为，随迁移一并移除并在注释注明）。
4. **GroupSetting 的本地函数名冲突**：组件自有 `deleteGroup` 函数，store 动作以 `deleteGroupAction = useGroupStore(state => state.deleteGroup)` 引入（沿用旧 `deleteGroup as deleteGroupAction` 惯例）。
5. **VariablesSelect 的原地 sort**：响应数组与 store 的 `variableParamsList` 同引用，改为 `slice()` 拷贝后排序（§5.3 规则）。

### 11.3 批次3 测试适配新坑（比 §10.3 更进一步）

- **「冻结 reducer 隐藏的历史缺陷」集中爆发**：旧组件测试的固定 reducer 从不执行真实 reducer 逻辑，因此两类问题被掩盖——
  1. **测试桩响应形状不完整**：MemberList/ProjectSettingPanels 的 `/api/group/get` 桩只返 `{role}` 或 `{group_name, _id}`，缺 `custom_field1`（真实服务端必返）；真实 store 的 fetchGroupMsg apply 会读 `data.custom_field1.name` 抛 TypeError（旧 reducer 同样会抛，只是从未真正执行）。修正桩为真实契约。
  2. **桩无视请求参数恒返同一对象**：MemberList 的 group/get 桩对任意 id 都返 `_id: 71`。真实 store 忠实写入后，`fetchGroupMsg(72)` 反而把 currGroup 写回 71 → 触发「分组回跳 → 成员列表再次重拉」连锁（断言 2 次实际 3 次）。修正桩按 `config.params.id` 回显。
- **断言迁移**：`dispatched.find(a => a.type === 'yapi/group/FETCH_GROUP_MSG')` 类断言改为断言 HTTP 请求发生（stub 记录 GET），并加反向断言「不再派发 `yapi/group/*`」；动态驱动 currGroup 变化的 `TEST/SET_GROUP` dispatch 改为 act 内 `useGroupStore.setState({currGroup})`。
- **connect 组件的 mapStateToProps 清空**：AddProject 的 mapStateToProps 仅剩 group 字段 → 改为 `connect(null, mapDispatchToProps)`；组件内 hook 值与本地 useState 镜像重名时注意改名（`storeGroupList`）。
- 源码结构断言测试（groupSelectionRace.test.js）同步适配：`dispatch(xxx)` → `xxx()`、`payload.data.data` → `res.data.data`。
- **visual 快照/差分测试同坑**：antd5-fixpoint、antd5-runtime-diff 的 mountProjectSetting/mountGroupSetting/mountAddProject 配方同样只种 redux group 切片——改种 groupStore（快照 DOM 不变，仅数据源换轨），并同步修正 group/list 双层包裹、group/get 缺 custom_field1 两类桩契约。
- **eslint 注意**：仓库 `no-unused-vars` 无 `_` 前缀豁免（args: 'after-used'），固定 reducer 不再消费 action 时应直接去掉形参 `function(state)`，而非改名 `_action`。

### 11.4 批次3 验证数据

- 新增 store 单测 26 条（interfaceCol 7 / addInterface 6 / group 13）全绿；
- `npm test` 全量冷库：见交付报告（预期 996 基线 + 26 新增，既有测试适配无净减）；
- `npx tsc --noEmit`：0 错误（消费方 3 文件按 §5.4 逐点 JSDoc 收窄）；`npm run lint`：0/0；`npm run audit:ci`：通过；
- grep 终态：全仓无 `state.interfaceCol` / `state.addInterface` / `state.group` 状态读取方；combineReducers 仅剩 user/project/inter。

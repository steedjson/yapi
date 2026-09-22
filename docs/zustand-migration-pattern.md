# Zustand 迁移模式（follow 试点，供后续 14 个 reducer 模块复制）

状态：试点已完成（2026-09，分支 `codex/refactor-foundation`）。
试点对象：`follow`（`client/reducer/modules/follow.js` → `client/store/followStore.js`）。

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

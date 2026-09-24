// @ts-check
import { combineReducers } from 'redux';
// follow / menu / news / mockCol / interfaceCol / addInterface / group / user / project /
// interface（inter）均已迁至 Zustand（client/store/），不再注册进 combineReducers。
// 迁移过程与语义差异见 docs/zustand-migration-pattern.md。
// 旧模块文件全部保留在盘上（迁移边界禁止删除）：
// - follow.js：ProjectCard 仍以其 addFollow/delFollow action creators 经 redux-promise 派发；
// - news.js：ProjectData 的 fetchUpdateLogData（type 为 '' 的纯 promise 助手）仍经 redux 派发；
// - interface.js：Search.js 的 fetchInterfaceListMenu 已迁 store（批次5），interfaceReducer.test.js
//   仍直接覆盖旧 reducer 文件；
// - group.js / news.js / interface.js 分别有 groupReducer/newsReducer/interfaceReducer 测试；
// - 其余模块文件已无消费方，待 redux 三件套收尾批次统一清理。
// Redux 状态树至此清零：redux/react-redux/redux-promise 的卸载属后续收尾批次。

import { emitHook } from 'client/plugin.js';

const reducerModules = {};
emitHook('add_reducer', reducerModules);

// 空模块 fallback：combineReducers({}) 在 dev 下会输出 "Store does not have a valid reducer"
// 警告（redux 4.2.1 实测不抛异常，仅 console.error；prod 构建跳过该校验），无插件注入时
// 退化为空状态占位 reducer 以消除警告（Redux 状态树已清零，仅维持 store 可用；
// 单参形态即可满足 redux reducer 契约，action 参数隐式丢弃）。
const combinedReducer = Object.keys(reducerModules).length
  ? combineReducers(reducerModules)
  : (/** @type {any} */ state = {}) => state || {};

export default combinedReducer;

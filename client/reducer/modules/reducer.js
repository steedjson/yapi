// @ts-check
import { combineReducers } from 'redux';
import user from './user.js';
import group from './group.js';
import project from './project.js';
import inter from './interface.js';
import interfaceCol from './interfaceCol.js';
import addInterface from './addInterface.js';
// follow 已迁至 Zustand（client/store/followStore.js，试点），不再注册进 combineReducers。
// 旧模块文件 ./follow.js 保留：ProjectCard 仍以其 addFollow/delFollow action creators 经
// redux-promise 派发（全仓无 state.follow 读取方，注销注册无行为影响）。
// menu / news 已迁至 Zustand（client/store/menuStore.js / newsStore.js，批次2）。
// 旧模块文件 ./menu.js / ./news.js 保留：news.js 的 fetchUpdateLogData/getMockUrl 仍被
// ProjectData 等经 redux-promise 派发（type 为 '' 不触达 news 状态），menu 的同步
// action creator 已无消费方（全仓无 state.menu 读取方，注销注册无行为影响）。
// mockCol 同批迁出：其注册点为插件 add_reducer 钩子
// （exts/yapi-plugin-advanced-mock/client.js → client/store/mockColStore.js）。

import { emitHook } from 'client/plugin.js';

const reducerModules = {
  group,
  user,
  inter,
  interfaceCol,
  project,
  addInterface
};
emitHook('add_reducer', reducerModules);

export default combineReducers(reducerModules);

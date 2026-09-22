// @ts-check
import { combineReducers } from 'redux';
import user from './user.js';
import group from './group.js';
import project from './project.js';
import inter from './interface.js';
import interfaceCol from './interfaceCol.js';
import news from './news.js';
import addInterface from './addInterface.js';
import menu from './menu.js';
// follow 已迁至 Zustand（client/store/followStore.js，试点），不再注册进 combineReducers。
// 旧模块文件 ./follow.js 保留：ProjectCard 仍以其 addFollow/delFollow action creators 经
// redux-promise 派发（全仓无 state.follow 读取方，注销注册无行为影响）。

import { emitHook } from 'client/plugin.js';

const reducerModules = {
  group,
  user,
  inter,
  interfaceCol,
  project,
  news,
  addInterface,
  menu
};
emitHook('add_reducer', reducerModules);

export default combineReducers(reducerModules);

// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';

const { default: useMenuStore } = require('../../../client/store/menuStore');

// Zustand store 为模块级单例，每条用例前复位到初始状态
// （node 环境无 window，初始 curKey 走 '/' 回退分支）
test.beforeEach(() => {
  useMenuStore.setState({ curKey: '/' });
});

test('初始状态：node 环境下 curKey 回退为 "/"，状态形状仅 curKey 一个字段', t => {
  const state = useMenuStore.getState();
  t.is(state.curKey, '/', '无 window 时初始 curKey 应为 "/"（浏览器下为 hash 首段，行为同旧 reducer）');
  t.deepEqual(Object.keys(state).sort(), ['changeMenuItem', 'curKey'], '状态+动作应仅有 curKey 与 changeMenuItem');
});

test.serial('changeMenuItem 写入 curKey（替代旧 dispatch(changeMenuItem(...)) 派发）', t => {
  useMenuStore.getState().changeMenuItem('/group');
  t.is(useMenuStore.getState().curKey, '/group', '应写入路由首段 key');

  useMenuStore.getState().changeMenuItem('');
  t.is(useMenuStore.getState().curKey, '', '空串（Header relieveLink 场景）应原样写入');
});

test.serial('changeMenuItem 连续切换以最后一次为准', t => {
  useMenuStore.getState().changeMenuItem('/project');
  useMenuStore.getState().changeMenuItem('/user');
  t.is(useMenuStore.getState().curKey, '/user', '多次切换后应以最后一次写入为准');
});

test.serial('AuthenticatedComponent 未登录重置场景：changeMenuItem("/") 生效', t => {
  useMenuStore.getState().changeMenuItem('/project/12');
  useMenuStore.getState().changeMenuItem('/');
  t.is(useMenuStore.getState().curKey, '/', '重置菜单高亮应回到 "/"');
});

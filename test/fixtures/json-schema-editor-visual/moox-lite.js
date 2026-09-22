/**
 * moox@1.0.2 兼容夹具（测试专用）：为旧编辑器 models/schema.js 的 immer 动作函数
 * 提供 dispatch 驱动 store。语义对齐真实 moox：
 *   - state 按模型键分命名空间（store.getState().schema = 模型 state）；
 *   - dispatch({type: 'moox/<ns>/<action>', params}) 后以 immer produce 应用变更，
 *     model 函数签名 (draftState, params, oldState)——oldState 为该命名空间变更前状态；
 *   - 变更后通知订阅者。
 * 使用应用自带 immer（10.2.0）——对 schema 编辑动作的变更语义与旧 moox 内嵌 immer@1.x
 * 一致（produce 洋葱模型），等价性结论见 docs/json-schema-editor-equiv-map.md。
 */
const { produce } = require('immer');

module.exports = function mooxLite(models) {
  const namespaces = Object.keys(models);
  let state = {};
  namespaces.forEach(key => {
    state[key] = models[key].state;
  });

  const listeners = [];

  const store = {
    getState() {
      return state;
    },
    dispatch(action) {
      if (!action || typeof action.type !== 'string') {
        throw new Error('moox-lite: dispatch 需要 {type, params}');
      }
      const parts = action.type.split('/');
      if (parts[0] !== 'moox' || parts.length !== 3) {
        throw new Error('moox-lite: 未知的 dispatch 形态 ' + action.type);
      }
      const ns = parts[1];
      const actionName = parts[2];
      const model = models[ns];
      const fn = model && model[actionName];
      if (typeof fn !== 'function') {
        throw new Error('moox-lite: 未知动作 ' + action.type);
      }
      const oldState = state[ns];
      state = produce(state, draft => {
        fn(draft[ns], action.params, oldState);
      });
      listeners.forEach(listener => listener());
      return state;
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const i = listeners.indexOf(listener);
        if (i > -1) listeners.splice(i, 1);
      };
    }
  };

  return {
    getStore() {
      return store;
    }
  };
};

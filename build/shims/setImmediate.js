'use strict';

// webpack 4 的 node.setImmediate 默认开启（经 timers 垫片替换 bundle 内的自由变量
// setImmediate）。webpack 5 移除该行为，这里提供 setTimeout 兜底实现（与
// timers-browserify 的降级路径语义一致），通过 webpack.ProvidePlugin 注入。
module.exports = function setImmediate(fn) {
  const restArgs = Array.prototype.slice.call(arguments, 1);
  return setTimeout(function() {
    fn.apply(null, restArgs);
  }, 0);
};

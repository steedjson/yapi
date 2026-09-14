'use strict';

// webpack 4 对 https 等 node 内置模块在 web 构建中注入空模块垫片（node: { https: 'empty' }）。
// webpack 5 移除该行为，这里以显式空模块保持同等语义，供 resolve.alias.https 指向。
module.exports = {};

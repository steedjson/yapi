'use strict';

// 统一旧 Babel 6 构建链的参数，后续独立 Webpack 入口直接复用，避免配置分叉。
function getBabelQuery() {
  return {
    cacheDirectory: true,
    presets: [
      ['es2015', { loose: true, modules: false }],
      'es2017',
      'stage-0',
      'react'
    ],
    plugins: [
      'transform-runtime',
      'transform-decorators-legacy',
      ['import', { libraryName: 'antd' }]
    ]
  };
}

function getPluginExclude(isWin) {
  return isWin
    ? /(tui-editor|node_modules\\(?!_?(yapi-plugin|json-schema-editor-visual)))/
    : /(tui-editor|node_modules\/(?!_?(yapi-plugin|json-schema-editor-visual)))/;
}

module.exports = { getBabelQuery, getPluginExclude };

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

function getDefineValues(packageInfo, webConfig, environment) {
  return {
    'process.env.NODE_ENV': JSON.stringify(environment === 'prd' ? 'production' : 'dev'),
    'process.env.version': JSON.stringify(packageInfo.version),
    'process.env.versionNotify': webConfig.versionNotify,
    'process.env.scriptEnable': JSON.stringify(webConfig.scriptEnable === true)
  };
}

function getStyleRule(test, extractTextPlugin, fallback, use) {
  return {
    test,
    loader: use === undefined
      ? extractTextPlugin.extract(fallback)
      : extractTextPlugin.extract(fallback, use)
  };
}

function getAssetRule() {
  return {
    test: /.(gif|jpg|jpeg|png|woff|woff2|eot|ttf|svg)$/,
    loader: 'url-loader',
    options: {
      limit: 8192,
      name: ['[path][name].[ext]?[sha256#base64:8]']
    }
  };
}

function getPreLoaders() {
  return [
    {
      test: /\.(js|jsx)$/,
      exclude: /tui-editor|node_modules|google-diff.js/,
      loader: 'eslint-loader'
    },
    { test: /\.json$/, loader: 'json-loader' }
  ];
}

module.exports = {
  getBabelQuery,
  getPluginExclude,
  getDefineValues,
  getStyleRule,
  getAssetRule,
  getPreLoaders
};

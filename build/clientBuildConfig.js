'use strict';

function getPluginExclude(isWin) {
  return isWin
    ? /(tui-editor|node_modules\\(?!_?(yapi-plugin|json-schema-editor-visual)))/
    : /(tui-editor|node_modules\/(?!_?(yapi-plugin|json-schema-editor-visual)))/;
}

// 生产页 static/index.html 读取 WEBPACK_ASSETS['index.js']，独立构建入口名是 index，需改写键名。
function normalizeAssets(assets) {
  const normalized = Object.assign({}, assets);
  if (normalized.index && !normalized['index.js']) {
    normalized['index.js'] = normalized.index;
    delete normalized.index;
  }
  return normalized;
}

function getDefineValues(packageInfo, webConfig, environment) {
  return {
    'process.env.NODE_ENV': JSON.stringify(environment === 'prd' ? 'production' : 'dev'),
    'process.env.version': JSON.stringify(packageInfo.version),
    'process.env.versionNotify': webConfig.versionNotify,
    'process.env.scriptEnable': JSON.stringify(webConfig.scriptEnable === true)
  };
}

module.exports = {
  getPluginExclude,
  getDefineValues,
  normalizeAssets
};

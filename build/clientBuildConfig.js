'use strict';

function getPluginExclude(isWin) {
  return isWin
    ? /(node_modules\\(?!_?(yapi-plugin|json-schema-editor-visual)))/
    : /(node_modules\/(?!_?(yapi-plugin|json-schema-editor-visual)))/;
}

// 生产页 static/index.html 读取 WEBPACK_ASSETS['index.js']，且自行拼接了 '/prd/' 前缀；
// 当 webpack 配置 publicPath 为 '/prd/' 时，AssetsPlugin 会在路径前附加 publicPath，
// 此处剥离该前缀以保持文件名纯净，避免 static/index.html 拼接出 '//prd/' 双斜杠路径。
function stripPrdPrefix(val) {
  return typeof val === 'string' ? val.replace(/^\/?prd\//, '') : val;
}

function normalizeAssets(assets) {
  const normalized = {};
  for (const key of Object.keys(assets)) {
    const item = assets[key];
    const cleanItem = {};
    for (const prop of Object.keys(item)) {
      cleanItem[prop] = stripPrdPrefix(item[prop]);
    }
    const targetKey = key === 'index' ? 'index.js' : key;
    normalized[targetKey] = cleanItem;
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

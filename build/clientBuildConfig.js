// @ts-check
'use strict';

/**
 * @param {boolean} isWin 是否为 Windows 平台
 * @returns {RegExp} 插件目录排除规则
 */
function getPluginExclude(isWin) {
  return isWin
    ? /(node_modules\\(?!_?yapi-plugin))/
    : /(node_modules\/(?!_?yapi-plugin))/;
}

// 生产页 static/index.html 读取 WEBPACK_ASSETS['index.js']，且自行拼接了 '/prd/' 前缀；
// 当 webpack 配置 publicPath 为 '/prd/' 时，AssetsPlugin 会在路径前附加 publicPath，
// 此处剥离该前缀以保持文件名纯净，避免 static/index.html 拼接出 '//prd/' 双斜杠路径。
/**
 * @param {unknown} val 资源路径（可能非字符串）
 * @returns {unknown} 剥离后的值，非字符串原样返回
 */
function stripPrdPrefix(val) {
  return typeof val === 'string' ? val.replace(/^\/?prd\//, '') : val;
}

/**
 * @param {Record<string, Record<string, unknown>>} assets 原始资源清单
 * @returns {Record<string, Record<string, unknown>>} 归一化后的资源清单
 */
function normalizeAssets(assets) {
  /** @type {Record<string, Record<string, unknown>>} */
  const normalized = {};
  for (const key of Object.keys(assets)) {
    const item = assets[key];
    /** @type {Record<string, unknown>} */
    const cleanItem = {};
    for (const prop of Object.keys(item)) {
      cleanItem[prop] = stripPrdPrefix(item[prop]);
    }
    const targetKey = key === 'index' ? 'index.js' : key;
    normalized[targetKey] = cleanItem;
  }
  return normalized;
}

/**
 * @param {{ version: string }} packageInfo package.json 内容
 * @param {{ versionNotify?: string, scriptEnable?: boolean }} webConfig 站点配置
 * @param {string} environment 构建环境（'prd' 为生产）
 * @returns {Record<string, string|boolean|undefined>} DefinePlugin 定义表
 */
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

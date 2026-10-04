// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const commonLib = require('../common/plugin.js');

/**
 * 插件配置项（common/plugin.js initPlugins 的输出形状）。
 * @typedef {{ name: string, options?: unknown, client?: unknown, enable?: boolean }} PluginEntry
 */

/**
 * 生成单个插件的 client.js 注册片段。
 * @param {PluginEntry} plugin 插件配置项
 * @param {string} pathAlias 插件所在目录别名（'node_modules' 或 'exts'）
 * @returns {string} 注册片段
 */
function createScript(plugin, pathAlias) {
  const options = plugin.options ? JSON.stringify(plugin.options) : null;
  if (pathAlias === 'node_modules') {
    return `"${plugin.name}" : {module: require('yapi-plugin-${plugin.name}/client.js'),options: ${options}}`;
  }
  return `"${plugin.name}" : {module: require('${pathAlias}/yapi-plugin-${plugin.name}/client.js'),options: ${options}}`;
}

/**
 * 生成客户端插件入口，默认构建和 standalone 构建共用同一份插件发现逻辑。
 * @param {string} root 仓库根目录绝对路径
 */
function initPlugins(root) {
  const config = require(path.join(root, 'config.json'));
  /** @type {PluginEntry[]} */
  let configPlugins = config.plugins;
  const systemPlugins = require(path.join(root, 'common/config.js')).exts;
  /** @type {string[]} */
  const scripts = [];

  if (Array.isArray(configPlugins) && configPlugins.length) {
    configPlugins = commonLib.initPlugins(configPlugins, 'plugin');
    configPlugins.forEach(plugin => {
      if (plugin.client && plugin.enable) scripts.push(createScript(plugin, 'node_modules'));
    });
  }

  commonLib.initPlugins(systemPlugins, 'ext').forEach(plugin => {
    if (plugin.client && plugin.enable) scripts.push(createScript(plugin, 'exts'));
  });

  // 生成物首两行为类型检查声明与生成说明, 由本生成器统一产出;
  // 调整文案须同步回归 client/plugin-module.js 的 @ts-check 头不丢失。
  const generatedHeader =
    '// @ts-check\n// 注意:本文件由 build/clientPluginModule.js 的 initPlugins() 生成,重新构建会覆盖手工改动。\n';

  fs.writeFileSync(
    path.join(root, 'client/plugin-module.js'),
    generatedHeader + 'module.exports = {' + scripts.join(',') + '}'
  );
}

module.exports = { initPlugins };

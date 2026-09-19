// @ts-check
/**
 * 分类缓存失效辅助：被 interface.js 与各方法组模块共同引用，
 * 保证 ttlCache 单例引用唯一、不因拆分重复初始化。
 */
const categoryCache = require('../../utils/ttlCache');

/**
 * 仅清理当前项目的分类缓存，避免写操作导致其他项目缓存无效。
 * @param {any} [projectId]
 * @returns {void}
 */
const clearProjectCategoryCache = projectId => {
  if (projectId !== undefined && projectId !== null) {
    categoryCache.clearByPrefix('menu:' + projectId);
    categoryCache.clearByPrefix('tree:' + projectId);
  } else {
    categoryCache.clear();
  }
};

module.exports = clearProjectCategoryCache;

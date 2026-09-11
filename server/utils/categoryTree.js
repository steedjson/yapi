// @ts-check

/**
 * 将分类平铺数据组装为树。
 * 历史数据可能没有 parent_id，也可能存在孤立父节点；这两类数据都按根分类返回。
 * @param {Array<Record<string, any>>} categories
 * @returns {Array<Record<string, any>>}
 */
function buildCategoryTree(categories) {
  /** @type {Array<Record<string, any>>} */
  const nodes = (Array.isArray(categories) ? categories : []).map(item =>
    Object.assign({}, item, { children: [] })
  );
  const byId = new Map(nodes.map(item => [item._id, item]));
  /** @type {Array<Record<string, any>>} */
  const roots = [];

  nodes.forEach(node => {
    const parentId = node.parent_id || 0;
    const parent = byId.get(parentId);
    if (!parent || parent === node || createsCycle(node, parent, byId)) {
      roots.push(node);
      return;
    }
    parent.children.push(node);
  });

  return roots;
}

/**
 * 检查挂载父节点是否会形成环，避免异常历史数据让分类从返回结果中消失。
 * @param {Record<string, any>} node
 * @param {Record<string, any>} parent
 * @param {Map<any, Record<string, any>>} byId
 */
function createsCycle(node, parent, byId) {
  const visited = new Set([node._id]);
  /** @type {Record<string, any> | undefined} */
  let current = parent;
  while (current) {
    if (visited.has(current._id)) return true;
    visited.add(current._id);
    current = byId.get(current.parent_id || 0);
  }
  return false;
}

/**
 * 将接口挂载到对应分类，统一菜单和分类树的数据转换逻辑。
 * @param {Array<Record<string, any>>} categories
 * @param {Array<Record<string, any>>} interfaces
 * @returns {Array<Record<string, any>>}
 */
function attachInterfacesToCategories(categories, interfaces) {
  /** @type {Record<string, Array<Record<string, any>>>} */
  const interfacesByCatid = {};
  (Array.isArray(interfaces) ? interfaces : []).forEach(inter => {
    const catid = inter.catid;
    if (!interfacesByCatid[catid]) interfacesByCatid[catid] = [];
    interfacesByCatid[catid].push(
      typeof inter.toObject === 'function' ? inter.toObject() : inter
    );
  });

  return (Array.isArray(categories) ? categories : []).map(category => {
    const item = typeof category.toObject === 'function' ? category.toObject() : category;
    return Object.assign({}, item, { list: interfacesByCatid[item._id] || [] });
  });
}

module.exports = { buildCategoryTree, attachInterfacesToCategories };

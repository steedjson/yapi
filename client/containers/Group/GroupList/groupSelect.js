// @ts-check
// GroupList 分组路由参数解析与选中逻辑的纯函数集合。
// 单独成文件以便 test/client 直接导入做纯逻辑测试（GroupList.js 引入 SCSS，无法被 Node 端测试加载）。

/**
 * 严格解析分组 id：仅接受十进制纯数字字符串/数字，
 * 避免 parseInt('123abc') === 12 这类宽松解析把脏路由参数当成有效分组。
 * @param {any} value
 * @returns {number} 非法时返回 0
 */
export function parseGroupId(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const str = String(value);
  if (!/^\d+$/.test(str)) {
    return 0;
  }
  const id = parseInt(str, 10);
  return Number.isSafeInteger(id) ? id : 0;
}

/**
 * 从 react-router v6 的 params 中解析分组 id。
 * 兼容显式 :groupId 参数与 /group/* splat 路由（本仓库分组页为 splat 形式，id 在 splat 首段）。
 * @param {Record<string, string | undefined>} [params]
 * @returns {number} 非法时返回 0
 */
export function parseRouteGroupId(params) {
  if (!params) {
    return 0;
  }
  if (params.groupId !== undefined) {
    return parseGroupId(params.groupId);
  }
  const splat = params['*'];
  if (typeof splat === 'string' && splat !== '') {
    return parseGroupId(splat.split('/')[0]);
  }
  return 0;
}

/**
 * 在分组列表中按 id 严格匹配（数值相等，兼容 string/number 形态的 _id 与路由 key）。
 * @param {Array<{_id: any}>|undefined} groupList
 * @param {any} groupId
 * @returns {{_id: any}|null} 未命中返回 null
 */
export function findGroupById(groupList, groupId) {
  if (!Array.isArray(groupList)) {
    return null;
  }
  const id = Number(groupId);
  if (!id) {
    return null;
  }
  return groupList.find(group => group && Number(group._id) === id) || null;
}

/**
 * 根据路由解析出的 id 决定应选中的分组：命中则命中，未命中回退首个分组；
 * 列表为空返回 null（调用方据此跳过导航，避免生成 /group/undefined）。
 * @param {Array<{_id: any}>|undefined} groupList
 * @param {number} routeId
 * @returns {{_id: any}|null}
 */
export function resolveTargetGroup(groupList, routeId) {
  if (!Array.isArray(groupList) || groupList.length === 0) {
    return null;
  }
  return findGroupById(groupList, routeId) || groupList[0];
}

/**
 * @param {any} groupId
 * @returns {string}
 */
export function buildGroupPath(groupId) {
  return `/group/${groupId}`;
}

/**
 * 按分组名称过滤列表，使用普通字符串匹配避免正则特殊字符抛错。
 * @param {Array<{group_name?: any}>|undefined} groupList
 * @param {any} value
 * @returns {Array<any>}
 */
export function filterGroups(groupList, value) {
  if (!Array.isArray(groupList)) {
    return [];
  }
  const keyword = String(value === undefined || value === null ? '' : value).toLowerCase();
  if (keyword === '') {
    return groupList;
  }
  return groupList.filter(group => {
    const name = group && group.group_name;
    return name !== undefined && name !== null && String(name).toLowerCase().includes(keyword);
  });
}

// @ts-check
/** @type {Map<string, { value: any, expiresAt: number }>} */
const cache = new Map();

// 进程内短缓存只保存副本，避免缓存对象被请求处理流程意外修改。
/** @param {any} value */
const clone = value => JSON.parse(JSON.stringify(value));

module.exports = {
  /** @param {string} key */
  get(key) {
    const item = cache.get(key);
    if (!item || item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return clone(item.value);
  },

  /** @param {string} key @param {any} value @param {number} [ttl] */
  set(key, value, ttl = 5000) {
    cache.set(key, { value: clone(value), expiresAt: Date.now() + ttl });
    return value;
  },

  /**
   * 清理指定前缀的缓存，避免一个项目的写操作影响其他项目的缓存。
   * @param {string} prefix
   */
  clearByPrefix(prefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  },

  clear() {
    cache.clear();
  }
};

const cache = new Map();

// 进程内短缓存只保存副本，避免缓存对象被请求处理流程意外修改。
const clone = value => JSON.parse(JSON.stringify(value));

module.exports = {
  get(key) {
    const item = cache.get(key);
    if (!item || item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return clone(item.value);
  },

  set(key, value, ttl = 5000) {
    cache.set(key, { value: clone(value), expiresAt: Date.now() + ttl });
    return value;
  },

  clear() {
    cache.clear();
  }
};

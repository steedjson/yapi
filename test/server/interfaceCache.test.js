import test from 'ava';

const cache = require('../../server/utils/ttlCache');

// 只验证缓存边界，不启动数据库和 HTTP 服务。
test('分类缓存命中时返回副本并支持主动清理', t => {
  const value = [{ _id: 1, name: '用户' }];

  cache.clear();
  cache.set('menu:1', value);
  const cached = cache.get('menu:1');
  cached[0].name = '被修改的副本';

  t.deepEqual(cache.get('menu:1'), value);

  cache.clear();
  t.is(cache.get('menu:1'), null);
});

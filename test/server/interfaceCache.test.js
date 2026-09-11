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

// 项目级清理只影响对应项目，避免无关项目缓存失效。
test('按项目清理分类缓存', t => {
  cache.clear();
  cache.set('menu:1', [{ _id: 1 }]);
  cache.set('tree:1', [{ _id: 1 }]);
  cache.set('menu:2', [{ _id: 2 }]);

  cache.clearByPrefix('menu:1');

  t.is(cache.get('menu:1'), null);
  t.deepEqual(cache.get('tree:1'), [{ _id: 1 }]);
  t.deepEqual(cache.get('menu:2'), [{ _id: 2 }]);
});

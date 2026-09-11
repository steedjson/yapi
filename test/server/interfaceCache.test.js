import test from 'ava';

const interfaceController = require('../../server/controllers/interface.js');

// 只验证缓存边界，不启动数据库和 HTTP 服务。
const createController = () => Object.create(interfaceController.prototype);

test('分类缓存命中时返回副本并支持主动清理', t => {
  const controller = createController();
  const value = [{ _id: 1, name: '用户' }];

  controller.clearCategoryCache();
  controller.setCategoryCache('menu:1', value);
  const cached = controller.getCategoryCache('menu:1');
  cached[0].name = '被修改的副本';

  t.deepEqual(controller.getCategoryCache('menu:1'), value);

  controller.clearCategoryCache();
  t.is(controller.getCategoryCache('menu:1'), null);
});

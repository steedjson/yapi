import test from 'ava';

const { buildCategoryTree, attachInterfacesToCategories } = require('../../server/utils/categoryTree');

// 分类树按 parent_id 组装，历史数据缺失父节点时仍作为根分类返回。
test('分类树兼容多级和历史平铺分类', t => {
  const tree = buildCategoryTree([
    { _id: 1, name: '用户' },
    { _id: 2, name: '用户查询', parent_id: 1 },
    { _id: 3, name: '用户详情', parent_id: 2 },
    { _id: 4, name: '历史根分类', parent_id: 0 }
  ]);

  t.deepEqual(tree.map(item => item._id), [1, 4]);
  t.is(tree[0].children[0].children[0]._id, 3);
});

// 孤立父节点和循环引用不应让异常历史数据中的分类消失。
test('分类树兼容孤立父节点和循环引用', t => {
  const tree = buildCategoryTree([
    { _id: 1, name: '根', parent_id: 0 },
    { _id: 2, name: '孤立父节点', parent_id: 99 },
    { _id: 3, name: '循环一', parent_id: 4 },
    { _id: 4, name: '循环二', parent_id: 3 }
  ]);

  t.deepEqual(tree.map(item => item._id), [1, 2, 3, 4]);
});

// 深层分类使用显式遍历，避免分类层级增加后触发递归调用栈限制。
test('分类树支持深层级分类', t => {
  const categories = Array.from({ length: 10000 }, (_, index) => ({
    _id: index + 1,
    name: '层级' + (index + 1),
    parent_id: index
  }));
  const tree = buildCategoryTree(categories);
  let node = tree[0];
  let depth = 0;
  while (node) {
    depth += 1;
    node = node.children[0];
  }

  t.is(depth, categories.length);
});

// 分类列表与分类树都应保留接口顺序，并兼容普通对象数据。
test('分类接口挂载保留接口顺序', t => {
  const result = attachInterfacesToCategories(
    [{ _id: 1, name: '用户' }, { _id: 2, name: '订单' }],
    [{ _id: 10, catid: 1, title: '列表' }, { _id: 11, catid: 1, title: '详情' }]
  );

  t.deepEqual(result[0].list.map(item => item._id), [10, 11]);
  t.deepEqual(result[1].list, []);
});

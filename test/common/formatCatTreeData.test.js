import test from 'ava';
import { formatCatTreeData } from '../../common/utils.js';

test('空数组返回空数组', t => {
  t.deepEqual(formatCatTreeData([]), []);
});

test('非数组输入安全返回空数组', t => {
  t.deepEqual(formatCatTreeData(undefined), []);
  t.deepEqual(formatCatTreeData(null), []);
  t.deepEqual(formatCatTreeData('not-array'), []);
});

test('一维列表转换为 title/value/key 结构且 _id 转为字符串', t => {
  const list = [{ _id: 1, name: 'a' }, { _id: 2, name: 'b' }];
  t.deepEqual(formatCatTreeData(list), [
    { title: 'a', value: '1', key: '1' },
    { title: 'b', value: '2', key: '2' }
  ]);
});

test('多级嵌套树结构保持层级并递归转换', t => {
  const tree = [
    {
      _id: 1,
      name: 'root',
      children: [
        { _id: 11, name: 'child1', children: [{ _id: 111, name: 'grandchild' }] },
        { _id: 12, name: 'child2' }
      ]
    },
    { _id: 2, name: 'root2' }
  ];
  t.deepEqual(formatCatTreeData(tree), [
    {
      title: 'root',
      value: '1',
      key: '1',
      children: [
        {
          title: 'child1',
          value: '11',
          key: '11',
          children: [{ title: 'grandchild', value: '111', key: '111' }]
        },
        { title: 'child2', value: '12', key: '12' }
      ]
    },
    { title: 'root2', value: '2', key: '2' }
  ]);
});

test('空 children 数组不生成 children 字段', t => {
  const tree = [{ _id: 1, name: 'a', children: [] }];
  t.deepEqual(formatCatTreeData(tree), [{ title: 'a', value: '1', key: '1' }]);
});

test('环结构安全终止且同一节点只出现一次', t => {
  const a = { _id: 1, name: 'a' };
  const b = { _id: 2, name: 'b' };
  a.children = [b];
  b.children = [a]; // 环
  const result = formatCatTreeData([a]);
  t.deepEqual(result, [
    {
      title: 'a',
      value: '1',
      key: '1',
      children: [{ title: 'b', value: '2', key: '2' }]
    }
  ]);
});

test('无效节点(null)被过滤', t => {
  const list = [null, { _id: 1, name: 'a' }];
  t.deepEqual(formatCatTreeData(list), [{ title: 'a', value: '1', key: '1' }]);
});

test('同一层级的重复引用原样输出（visited 仅用于环保护）', t => {
  const shared = { _id: 1, name: 'a' };
  const list = [shared, shared];
  t.deepEqual(formatCatTreeData(list), [
    { title: 'a', value: '1', key: '1' },
    { title: 'a', value: '1', key: '1' }
  ]);
});

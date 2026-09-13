import test from 'ava';
import { flattenCatList } from '../../common/utils.js';

test('空数组返回空数组', t => {
  t.deepEqual(flattenCatList([]), []);
});

test('非数组输入安全返回空数组', t => {
  t.deepEqual(flattenCatList(undefined), []);
  t.deepEqual(flattenCatList(null), []);
  t.deepEqual(flattenCatList('not-array'), []);
});

test('扁平列表原样返回且保持顺序', t => {
  const list = [{ _id: 1, name: 'a' }, { _id: 2, name: 'b' }];
  const result = flattenCatList(list);
  t.deepEqual(
    result.map(item => item._id),
    [1, 2]
  );
});

test('树形列表拍平为深度优先原有顺序', t => {
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
  const result = flattenCatList(tree);
  t.deepEqual(
    result.map(item => item._id),
    [1, 11, 111, 12, 2]
  );
});

test('缺失 children 字段按叶子处理', t => {
  const tree = [{ _id: 1, name: 'a' }, { _id: 2, name: 'b', children: [] }];
  const result = flattenCatList(tree);
  t.deepEqual(
    result.map(item => item._id),
    [1, 2]
  );
});

test('环保护避免死循环且去重', t => {
  const a = { _id: 1, name: 'a' };
  const b = { _id: 2, name: 'b' };
  a.children = [b];
  b.children = [a]; // 环
  const result = flattenCatList([a]);
  t.deepEqual(
    result.map(item => item._id),
    [1, 2]
  );
});

test('保留每个节点的 name 与 _id 供下拉框匹配', t => {
  const tree = [{ _id: 10, name: '服务', children: [{ _id: 11, name: 'B' }] }];
  const result = flattenCatList(tree);
  t.is(result.length, 2);
  t.truthy(result.find(item => item._id === 11 && item.name === 'B'));
});

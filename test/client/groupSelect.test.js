import test from 'ava';
import {
  parseGroupId,
  parseRouteGroupId,
  findGroupById,
  resolveTargetGroup,
  buildGroupPath,
  filterGroups
} from '../../client/containers/Group/GroupList/groupSelect';

test('parseGroupId 仅接受十进制纯数字, 拒绝宽松 parseInt 陷阱', t => {
  t.is(parseGroupId('5'), 5);
  t.is(parseGroupId(7), 7);
  t.is(parseGroupId('007'), 7);
  t.is(parseGroupId('12abc'), 0);
  t.is(parseGroupId(''), 0);
  t.is(parseGroupId('   '), 0);
  t.is(parseGroupId('-1'), 0);
  t.is(parseGroupId('0x10'), 0);
  t.is(parseGroupId('1.5'), 0);
  t.is(parseGroupId(undefined), 0);
  t.is(parseGroupId(null), 0);
  t.is(parseGroupId({}), 0);
  t.is(parseGroupId('99999999999999999999'), 0);
});

test('parseRouteGroupId 兼容显式 :groupId 与 v6 /group/* splat', t => {
  t.is(parseRouteGroupId({ groupId: '9' }), 9);
  t.is(parseRouteGroupId({ groupId: 'abc' }), 0);
  t.is(parseRouteGroupId({ '*': '5' }), 5);
  t.is(parseRouteGroupId({ '*': '5/extra' }), 5);
  t.is(parseRouteGroupId({ '*': '' }), 0);
  t.is(parseRouteGroupId({ '*': 'abc' }), 0);
  t.is(parseRouteGroupId({}), 0);
  t.is(parseRouteGroupId(undefined), 0);
  t.is(parseRouteGroupId(null), 0);
});

const groupList = [{ _id: 1, group_name: 'a' }, { _id: 2, group_name: 'b' }];

test('findGroupById 数值严格匹配, 兼容字符串 id', t => {
  t.is(findGroupById(groupList, 2), groupList[1]);
  t.is(findGroupById(groupList, '1'), groupList[0]);
  t.is(findGroupById(groupList, 3), null);
  t.is(findGroupById(groupList, 0), null);
  t.is(findGroupById([], 1), null);
  t.is(findGroupById(undefined, 1), null);
  t.is(findGroupById([{ group_name: '无id' }], 1), null);
});

test('resolveTargetGroup 未命中回退首个分组, 空列表返回 null', t => {
  t.is(resolveTargetGroup(groupList, 2), groupList[1]);
  t.is(resolveTargetGroup(groupList, 99), groupList[0]);
  t.is(resolveTargetGroup(groupList, 0), groupList[0]);
  t.is(resolveTargetGroup([], 1), null);
  t.is(resolveTargetGroup(undefined, 1), null);
});

test('filterGroups 使用大小写不敏感的普通文本匹配', t => {
  const groups = [
    { group_name: 'Alpha' },
    { group_name: 'beta' },
    { group_name: 'symbols [(*\\\\' },
    { group_name: null }
  ];
  t.deepEqual(filterGroups(groups, 'ALP'), [groups[0]]);
  t.deepEqual(filterGroups(groups, '['), [groups[2]]);
  t.deepEqual(filterGroups(groups, ''), groups);
  t.deepEqual(filterGroups(undefined, 'a'), []);
});

test('buildGroupPath 由有效 id 构造 URL', t => {
  t.is(buildGroupPath(5), '/group/5');
  // 空列表场景由 resolveTargetGroup 返回 null 拦截, 不会走到拼 URL 一步
  t.is(resolveTargetGroup([], 1), null);
  t.is(resolveTargetGroup(undefined, 1), null);
});

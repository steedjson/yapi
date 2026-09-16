import test from 'ava';
import fs from 'fs';
import path from 'path';

// 分组选中竞态回归测试。
// GroupList.js 引入 SCSS 与装饰器，无法被 Node 端 AVA 直接加载，
// 故以源码结构断言锁定竞态修复要点（选中统一由 GroupList 负责、初始化用响应 payload）。

const readSrc = rel =>
  fs.readFileSync(path.join(__dirname, '../../client/containers/Group', rel), 'utf8');

const groupSrc = readSrc('Group.js');
const groupListSrc = readSrc('GroupList/GroupList.js');

test('Group 父容器不再出现 setCurrGroup（导入/注入/派发均移除, 选中统一由 GroupList 负责）', t => {
  t.false(/setCurrGroup/.test(groupSrc));
  t.false(/reducer\/modules\/group/.test(groupSrc)); // 不再从 group reducer 导入任何内容
});

test('Group 保留 get_mygroup 个人分组创建与 loading/error gate', t => {
  t.true(/get_mygroup/.test(groupSrc));
  t.true(/loadError/.test(groupSrc));
  t.true(/groupId === -1/.test(groupSrc));
  t.true(/<Spin/.test(groupSrc));
});

test('GroupList 初始化 await fetchGroupList 后使用响应 payload.data.data, 不读陈旧 props', t => {
  const match = groupListSrc.match(/async UNSAFE_componentWillMount\(\)[\s\S]*?\n {2}\}/);
  t.truthy(match, '应能定位到 UNSAFE_componentWillMount 方法体');
  const body = match[0];
  t.true(/await this\.props\.fetchGroupList\(\)/.test(body), '初始化应等待列表请求返回');
  t.true(/payload\.data\.data/.test(body), '应使用响应 payload 中的最新列表');
  t.false(/syncGroupSelection\(this\.props\.groupList/.test(body), '不得把可能陈旧的 props 直接传入同步方法');
});

test('GroupList 仍是选中分组的唯一派发方（syncGroupSelection 内派发 setCurrGroup）', t => {
  t.true(/this\.props\.setCurrGroup\(target\)/.test(groupListSrc));
  t.true(/this\.props\.history\.replace\(buildGroupPath\(target\._id\)\)/.test(groupListSrc));
});

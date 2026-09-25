// migrate-precheck.js 纯函数单测（离线：不连接数据库）
// 去重计划规则见 scripts/migrate-precheck.js 头注释与 computeDedupePlan JSDoc：
// 每组保留 count 最大的一条；count 并列时保留 _id 字符串序最小的一条（确定性取舍）；
// count 缺失/非数值按 0；model/field 缺失归入同一空键组；输出按 model/field 升序。
import test from 'ava';
import {
  computeDedupePlan,
  classifyPassword,
  maskUri,
  nodeMeetsRequirement,
  overrideDatabaseInUri
} from '../../scripts/migrate-precheck.js';

test('去重计划：无重复 → 空计划', t => {
  const docs = [
    { _id: 'a', model: 'project', field: '_id', count: 5 },
    { _id: 'b', model: 'user', field: '_id', count: 3 }
  ];
  t.deepEqual(computeDedupePlan(docs), []);
});

test('去重计划：空输入与非数组输入 → 空计划', t => {
  t.deepEqual(computeDedupePlan([]), []);
  // 防御性容错：非数组输入按空处理（脚本对老库异常形态不崩溃）
  t.deepEqual(computeDedupePlan(undefined), []);
  t.deepEqual(computeDedupePlan(null), []);
});

test('去重计划：单组多重复 → 保留 count 最大的一条，其余全部进入 removeIds', t => {
  const docs = [
    { _id: 'x1', model: 'project', field: '_id', count: 5 },
    { _id: 'x2', model: 'project', field: '_id', count: 9 },
    { _id: 'x3', model: 'project', field: '_id', count: 7 }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1);
  t.is(plan[0].keepId, 'x2');
  t.is(plan[0].keepCount, 9);
  t.is(plan[0].total, 3);
  // removeIds 顺序 = count 降序（与脚本删除明细输出一致）
  t.deepEqual(plan[0].removeIds, ['x3', 'x1']);
});

test('去重计划：多组并行 → 各组独立出计划，输出按 model/field 升序稳定排列', t => {
  const docs = [
    { _id: 'b2', model: 'user', field: '_id', count: 10 },
    { _id: 'b1', model: 'user', field: '_id', count: 2 },
    { _id: 'a3', model: 'interface', field: '_id', count: 100 },
    { _id: 'a1', model: 'interface', field: '_id', count: 101 },
    { _id: 'a2', model: 'interface', field: '_id', count: 99 }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 2);
  // interface < user：按 model 字符串升序
  t.is(plan[0].model, 'interface');
  t.is(plan[0].keepId, 'a1');
  t.deepEqual(plan[0].removeIds, ['a3', 'a2']);
  t.is(plan[1].model, 'user');
  t.is(plan[1].keepId, 'b2');
  t.deepEqual(plan[1].removeIds, ['b1']);
});

test('去重计划：count 并列 → 确定性取舍：保留 _id 字符串序最小的一条', t => {
  const docs = [
    { _id: 'm2', model: 'interface', field: '_id', count: 100 },
    { _id: 'm1', model: 'interface', field: '_id', count: 100 },
    { _id: 'm3', model: 'interface', field: '_id', count: 100 }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1);
  t.is(plan[0].keepId, 'm1', '并列时按 _id 字符串升序取首个，多次运行结果一致');
  t.is(plan[0].keepCount, 100);
  t.deepEqual(plan[0].removeIds, ['m2', 'm3']);
});

test('去重计划：count 并列且与 0 并列（缺失值）→ 同样按 _id 序取舍', t => {
  const docs = [
    { _id: 'z2', model: 'project', field: '_id' }, // count 缺失按 0
    { _id: 'z1', model: 'project', field: '_id', count: 0 }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1);
  t.is(plan[0].keepId, 'z1');
  t.deepEqual(plan[0].removeIds, ['z2']);
});

test('去重计划：字段缺失容错 → model/field 缺失归入同一空键组，不崩溃', t => {
  const docs = [
    { _id: 'k1', count: 4 }, // model/field 全缺
    { _id: 'k2', count: 6 }, // model/field 全缺（同组）
    { _id: 'k3', model: 'project', count: 1 } // 只有 model（field 缺），独立组
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1, 'k3 的 field 缺失与 k1/k2 的全缺不同键，不并入');
  t.deepEqual(plan[0].model, undefined);
  t.deepEqual(plan[0].field, undefined);
  t.is(plan[0].keepId, 'k2');
  t.deepEqual(plan[0].removeIds, ['k1']);
});

test('去重计划：_id 缺失容错 → 不进入 removeIds，keepId 允许为 null（防御 MongoDB 保证之外的数据）', t => {
  const docs = [
    { model: 'project', field: '_id', count: 5 }, // 无 _id（正常库不可能，防御合成/损坏数据）
    { _id: 'w2', model: 'project', field: '_id', count: 9 },
    { _id: 'w3', model: 'project', field: '_id', count: 7 }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1);
  t.is(plan[0].keepId, 'w2');
  t.deepEqual(plan[0].removeIds, ['w3'], '无 _id 的文档不会也不应出现在 removeIds 中');
});

test('去重计划：非对象元素跳过，count 为 NaN/Infinity 等非有限数值按 0', t => {
  const docs = [
    null, // 非对象元素跳过
    { _id: 'n1', model: 'user', field: '_id', count: Number.NaN },
    { _id: 'n2', model: 'user', field: '_id', count: Infinity }
  ];
  const plan = computeDedupePlan(docs);
  t.is(plan.length, 1);
  t.is(plan[0].keepId, 'n1', 'NaN 与 Infinity 都按 0，并列走 _id 序，n1 < n2');
  t.deepEqual(plan[0].removeIds, ['n2']);
});

test('密码分类：legacy sha1（40 位 hex）与 scrypt$ 前缀互斥且正确', t => {
  const legacy = '5f4dcc3b5aa765d61d8327deb882cf99b10ecf22'; // 40 位 hex
  t.is(classifyPassword(legacy), 'legacy_sha1');
  t.is(classifyPassword(legacy.toUpperCase()), 'legacy_sha1', 'hex 大小写不敏感');
  t.is(
    classifyPassword('scrypt$16384$8$1$ab12cd34$5678ef90ab12cd345678ef90ab12cd34'),
    'scrypt'
  );
  t.is(classifyPassword('not-a-hash'), 'other');
  t.is(classifyPassword(12345), 'other', '非字符串非空按 other');
  t.is(classifyPassword(''), 'missing');
  t.is(classifyPassword(undefined), 'missing');
  t.is(classifyPassword(null), 'missing');
});

test('工具函数：nodeMeetsRequirement 按 engines 口径 >= 22.12 判定', t => {
  t.true(nodeMeetsRequirement('v22.12.0'));
  t.true(nodeMeetsRequirement('v24.21.0'));
  t.false(nodeMeetsRequirement('v22.11.0'));
  t.false(nodeMeetsRequirement('v20.19.5'));
  t.false(nodeMeetsRequirement(''));
  t.false(nodeMeetsRequirement('garbage'));
});

test('工具函数：overrideDatabaseInUri 只替换路径首段库名，query（含 authSource）原样保留', t => {
  t.is(overrideDatabaseInUri('mongodb://127.0.0.1:27018/yapi', 'ndb'), 'mongodb://127.0.0.1:27018/ndb');
  t.is(
    overrideDatabaseInUri('mongodb://127.0.0.1:27018/yapi?authSource=admin', 'ndb'),
    'mongodb://127.0.0.1:27018/ndb?authSource=admin'
  );
  t.is(
    overrideDatabaseInUri('mongodb://h1:27017,h2:27018/mydb', 'ndb'),
    'mongodb://h1:27017,h2:27018/ndb',
    '多主机副本集连接串（new URL 会抛 Invalid URL 的形态）也能替换'
  );
  t.is(
    overrideDatabaseInUri('mongodb://user%40x:p%40ss@srv.example.com/dbname?tls=true', 'ndb'),
    'mongodb://user%40x:p%40ss@srv.example.com/ndb?tls=true'
  );
  t.is(overrideDatabaseInUri('mongodb+srv://cluster.example.com/', 'ndb'), 'mongodb+srv://cluster.example.com/ndb');
  t.is(overrideDatabaseInUri('mongodb://host', 'ndb'), 'mongodb://host/ndb', '无路径段时追加');
  t.is(overrideDatabaseInUri('mongodb://host?authSource=x', 'ndb'), 'mongodb://host/ndb?authSource=x');
});

test('工具函数：maskUri 抹掉 userinfo 凭据，无凭据连接串原样返回', t => {
  t.is(
    maskUri('mongodb://user:pass@127.0.0.1:27018/yapi?authSource=admin'),
    'mongodb://***@127.0.0.1:27018/yapi?authSource=admin'
  );
  t.is(maskUri('mongodb://127.0.0.1:27018/yapi'), 'mongodb://127.0.0.1:27018/yapi');
});

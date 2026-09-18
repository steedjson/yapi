/**
 * 回归测试：connect() 完整就绪契约。
 *
 * `await yapi.connect` 返回时，以下启动期数据库工作必须已全部落定
 * （server/utils/db.js 就绪链：ensureQueryIndexes → 全部已注册启动任务）：
 * 1. 11 条核心查询索引（条数与键顺序逐一核对）；
 * 2. identitycounters 的 {field:1, model:1} 唯一索引（mongoose-auto-increment
 *    的计数器正确性依赖，autoIndex 已关闭，改由启动任务显式创建）；
 * 3. 插件集合索引（wiki / statis_mock / adv_mock / adv_mock_case，改由
 *    yapi.registerStartupTask 注册的启动任务创建）。
 * 且 resolve 值透传 mongoose 实例。该语义是 test/helpers/closeMongoose.js
 * 安全 close 连接的前提：若启动任务退化为 fire-and-forget，此测试会失败。
 */
const test = require('ava');
const mongoose = require('mongoose');
const yapi = require('../../server/yapi.js');
const closeMongoose = require('../helpers/closeMongoose.js');

// 与 server/app.js 相同的启动路径（db.js connect + plugin.js 加载插件并注册
// 启动任务）；worker 内仅连接一次
if (!yapi.connect) {
  require('../../server/app.js');
}

// 与 server/utils/db.js ensureQueryIndexes 的声明保持一致
const EXPECTED = {
  interface: [
    { project_id: 1, catid: 1, index: 1 },
    { project_id: 1, index: 1 },
    { catid: 1, index: 1 },
    { catid: 1, api_opened: 1, title: 1 },
    { project_id: 1, title: 1 },
    { project_id: 1, path: 1, method: 1 }
  ],
  interface_cat: [{ project_id: 1, index: 1 }],
  interface_col: [{ project_id: 1, index: 1 }],
  interface_case: [
    { col_id: 1, index: 1 },
    { project_id: 1 },
    { interface_id: 1 }
  ]
};

// 与 3 个 exts 插件 server.js 注册的启动任务保持一致（键顺序逐一核对）
const PLUGIN_EXPECTED = {
  wiki: [{ project_id: 1 }],
  statis_mock: [
    { interface_id: 1 },
    { project_id: 1 },
    { group_id: 1 },
    { time: 1 },
    { date: 1 }
  ],
  adv_mock: [{ interface_id: 1 }, { project_id: 1 }],
  adv_mock_case: [{ interface_id: 1 }, { project_id: 1 }]
};

async function assertIndexes(t, coll, expectedKeys) {
  const dbh = mongoose.connection.db;
  t.truthy(dbh, 'mongoose 连接应已就绪');
  const idx = await dbh.collection(coll).listIndexes().toArray();
  const keys = idx.filter(i => i.name !== '_id_').map(i => i.key);
  const missing = expectedKeys.filter(k => !keys.some(g => JSON.stringify(g) === JSON.stringify(k)));
  const extra = keys.filter(g => !expectedKeys.some(k => JSON.stringify(k) === JSON.stringify(g)));
  t.deepEqual(missing, [], `${coll} 缺失索引: ${JSON.stringify(missing)}`);
  t.deepEqual(extra, [], `${coll} 多余索引: ${JSON.stringify(extra)}`);
}

test('connect() 就绪语义: await 后零等待, 11 条核心索引(条数+键顺序)全部存在', async t => {
  const resolved = await yapi.connect;
  t.truthy(resolved && resolved.connection, 'connect() resolve 值应为 mongoose 实例');
  for (const [coll, expectedKeys] of Object.entries(EXPECTED)) {
    await assertIndexes(t, coll, expectedKeys);
  }
});

test('connect() 就绪语义: identitycounters {field:1, model:1} 唯一索引存在', async t => {
  await yapi.connect;
  const dbh = mongoose.connection.db;
  const idx = await dbh.collection('identitycounters').listIndexes().toArray();
  const target = idx.find(
    i => JSON.stringify(i.key) === JSON.stringify({ field: 1, model: 1 })
  );
  t.truthy(target, 'identitycounters 应存在键序 {field:1, model:1} 的索引');
  t.true(!!(target && target.unique), '该索引必须保持 unique 语义');
  t.is(
    idx.filter(i => i.name !== '_id_').length,
    1,
    'autoIndex 已关闭，identitycounters 只应存在这一条业务索引'
  );
});

test('connect() 就绪语义: 插件集合索引(条数+键顺序)全部存在', async t => {
  await yapi.connect;
  for (const [coll, expectedKeys] of Object.entries(PLUGIN_EXPECTED)) {
    await assertIndexes(t, coll, expectedKeys);
  }
});

test.after.always('cleanup lingering handles', () => closeMongoose());

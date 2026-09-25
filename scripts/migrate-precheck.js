#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * migrate-precheck —— v2.0.0 换库/升级场景的迁移前检查与修复脚本
 *
 * 使用时机：mongorestore 之后、首次启动 v2.0.0 之前（见 docs/upgrade-migration-guide.md
 * 「主线路径：MongoDB 大版本升级」第三节）。默认只读报告，不带 --fix 不做任何写操作。
 *
 * 连接：读取仓库根 config.json，连接串构建逻辑与 server/utils/db.js connect() 逐分支一致
 * （connectString 优先 / servername+port+DATABASE / authSource 追加 / user-pass 认证），
 * 使用仓库自带的 mongodb 驱动（mongoose 的底层依赖，零新增依赖），不引入 mongoose。
 *
 * 检查项（默认只读）：
 *   1. identitycounters 重复文档：老版本多实例冷启动竞态的存量缺陷（TECH_DEBT 遗留观察项）。
 *      重复会让 v2.0.0 启动任务建 {field, model} 唯一索引失败（日志报错、不阻塞业务）。
 *      --fix 时每组保留 count 最大的一条（自增计数取最大保证不回退）并输出删除明细，
 *      fix 前后各报告一次残留。count 并列时保留 _id 字符串序最小的一条（确定性取舍）。
 *   2. user 密码格式普查：legacy sha1（40 位 hex）vs scrypt$ 自描述格式。
 *      scrypt 计数即「回滚陷阱暴露面」——这些账号已无法用 master 老代码登录
 *      （master user.js:48 只认 sha1 纯字符串比较，见指南回滚一节）。
 *   3. interface_cat 的 parent_id 缺失计数：无该字段的存量分类在 v2.0.0 读取侧
 *      归一为 0（顶级分类），纯信息性，无需处理。
 *   4. storage 集合普查：文档数与 key 类型分布。key Number→String 的存量文档
 *      不影响 v2.0.0（唯一消费方按字符串命名空间读写），纯信息性。
 *
 * CLI 参数：
 *   --fix        执行 identitycounters 清洗（其余检查始终只读）
 *   --db <name>  覆盖 config 中的 DATABASE（connectString 分支则替换串内库名，测试用）
 *   --json       机器可读输出（stdout 仅输出一个 JSON 对象，人类可读说明走 stderr）
 *
 * 退出码约定：
 *   0  无需处理 / --fix 处理成功
 *   1  发现需处理项（identitycounters 有重复且未带 --fix，或 --fix 后仍有残留）
 *   2  连接或参数错误（config.json 缺失/非法、连接失败、未知参数等）
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const COLLECTION_COUNTERS = 'identitycounters';
const COLLECTION_USER = 'user';
const COLLECTION_INTERFACE_CAT = 'interface_cat';
const COLLECTION_STORAGE = 'storage';
const SCRYPT_PREFIX = 'scrypt$';
// legacy sha1(password + sha1(passsalt)) 为 40 位十六进制（v2.0.0 scrypt 自描述格式以 scrypt$ 开头）
const SHA1_HEX_RE = /^[0-9a-f]{40}$/i;
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 12;
const CONNECT_TIMEOUT_MS = 10000;

/**
 * 以统一前缀向 stderr 写错误并退出（与 audit-check.js 的 fail 同风格）。
 * @param {number} code 退出码
 * @param {string} message 错误说明
 * @returns {never} 不会返回
 */
function fail(code, message) {
  process.stderr.write(`[migrate-precheck] ${message}\n`);
  process.exit(code);
}

/**
 * 手写 argv 解析（零依赖，双形态支持 --db <name> 与 --db=<name>）。
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{fix: boolean, json: boolean, db: string}} 解析结果
 */
function parseArgs(argv) {
  const opts = { fix: false, json: false, db: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fix') {
      opts.fix = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--db') {
      if (i + 1 >= argv.length) {
        fail(2, '--db 需要跟一个库名，例如 --db yapi_new');
      }
      opts.db = argv[++i];
    } else if (arg.startsWith('--db=')) {
      const value = arg.slice('--db='.length);
      if (!value) fail(2, '--db= 之后的库名不能为空');
      opts.db = value;
    } else {
      fail(2, `未知参数：${arg}（本脚本仅支持 --fix / --db <name> / --json）`);
    }
  }
  if (opts.db && !/^[^/\\?#\s"]+$/.test(opts.db)) {
    fail(2, `--db 的库名不合法：${opts.db}（不得包含 / \\ ? # 空白或引号）`);
  }
  return opts;
}

/**
 * 读取并校验 config.json（只读，不修改）。
 * @param {string} configPath 配置文件路径
 * @returns {{db: Record<string, any>}} 配置对象
 */
function loadConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    fail(2, `无法读取配置文件 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    fail(2, `配置文件 ${configPath} 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!config || typeof config !== 'object' || !config.db || typeof config.db !== 'object') {
    fail(2, `配置文件 ${configPath} 缺少 db 配置节点（应包含 servername/port/DATABASE 或 connectString）`);
  }
  return config;
}

/**
 * Node 版本是否满足部署硬性要求（engines 口径：>= 22.12，jsondiffpatch 0.7 require(esm) 下限）。
 * @param {string} versionString 形如 v24.21.0 的版本串
 * @returns {boolean} 是否满足
 */
function nodeMeetsRequirement(versionString) {
  const parts = String(versionString || '')
    .replace(/^v/, '')
    .split('.')
    .map(n => parseInt(n, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  if (major > MIN_NODE_MAJOR) return true;
  if (major < MIN_NODE_MAJOR) return false;
  return minor >= MIN_NODE_MINOR;
}

/**
 * 计数排序的规范化：老库极端脏数据（缺失/非数值）按 0 处理，保证排序确定性。
 * @param {any} value 原始 count 值
 * @returns {number} 可比较的数值
 */
function normalizeCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 分组键的单个部分：null/undefined 统一为空串（字段缺失容错，仍参与分组）。
 * @param {any} value model/field 原始值
 * @returns {string} 字符串键
 */
function keyPart(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * _id 排序键：用字符串形式比较。MongoDB ObjectId 的十六进制串升序即创建时间升序，
 * 字符串 _id 按字典序——两种形态下排序均为确定性取舍。
 * @param {any} id 文档 _id
 * @returns {string} 排序键
 */
function idSortKey(id) {
  return id === undefined || id === null ? '' : String(id);
}

/**
 * 去重计划纯函数：按 {model, field} 分组，对文档数 > 1 的组给出保留与删除方案。
 *
 * 规则（与 mongosh 手工片段语义一致，见 docs/upgrade-migration-guide.md）：
 *   - 每组保留 count 最大的一条（自增计数取最大保证不回退）；
 *   - count 并列时保留 _id 字符串序最小的一条（即最早创建的 ObjectId），行为确定性已声明；
 *   - count 缺失/非数值按 0 参与排序；model/field 缺失归入同一空键组；非对象元素跳过；
 *   - _id 缺失的文档不会进入 removeIds（MongoDB 服务端保证 _id 存在，此处仅防御合成/损坏数据）；
 *   - 输出按 model/field 字符串升序排列，便于测试与人工核对。
 *
 * @param {Array<Record<string, any>>} docs identitycounters 全量文档
 * @returns {Array<{model: any, field: any, total: number, keepId: any, keepCount: number, removeIds: any[]}>} 仅含需去重的组
 */
function computeDedupePlan(docs) {
  /** @type {Map<string, {model: any, field: any, docs: Record<string, any>[]}>} */
  const groups = new Map();
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (!doc || typeof doc !== 'object') continue;
    const key = `${keyPart(doc.model)}\u0000${keyPart(doc.field)}`;
    let group = groups.get(key);
    if (!group) {
      group = { model: doc.model, field: doc.field, docs: [] };
      groups.set(key, group);
    }
    group.docs.push(doc);
  }

  /** @type {Array<{model: any, field: any, total: number, keepId: any, keepCount: number, removeIds: any[]}>} */
  const plans = [];
  for (const group of groups.values()) {
    if (group.docs.length <= 1) continue;
    // count 降序，并列时 _id 字符串升序（保留最早创建的一条）
    const sorted = group.docs.slice().sort((a, b) => {
      const diff = normalizeCount(b.count) - normalizeCount(a.count);
      if (diff !== 0) return diff;
      const aKey = idSortKey(a._id);
      const bKey = idSortKey(b._id);
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
    const keeper = sorted[0];
    plans.push({
      model: group.model,
      field: group.field,
      total: group.docs.length,
      keepId: keeper._id === undefined ? null : keeper._id,
      keepCount: normalizeCount(keeper.count),
      removeIds: sorted
        .slice(1)
        .map(doc => doc._id)
        .filter(id => id !== undefined && id !== null)
    });
  }

  plans.sort((a, b) => {
    const aKey = `${keyPart(a.model)}\u0000${keyPart(a.field)}`;
    const bKey = `${keyPart(b.model)}\u0000${keyPart(b.field)}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return plans;
}

/**
 * 用户密码格式分类（普查用，只分类不改写）。
 * @param {any} password password 字段原值
 * @returns {'legacy_sha1'|'scrypt'|'other'|'missing'} 分类
 */
function classifyPassword(password) {
  if (password === undefined || password === null || password === '') return 'missing';
  if (typeof password !== 'string') return 'other';
  if (password.indexOf(SCRYPT_PREFIX) === 0) return 'scrypt';
  if (SHA1_HEX_RE.test(password)) return 'legacy_sha1';
  return 'other';
}

/**
 * 展示用 URI 脱敏：抹掉 userinfo 凭据（连接串可能内嵌账号密码，不得明文回显）。
 * @param {string} uri 连接串
 * @returns {string} 脱敏后的连接串
 */
function maskUri(uri) {
  const schemeEnd = uri.indexOf('://');
  const at = uri.lastIndexOf('@'); // lastIndexOf: userinfo 内未编码的 @ 会使 indexOf 泄露密码尾部片段
  if (schemeEnd !== -1 && at > schemeEnd) {
    return uri.slice(0, schemeEnd + 3) + '***@' + uri.slice(at + 1);
  }
  return uri;
}

/**
 * 用字符串手术替换连接串内的库名（不使用 new URL：其非特殊协议解析对
 * 多主机副本集连接串（mongodb://h1:27017,h2:27018/db）会直接抛 Invalid URL）。
 * 仅替换路径首段，query（含 authSource）原样保留。
 * @param {string} uri 原连接串
 * @param {string} database 目标库名
 * @returns {string} 替换后的连接串
 */
function overrideDatabaseInUri(uri, database) {
  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) {
    fail(2, `连接串不含 :// 权威部分，无法应用 --db：${maskUri(uri)}`);
  }
  const authStart = schemeEnd + 3;
  const slashIdx = uri.indexOf('/', authStart);
  // 权威部分之后先出现 ?/# 则视为无路径段
  const qHashRel = uri.slice(authStart).search(/[?#]/);
  const qHashAbs = qHashRel === -1 ? -1 : authStart + qHashRel;
  if (slashIdx === -1 || (qHashAbs !== -1 && qHashAbs < slashIdx)) {
    if (qHashAbs === -1) return `${uri}/${database}`;
    return `${uri.slice(0, qHashAbs)}/${database}${uri.slice(qHashAbs)}`;
  }
  const afterPath = uri.slice(slashIdx + 1);
  const segEndRel = afterPath.search(/[?#]/);
  const tail = segEndRel === -1 ? '' : afterPath.slice(segEndRel);
  return `${uri.slice(0, slashIdx + 1)}${database}${tail}`;
}

/**
 * 构建 mongodb 驱动连接参数：与 server/utils/db.js connect() 逐分支一致。
 * @param {Record<string, any>} config config.json 解析结果
 * @param {string} dbOverride --db 覆盖的库名（空串表示不覆盖）
 * @returns {{uri: string, options: Record<string, any>, database: string}} 连接串与驱动选项
 */
function buildConnection(config, dbOverride) {
  const db = config.db;
  /** @type {Record<string, any>} */
  const options = {};
  // 分支一：user/pass 存在时作为认证。mongoose options 形态对应驱动的 auth 对象。
  if (db.user) {
    options.auth = { username: db.user, password: db.pass };
  }
  // config.db.options 合并：与 db.js 的 Object.assign 行为一致（后者优先级更高）。
  if (db.options && typeof db.options === 'object' && !Array.isArray(db.options)) {
    Object.assign(options, db.options);
  }

  let uri;
  let database = dbOverride || '';
  if (db.connectString) {
    uri = dbOverride ? overrideDatabaseInUri(String(db.connectString), dbOverride) : String(db.connectString);
  } else {
    if (!dbOverride && (!db.servername || db.port === undefined || db.port === null || !db.DATABASE)) {
      fail(2, 'config.json 的 db 节点缺少 servername/port/DATABASE（且未配置 connectString），无法构建连接串');
    }
    database = dbOverride || String(db.DATABASE);
    // 与 db.js 相同：mongodb://{servername}:{port}/{DATABASE}，authSource 存在时追加
    uri = `mongodb://${db.servername}:${db.port}/${database}`;
    if (db.authSource) {
      uri += `?authSource=${db.authSource}`;
    }
  }
  // CLI 显式给出较短的服务发现超时，避免连不上时按驱动默认挂 30 秒；
  // config.db.options 可覆盖该值（合并顺序在其之后无效力，故先放默认再放 options）。
  const finalOptions = Object.assign({ serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS }, options);
  return { uri, options: finalOptions, database };
}

/**
 * 检查项 1：identitycounters 重复文档。
 * @param {import('mongodb').Db} db 数据库句柄
 * @param {boolean} fix 是否执行清洗
 * @param {(line: string) => void} out 人类可读输出函数
 * @returns {Promise<{totalDocs: number, duplicateGroups: number, docsInDupGroups: number, removed: number, residueGroups: number, plan: Array<Record<string, any>>}>} 检查结果
 */
async function checkIdentityCounters(db, fix, out) {
  const col = db.collection(COLLECTION_COUNTERS);
  const docs = await col.find({}).toArray();
  const plan = computeDedupePlan(docs);
  const docsInDupGroups = plan.reduce((sum, group) => sum + group.total, 0);

  out(`  [1] identitycounters 共 ${docs.length} 条文档，按 {model, field} 分组：`);
  if (plan.length === 0) {
    out('      无重复文档，无需清洗。');
    return {
      totalDocs: docs.length,
      duplicateGroups: 0,
      docsInDupGroups: 0,
      removed: 0,
      residueGroups: 0,
      plan: []
    };
  }

  out(`      发现 ${plan.length} 组重复（涉及 ${docsInDupGroups} 条文档），每组保留 count 最大的一条：`);
  for (const group of plan) {
    out(
      `      - model=${JSON.stringify(group.model)} field=${JSON.stringify(group.field)}：` +
        `${group.total} 条，保留 _id=${String(group.keepId)}（count=${group.keepCount}），` +
        `将删除 ${group.removeIds.length} 条`
    );
  }

  let removed = 0;
  if (fix) {
    for (const group of plan) {
      const result = await col.deleteMany({ _id: { $in: group.removeIds } });
      removed += result.deletedCount || 0;
      out(`      已删除 model=${JSON.stringify(group.model)} field=${JSON.stringify(group.field)} 组 ${result.deletedCount || 0} 条`);
    }
    // fix 后复查残留（重复组清零才算处理成功）
    const residue = computeDedupePlan(await col.find({}).toArray());
    out(`      清洗完成，共删除 ${removed} 条；复查残留重复组：${residue.length} 组`);
    return {
      totalDocs: docs.length,
      duplicateGroups: plan.length,
      docsInDupGroups,
      removed,
      residueGroups: residue.length,
      plan
    };
  }

  out('      未带 --fix，本次不做任何写操作。');
  return {
    totalDocs: docs.length,
    duplicateGroups: plan.length,
    docsInDupGroups,
    removed: 0,
    residueGroups: plan.length,
    plan
  };
}

/**
 * 检查项 2：user 密码格式普查（回滚陷阱暴露面）。
 * @param {import('mongodb').Db} db 数据库句柄
 * @param {(line: string) => void} out 人类可读输出函数
 * @returns {Promise<{total: number, legacy_sha1: number, scrypt: number, other: number, missing: number}>} 普查结果
 */
async function checkUserPasswords(db, out) {
  const col = db.collection(COLLECTION_USER);
  const docs = await col.find({}, { projection: { password: 1 } }).toArray();
  /** @type {{total: number, legacy_sha1: number, scrypt: number, other: number, missing: number}} */
  const census = { total: docs.length, legacy_sha1: 0, scrypt: 0, other: 0, missing: 0 };
  for (const doc of docs) {
    census[classifyPassword(doc.password)] += 1;
  }
  out(`  [2] user 密码格式普查（共 ${census.total} 个账号）：`);
  out(`      legacy sha1（老格式，仍可回退老版本登录）：${census.legacy_sha1}`);
  out(`      scrypt$（v2.0.0 自动升级后，回滚老版本后无法登录）：${census.scrypt}`);
  if (census.other > 0 || census.missing > 0) {
    out(`      其他/缺失（需人工核对）：other=${census.other} missing=${census.missing}`);
  }
  out('      说明：scrypt 计数即回滚陷阱暴露面（master user.js:48 只认 sha1），详见指南回滚一节。');
  return census;
}

/**
 * 检查项 3：interface_cat 的 parent_id 缺失计数（信息性）。
 * @param {import('mongodb').Db} db 数据库句柄
 * @param {(line: string) => void} out 人类可读输出函数
 * @returns {Promise<{total: number, missingParentId: number}>} 检查结果
 */
async function checkInterfaceCat(db, out) {
  const col = db.collection(COLLECTION_INTERFACE_CAT);
  const total = await col.countDocuments({});
  const missingParentId = await col.countDocuments({ parent_id: { $exists: false } });
  out(`  [3] interface_cat 共 ${total} 条，其中无 parent_id 字段 ${missingParentId} 条（信息性：v2.0.0 读取侧归一为 0 = 顶级分类，多级分类 UI 中正常显示为顶层，无需处理）。`);
  return { total, missingParentId };
}

/**
 * 检查项 4：storage 集合普查（信息性）。
 * @param {import('mongodb').Db} db 数据库句柄
 * @param {(line: string) => void} out 人类可读输出函数
 * @returns {Promise<{total: number, keyTypes: Array<{type: string, n: number}>}>} 普查结果
 */
async function checkStorage(db, out) {
  const col = db.collection(COLLECTION_STORAGE);
  const total = await col.countDocuments({});
  const typeRows = await col
    .aggregate([{ $group: { _id: { $type: '$key' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  const keyTypes = typeRows.map(row => ({ type: row._id === null ? 'null' : String(row._id), n: row.n }));
  out(`  [4] storage 共 ${total} 条，key 类型分布：${keyTypes.map(t => `${t.type}=${t.n}`).join('、') || '（空集合）'}`);
  out('      说明：key Number→String 为向后兼容变更，存量 Number key 文档不影响 v2.0.0，无需处理。');
  return { total, keyTypes };
}

/**
 * 主流程：连接 → 四项检查 →（--fix 时清洗）→ 汇总输出 → 返回退出码。
 * @returns {Promise<number>} 退出码：0 无需处理/处理成功；1 发现需处理项；2 已在 fail() 内退出
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const configPath = DEFAULT_CONFIG_PATH;
  const config = loadConfig(configPath);

  // Node 版本检查：部署硬性要求（engines 口径），但脚本本身低版本也能跑，仅警告不阻断
  const nodeOk = nodeMeetsRequirement(process.version);
  if (!nodeOk) {
    process.stderr.write(
      `[migrate-precheck] 警告：当前 Node 版本 ${process.version} 低于 v2.0.0 部署硬性要求 ` +
        `>= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}（jsondiffpatch 0.7 require(esm) 下限，engines 已强制）。` +
        `本脚本不受影响继续运行，但请在部署 v2.0.0 前升级 Node。\n`
    );
  }

  const { uri, options, database } = buildConnection(config, opts.db);

  const client = new MongoClient(uri, options);
  try {
    try {
      await client.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(2, `无法连接 MongoDB（${maskUri(uri)}）：${message}`);
    }
    const db = client.db();

    /** @type {string[]} */
    const humanLines = [];
    const out = (/** @type {string} */ line) => {
      if (opts.json) {
        humanLines.push(line);
      } else {
        console.log(line);
      }
    };

    // json 模式下目标信息已在 JSON 的 target 字段中，人类可读行统一走 stderr；
    // 非 json 模式走 stdout，与检查输出构成一份完整报告。
    if (opts.json) {
      console.error(`[migrate-precheck] 目标库：${maskUri(uri)}（config：${configPath}）`);
    } else {
      out(`[migrate-precheck] 目标库：${maskUri(uri)}（config：${configPath}）${opts.fix ? '（--fix 已启用）' : ''}`);
    }

    const counters = await checkIdentityCounters(db, opts.fix, out);
    const passwords = await checkUserPasswords(db, out);
    const interfaceCat = await checkInterfaceCat(db, out);
    const storage = await checkStorage(db, out);

    // 退出码：发现需处理项（有重复且未 --fix，或 --fix 后仍有残留）为 1；其余 0
    const needsAction = opts.fix ? counters.residueGroups > 0 : counters.duplicateGroups > 0;
    const exitCode = needsAction ? 1 : 0;

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            node: { version: process.version, meetsRequirement: nodeOk },
            target: { configPath, database, uri: maskUri(uri), fix: opts.fix },
            checks: {
              identityCounters: counters,
              userPasswords: passwords,
              interfaceCat,
              storage
            },
            summary: {
              needsAction,
              action: needsAction ? '重新运行并携带 --fix 执行 identitycounters 清洗' : '无需处理',
              exitCode
            },
            humanLog: humanLines
          },
          null,
          2
        )
      );
    } else {
      console.log('');
      console.log(
        `[migrate-precheck] 结论：${
          needsAction
            ? '发现需处理项（identitycounters 重复' + (opts.fix ? '，清洗后仍有残留' : '') + '），退出码 1'
            : opts.fix
              ? '处理成功（或无需处理），退出码 0'
              : '无需处理，退出码 0'
        }`
      );
      if (needsAction && !opts.fix) {
        console.log('[migrate-precheck] 处理方式：node scripts/migrate-precheck.js --fix');
      }
    }
    return exitCode;
  } finally {
    await client.close().catch(() => {});
  }
}

if (require.main === module) {
  main()
    .then(code => {
      process.exit(code);
    })
    .catch(err => {
      fail(2, `执行异常：${err instanceof Error ? (err.stack || err.message) : String(err)}`);
    });
}

module.exports = {
  computeDedupePlan,
  classifyPassword,
  buildConnection,
  overrideDatabaseInUri,
  maskUri,
  nodeMeetsRequirement,
  parseArgs
};

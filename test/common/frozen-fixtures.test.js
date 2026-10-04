import test from 'ava';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * 冻结夹具字节门禁: test/fixtures/json-schema-editor-visual/
 *
 * 对象: json-schema-editor-visual@1.0.23 的 npm pack 原样快照(2026-09-22 提取), 是新旧编辑器
 * 往返等价测试(JsonSchemaEditor.equiv*.test.js)的唯一基线; 该目录 README 声明「冻结原则:
 * 禁止修改」, eslint 亦整体豁免(eslint.config.js ignores 'test/fixtures/**')——豁免意味着
 * lint 不会再替这个目录兜底发现误删。
 *
 * 实证背景: 调试残留清理批曾把该目录 utils.js:104 的 `// console.log(schema)` 列为候选删除
 * 目标(位于冻结目录内, 按纪律保留才未丢基线); 目录此前无任何内容门禁, 同类清理再触碰时不会
 * 有测试报红。本文件把目录清单与全部文件的内容指纹钉死: 任何字节漂移、增删、改名都会报红,
 * 有意变更必须显式更新下方 FROZEN_FILES(变更本身进 diff 可见)。
 *
 * 范围取舍(单文件 vs 全目录):
 *   - 不选「只钉 utils.js 单文件」: 等价测试 require 的执行资产共 4 个(models/schema.js、
 *     moox-lite.js、schema.js、utils.js), 任一漂移都会静默改变基线行为, 单文件保护力不足;
 *   - 不选「目录整体单哈希」(相对路径清单拼进一个哈希): 逐文件指纹可在断言里直接读出是哪个
 *     文件漂移, 诊断成本低; 文件增删/改名由目录清单断言独立暴露, 不必与内容漂移混在一条;
 *   - README.md 一并内容钉死: 冻结目录采用单一规则「目录内每个文件都冻结」, 不设判断口子
 *     (README 记录来源与冻结原则, 属冻结产物的一部分); 有意更新须显式改指纹。
 *
 * 反恒真: 先断言目录存在、清单非空且与冻结清单逐项相等, 再逐文件断言字节数与 sha256——
 * 指纹为 null/空转、文件缺失、清单枚举失效都会先被清单/存在性断言拦下。
 */
const ROOT = path.resolve(__dirname, '../..');
const FIXTURE_DIR = path.join(ROOT, 'test/fixtures/json-schema-editor-visual');

// 冻结清单: 相对路径(统一 '/' 分隔) → 字节数 + sha256。双指标同时断言: 任一单独失效
// (如哈希常量误抄)另一条仍能兜底, 且字节数先给出可读的漂移量。
const FROZEN_FILES = {
  'README.md': {
    bytes: 522,
    sha256: 'f5038b5f7ea75c1c4374b8504ba5eb421045e590f960392f44c9faeecdac8365'
  },
  'moox-lite.js': {
    bytes: 2064,
    sha256: 'd250fbb4c4c2d72b84460481693752f46e0c9139013c775fb0820a558e6afbf8'
  },
  'models/schema.js': {
    bytes: 6393,
    sha256: '750175c680b1de7ea5b6084927e862617ab6972632bf1d5855fbbf2ebed181bc'
  },
  'schema.js': {
    bytes: 829,
    sha256: '1784b309eae789f46ab0a533f81b0e9e37333c2dc2313014fc0aeb4fb23d7d9e'
  },
  'utils.js': {
    bytes: 3302,
    sha256: '9bf16800c283d5dc5f9f8b995d2d50689f619049d17c942cb54de400fd89bab7'
  }
};

const EXPECTED_FILES = Object.keys(FROZEN_FILES).sort();
const IGNORED_OS_JUNK = ['.DS_Store'];

/** 递归枚举夹具目录(忽略 macOS 浏览目录产生的 .DS_Store), 返回 '/' 分隔的相对路径排序表 */
function listFixtureFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_OS_JUNK.includes(entry.name)) {
      continue;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFixtureFiles(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

test('冻结夹具目录存在且文件清单与冻结清单逐项相等(增删/改名即报红)', t => {
  t.true(fs.existsSync(FIXTURE_DIR), `冻结夹具目录缺失: ${FIXTURE_DIR}`);
  t.true(fs.statSync(FIXTURE_DIR).isDirectory());

  // 目录为树形(根下 models/ 与四个文件), 递归结果按路径整表排序后与期望清单(全局排序)比较
  const files = listFixtureFiles(FIXTURE_DIR).sort();
  // 非空下限: 防枚举失效/清单被清空导致的恒真
  t.true(files.length >= EXPECTED_FILES.length, `目录内文件数异常偏少: ${files.length}`);
  t.true(EXPECTED_FILES.length >= 5, '冻结清单不得被清空(至少 5 个文件)');
  t.deepEqual(files, EXPECTED_FILES, '冻结夹具目录的文件清单漂移: 新增/删除/改名须显式复核');
});

test('冻结夹具每个文件字节数与 sha256 均与冻结指纹一致(任何字节改动即报红)', t => {
  for (const [rel, frozen] of Object.entries(FROZEN_FILES)) {
    const file = path.join(FIXTURE_DIR, rel);
    t.true(fs.existsSync(file), `冻结夹具文件缺失: ${rel}`);

    const bytes = fs.readFileSync(file);
    t.is(bytes.length, frozen.bytes, `${rel} 字节数漂移`);
    t.is(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      frozen.sha256,
      `${rel} 内容漂移(sha256 不匹配)`
    );
  }
});

test('utils.js:104 注释态调试残留按纪律保留(清理批候选目标的定向回归钉)', t => {
  // 该行是「注释态调试残留清理」批中唯一按冻结纪律保留的候选: 若同类清理误删此注释,
  // 哈希断言虽报红但定位不直观, 本用例把该行内容单独钉死、失败信息直接指向原因。
  const lines = fs.readFileSync(path.join(FIXTURE_DIR, 'utils.js'), 'utf8').split('\n');
  t.is(lines.length, 153, 'utils.js 行数漂移');
  t.is(lines[103], '  // console.log(schema)', 'utils.js:104 的注释态残留不得被清理误删');
});
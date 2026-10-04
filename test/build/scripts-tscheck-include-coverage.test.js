import test from 'ava';
import fs from 'fs';
import path from 'path';
// 共享辅助（test/build/gate-helpers.js）：marker 识别、JSONC 读取、include glob 匹配与
// 代码文件枚举统一取共享实现，本文件不再自带副本。
const { hasTsCheckMarker, readJsonc, globToRegExp, listCodeFiles } = require('./gate-helpers');

// 类型门禁有两条腿，缺一即静默脱检：
//   1) marker：文件自带 // @ts-check（受检的唯一开关，checkJs 继承 false）——
//      scripts/ 面与根级白名单面的 marker 腿由 test/build/build-tscheck-coverage.test.js 锁死；
//   2) include：文件必须落在某个 tsconfig 的 program 内——主 tsconfig.json 以逐文件
//      白名单收口 scripts/ 的 .js/.cjs 与 5 个根级 CJS 配置，tsconfig.build.json 以
//      scripts/**/*.mjs glob 与根级 rsbuild.config.mjs 显式条目覆盖 .mjs。
// 本文件锁第 2 条（include 腿），覆盖范围 = scripts/ 全部脚本 + 仓库根级代码文件
// （*.js/*.jsx/*.mjs/*.cjs，含 .prettierrc.js 这类隐藏文件；无豁免清单）。新增一个
// 「带 marker 但没进任何 include」的文件时，marker 断言仍全绿，tsc 却根本不看它
// （实测：同一份含类型错误的探针，未 include 时 exit 0）。
// 只读 tsconfig.json / tsconfig.build.json / scripts/ 目录与仓库根目录，不修改任何文件。

const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

// 两份 tsconfig 的 include 合并成「program 覆盖面」匹配器（include 腿的两个测试共用）。
function includePatterns() {
  const mainConfig = readJsonc(path.join(ROOT, 'tsconfig.json'));
  const buildConfig = readJsonc(path.join(ROOT, 'tsconfig.build.json'));
  return [...mainConfig.include, ...(buildConfig.include || [])].map(globToRegExp);
}

test('scripts/ 下的每个 .js/.mjs/.cjs 都落在某个 tsconfig 的 include 内（带 marker 但不在 program 内同样脱检）', t => {
  const files = listCodeFiles(SCRIPTS_DIR, { recursive: true });
  t.true(files.length >= 5, 'scripts/ 应枚举到全部脚本，实际 ' + files.length);

  const patterns = includePatterns();

  // 反恒真守卫：matcher 不得匹配任意路径（否则本断言会退化为恒过）。
  t.false(patterns.some(p => p.test('scripts/__qa-not-a-real-file__.js')), 'glob 匹配过宽');
  t.false(patterns.some(p => p.test('client/not-covered.js')), 'glob 匹配过宽（跨目录）');

  const uncovered = files.filter(rel => !patterns.some(p => p.test(rel)));

  t.deepEqual(
    uncovered,
    [],
    '以下 scripts 文件不在任何 tsconfig include 内，会被静默跳过（加 marker 也无效）：' +
      uncovered.join(', ')
  );
});

// 仓库根级代码文件此前只在批 B 的显式白名单里被逐条断言（只锁已知条目，不枚举）：新增一个
// 未进 include 或缺 marker 的根级配置会静默游离。本测试按枚举补齐完整性兜底：仓库根
// 一层的每个 .js/.jsx/.mjs/.cjs 都必须同时满足 include 腿与 marker 腿，无豁免清单。
test('仓库根级代码文件（*.js/*.jsx/*.mjs/*.cjs，含隐藏文件）同样满足两条腿（include ∧ marker）', t => {
  const files = listCodeFiles(ROOT); // 非递归：只枚举仓库根一层
  // 下限断言防「枚举失效导致清单为空/漏隐藏文件」的假绿：当前恰 6 个（5 个非隐藏 +
  // 隐藏的 .prettierrc.js）；枚举若丢掉隐藏文件会只剩 5 个，此断言立即失败。
  t.true(files.length >= 6, '仓库根级应枚举到全部代码文件（含隐藏文件），实际 ' + files.length);

  const patterns = includePatterns();

  // 反恒真守卫：matcher 不得匹配不存在的根文件，也不得跨目录（否则断言退化为恒过）。
  t.false(
    patterns.some(p => p.test('zz-not-a-real-root-file.js')),
    'glob 匹配过宽（不存在的根文件）'
  );
  t.false(patterns.some(p => p.test('client/not-covered.js')), 'glob 匹配过宽（跨目录）');

  const missingInclude = files.filter(rel => !patterns.some(p => p.test(rel)));
  const missingMarker = files.filter(
    rel => !hasTsCheckMarker(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  );

  t.deepEqual(
    missingInclude,
    [],
    '以下根级代码文件不在任何 tsconfig include 内（缺 include 腿，tsc 静默跳过，加 marker 也无效）：' +
      missingInclude.join(', ')
  );
  t.deepEqual(
    missingMarker,
    [],
    '以下根级代码文件缺 // @ts-check（缺 marker 腿，checkJs 继承 false 时 tsc 静默跳过）：' +
      missingMarker.join(', ')
  );
});
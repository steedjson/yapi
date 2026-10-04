import test from 'ava';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// build/ 门禁（类型 + lint）的覆盖不变量。
// tsconfig.build.json 继承主 tsconfig.json 的 checkJs: false，因此 build/ 下每个文件必须
// 自带 // @ts-check 才会被 tsc 纳入检查：实测同一份含类型错误的探针文件，带 marker 时报
// TS2339（exit 1），去掉 marker 后 exit 0 静默跳过。也就是说 marker 是「唯一开关」，
// 漏写的文件会脱检而不报错——本测试把「受检集合 = build/ 下除豁免清单外的全部 .js/.mjs」
// 锁成断言，防止后续新增脚本静默脱检。
//
// 同源的 lint 面按同一思路锁死：eslint 9 平铺配置只给 files 命中的配置块挂规则，
// .mjs 不显式并入时规则数为 0（实测 --print-config），且 build/ 需显式列入 lint 脚本
// 才会被扫描——两处一并断言，防「文件被 lint 但无规则」的静默游离。
//
// 纪律：本文件只读 build/、tsconfig.build.json、package.json 与 eslint.config.js，
// 不修改任何源码（免检例外仅登记在 tsconfig.build.json 注释与 docs/BUGLOG/dev.md，
// 此处只做断言）。

const ROOT = path.resolve(__dirname, '../..');
const BUILD_DIR = path.join(ROOT, 'build');
const BUILD_TSCONFIG = path.join(ROOT, 'tsconfig.build.json');

// 有意豁免清单：build/empty-module.js 经 resolve.fallback（rsbuild.config.mjs）进入客户端
// 模块图，其源码内容会不可预判地改变 static/prd 的 manifest chunk 名（实测：加 @ts-check
// 确定性触发 08fdc614→5538fe94；另有一段说明注释曾触发；一行短中性注释未触发）——破坏
// 「注解批次零产物变更」不变量。故该文件免检、且必须与 HEAD 逐字节一致；豁免只此一个文件。
const TSCCHECK_EXEMPT = ['empty-module.js'];

// 豁免文件的字节指纹（sha256 / 字节数）：内容改动可能移动客户端产物的 manifest 名
// （影响不可预判），必须连同 static/prd 产物一起显式复核后才可有意更新此指纹。
const EMPTY_MODULE_SHA256 =
  '259739051e01afc1e3cd2d94b0da9a6bfac5b07b335e1bcb1c0753baffc0866a';
const EMPTY_MODULE_BYTES = 262;

// 递归枚举 build/ 下的脚本（与 tsconfig.build.json 的 build/**/*.js|*.mjs glob 同口径）。
function listBuildScripts(dir = BUILD_DIR, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listBuildScripts(full, acc);
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      acc.push(path.relative(BUILD_DIR, full));
    }
  }
  return acc;
}

// tsconfig.build.json 带 JSONC 注释，故先剥掉整行 // 注释再解析。
function readBuildTsconfig() {
  const stripped = fs
    .readFileSync(BUILD_TSCONFIG, 'utf8')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
  return JSON.parse(stripped);
}

test('build/ 下除豁免清单外的每个 .js/.mjs 都带 // @ts-check（漏写即静默脱检）', t => {
  const scripts = listBuildScripts();
  // 2026-10-04 删除零消费方死模块 clientBuildConfig.js 后，build/ 共 8 个脚本；
  // 下限断言用于防「枚举失效导致清单为空」的假绿。
  t.true(scripts.length >= 8, 'build/ 应枚举到全部脚本，实际 ' + scripts.length);

  const unmarked = scripts.filter(rel => {
    const source = fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8');
    return !/^\s*\/\/\s*@ts-check/.test(source);
  });

  t.deepEqual(
    unmarked.sort(),
    [...TSCCHECK_EXEMPT].sort(),
    '未标记 @ts-check 的文件集合必须恰好等于豁免清单；多出的文件会脱离类型门禁'
  );
});

test('tsconfig.build.json 的 include 覆盖 build/ 全部脚本且无 exclude 收窄', t => {
  const config = readBuildTsconfig();
  t.is(config.extends, './tsconfig.json');
  t.deepEqual(config.include, ['build/**/*.js', 'build/**/*.mjs', 'scripts/**/*.mjs']);
  t.false(Object.prototype.hasOwnProperty.call(config, 'exclude'), 'exclude 会静默缩小门禁范围');

  // 免检是「文件不带 marker」，不是「不在 glob 内」：豁免文件必须仍被 include 命中。
  const exemptRel = TSCCHECK_EXEMPT[0];
  t.true(/\.js$/.test(exemptRel), '豁免文件须落在 build/**/*.js glob 内');
  t.true(fs.existsSync(path.join(BUILD_DIR, exemptRel)));

  // nodenext 是本配置存在的理由（主配置 module: commonjs 容纳不下 .mjs 的 import.meta）。
  t.true(listBuildScripts().some(rel => rel.endsWith('.mjs')), 'build/ 存在 .mjs 脚本');
  t.is(config.compilerOptions.module, 'nodenext');
  t.is(config.compilerOptions.moduleResolution, 'nodenext');
});

test('豁免文件 build/empty-module.js 与 HEAD 逐字节一致（内容改动可能移动 manifest 名）', t => {
  const source = fs.readFileSync(path.join(BUILD_DIR, TSCCHECK_EXEMPT[0]));
  t.false(/@ts-check/.test(source.toString('utf8')), '豁免文件不得加 marker');

  const hash = crypto.createHash('sha256').update(source).digest('hex');
  t.is(source.length, EMPTY_MODULE_BYTES, '字节数漂移：产物 manifest 名会随之改变');
  t.is(hash, EMPTY_MODULE_SHA256, '内容漂移：产物 manifest 名会随之改变');
});

test('build/ 已纳入 lint 范围，且四类脚本扩展名均有规则面（防静默游离）', t => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lintTokens = pkg.scripts.lint.split(/\s+/);
  t.true(
    lintTokens.includes('.') || lintTokens.includes('build/'),
    'lint 脚本必须以全仓（.）或显式 build/ 覆盖构建脚本'
  );

  const eslintConfig = require(path.join(ROOT, 'eslint.config.js'));
  // 平铺配置的 ignores 不得排除 build/（否则「脚本收了口、文件仍游离」）。
  const ignores = eslintConfig.flatMap(entry =>
    Array.isArray(entry.ignores) ? entry.ignores : []
  );
  t.false(
    ignores.some(pattern => pattern.startsWith('build')),
    'build/ 不得出现在 eslint ignores'
  );

  // 只有 files 命中的配置块才挂规则；扩展名未显式并入时会出现「被 lint 但 0 规则」。
  for (const ext of ['js', 'jsx', 'mjs', 'cjs']) {
    const covered = eslintConfig.some(
      entry =>
        entry.files &&
        entry.files.some(pattern => pattern.endsWith('*.' + ext)) &&
        Object.keys(entry.rules || {}).length > 0
    );
    t.true(covered, `.${ext} 必须被挂有规则的配置块覆盖`);
  }
});

// scripts/ 面按同一口径锁死：主 tsconfig.json 以逐文件白名单收口 scripts/ 的 .js/.cjs，
// tsconfig.build.json 以 scripts/**/*.mjs glob 覆盖 .mjs——两处都继承 checkJs: false，
// 仍以文件自带 // @ts-check 为唯一开关。scripts/ 无豁免文件，故断言「每个 .js/.mjs/.cjs
// 都带 marker」，防止后续新增脚本漏写 marker 而静默脱离类型门禁。
test('scripts/ 下每个 .js/.mjs/.cjs 都带 // @ts-check（无豁免清单；漏写即静默脱检）', t => {
  const scriptsDir = path.join(ROOT, 'scripts');
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
        files.push(path.relative(scriptsDir, full));
      }
    }
  })(scriptsDir);
  // 下限断言防「枚举失效导致清单为空」的假绿（当前 5 个脚本，含 1 个 .cjs 与 1 个 .mjs）。
  t.true(files.length >= 5, 'scripts/ 应枚举到全部脚本，实际 ' + files.length);

  const unmarked = files.filter(rel => {
    // 允许 shebang 先行（#!/usr/bin/env node 在 marker 之前仍被 TS 识别），故先剥掉再匹配。
    const source = fs
      .readFileSync(path.join(scriptsDir, rel), 'utf8')
      .replace(/^#![^\n]*\n/, '');
    return !/^\s*\/\/\s*@ts-check/.test(source);
  });

  t.deepEqual(
    unmarked,
    [],
    '未标记 @ts-check 的 scripts 文件会脱离类型门禁：' + unmarked.join(', ')
  );
});
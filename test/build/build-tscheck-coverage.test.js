import test from 'ava';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 类型门禁的覆盖不变量（build/ 面 + scripts/ 面 + 批 B 根级配置面）。
// 门禁有两条腿，缺一即静默脱检：
//   1) marker：checkJs 继承 false，文件必须自带 // @ts-check 才会被 tsc 纳入检查——实测
//      同一份含类型错误的探针文件，带 marker 时报 TS2339（exit 1），去掉 marker 后
//      exit 0 静默跳过；
//   2) include：文件必须落在某个 tsconfig 的 program 内——主 tsconfig.json 以逐文件白名单
//      收口 commonjs 面，tsconfig.build.json 以 glob + 根级 rsbuild.config.mjs 收口 nodenext
//      面；带 marker 但不在 include 内同样静默脱检（实测：含错探针未 include 时 exit 0）。
// 本文件把 build/ 与 scripts/ 的「受检集合 = 全部脚本除豁免清单」以及批 B 的根级配置
// 白名单（7 条显式清单 + rsbuild.config.mjs 走 nodenext 面）逐条锁成「include ∧ marker」
// 断言，防止后续新增脚本/配置漏写 marker 或漏进 include 而静默脱检。
//
// 同源的 lint 面按同一思路锁死：eslint 9 平铺配置只给 files 命中的配置块挂规则，
// .mjs 不显式并入时规则数为 0（实测 --print-config），且 build/ 需显式列入 lint 脚本
// 才会被扫描——两处一并断言，防「文件被 lint 但无规则」的静默游离。
//
// 纪律：本文件只读 build/、scripts/、根级构建配置、test/client/visual/ 的受检文件、
// tsconfig.json、tsconfig.build.json、package.json 与 eslint.config.js，不修改任何源码
// （免检例外仅登记在 tsconfig.build.json 注释与 docs/BUGLOG/dev.md，此处只做断言）。

const ROOT = path.resolve(__dirname, '../..');
const BUILD_DIR = path.join(ROOT, 'build');
const BUILD_TSCONFIG = path.join(ROOT, 'tsconfig.build.json');
const MAIN_TSCONFIG = path.join(ROOT, 'tsconfig.json');

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

// 批 B 白名单：本批纳入类型门禁的根级构建配置与 antd5 视觉巡检工具链。
// 主 tsconfig.json（commonjs 面）逐文件收口的 7 条显式条目：
const ROOT_CONFIG_WHITELIST = [
  'babel.config.js',
  'eslint.config.js',
  '.prettierrc.js',
  'ava.config.cjs',
  'commitlint.config.cjs',
  'test/client/visual/prdRules.js',
  'test/client/visual/antd5Cascade.js'
];
// tsconfig.build.json（nodenext 面）显式收口的 1 条（rsbuild 配置为 ESM，见该配置注释）：
const NODENEXT_WHITELIST = ['rsbuild.config.mjs'];

// TS 的 // @ts-check 识别语义（本机 TS 7.0.2 探针实测）：
//   - 位置面逐条对齐：只认「首个非注释 token 之前」前导 trivia 中的 // 行注释（shebang
//     可先行）；块注释内的 marker 不认（`/* @ts-check */` 与 jsdoc 式多行块注释均不识别）；
//     代码（含 'use strict' 指令）之后再写 marker 一律不认——marker 会静默失效；
//   - 拼写面为 TS 的保守子集（宁窄不宽）：`//@ts-check`、`//   @ts-check  ` 认，
//     `// note: @ts-check`、`// @ts-check-extra` 不认；TS 另容忍 `///@ts-check` 前缀、
//     大小写变体、`// @ts-check:` 等拼写，本函数不认——方向安全：所有「本函数认」的
//     样本 TS 均认（实测 17/17），反向偏差只产生响亮误报，不存在把脱检文件判成
//     已标记的静默漏洞。
// 故本函数是唯一识别器，由下方「marker 识别语义自证」用正例/反例样本双向锁死。
function hasTsCheckMarker(source) {
  const text = source.replace(/^#![^\n]*\n/, '');
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    if (rest.startsWith('//')) {
      const eol = rest.indexOf('\n');
      const line = eol === -1 ? rest : rest.slice(0, eol);
      if (/^\/\/\s*@ts-check(\s|$)/.test(line)) return true;
      i += line.length;
      continue;
    }
    if (rest.startsWith('/*')) {
      // 块注释整体跳过：其内部即使含 @ts-check 也不被 TS 识别
      const end = rest.indexOf('*/');
      if (end === -1) break;
      i += end + 2;
      continue;
    }
    break; // 首个非注释 token：代码之后的 marker 不识别
  }
  return false;
}

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

// tsconfig.json / tsconfig.build.json 带 JSONC 注释（仓库内只用整行 // 与尾随逗号），
// 故先剥掉整行 // 注释、去掉尾随逗号再解析。
function readJsonc(file) {
  const stripped = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n')
    .replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(stripped);
}

test('build/ 下除豁免清单外的每个 .js/.mjs 都带 // @ts-check（漏写即静默脱检）', t => {
  const scripts = listBuildScripts();
  // 2026-10-04 删除零消费方死模块 clientBuildConfig.js 后，build/ 共 8 个脚本；
  // 下限断言用于防「枚举失效导致清单为空」的假绿。
  t.true(scripts.length >= 8, 'build/ 应枚举到全部脚本，实际 ' + scripts.length);

  const unmarked = scripts.filter(rel => {
    const source = fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8');
    return !hasTsCheckMarker(source);
  });

  t.deepEqual(
    unmarked.sort(),
    [...TSCCHECK_EXEMPT].sort(),
    '未标记 @ts-check 的文件集合必须恰好等于豁免清单；多出的文件会脱离类型门禁'
  );
});

test('tsconfig.build.json 的 include 覆盖 build/ 全部脚本与根级 rsbuild.config.mjs，且无 exclude 收窄', t => {
  const config = readJsonc(BUILD_TSCONFIG);
  t.is(config.extends, './tsconfig.json');
  t.deepEqual(config.include, [
    'build/**/*.js',
    'build/**/*.mjs',
    'scripts/**/*.mjs',
    'rsbuild.config.mjs'
  ]);
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
    // marker 识别统一走 hasTsCheckMarker（shebang 先行、前导注释块之后的 marker 均按
    // TS 语义识别；代码之后的 marker 判未标记）。
    const source = fs.readFileSync(path.join(scriptsDir, rel), 'utf8');
    return !hasTsCheckMarker(source);
  });

  t.deepEqual(
    unmarked,
    [],
    '未标记 @ts-check 的 scripts 文件会脱离类型门禁：' + unmarked.join(', ')
  );
});

// marker 识别语义自证（对齐 TS 7.0.2 探针实测）：正例/反例样本双向断言，
// 防「正则过宽 → 把脱检文件判成已标记」（静默漏洞）与「过窄 → 误报」两类失真。
test('@ts-check marker 识别与 TS 语义对齐（前导 trivia 内 // 注释；代码之后不识别）', t => {
  const marked = [
    '// @ts-check\nconst a = 1;\n',
    '#!/usr/bin/env node\n// @ts-check\nconst a = 1;\n',
    '// 文件头说明\n// @ts-check\nconst a = 1;\n',
    '/* 块注释头 */\n// @ts-check\nconst a = 1;\n',
    '/* 块注释头 */ // @ts-check\nconst a = 1;\n',
    '\n\n//@ts-check\nconst a = 1;\n',
    '//   @ts-check  \nconst a = 1;\n',
    '// @ts-check because reasons\nconst a = 1;\n'
  ];
  const unmarked = [
    'const a = 1;\n// @ts-check\n', // marker 在代码之后
    "'use strict';\n// @ts-check\nconst a = 1;\n", // 指令之后
    '/* @ts-check */\nconst a = 1;\n', // 块注释内的 marker
    '/**\n * @ts-check\n */\nconst a = 1;\n', // jsdoc 块注释内的 marker
    '/* 块\n// @ts-check\n*/\nconst a = 1;\n', // 块注释内的行注释形态
    '// note: @ts-check\nconst a = 1;\n', // marker 不在注释起始
    '// @ts-check-extra\nconst a = 1;\n', // 非 marker 词（TS 实测不识别）
    '// 只有普通注释\nconst a = 1;\n', // 无 marker（反恒真对照）
    ''
  ];
  for (const source of marked) {
    t.true(hasTsCheckMarker(source), '应识别为已标记：' + JSON.stringify(source.slice(0, 32)));
  }
  for (const source of unmarked) {
    t.false(hasTsCheckMarker(source), '应识别为未标记：' + JSON.stringify(source.slice(0, 32)));
  }
});

// 批 B 两条腿锁测：本批纳入门禁的根级配置白名单（7 条显式清单 + rsbuild 的 nodenext 面）
// 必须同时满足 include ∧ marker——只写 include 会因缺 marker 脱检，只写 marker 会因
// 不在 program 内脱检（后者见 test/build/scripts-tscheck-include-coverage.test.js 的同源实测）。
test('批 B 根级配置白名单逐条满足 include ∧ marker（rsbuild.config.mjs 走 nodenext 面）', t => {
  const mainInclude = readJsonc(MAIN_TSCONFIG).include;
  const buildInclude = readJsonc(BUILD_TSCONFIG).include;

  // 下限守卫：白名单本身不得为空（否则本断言退化为恒真）。
  t.true(ROOT_CONFIG_WHITELIST.length >= 7, '批 B 白名单不得为空');

  for (const rel of [...ROOT_CONFIG_WHITELIST, ...NODENEXT_WHITELIST]) {
    t.true(fs.existsSync(path.join(ROOT, rel)), rel + ' 不存在（幽灵白名单条目）');
  }
  for (const rel of ROOT_CONFIG_WHITELIST) {
    t.true(mainInclude.includes(rel), '主 tsconfig.json include 缺少 ' + rel);
    t.true(
      hasTsCheckMarker(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
      rel + ' 缺 // @ts-check（include 有而 marker 缺 → 静默脱检）'
    );
  }
  for (const rel of NODENEXT_WHITELIST) {
    t.true(buildInclude.includes(rel), 'tsconfig.build.json include 缺少 ' + rel);
    t.true(
      hasTsCheckMarker(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
      rel + ' 缺 // @ts-check（include 有而 marker 缺 → 静默脱检）'
    );
  }
});
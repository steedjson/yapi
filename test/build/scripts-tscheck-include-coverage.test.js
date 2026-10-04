import test from 'ava';
import fs from 'fs';
import path from 'path';

// scripts/ 纳入类型门禁有两条腿，缺一即静默脱检：
//   1) marker：文件自带 // @ts-check（受检的唯一开关，checkJs 继承 false）——
//      由 test/build/build-tscheck-coverage.test.js 锁死；
//   2) include：文件必须落在某个 tsconfig 的 program 内——主 tsconfig.json 以逐文件
//      白名单收口 scripts/ 的 .js/.cjs，tsconfig.build.json 以 scripts/**/*.mjs 覆盖 .mjs。
// 本文件锁第 2 条：新增一个「带 marker 但没进任何 include」的 scripts 脚本时，marker 断言
// 仍全绿，tsc 却根本不看它（实测：同一份含类型错误的探针，未 include 时 exit 0）。
// 只读 tsconfig.json / tsconfig.build.json / scripts/ 目录，不修改任何文件。

const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

// JSONC 容忍读取：剥 // 与 /* */ 注释（尊重字符串字面量）后去掉尾随逗号再解析。
function readJsonc(file) {
  const src = fs.readFileSync(file, 'utf8');
  let out = '';
  let quote = null;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n;
        i++;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[\]}])/g, '$1'));
}

// tsconfig include 的 glob → RegExp（只覆盖本仓库用到的形态：**、**/、*）。
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$+.()|{}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function listScriptFiles(dir = SCRIPTS_DIR, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listScriptFiles(full, acc);
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      acc.push(path.relative(SCRIPTS_DIR, full));
    }
  }
  return acc;
}

test('scripts/ 下的每个 .js/.mjs/.cjs 都落在某个 tsconfig 的 include 内（带 marker 但不在 program 内同样脱检）', t => {
  const files = listScriptFiles();
  t.true(files.length >= 5, 'scripts/ 应枚举到全部脚本，实际 ' + files.length);

  const mainConfig = readJsonc(path.join(ROOT, 'tsconfig.json'));
  const buildConfig = readJsonc(path.join(ROOT, 'tsconfig.build.json'));
  const patterns = [...mainConfig.include, ...(buildConfig.include || [])].map(globToRegExp);

  // 反恒真守卫：matcher 不得匹配任意路径（否则本断言会退化为恒过）。
  t.false(patterns.some(p => p.test('scripts/__qa-not-a-real-file__.js')), 'glob 匹配过宽');
  t.false(patterns.some(p => p.test('client/not-covered.js')), 'glob 匹配过宽（跨目录）');

  const uncovered = files.filter(rel => {
    const repoRel = 'scripts/' + rel.split(path.sep).join('/');
    return !patterns.some(p => p.test(repoRel));
  });

  t.deepEqual(
    uncovered,
    [],
    '以下 scripts 文件不在任何 tsconfig include 内，会被静默跳过（加 marker 也无效）：' +
      uncovered.join(', ')
  );
});
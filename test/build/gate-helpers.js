// 类型门禁锁测的共享辅助（test-only）：marker 识别、JSONC 读取、include glob 匹配与
// 代码文件枚举。本文件不是 *.test.js，不被 ava 收集为测试；只有纯函数与只读 fs 访问，
// 无副作用、无新增依赖。
// 抽出的动因：两条腿的锁测（build-tscheck-coverage 与 scripts-tscheck-include-coverage）
// 此前各自维护一份同名不同实现的 readJsonc / glob / 枚举逻辑，容易漂移成两套口径；
// 现 JSONC 读取、glob 匹配与 repo-relative 枚举统一到本文件，两处引用同一实现。
// （build/ 面枚举因路径基为 BUILD_DIR 相对、扩展名口径仅 js/mjs，刻意保留本地
//  listBuildScripts 未抽——改用本文件的 listCodeFiles 会改变既有断言的路径形态。）
// 注：本文件不在任何 tsconfig 的 include 内（辅助代码不属于受检源码，marker 加在这里
// tsc 也不会看），由仓库级 `eslint .` 覆盖其语法与正确性。
// 批 D 加固：readJsonc 重写为单遍状态机（字符串内不剥尾随逗号；未闭合块注释/字符串
// 响亮报错，不再静默截断），由 test/build/gate-helpers.test.js 直接单测锁死。

const fs = require('fs');
const path = require('path');

// 仓库根：本文件位于 test/build/ 下。
const ROOT = path.resolve(__dirname, '../..');

// TS 的 // @ts-check 识别语义（本机 TS 7.0.2 探针实测）：
//   - 位置面逐条对齐：只认「首个非注释 token 之前」前导 trivia 中的 // 行注释（shebang
//     可先行）；块注释内的 marker 不认（`/* @ts-check */` 与 jsdoc 式多行块注释均不识别）；
//     代码（含 'use strict' 指令）之后再写 marker 一律不认——marker 会静默失效；
//   - 拼写面为 TS 的保守子集（宁窄不宽）：`//@ts-check`、`//   @ts-check  ` 认，
//     `// note: @ts-check`、`// @ts-check-extra` 不认；TS 另容忍 `///@ts-check` 前缀、
//     大小写变体、`// @ts-check:` 等拼写，本函数不认——方向安全：所有「本函数认」的
//     样本 TS 均认（实测 17/17），反向偏差只产生响亮误报，不存在把脱检文件判成
//     已标记的静默漏洞。
// 故本函数是唯一识别器，由 test/build/build-tscheck-coverage.test.js 的「marker 识别语义
// 自证」用正例/反例样本双向锁死。
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

// JSONC 容忍读取：单遍状态机，注释剥离与尾随逗号剥除在同一遍内完成。
//   - 注释尊重字符串字面量：`"build/**/*.js"` 里的 `/*` 序列不会被误判为块注释开始；
//   - 尾随逗号只在「字符串外」删除，且要求其后（跳过空白与注释——注释折算为空白后与
//     纯空白等价）紧邻 `]`/`}`，字符串字面量内一切字符原样保留。旧实现分两步（先整段
//     剥注释，再用全局正则 /,(\s*[\]}])/ 去尾随逗号），正则会命中字符串字面量：实测
//     `{"glob": "a,}b"}` 被静默改写为 `{"glob":"a}b"}`（批 C 评审⑦登记的继承性弱点，
//     本批加固并由 test/build/gate-helpers.test.js 回归钉死）；
//   - 块注释未闭合、字符串未闭合一律 throw（消息含文件路径），不得静默截断：旧实现在
//     未闭合块注释后若再无有效文本会丢弃 `/*` 到 EOF，前缀恰可解析时即静默返回残缺
//     配置（实测 `{"include":["x"]}\n/* unclosed` → `{"include":["x"]}`，门禁读 tsconfig
//     时存在假绿风险）；
//   - 只做 JSONC 容错（注释 + 尾随逗号），不做语法扩展：单引号字符串仍由 JSON.parse 拒绝。
function readJsonc(file) {
  const src = fs.readFileSync(file, 'utf8');
  const at = '（文件：' + file + '）';
  let out = '';
  let quote = null;
  // 待定尾随逗号在 out 中的下标（-1 为无）：逗号写出后只再写入空白（注释已折算为空白）
  // 候选才保持；写入任何非空白字符即作废；遇到 ]/} 时若候选仍在，删掉该逗号。
  let trailingComma = -1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      if (c === '\\') {
        if (i + 1 >= src.length) {
          throw new Error('readJsonc: 字符串未闭合' + at);
        }
        out += c + n;
        i += 2;
        continue;
      }
      out += c;
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      trailingComma = -1;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      const eol = src.indexOf('\n', i + 2);
      if (eol === -1) break; // 行注释直到 EOF：其后已无内容可保留
      i = eol; // 丢弃注释文本，仅保留换行（等价空白）
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error('readJsonc: 块注释未闭合' + at);
      }
      out += ' '; // 折算为一个空格：分隔相邻 token，且不打断尾随逗号候选
      i = end + 2;
      continue;
    }
    if (c === ',') {
      out += c;
      trailingComma = out.length - 1;
      i++;
      continue;
    }
    if (c === ']' || c === '}') {
      if (trailingComma !== -1) {
        out = out.slice(0, trailingComma) + out.slice(trailingComma + 1);
        trailingComma = -1;
      }
      out += c;
      i++;
      continue;
    }
    out += c;
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') trailingComma = -1;
    i++;
  }
  if (quote) {
    throw new Error('readJsonc: 字符串未闭合' + at);
  }
  return JSON.parse(out);
}

// tsconfig include 的 glob → RegExp（只覆盖本仓库用到的形态：**、**/、*；不支持 `?`、
// brace 展开与 `!` 否定——未来 include 引入这些语法须先扩写本函数，否则匹配会失真）。
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

// 枚举 dir 下扩展名为 .js/.jsx/.mjs/.cjs 的代码文件，返回相对仓库根的正斜杠路径。
// 隐藏文件必须能枚举到（readdirSync 原生返回 dotfile，如根级 .prettierrc.js）。
// recursive 默认 false（只枚举 dir 一层），true 时递归子目录。
function listCodeFiles(dir, { recursive = false } = {}) {
  const files = [];
  const walk = current => {
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return files;
}

module.exports = { hasTsCheckMarker, readJsonc, globToRegExp, listCodeFiles };
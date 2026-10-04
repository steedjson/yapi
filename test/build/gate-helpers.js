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

// JSONC 容忍读取：剥 // 与 /* */ 注释（尊重字符串字面量，如 "build/**/*.js" 里的 `/*`
// 序列不会被误判为块注释开始）后去掉尾随逗号再解析。
// 尾随逗号处理是 JSONC 容错（评审 M-3）：当前两份 tsconfig 均无尾随逗号，保留该步骤是
// 为了将来手写配置出现尾随逗号时不至于解析失败。
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
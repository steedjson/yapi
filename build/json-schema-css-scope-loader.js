'use strict';

// json-schema-editor-visual(接口编辑的 JSON Schema 编辑器)内嵌 antd3,
// 其全量 antd.css 若全局加载,antd3 的 body 基础样式与全局 .ant-* 规则
// 会污染 antd5 应用(cssinjs 需要 StyleProvider hashPriority=high 才能压制)。
// 本 loader 为每条非全局规则生成两个作用域副本:
// 1) `.json-schema-editor-scope <sel>`:编辑器容器内的常规组件;
// 2) `.ant-modal-root:not([class*="css-"]) <sel>`:antd3 Modal 经 Portal 渲染到
//    body 下 .ant-modal-root,弹窗内的 Tabs/Button 等组件不在编辑器容器内,
//    必须靠第二副本才能命中。antd5 组件根节点恒带 css-* hash 类(dev 为
//    css-dev-only-do-not-override-*,prod 为 css-*),antd3 root 无任何 css- 类,
//    :not([class*="css-"]) 在 dev/prod 均可精准排除 antd5 弹窗、避免双份样式污染。
// html/body/* /:root 等全局基础规则限定作用域后无意义,对应整条规则(含
// 两个作用域副本)直接丢弃。@keyframes/@font-face/@import 等非选择器规则
// 原样保留;@media/@supports 保留条件并递归生成两个作用域副本。

const SCOPE = '.json-schema-editor-scope ';

const MODAL_SCOPE = '.ant-modal-root:not([class*="css-"]) ';

// 选择器以 html/body/* /:root 开头即视为全局规则(如 `html`、`body`、`*::before`)
const GLOBAL_SELECTOR_RE = /^(html|body|\*|:root)(?:$|[\s.,[:#>~+*])/i;

// 需要原样保留的块级 at-rule(keyframes 的百分比选择器不能加前缀;
// viewport/font-face/page 无选择器概念)
const VERBATIM_AT_RULE_RE = /^@(?:-[a-z]+-)?(?:keyframes|font-face|viewport|page)\b/i;

// @media/@supports 保留条件,递归处理其内部规则
const NESTED_AT_RULE_RE = /^@(?:media|supports|document)\b/i;

function skipComment(css, start) {
  const end = css.indexOf('*/', start + 2);
  return end === -1 ? css.length : end + 2;
}

function skipString(css, start) {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i++;
  }
  return i;
}

// pos 指向 '{',返回匹配 '}' 之后的位置(跳过字符串与注释)
function skipBlock(css, pos) {
  let depth = 0;
  while (pos < css.length) {
    const ch = css[pos];
    if (ch === '"' || ch === "'") {
      pos = skipString(css, pos);
      continue;
    }
    if (ch === '/' && css[pos + 1] === '*') {
      pos = skipComment(css, pos);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return pos + 1;
    }
    pos++;
  }
  return pos;
}

// 按顶层逗号拆分选择器列表(跳过括号/中括号/字符串内的逗号)
function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '"' || ch === "'") {
      i = skipString(selector, i) - 1;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

function isGlobalRule(selectors) {
  const list = splitSelectors(selectors)
    .map(s => s.trim())
    .filter(Boolean);
  return list.length > 0 && list.every(s => GLOBAL_SELECTOR_RE.test(s));
}

// prelude 中的注释单独抽出(注释内容可能含逗号,不能参与选择器拆分;
// 文件头部的 antd license 注释必须保留,不能随被丢弃的全局规则一起丢失)
function extractComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop) + '\n';
      i = stop;
    } else {
      i++;
    }
  }
  return out.trim();
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function scopeCss(css) {
  let out = '';
  let pos = 0;
  // prelude = 到顶层 '{' 或 ';' 为止的片段(规则选择器或 at-rule 条件)
  while (pos < css.length) {
    const start = pos;
    let ch;
    while (pos < css.length && (ch = css[pos]) !== '{' && ch !== ';') {
      if (ch === '/' && css[pos + 1] === '*') {
        pos = skipComment(css, pos);
      } else if (ch === '"' || ch === "'") {
        pos = skipString(css, pos);
      } else {
        pos++;
      }
    }
    const prelude = css.slice(start, pos);
    if (pos >= css.length) {
      out += prelude;
      break;
    }
    if (css[pos] === ';') {
      // @import/@charset 等语句原样保留
      out += prelude + ';';
      pos++;
      continue;
    }
    const blockStart = pos;
    pos = skipBlock(css, pos);
    const block = css.slice(blockStart, pos);
    const comments = extractComments(prelude);
    const trimmed = stripComments(prelude).trim();

    if (VERBATIM_AT_RULE_RE.test(trimmed)) {
      out += prelude + block;
    } else if (NESTED_AT_RULE_RE.test(trimmed)) {
      // @media/@supports:保留条件,递归前缀化内部规则
      out += prelude + '{' + scopeCss(block.slice(1, -1)) + '}';
    } else if (trimmed.startsWith('@')) {
      // 其余未知 at-rule 一律原样保留
      out += prelude + block;
    } else if (isGlobalRule(trimmed)) {
      // html/body/* /:root 全局规则整条丢弃,仅保留前置注释
      out += comments ? '\n' + comments : '';
    } else {
      // 每条选择器生成编辑器容器与 antd3 Modal(Portal)两个作用域副本
      const scoped = splitSelectors(trimmed)
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(s => [SCOPE + s, MODAL_SCOPE + s])
        .join(',\n');
      out += (comments ? '\n' + comments + '\n' : '\n') + scoped + ' ' + block;
    }
  }
  return out;
}

module.exports = function jsonSchemaCssScopeLoader(content) {
  return scopeCss(content);
};

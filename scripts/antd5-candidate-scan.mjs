#!/usr/bin/env node
/**
 * antd5 覆盖面视觉巡检 · 层 A：静态冲突候选扫描（CLI）
 * ============================================================
 * 输入：static/prd/*.css（prod 构建产物，只读，当前提交态）
 * 规则：提取「非 .ant-* 前缀」的自定义选择器规则，且声明含盒模型/排版属性
 *       （margin/padding/width/height/position/top/left/right/bottom/background/
 *        border/color/font-size/line-height/display/overflow 及其派生属性）。
 * 候选判定（共现）：选择器中的自定义类与页面元素上的 antd 类是否共现由层 B
 *       运行时实测（非文本猜测）；本脚本仅登记文本层面的强信号
 *       hasAntdRef（选择器自身引用了 .ant-* 类，如 `.m-panel .ant-table td`）。
 * 输出：候选清单 JSON（选择器、属性集、所在 chunk）+ 人类可读报告。
 *
 * 解析/扫描口径统一在 scripts/antd5-css-lib.cjs（层 B 测试进程同源复用，
 * 详见该文件头注释——.mjs 会被 @babel/register 钩住，故实现放 .cjs）。
 *
 * 用法：
 *   node scripts/antd5-candidate-scan.mjs [--out <dir>] [--prd <dir>]
 *     --out   输出目录（默认 /tmp/yapi-antd5-scan，避免污染仓库工作区）
 *     --prd   产物目录（默认 <repo>/static/prd）
 *
 * 产物：
 *   <out>/candidates.json   全量候选（层 B 的直接输入）
 *   <out>/report.md         人类可读报告（按 chunk 分组统计 + 明细表）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CHUNK_PAGES, scanCandidates } = require('./antd5-css-lib.cjs');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------- 人类可读报告 ----------------

/**
 * @param {any[]} candidates
 * @param {any} stats
 */
function renderReport(candidates, stats) {
  const lines = [];
  lines.push('# antd5 覆盖面视觉巡检 · 层 A 静态候选扫描报告');
  lines.push('');
  lines.push('> 生成：`node scripts/antd5-candidate-scan.mjs`（只读 static/prd 提交态产物）');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push('| CSS chunk 数 | ' + stats.files.length + ' |');
  lines.push('| 规则总数 | ' + stats.totalRules + ' |');
  lines.push('| 纯 antd 类规则（排除） | ' + stats.antdOnlyRules + ' |');
  lines.push('| 无类选择器规则（排除） | ' + stats.noClassRules + ' |');
  lines.push('| 无观察属性规则（排除） | ' + stats.noWatchedPropRules + ' |');
  lines.push('| json-schema-editor 作用域规则（计划排除） | ' + stats.outOfScopeRules + ' |');
  lines.push('| **自定义候选规则** | **' + stats.candidates + '** |');
  lines.push('');
  lines.push('## 分 chunk 统计');
  lines.push('');
  lines.push('| chunk | 规则数 | 候选数 | 页面域 |');
  lines.push('| --- | --- | --- | --- |');
  for (const f of stats.files) {
    lines.push(
      '| `' + f.file + '` | ' + f.rules + ' | ' + f.candidates + ' | ' + (CHUNK_PAGES[f.chunk] || '-') + ' |'
    );
  }
  lines.push('');
  lines.push('## 候选明细');
  lines.push('');
  lines.push('> `antd-ref` = 选择器自身引用 .ant-* 类（对 antd 元素设样的强信号）。');
  lines.push('');
  let currentFile = '';
  for (const c of candidates) {
    if (c.file !== currentFile) {
      currentFile = c.file;
      lines.push('');
      lines.push('### ' + currentFile + '');
      lines.push('');
      lines.push('| 选择器 | 观察属性 | antd-ref | media |');
      lines.push('| --- | --- | --- | --- |');
    }
    const props = c.props
      .map(p => p.prop + (p.important ? ':!' : '') + '=' + String(p.value).slice(0, 24))
      .join('; ');
    lines.push(
      '| `' +
        c.selector.slice(0, 110) +
        '` | ' +
        props.slice(0, 200) +
        ' | ' +
        (c.hasAntdRef ? 'Y' : '') +
        ' | ' +
        (c.media ? c.media.slice(0, 40) : '') +
        ' |'
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------- CLI ----------------

function main() {
  const argv = process.argv.slice(2);
  let outDir = path.join('/tmp', 'yapi-antd5-scan');
  let prdDir = path.join(REPO_ROOT, 'static', 'prd');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outDir = path.resolve(argv[++i]);
    else if (argv[i] === '--prd') prdDir = path.resolve(argv[++i]);
  }
  const { candidates, stats } = scanCandidates(prdDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'candidates.json');
  const reportPath = path.join(outDir, 'report.md');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), prdDir, stats, candidates }, null, 2)
  );
  fs.writeFileSync(reportPath, renderReport(candidates, stats));
  console.log('层 A 扫描完成');
  console.log('  产物目录   : ' + outDir);
  console.log('  规则总数   : ' + stats.totalRules);
  console.log('  自定义候选 : ' + stats.candidates);
  for (const f of stats.files) {
    console.log(
      '    ' + f.file.padEnd(40) + ' rules=' + String(f.rules).padEnd(6) + ' candidates=' + f.candidates
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

// @ts-check
/**
 * antd5 巡检：static/prd 静态规则装载（层 B/批次 3 共用，避免两处口径漂移）。
 *
 * 注入序模型（层 C 实测修正，2026-09）：
 *   cssinjs 运行时 <style>（`hashPriority="high"` 下以 data-rc-order="prepend"
 *   前置到 head 顶部，先于全部 <link>）
 *   → initial chunk CSS（index.html 经 assets.js 的 WEBPACK_INITIAL_CHUNKS 同步
 *   document.write <link>）
 *   → 异步路由 chunk CSS（assets.js 在 chunk 加载时动态插入 <link>）。
 * 即：全部自定义静态规则源序晚于 antd 运行时规则，同特异性平局由自定义获胜
 * （层 C 实测：首页 guest 全部平局项、N-3/N-4/F-2 均自定义获胜）；
 * 早期模型把静态规则排在运行时之前且按「:where() 计零」估算 antd 特异性，
 * 两者均已按生产（StyleProvider hashPriority="high"）修正。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const scanLib = require('../../../scripts/antd5-css-lib.cjs');
const cascade = require('./antd5Cascade.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PRD_DIR = path.join(REPO_ROOT, 'static', 'prd');

/**
 * 解析 assets.js，取 initial chunk 对应的 CSS 文件名集合。
 * @returns {Set<string>}
 */
function loadInitialCss() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PRD_DIR, 'assets.js'), 'utf8'), sandbox, {
    timeout: 5000
  });
  const w = /** @type {any} */ (sandbox.window);
  const assets = w.WEBPACK_ASSETS || {};
  const initial = w.WEBPACK_INITIAL_CHUNKS || [];
  const out = new Set();
  for (const key of initial) {
    const asset = assets[key];
    if (asset && asset.css) out.add(asset.css);
  }
  return out;
}

const INITIAL_CSS = loadInitialCss();

/** @param {any[]} rawRules @param {number} orderBase @returns {any[]} */
function toRules(rawRules, sourceKind, sourceName, rank, orderBase) {
  return cascade.buildCascadeRules(rawRules, { sourceKind, sourceName, rank, orderBase });
}

/**
 * 装载全部 static/prd CSS 规则。
 * 秩空间：runtime 1e8 段 < initial 2e8 段 < 异步 chunk 3e8 段。
 */
function loadPrdRules() {
  const files = fs
    .readdirSync(PRD_DIR)
    .filter(f => f.endsWith('.css'))
    .sort();
  const rules = [];
  let initialIdx = 0;
  files.forEach((file, fileIdx) => {
    const isInitial = INITIAL_CSS.has(file);
    const rank = isInitial ? initialIdx++ : 10 + fileIdx;
    const orderBase = isInitial ? 200000000 + initialIdx * 100000 : 300000000 + fileIdx * 100000;
    const raw = scanLib.parseCssRules(fs.readFileSync(path.join(PRD_DIR, file), 'utf8'), file);
    rules.push(...toRules(raw, 'prd', file, rank, orderBase));
  });
  return rules;
}

/**
 * 把运行时 <style> 文本转成级联规则（orderBase 先于全部 prd 静态规则）。
 * @param {string[]} runtimeStyleTexts
 */
function buildRuntimeRules(runtimeStyleTexts) {
  const rules = [];
  runtimeStyleTexts.forEach((text, idx) => {
    const raw = scanLib.parseCssRules(text, 'runtime:' + idx);
    rules.push(...toRules(raw, 'runtime', 'runtime:' + idx, 9, 100000000 + idx * 100000));
  });
  return rules;
}

module.exports = {
  REPO_ROOT,
  PRD_DIR,
  INITIAL_CSS,
  scanLib,
  loadPrdRules,
  buildRuntimeRules
};

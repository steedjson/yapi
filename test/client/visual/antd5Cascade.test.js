/**
 * antd5 覆盖面视觉巡检 · 级联仿真库单元测试（纯函数，无需 jsdom——
 * 元素用携带 classList/matches 的桩对象即可，见 antd5Cascade.js 文件头约束）。
 *
 * 重点回归：elementRulesCache 硬化（批次 2）——元素 → 候选规则的记忆化缓存
 * 必须随 computeIndex 的索引一同更换；同一元素跨两个索引求值不得复用旧索引
 * 的规则集（历史上缓存挂在模块级 WeakMap 上，重扫后同元素会拿到陈旧规则）。
 */
import test from 'ava';
const cascade = require('./antd5Cascade.js');
const scanLib = require('../../../scripts/antd5-css-lib.cjs');

/**
 * 构建桩元素：级联仿真只依赖 classList 与 matches
 * @param {string[]} classes
 */
function stubElement(classes) {
  return { classList: classes, matches: () => true };
}

/**
 * 解析一段 CSS 并构建为级联规则
 * @param {string} css
 * @param {'prd'|'runtime'} sourceKind
 * @param {number} orderBase
 */
function rules(css, sourceKind, orderBase) {
  return cascade.buildCascadeRules(scanLib.parseCssRules(css, 'unit'), {
    sourceKind,
    sourceName: 'unit:' + orderBase,
    rank: sourceKind === 'prd' ? 0 : 9,
    orderBase
  });
}

const CANDIDATE = { id: 'unit#1#.foo', selector: '.foo' };
const WATCHED = { prop: 'color', value: '#111111', important: false };

test('级联仿真：prd 规则获胜 → not-overridden；antd 运行时规则以更高特异性获胜 → confirmed-override', t => {
  const prd = rules('.foo { color: #111111; }', 'prd', 1000);
  const runtime = rules(':where(.css-h).ant-card .foo { color: #333333; }', 'runtime', 10000000);
  const el = stubElement(['foo']);

  const verdictPrd = cascade.evaluate(CANDIDATE, el, WATCHED, cascade.computeIndex(prd), 'dev');
  t.is(verdictPrd.status, 'not-overridden');
  t.is(verdictPrd.reason, 'custom-wins');

  const verdictRuntime = cascade.evaluate(
    CANDIDATE,
    el,
    WATCHED,
    cascade.computeIndex(prd.concat(runtime)),
    'dev'
  );
  t.is(verdictRuntime.status, 'confirmed-override');
  t.is(verdictRuntime.winnerValue, 'color: #333333');
});

test('回归（批次 2）：同一元素跨索引求值不得复用旧索引的缓存规则集', t => {
  const prd = rules('.foo { color: #111111; }', 'prd', 1000);
  const runtime = rules(':where(.css-h).ant-card .foo { color: #333333; }', 'runtime', 10000000);
  const el = stubElement(['foo']);

  const indexA = cascade.computeIndex(prd);
  const verdictA = cascade.evaluate(CANDIDATE, el, WATCHED, indexA, 'dev');
  t.is(verdictA.status, 'not-overridden', '索引 A（仅 prd 规则）下自定义规则获胜');

  // 同一元素在新增了运行时规则的索引 B 下求值：若缓存仍挂在模块级（旧实现），
  // rulesForElement 会命中旧缓存、跳过新规则，错报 not-overridden
  const indexB = cascade.computeIndex(prd.concat(runtime));
  const verdictB = cascade.evaluate(CANDIDATE, el, WATCHED, indexB, 'dev');
  t.is(verdictB.status, 'confirmed-override', '索引 B（新增运行时规则）下应实测到 antd 获胜');

  // 反向：回到索引 A，缓存仍应各自独立、判定不互相污染
  const verdictA2 = cascade.evaluate(CANDIDATE, el, WATCHED, indexA, 'dev');
  t.is(verdictA2.status, 'not-overridden', '索引 A 的判定不因索引 B 的求值被污染');
});

test('回归（批次 2）：computeIndex 每次返回独立缓存对象', t => {
  const prd = rules('.foo { color: #111111; }', 'prd', 1000);
  const indexA = cascade.computeIndex(prd);
  const indexB = cascade.computeIndex(prd);
  t.truthy(indexA.cache, 'computeIndex 应返回随索引同生的缓存');
  t.not(indexA.cache, indexB.cache, '两个索引不得共享同一缓存对象');
});

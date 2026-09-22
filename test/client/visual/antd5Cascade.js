/**
 * antd5 覆盖面视觉巡检 · 层 B 级联仿真库（纯函数，无 DOM/IO 依赖）。
 *
 * 背景：jsdom 的 getComputedStyle 不做样式表层叠（不级联 <style>/<link> 声明），
 * 无法直接比较「规则声明值 vs 计算值」。本库以确定性级联仿真替代：
 *   1. 解析静态产物 CSS（层 A 的 parseCssRules）与 antd5 运行时注入的 <style>；
 *   2. 对每个候选元素 × 观察属性，收集所有匹配规则（element.matches 实测）；
 *   3. 按 CSS 级联次序（!important > specificity > 来源顺序）求胜出规则；
 *   4. 与候选自定义规则声明比对：
 *        - 胜出者为该自定义规则            → not-overridden
 *        - 胜出者为其他「自定义」规则       → not-overridden（最终样式仍出自自定义 CSS，
 *                                             记录 winner 供人工复核）
 *        - 胜出者为 antd 运行时规则且值相同 → ambiguous（无视觉差异，或本就继承同值）
 *        - 胜出者为 antd 运行时规则且值不同 → confirmed-override（记录 specificity 对比）
 *
 * ⚠️ 已知局限（N-5 实证，详见 docs/antd5-visual-audit-findings.md §4）：引擎将全部
 * chunk 规则并入同一索引，不建模「chunk CSS 是否在该页面域实际加载」——对跨 chunk
 * 候选，self-wins 判定可能是空真（规则从未在该页生效）。此类候选须经层 C 或加载
 * 关系核对后方可采信；同 chunk 候选的判定不受此限。
 *
 * dev/prod 双口径：本应用在 client/index.js 用 `StyleProvider hashPriority="high"`，
 * antd 5.29.3 / @ant-design/cssinjs 注入的选择器为 `.css-<hash>.ant-xxx`（hash 类
 * **计 1 类特异性**，非 `:where()` 计零）；dev（css-dev-only-do-not-override-*）与
 * prod（css-<hash>）形态一致，两口径特异性相同。层 C 实测（2026-09）发现早期
 * 「:where() 计零」假设导致自保判定失真，现 specProd 与 specDev 均按原样计数，
 * 保留双口径机制以便版本升级导致两口径重新分化时无需改引擎。
 */

// ---------------- specificity ----------------

/**
 * 计算单个选择器（无逗号）的 specificity [a, b, c]。
 * 支持 :is()/:not() 取参数最大值、:where() 计零的 CSS Selectors 4 语义（近似覆盖
 * 产物与 cssinjs 的选择器形态）。
 * @param {string} selector
 * @returns {number[]}
 */
function computeSpecificity(selector) {
  const spec = [0, 0, 0];
  const text = String(selector);

  /**
   * 扫描一个复合选择器（不含顶层 combinator 空白/>/+/~ 的连续片段）
   * @param {string} compound
   */
  function scanCompound(compound) {
    let i = 0;
    while (i < compound.length) {
      const ch = compound[i];
      if (ch === '#') {
        spec[0]++;
        i++;
        while (i < compound.length && /[-\w]/.test(compound[i])) i++;
      } else if (ch === '.') {
        spec[1]++;
        i++;
        while (i < compound.length && /[-\w]/.test(compound[i])) i++;
      } else if (ch === '[') {
        spec[1]++;
        i++;
        let depth = 1;
        while (i < compound.length && depth > 0) {
          if (compound[i] === '[') depth++;
          if (compound[i] === ']') depth--;
          i++;
        }
      } else if (ch === ':') {
        if (compound[i + 1] === ':') {
          // 伪元素
          spec[2]++;
          i += 2;
          while (i < compound.length && /[-\w]/.test(compound[i])) i++;
          continue;
        }
        i++;
        let name = '';
        while (i < compound.length && /[-\w]/.test(compound[i])) {
          name += compound[i];
          i++;
        }
        const lower = name.toLowerCase();
        if (i < compound.length && compound[i] === '(') {
          // 函数式伪类：找配对右括号
          let depth = 1;
          const argStart = ++i;
          while (i < compound.length && depth > 0) {
            if (compound[i] === '(') depth++;
            if (compound[i] === ')') depth--;
            i++;
          }
          const arg = compound.slice(argStart, i - 1);
          if (lower === 'where') {
            // 计零
          } else if (lower === 'is' || lower === 'not' || lower === 'matches') {
            const argSpecs = arg
              .split(',')
              .map(part => computeSpecificity(part.trim()));
            const max = argSpecs.reduce(
              (acc, s) => (cmpSpec(s, acc) > 0 ? s : acc),
              [0, 0, 0]
            );
            spec[0] += max[0];
            spec[1] += max[1];
            spec[2] += max[2];
          } else if (lower === 'nth-child' || lower === 'nth-last-child' || lower === 'nth-of-type') {
            spec[1]++;
            // an+b of S 形式的 of 选择器（近似：若有 of 子句则累加其 specificity）
            const ofIdx = arg.toLowerCase().indexOf(' of ');
            if (ofIdx !== -1) {
              const ofSpec = computeSpecificity(arg.slice(ofIdx + 4).trim());
              spec[0] += ofSpec[0];
              spec[1] += ofSpec[1];
              spec[2] += ofSpec[2];
            }
          } else {
            spec[1]++;
          }
        } else {
          spec[1]++;
        }
      } else if (/[-\w]/.test(ch)) {
        // 元素类型或 universal
        if (ch === '*') {
          i++;
        } else {
          spec[2]++;
          while (i < compound.length && /[-\w]/.test(compound[i])) i++;
        }
      } else {
        i++;
      }
    }
  }

  // 按顶层 combinator 切分复合选择器（括号深度感知）
  let depth = 0;
  let compoundStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (i === text.length || /[\s>+~]/.test(ch))) {
      const compound = text.slice(compoundStart, i).trim();
      if (compound) scanCompound(compound);
      compoundStart = i + 1;
    }
  }
  return spec;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cmpSpec(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ---------------- 属性家族（shorthand ↔ longhand 竞争关系） ----------------

const SHORTHAND_LONGHANDS = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  overflow: ['overflow-x', 'overflow-y'],
  background: [
    'background-color',
    'background-image',
    'background-repeat',
    'background-position',
    'background-size',
    'background-attachment',
    'background-clip',
    'background-origin'
  ],
  // 注意：border 简写按 CSS 规范重置 width/style/color/border-image，
  // 不重置 border-radius（radius 属独立属性，不参与 border 简写级联竞争）
  border: [
    'border-width',
    'border-style',
    'border-color',
    'border-image',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color'
  ],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  font: ['font-size', 'font-family', 'font-weight', 'font-style', 'line-height']
};

const competeCache = new Map();

// 不与任何简写竞争的独立属性：border 简写按规范不重置 border-radius
const STANDALONE_PROPS = new Set(['border-radius']);

/**
 * 返回与 prop 存在级联竞争（同 longhand）的属性名集合（含自身）。
 * 规则（CSS 级联按 longhand 逐项竞争）：
 *   - 简写与其展开的 longhand 相互竞争；
 *   - 兄弟 longhand（margin-top 与 margin-bottom）不竞争；
 * @param {string} prop
 * @returns {Set<string>}
 */
function competesWith(prop) {
  const key = String(prop).toLowerCase();
  const cached = competeCache.get(key);
  if (cached) return cached;
  const set = new Set([key]);
  if (!STANDALONE_PROPS.has(key)) {
    if (SHORTHAND_LONGHANDS[key]) {
      // prop 自身是简写：与其全部 longhand 竞争
      SHORTHAND_LONGHANDS[key].forEach(p => set.add(p));
    }
    for (const shorthand of Object.keys(SHORTHAND_LONGHANDS)) {
      const longhands = SHORTHAND_LONGHANDS[shorthand];
      if (longhands.indexOf(key) !== -1 || key.indexOf(shorthand + '-') === 0) {
        // prop 是该简写的 longhand（或下级简写）：仅与该简写竞争，不引入兄弟 longhand
        set.add(shorthand);
      }
    }
  }
  competeCache.set(key, set);
  return set;
}

// ---------------- 规则构建 ----------------

/**
 * @param {string} selector
 */
function stripDevHash(selector) {
  return String(selector);
}

/** print-only 的 media 不适用（jsdom 按 screen 求值），其余一律视为适用并标注 media-dependent */
function mediaApplies(media) {
  if (!media) return true;
  const m = media.toLowerCase();
  if (m.indexOf('print') !== -1 && m.indexOf('screen') === -1) return false;
  return true;
}

/**
 * 把 parseCssRules 的产出转为带 specificity / 全局顺序的级联规则。
 * 多选择器规则在此拆分为逐条（与层 A scanCandidates 的拆分口径一致）。
 *
 * @param {any[]} rawRules parseCssRules 输出
 * @param {{sourceKind: 'prd'|'runtime', sourceName: string, rank: number, orderBase: number}} meta
 * @returns {any[]}
 */
function buildCascadeRules(rawRules, meta) {
  const out = [];
  for (const rule of rawRules) {
    if (!mediaApplies(rule.media)) continue;
    const parts = splitTopLevel(rule.selector, ',');
    for (const selector of parts) {
      const normalized = selector.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const spec = computeSpecificity(normalized);
      out.push({
        id: meta.sourceName + '#' + rule.order + '#' + normalized,
        selector: normalized,
        declarations: rule.declarations,
        media: rule.media,
        sourceKind: meta.sourceKind,
        sourceName: meta.sourceName,
        sourceOrder: meta.orderBase + rule.order,
        specDev: spec,
        // hashPriority="high" 下 dev/prod 哈希类均计 1 类，两口径特异性一致
        specProd: spec
      });
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} sep
 */
function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

// ---------------- 匹配索引与胜者求解 ----------------

/**
 * 取选择器最右侧的复合子（括号深度感知按顶层 combinator 切分）。
 * 类名预索引只看最右复合子：后代选择器（`.a .b`）的被匹配元素自身只携带
 * 最右复合子的类，携带 `.a` 的祖先不影响其应命中的规则集合。
 * @param {string} selector
 */
function rightmostCompound(selector) {
  const text = String(selector);
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (i === text.length || /[\s>+~]/.test(ch))) {
      const compound = text.slice(start, i).trim();
      if (compound) parts.push(compound);
      start = i + 1;
    }
  }
  return parts[parts.length - 1] || text;
}

/**
 * 构建匹配索引：最右复合子类名 → 规则、无类最右复合子规则列表。
 * cache 为本索引私有的元素记忆化（WeakMap），随索引一同更换——同一元素跨
 * 两个索引（如重扫后规则集变化）不会复用旧索引的候选规则（跨 index 陈旧规则）。
 * @param {any[]} rules
 */
function computeIndex(rules) {
  const byClass = new Map();
  const classless = [];
  for (const rule of rules) {
    const classMatches = rightmostCompound(rule.selector).match(/\.([a-zA-Z0-9_-]+)/g);
    if (classMatches && classMatches.length) {
      classMatches.forEach(token => {
        const cls = token.slice(1);
        if (!byClass.has(cls)) byClass.set(cls, []);
        byClass.get(cls).push(rule);
      });
    } else {
      classless.push(rule);
    }
  }
  return { byClass, classless, cache: new WeakMap() };
}

/**
 * 元素 → 候选规则数组（类名并集 + 无类规则），按 index 私有 WeakMap 记忆化
 * （缓存生命周期与所属索引绑定，见 computeIndex）
 * @param {any} el
 * @param {any} index
 */
function rulesForElement(el, index) {
  if (!index.cache) index.cache = new WeakMap();
  const cached = index.cache.get(el);
  if (cached) return cached;
  const seen = new Set();
  const out = [];
  const push = rule => {
    if (!seen.has(rule.id)) {
      seen.add(rule.id);
      out.push(rule);
    }
  };
  el.classList.forEach(cls => {
    const list = index.byClass.get(cls);
    if (list) list.forEach(push);
  });
  // 无类规则（元素/属性选择器）统一纳入，matches 过滤
  index.classless.forEach(push);
  index.cache.set(el, out);
  return out;
}

/**
 * 求元素在某属性上的级联胜出声明。
 * @param {any} el
 * @param {string} prop 目标属性（longhand 口径比较）
 * @param {any[]} rules 预筛规则
 * @param {'dev'|'prod'} mode
 * @returns {{rule: any, decl: any, key: number[]} | null}
 */
function resolveWinner(el, prop, rules, mode) {
  const competing = competesWith(prop);
  let best = null;
  for (const rule of rules) {
    for (const decl of rule.declarations) {
      if (!competing.has(String(decl.prop).toLowerCase())) continue;
      const spec = mode === 'prod' ? rule.specProd : rule.specDev;
      const key = [decl.important ? 1 : 0, spec[0], spec[1], spec[2], rule.sourceOrder];
      if (!best || cmpKey(key, best.key) > 0) {
        let matched = true;
        try {
          matched = el.matches(rule.selector);
        } catch (e) {
          matched = false; // jsdom/nwsapi 不支持的伪类选择器按不匹配处理
        }
        if (matched) {
          best = { rule, decl, key };
        }
      }
    }
  }
  return best;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cmpKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * 单条候选（元素 × 属性 × 口径）的完整判定。
 * @param {any} candidate 层 A 候选（含 id）
 * @param {any} el
 * @param {{prop: string, value: string, important: boolean}} watched
 * @param {any} index computeIndex 产出
 * @param {'dev'|'prod'} mode
 */
function evaluate(candidate, el, watched, index, mode) {
  const rules = rulesForElement(el, index);
  const winner = resolveWinner(el, watched.prop, rules, mode);
  const normalize = v => String(v).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!winner) {
    return { status: 'not-overridden', reason: 'no-competing-rule' };
  }
  if (winner.rule.id === candidate.id) {
    return { status: 'not-overridden', reason: 'self-wins' };
  }
  if (winner.rule.sourceKind === 'prd') {
    return {
      status: 'not-overridden',
      reason: 'custom-wins',
      winnerSelector: winner.rule.selector,
      winnerValue: winner.decl.prop + ': ' + winner.decl.value
    };
  }
  // antd 运行时规则获胜
  if (normalize(winner.decl.value) === normalize(watched.value)) {
    return {
      status: 'ambiguous',
      reason: 'antd-wins-same-value',
      winnerSelector: winner.rule.selector,
      winnerValue: winner.decl.prop + ': ' + winner.decl.value,
      specCustom: computeSpecificity(candidate.selector).join(','),
      specWinner: (mode === 'prod' ? winner.rule.specProd : winner.rule.specDev).join(',')
    };
  }
  return {
    status: 'confirmed-override',
    reason: 'antd-wins-different-value',
    winnerSelector: winner.rule.selector,
    winnerValue: winner.decl.prop + ': ' + winner.decl.value,
    specCustom: computeSpecificity(candidate.selector).join(','),
    specWinner: (mode === 'prod' ? winner.rule.specProd : winner.rule.specDev).join(',')
  };
}

module.exports = {
  computeSpecificity,
  competesWith,
  buildCascadeRules,
  stripDevHash,
  mediaApplies,
  computeIndex,
  resolveWinner,
  evaluate
};

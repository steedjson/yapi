/**
 * antd5 覆盖面视觉巡检 · 共享 CSS 解析/扫描库（CJS）。
 *
 * 为什么是 .cjs：@babel/register（pirates）默认钩住 .js/.mjs 并按其 Babel 配置
 * 编译，require 一个 .mjs 不会走到 Node 原生 require(esm)，ESM 语法被转译成
 * require 后在模块作用域爆炸。.cjs 不在 pirates 钩子列表内，可被 ava 测试进程
 * 与 .mjs CLI（ESM-CJS interop）双端安全加载。
 *
 * 职责（层 A + 层 B 共用同一套解析口径）：
 *   - parseCssRules：CSS 文本 → 规则清单（@media/@supports 展开、@keyframes 跳过、
 *     嵌套规则容错）；
 *   - scanCandidates：static/prd/*.css → 自定义候选规则（层 A 判定口径）；
 *   - splitSelectorClasses / splitTopLevel / isWatchedProp：口径原子函数。
 */

const fs = require('fs');
const path = require('path');

/** 盒模型/排版属性观察名单（前缀匹配，含派生属性如 margin-top / background-color） */
const WATCHED_PROP_PREFIXES = [
  'margin',
  'padding',
  'width',
  'height',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'background',
  'border',
  'color',
  'font-size',
  'line-height',
  'display',
  'overflow'
];

/**
 * 计划明确排除的二级风险源（docs/antd5-visual-audit-plan.md §6）：
 * json-schema-editor-visual 内嵌 antd3 的作用域样式由 json-schema-css-scope-loader
 * 负责，属「编辑器自研」立项范围，不在本专项候选内（显式排除并计数，不静默）。
 */
const OUT_OF_SCOPE_SELECTOR_PREFIXES = ['.json-schema-editor-scope'];

/** chunk 名 → 路由页面域（报告可读性用） */
const CHUNK_PAGES = {
  index: '全局外壳 / login / home / add-project 之外的首屏公共样式',
  'i': 'project interface（接口列表/详情/编辑/运行/用例集合）',
  project: 'project（设置/动态/数据/token 等项目域页面）',
  group: 'group（列表/成员/设置/动态）',
  user: 'user（列表/资料）',
  follows: 'follow（关注项目）',
  'add-project': 'add-project（新建项目）'
};

/** 判断声明属性是否在观察名单内 */
function isWatchedProp(prop) {
  const p = String(prop).toLowerCase();
  return WATCHED_PROP_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '-'));
}

/**
 * 提取选择器文本中的类名（不含点），返回 { antd: [], custom: [] }。
 * `-` 开头的转义类名与字符串/属性选择器内容不在此解析口径内（产物 CSS 类名为常规标识符）。
 * @param {string} selectorText
 */
function splitSelectorClasses(selectorText) {
  const antd = [];
  const custom = [];
  const re = /\.([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = re.exec(selectorText)) !== null) {
    if (m[1].indexOf('ant-') === 0) {
      antd.push(m[1]);
    } else {
      custom.push(m[1]);
    }
  }
  return { antd, custom };
}

/**
 * 按顶层分隔符切分（忽略括号/引号内的分隔符）
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

/**
 * 解析 CSS 文本为规则清单（层 A 统计与层 B 级联共用）。
 * - 剥离注释；@media/@supports/@layer 递归展开（记录 media 条件）；
 * - @keyframes/@font-face/@page 体跳过；@charset/@import 语句跳过；
 * - 嵌套规则容错：近似展开为「父选择器 后代」（当前产物未观察到，仅防御）；
 * - 返回 [{ selector, declarations: [{prop, value, important}], media, order, source }]。
 *
 * @param {string} cssText
 * @param {string} sourceName 来源标注（chunk 文件名或 'runtime:<n>'）
 * @returns {any[]}
 */
function parseCssRules(cssText, sourceName) {
  // 预处理：剥离注释（产物已 minify，仍可能有 license 注释）
  const css = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const warnings = [];
  let order = 0;

  /**
   * @param {string} text
   * @param {number} start
   * @param {number} end
   * @param {string} media
   */
  function walk(text, start, end, media) {
    let i = start;
    while (i < end) {
      // 跳过空白与顶层分号
      while (i < end && /[\s;]/.test(text[i])) i++;
      if (i >= end) break;

      if (text[i] === '@') {
        // at-rule：读到 { 或 ;
        let j = i;
        let depth = 0;
        let atHeader = '';
        while (j < end) {
          const ch = text[j];
          if (ch === ';' && depth === 0) {
            // 无块 at 语句（@charset/@import）
            i = j + 1;
            break;
          }
          if (ch === '{') {
            atHeader = text.slice(i, j).trim();
            depth = 1;
            j++;
            const bodyStart = j;
            while (j < end && depth > 0) {
              if (text[j] === '{') depth++;
              else if (text[j] === '}') depth--;
              if (depth === 0) break;
              j++;
            }
            const bodyEnd = j; // 指向 '}'
            i = j + 1;
            const atName = atHeader.split(/[\s(]/, 1)[0].toLowerCase();
            if (atName === '@media' || atName === '@supports' || atName === '@layer') {
              walk(text, bodyStart, bodyEnd, media ? media + ' && ' + atHeader : atHeader);
            } else if (atName === '@keyframes' || atName === '@font-face' || atName === '@page') {
              // 体不产生页面选择器规则
            } else {
              warnings.push(sourceName + ': 未识别的 at-rule 已忽略 → ' + atHeader.slice(0, 60));
            }
            break;
          }
          j++;
        }
        continue;
      }

      // 常规规则：selector { ... }
      let j = i;
      while (j < end && text[j] !== '{' && text[j] !== '}') j++;
      if (j >= end || text[j] === '}') {
        // 异常片段（不应出现），跳过
        i = j + 1;
        continue;
      }
      const selector = text.slice(i, j).trim();
      j++;
      // 声明体（考虑嵌套块容错）
      const bodyStart = j;
      let depth = 1;
      while (j < end && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        if (depth === 0) break;
        j++;
      }
      const body = text.slice(bodyStart, j);
      i = j + 1;

      // 声明体里若再出现「selector { }」形态，按 CSS 嵌套规则容错展开
      const nested = body.indexOf('{');
      if (nested !== -1) {
        warnings.push(
          sourceName + ': 检测到嵌套规则，近似展开 → ' + body.slice(Math.max(0, nested - 40), nested + 1)
        );
        walkNested(selector, body, media);
      } else {
        pushRule(selector, body, media);
      }
    }
  }

  /**
   * 嵌套容错：顶层声明 + 递归嵌套块（嵌套选择器近似为「父选择器 后代」）
   * @param {string} parentSelector
   * @param {string} body
   * @param {string} media
   */
  function walkNested(parentSelector, body, media) {
    let depth = 0;
    let declStart = 0;
    let selStart = -1;
    for (let k = 0; k <= body.length; k++) {
      const ch = body[k];
      if (ch === '{') {
        if (depth === 0) {
          const decl = body.slice(declStart, selStart === -1 ? k : selStart);
          if (decl.trim()) pushRule(parentSelector, decl, media);
          const nestedSelector = body.slice(selStart === -1 ? declStart : selStart, k).trim();
          let d2 = 1;
          let k2 = k + 1;
          while (k2 < body.length && d2 > 0) {
            if (body[k2] === '{') d2++;
            else if (body[k2] === '}') d2--;
            k2++;
          }
          walkNested(parentSelector + ' ' + nestedSelector, body.slice(k + 1, k2 - 1), media);
          k = k2 - 1;
          declStart = k2;
          selStart = -1;
        }
        depth++;
      } else if (ch === '}') {
        depth--;
      } else if (ch === ';' && depth === 0) {
        declStart = k + 1;
        selStart = -1;
      }
    }
    const tail = body.slice(declStart);
    if (tail.trim() && tail.indexOf('{') === -1) {
      pushRule(parentSelector, tail, media);
    }
  }

  /**
   * @param {string} selectorText
   * @param {string} declBody
   * @param {string} media
   */
  function pushRule(selectorText, declBody, media) {
    const declarations = [];
    String(declBody).split(';').forEach(decl => {
      const idx = decl.indexOf(':');
      if (idx === -1) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      let value = decl.slice(idx + 1).trim();
      if (!prop || !value) return;
      let important = false;
      const bang = value.lastIndexOf('!important');
      if (bang !== -1) {
        important = true;
        value = (value.slice(0, bang) + value.slice(bang + '!important'.length)).trim();
      }
      declarations.push({ prop, value, important });
    });
    if (!declarations.length || !selectorText) return;
    rules.push({
      selector: selectorText.replace(/\s+/g, ' ').trim(),
      declarations,
      media: media || '',
      source: sourceName,
      order: order++
    });
  }

  walk(css, 0, css.length, '');
  if (warnings.length) {
    rules.warnings = warnings;
  }
  return rules;
}

/**
 * 全量扫描：对产物目录下所有 .css chunk 执行层 A 规则提取与候选过滤。
 * @param {string} prdDir
 * @returns {{ candidates: any[], stats: any }}
 */
function scanCandidates(prdDir) {
  const files = fs
    .readdirSync(prdDir)
    .filter(f => f.endsWith('.css'))
    .sort();
  const candidates = [];
  const stats = {
    files: [],
    totalRules: 0,
    antdOnlyRules: 0,
    noWatchedPropRules: 0,
    noClassRules: 0,
    outOfScopeRules: 0,
    candidates: 0
  };

  for (const file of files) {
    const chunk = file.slice(0, file.indexOf('@'));
    const css = fs.readFileSync(path.join(prdDir, file), 'utf8');
    const rules = parseCssRules(css, file);
    const fileStat = { file, chunk, rules: rules.length, candidates: 0 };

    for (const rule of rules) {
      stats.totalRules++;
      // 多选择器规则按逗号拆为逐条候选（共享同一组声明）
      const selectorParts = splitTopLevel(rule.selector, ',');
      for (const selector of selectorParts) {
        const normalizedSelector = selector.replace(/\s+/g, ' ').trim();
        // :is()/:where() 包裹的作用域选择器同样剥壳检测
        const unwrapped = normalizedSelector.replace(/^:(is|where)\(/, '');
        if (
          OUT_OF_SCOPE_SELECTOR_PREFIXES.some(
            prefix => unwrapped === prefix || unwrapped.indexOf(prefix + ' ') === 0
          )
        ) {
          stats.outOfScopeRules++;
          continue; // json-schema-editor-visual 作用域样式：计划排除项，显式计数
        }
        const { antd, custom } = splitSelectorClasses(selector);
        if (antd.length && !custom.length) {
          stats.antdOnlyRules++;
          continue; // antd 库自有规则（历史 antd3 产物），不属自定义候选
        }
        if (!antd.length && !custom.length) {
          stats.noClassRules++;
          continue; // 纯元素/ID 选择器，无类共现入口
        }
        const watched = rule.declarations.filter(d => isWatchedProp(d.prop));
        if (!watched.length) {
          stats.noWatchedPropRules++;
          continue; // 不含盒模型/排版属性，非本专项观察对象
        }
        candidates.push({
          id: file + '#' + rule.order + '#' + normalizedSelector,
          selector: normalizedSelector,
          props: watched.map(d => ({
            prop: d.prop,
            value: d.value,
            important: d.important
          })),
          allProps: rule.declarations.map(d => d.prop),
          chunk,
          file,
          media: rule.media,
          order: rule.order,
          hasAntdRef: antd.length > 0,
          antdClasses: antd,
          customClasses: custom
        });
        fileStat.candidates++;
      }
    }
    stats.files.push(fileStat);
    stats.candidates += fileStat.candidates;
  }
  return { candidates, stats };
}

module.exports = {
  WATCHED_PROP_PREFIXES,
  OUT_OF_SCOPE_SELECTOR_PREFIXES,
  CHUNK_PAGES,
  isWatchedProp,
  splitSelectorClasses,
  splitTopLevel,
  parseCssRules,
  scanCandidates
};

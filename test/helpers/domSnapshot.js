/**
 * 规范化 DOM 快照共享序列化器（严版）。
 *
 * 由 PostmanContainer.test.js 的严版序列化器下沉而来，InterfaceColContentContainer
 * 等容器级快照门禁统一复用，避免各文件各养一份、口径漂移。
 *
 * 规范化策略（比批 1 InterfaceColContentContainer 的松版更严）：
 *   - 保留：tag / class（剥离 antd CSS-in-JS 哈希）/ 全部 attributes / 文本（空白折叠）；
 *   - style：批 1 整体剥离；本模块按「布局类白名单」采集 display / flex-basis /
 *     flex-grow / visibility（值截断到白名单声明、按名排序），布局漂移可检出，
 *     其余内联样式仍剥离；
 *   - 受控值：对 input/textarea/select 采集实时 value / checked（checkbox·radio 取
 *     checked，其余取 value）——React 把实时值写在元素属性上而非 attribute，仅采集
 *     attribute 看不到受控编辑；同名 attribute（value/checked/style）跳过避免重复；
 *   - 其余沿用：SVG path 的 d 数据、rc-select 与 react useId 生成 id、dnd-kit 自增 id
 *     归一化（与结构无关且跨挂载不稳定），以及 rc-motion 过渡态类名归一化
 *     （-appear/-enter/-leave 相位类在 jsdom 下停在不确定的相位，属动画进度非结构）。
 *
 * 用法：在测试文件顶部先 import jsdom-setup / containers，再 `require` 本模块。
 * 序列化器本身只读 DOM，不依赖装载顺序。
 */

// antd5 CSS-in-JS 在非 production 下注入的开发态哈希类
const HASH_CLASS = /^css-dev-only-do-not-override-.*$/;
// rc-motion 的过渡态类名（-appear/-enter/-leave 及其 -start/-active/-prepare 相位）
// 表达的是动画进度而非结构，且同一元素的相位类在不同运行下会停在 start/active 之间
// （jsdom 不派发 transitionend，离场动画不会结束）——归一化为 -STATE 后去重。
const MOTION_STATE = /-(appear|enter|leave)(-(start|active|prepare))?$/;
// 布局类白名单：整体剥离 style 会漏掉布局漂移，此处只保留这 4 个声明
const LAYOUT_STYLE_KEYS = { display: true, 'flex-basis': true, 'flex-grow': true, visibility: true };

/**
 * 仅保留白名单内的内联样式声明，按声明名排序输出（值为空或空串则忽略）
 * @param {string} styleText
 */
function normalizeStyle(styleText) {
  const kept = [];
  String(styleText)
    .split(';')
    .forEach(decl => {
      const idx = decl.indexOf(':');
      if (idx === -1) {
        return;
      }
      const name = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim().replace(/\s+/g, ' ');
      if (!name || !value || !LAYOUT_STYLE_KEYS[name]) {
        return;
      }
      kept.push(name + ':' + value);
    });
  kept.sort();
  return kept.join(';');
}

/**
 * 受控表单元素的实时值：input/textarea/select 采集 value，checkbox/radio 采集 checked
 * （React 把实时值写在元素属性上而非 attribute，故必须读属性）
 * @param {any} node
 */
function liveFieldOf(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'input') {
    const type = String(node.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      return { name: 'checked', value: node.checked ? 'true' : 'false' };
    }
    return { name: 'value', value: node.value == null ? '' : String(node.value) };
  }
  if (tag === 'textarea' || tag === 'select') {
    return { name: 'value', value: node.value == null ? '' : String(node.value) };
  }
  return null;
}

/**
 * @param {string} name
 * @param {string} value
 */
function normalizeAttr(name, value) {
  if (name === 'd') {
    return 'SVG_PATH';
  }
  if (name === 'class') {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map(c => c.replace(HASH_CLASS, 'CSSHASH').replace(MOTION_STATE, '-STATE'))
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .join('.');
  }
  return value
    .replace(/:[rR][0-9a-z]+:/g, ':RID:')
    .replace(/rc_select_\d+/g, 'rc_select_N')
    .replace(/DndDescribedBy-\d+/g, 'DndDescribedBy-N')
    .replace(/DndLiveRegion-\d+/g, 'DndLiveRegion-N');
}

/**
 * @param {any} node
 * @param {string[]} out
 * @param {number} depth
 */
function serializeNode(node, out, depth) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 3) {
    const text = String(node.nodeValue)
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      out.push(pad + '"' + text + '"');
    }
    return;
  }
  if (node.nodeType !== 1) {
    return;
  }
  const attrs = {};
  Array.from(node.getAttributeNames()).forEach(name => {
    // style / value / checked 单独处理：style 走白名单，value/checked 取实时值
    if (name === 'style' || name === 'value' || name === 'checked') {
      return;
    }
    attrs[name] = normalizeAttr(name, node.getAttribute(name));
  });
  const style = normalizeStyle(node.getAttribute('style') || '');
  if (style) {
    attrs.style = style;
  }
  const live = liveFieldOf(node);
  if (live) {
    attrs[live.name] = live.value;
  }
  const rendered = Object.keys(attrs)
    .sort()
    .map(name => name + '=' + JSON.stringify(attrs[name]));
  out.push(
    pad + '<' + node.tagName.toLowerCase() + (rendered.length ? ' ' + rendered.join(' ') : '') + '>'
  );
  Array.from(node.childNodes).forEach(child => serializeNode(child, out, depth + 1));
}

/**
 * 以「每行一个节点/文本」的规范化文本表示一棵 DOM 子树。
 * @param {any} node 根元素（通常为 render 的 container 或 body）
 */
function snapshot(node) {
  const out = [];
  serializeNode(node, out, 0);
  return out.join('\n');
}

module.exports = {
  snapshot,
  serializeNode,
  normalizeAttr,
  normalizeStyle,
  liveFieldOf
};

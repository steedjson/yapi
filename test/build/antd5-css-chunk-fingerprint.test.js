/**
 * static/prd CSS 分包顺序指纹门禁（antd5 覆盖面视觉巡检 · 批次 1 交付物 4）。
 *
 * 背景：antd5 巡检依赖产物指纹稳定。原第 3 条断言（scoped antd3 carrier 存在标记）
 * 已随批次 4 机制退役替换为「全 chunk 0 标记」回流守卫，
 * 「CSS 分包形态稳定」——层 A/层 B 的候选归属、页面归因均以 chunk 为坐标。
 * 历史上发生过产物清单与实际分包形态脱节的 D-1 类事故（清单指向的 chunk 与
 * 磁盘产物不一致、scoped 样式泄入公共包），本门禁把该形态 CI 化：
 *   1. assets.js 清单中各 CSS chunk 文件名与登记基线逐字节一致（hash 变化 =
 *      产物重建，须有意识地更新基线并重跑层 A/层 B 扫描）；
 *   2. 初始 chunk 注入顺序与基线一致（link 标签顺序决定同特异性 CSS 的决胜序）；
 *   3. 承载 scoped antd3 的 chunk（i）确含 .json-schema-editor-scope 标记，
 *      且公共入口 index CSS 不含该标记（scope 泄漏检测）。
 *
 * 产物重建后的更新方式：重跑 `node scripts/antd5-candidate-scan.mjs` 与
 * `npx ava test/client/visual/antd5-runtime-diff.test.js`，确认候选/判定无漂移后
 * 更新下方 BASELINE（允许的显式变更，不允许静默漂移）。
 */
import test from 'ava';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PRD_DIR = path.join(REPO_ROOT, 'static', 'prd');

// ---- 登记基线（与 static/prd 提交态一致；更新须按文件头说明走重扫流程）----
// 批次 3（消费方切换）+ 批次 4（机制退役）后全量重建：schemaEditors.js 不再 require
// json-schema-editor-visual 且 antd.css import 已删——旧编辑器 JS 链（antd3 组件 /
// rc-editor-mention / moox）
// 从依赖图消失——接口路由 chunk 由 i@…js(3.3MB) 缩为 d@…js(539KB)，chunk 序号重排：
// 接口路由 i→d、vendor p→v；project/d 两 CSS 哈希随之更新，其余 CSS 内容不变。
// scoped antd3（InterfaceEditForm.js 保留的 antd.css import，批次 4 才删）仍由
// 接口路由 chunk（现名 d）承载。层 A/层 B 已按新产物重扫（候选/判定无漂移）。
const BASELINE = {
  cssChunks: {
    'index.js': 'index@39ef29962cd900dd.css',
    group: 'group@426f689219580b35.css',
    project: 'project@8ac0e409123e607c.css',
    user: 'user@57802eb279f54184.css',
    follows: 'follows@3f80bd4670cf7f38.css',
    'add-project': 'add-project@80e6a5a4d705c349.css'
  },
  initialChunks: ['manifest', '5', 'index.js']
  // 批次 4：json-schema-editor-visual 的 antd.css import 已删，scoped antd3 双作用域
  // 机制退役——scopedAntd3Carrier/scopeMarker 基线随之移除（产物实测 0 处标记）。
};

function loadWebpackAssets() {
  const code = fs.readFileSync(path.join(PRD_DIR, 'assets.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  if (!sandbox.window.WEBPACK_ASSETS) {
    throw new Error('assets.js 缺少 window.WEBPACK_ASSETS 清单');
  }
  return sandbox.window;
}

test('D-1 门禁：assets.js 各 CSS chunk 文件名与登记基线一致', t => {
  const { WEBPACK_ASSETS } = loadWebpackAssets();
  for (const [chunk, expectedCss] of Object.entries(BASELINE.cssChunks)) {
    const entry = WEBPACK_ASSETS[chunk];
    t.truthy(entry, 'assets.js 应含 chunk ' + chunk);
    t.is(
      entry && entry.css,
      expectedCss,
      'chunk ' + chunk + ' 的 CSS 指向与基线不符：产物已重建？请按门禁文件头说明重跑层 A/层 B 后更新 BASELINE'
    );
    t.true(
      fs.existsSync(path.join(PRD_DIR, expectedCss)),
      '基线指向的产物应真实存在：' + expectedCss
    );
  }
});

test('D-1 门禁：初始 chunk 注入顺序与登记基线一致', t => {
  const { WEBPACK_INITIAL_CHUNKS } = loadWebpackAssets();
  t.deepEqual(
    WEBPACK_INITIAL_CHUNKS,
    BASELINE.initialChunks,
    '初始 chunk 顺序漂移会改变 link 标签顺序（同特异性 CSS 决胜序），须有意识更新基线'
  );
});

test('D-1 门禁：scoped antd3 双作用域机制退役后不得回流', t => {
  // 批次 4：json-schema-editor-visual 已删，scoped antd3 机制（json-schema-css-scope-loader
  // + antd.css import）整体退役。此断言防止任何形式的回流：全部 CSS chunk 中
  // .json-schema-editor-scope 标记应为 0 处。
  const { WEBPACK_ASSETS } = loadWebpackAssets();
  for (const [chunk, item] of Object.entries(WEBPACK_ASSETS)) {
    if (!item.css) continue;
    const css = fs.readFileSync(path.join(PRD_DIR, item.css), 'utf8');
    t.false(
      css.indexOf('.json-schema-editor-scope') !== -1,
      'chunk ' + chunk + ' 不应含 scoped antd3 标记（该机制已随批次 4 退役）'
    );
  }
});

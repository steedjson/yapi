// @ts-check
/**
 * 站内使用文档生成脚本（替代已移除的 ydoc `npm run docs`）。
 *
 * 读取 docs/documents/*.md，用 markdown-it 渲染为单个 static/docs/index.html：
 * - 顶部标题栏（「YApi 使用文档」+ 版本徽标）+ 左侧章节导航 + 右侧正文；
 * - 纯原生 JS hash 路由切换章节（#/章节 或 #/章节/锚点），无任何外网资源；
 * - md 中的图片（markdown 与内嵌 <img> 两种写法）复制到 static/docs/assets/，
 *   引用改写为 ./assets/<文件名>；
 * - md 间互链（./xxx.md、./xxx.md#锚点）改写为站内章节锚点，外链保留并加 target=_blank；
 * - 安全策略：markdown-it 保持 html:false（默认），md 内嵌的原生 HTML 仅按
 *   div/span/p/br/a/img 白名单预处理转成 markdown 语法，其余一律被转义，
 *   不开启 html:true，防 md 内嵌脚本。
 *
 * 幂等：每次执行先清空 static/docs/ 再生成。
 */
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'documents');
const OUT_DIR = path.join(ROOT, 'static', 'docs');
const ASSETS_DIR = path.join(OUT_DIR, 'assets');
// 版本号来源：package.json（当前 2.0.0），此处写死以保持产物稳定可 diff
const SITE_VERSION = '2.0.0';

// 章节顺序：version 置顶，其余沿用实施计划既定顺序（与 SUMMARY.md 目录兼容）
const CHAPTERS = [
  'version',
  'index',
  'quickstart',
  'manage',
  'project',
  'api',
  'case',
  'adv_mock',
  'mock',
  'data',
  'export-data',
  'plugin-index',
  'plugin-dev',
  'plugin-hooks',
  'plugin-list',
  'qa',
  'redev',
  'CHANGELOG'
];

// SUMMARY.md 未覆盖时的章节标题兜底
const FALLBACK_TITLES = {
  version: '版本说明',
  index: '认识YApi',
  quickstart: '创建第一个API',
  manage: '权限',
  project: '项目操作',
  api: '接口操作',
  case: '自动化测试',
  adv_mock: '高级Mock',
  mock: '数据Mock',
  data: '数据导入',
  'export-data': '数据导出',
  'plugin-index': '插件',
  'plugin-dev': '插件开发',
  'plugin-hooks': '钩子',
  'plugin-list': '插件列表',
  qa: '常见问题解答',
  redev: '二次开发',
  CHANGELOG: '版本记录'
};

/** @type {Record<string, string>} */
const assetNameBySrc = {};
/** @type {Record<string, string>} */
const assetNameTaken = {};

/**
 * 解析 SUMMARY.md 中的「* [标题](文件.md...)」得到既定中文标题。
 * @returns {Record<string, string>}
 */
function readSummaryTitles() {
  /** @type {Record<string, string>} */
  const titles = {};
  const summaryPath = path.join(SRC_DIR, 'SUMMARY.md');
  if (!fs.existsSync(summaryPath)) {
    return titles;
  }
  const lines = fs.readFileSync(summaryPath, 'utf8').split(/\r?\n/);
  lines.forEach(function (line) {
    const m = line.match(/^\s*\*\s*\[(.+?)\]\(([^)]+?)\)/);
    if (!m) {
      return;
    }
    const file = m[2].split('#')[0].trim();
    const name = file.replace(/\.md$/i, '');
    if (name && !titles[name]) {
      titles[name] = m[1];
    }
  });
  return titles;
}

/**
 * 章节标题：优先 SUMMARY.md 中文标题，缺失时用兜底表，再缺失用文件名。
 * @param {string} chapter
 * @param {Record<string, string>} summaryTitles
 * @returns {string}
 */
function chapterTitle(chapter, summaryTitles) {
  return summaryTitles[chapter] || FALLBACK_TITLES[chapter] || chapter;
}

/**
 * 标题 slug（供锚点）：小写、中文/字母/数字/连字符保留，其余折叠为 -。
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 解析图片相对路径：相对 docs/documents/ 目录。
 * @param {string} src
 * @returns {string}
 */
function resolveAssetSrc(src) {
  return src.replace(/^\.\//, '').split('?')[0].split('#')[0];
}

/**
 * 复制被引用图片到 assets/，返回改写后的引用名（防重名冲突）。
 * @param {string} src md 中的原始引用
 * @returns {string|null} 改写后的 ./assets/<文件名>，文件不存在时返回 null
 */
function copyAsset(src) {
  const rel = resolveAssetSrc(src);
  const abs = path.join(SRC_DIR, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return null;
  }
  if (assetNameBySrc[rel]) {
    return assetNameBySrc[rel];
  }
  let name = path.basename(rel);
  if (assetNameTaken[name]) {
    // 不同目录同名文件：以父目录名做前缀避免覆盖
    const prefix = path.basename(path.dirname(rel));
    name = prefix + '-' + name;
    let i = 1;
    while (assetNameTaken[name]) {
      name = prefix + '-' + i + '-' + path.basename(rel);
      i++;
    }
  }
  assetNameTaken[name] = rel;
  const target = path.join(ASSETS_DIR, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(abs, target);
  const rewritten = './assets/' + name;
  assetNameBySrc[rel] = rewritten;
  return rewritten;
}

/**
 * 把 md 内嵌的白名单原生 HTML 预处理为 markdown 语法（渲染仍走 html:false）。
 * @param {string} md
 * @returns {string}
 */
function preprocessMarkdown(md) {
  let out = md.replace(/\r\n/g, '\n');
  // <img ...> -> markdown 图片（丢弃 class/style 等属性，展示交给样式表）
  out = out.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi, function (m, src) {
    return '![](' + src + ')';
  });
  // <a ... href="URL" ...>TEXT</a> -> [TEXT](URL)
  out = out.replace(
    /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    function (m, href, text) {
      var clean = String(text).replace(/\s+/g, ' ').trim();
      if (!clean) {
        return '';
      }
      return '[' + clean + '](' + href + ')';
    }
  );
  // <span class="list-index">N</span> 步骤序号 -> 加粗序号
  out = out.replace(/<span[^>]*class=["']list-index["'][^>]*>([\s\S]*?)<\/span>/gi, function (
    m,
    inner
  ) {
    var num = inner.replace(/<[^>]+>/g, '').trim();
    return num ? '**' + num + '.** ' : '';
  });
  // 其余 span 丢弃标签保留内容
  out = out.replace(/<\/?span\b[^>]*>/gi, '');
  // 整行只剩 div/p/br 标签的行：置空（作为块级分隔）
  out = out.replace(/^[ \t]*(?:<\/?(?:div|p|br)\b[^>]*>)+[ \t]*$/gim, '');
  // 行内残余 div/p 标签：折叠为空格，避免打断列表等 markdown 结构
  out = out.replace(/<\/?(?:div|p)\b[^>]*>/gi, ' ');
  // 行内 <br> 转为硬换行
  out = out.replace(/<br\s*\/?>/gi, '  \n');
  return out;
}

/**
 * 构建 markdown-it 实例并挂载渲染改写规则。
 * @returns {import('markdown-it')}
 */
function createRenderer() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };
  const defaultImage =
    md.renderer.rules.image ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  // 链接改写：站内 md 互链 -> #/章节(锚点)；外链 -> 补 target=_blank
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const href = String(token.attrs[hrefIndex][1]);
      const rewritten = rewriteLink(href, env.chapter);
      token.attrs[hrefIndex][1] = rewritten.url;
      if (rewritten.external) {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // 图片改写：复制到 assets/ 并指向 ./assets/<文件名>
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    if (srcIndex >= 0) {
      const src = String(token.attrs[srcIndex][1]);
      const copied = copyAsset(src);
      token.attrs[srcIndex][1] = copied || src;
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  // 标题 slug：为章节内锚点生成稳定 id（重名追加 -1/-2）
  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const inline = tokens[idx + 1];
    let slug = slugify(inline ? inline.content : '');
    if (!slug) {
      slug = 'h';
    }
    /** @type {Record<string, number>} */
    const used = (env.slugUsed = env.slugUsed || {});
    if (used[slug] !== undefined) {
      used[slug] += 1;
      slug = slug + '-' + used[slug];
    } else {
      used[slug] = 0;
    }
    token.attrSet('id', slug);
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

/**
 * md 互链改写规则。
 * @param {string} href
 * @param {string} chapter 当前章节 id
 * @returns {{url: string, external: boolean}}
 */
function rewriteLink(href, chapter) {
  // 站内 md 互链：./xxx.md / ./xxx.md#锚点 / xxx.md
  const mdLink = href.match(/^\.?\/?([\w-]+)\.md(?:#(.*))?$/i);
  if (mdLink && CHAPTERS.indexOf(mdLink[1]) > -1) {
    const target = mdLink[1];
    const anchor = mdLink[2] ? '/' + slugify(decodeURI(mdLink[2])) : '';
    return { url: '#/' + target + anchor, external: false };
  }
  // 本章锚点：#xxx -> #/当前章节/xxx（避免污染顶层路由 hash）
  if (/^#[^/]/.test(href)) {
    return { url: '#/' + chapter + '/' + slugify(decodeURI(href.slice(1))), external: false };
  }
  // 旧外网文档站的 openapi 文档链接收敛为本仓内置的同源页面（md 源不动，构建期改写）
  if (/^https?:\/\/hellosean1025\.github\.io\/yapi\/openapi\.html\/?$/i.test(href)) {
    return { url: '/openapi-doc.html', external: true };
  }
  // 外链保持原样
  return { url: href, external: /^https?:\/\//i.test(href) };
}

/**
 * 渲染单章 HTML。
 * @param {string} chapter
 * @param {import('markdown-it')} md
 * @returns {string}
 */
function renderChapter(chapter, md) {
  const file = path.join(SRC_DIR, chapter + '.md');
  const raw = fs.readFileSync(file, 'utf8');
  const env = { chapter: chapter };
  return md.render(preprocessMarkdown(raw), env);
}

/**
 * HTML 转义。
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 组装最终单文件站点。
 * @param {Record<string, string>} summaryTitles
 * @param {string[]} chapterHtmls
 * @returns {string}
 */
function buildSiteHtml(summaryTitles, chapterHtmls) {
  const navItems = CHAPTERS.map(function (chapter) {
    return (
      '<a class="nav-item" href="#/' +
      chapter +
      '" data-chapter="' +
      chapter +
      '">' +
      escapeHtml(chapterTitle(chapter, summaryTitles)) +
      '</a>'
    );
  }).join('\n');
  const sections = CHAPTERS.map(function (chapter, i) {
    return (
      '<section class="chapter" data-chapter="' +
      chapter +
      '" hidden>' +
      chapterHtmls[i] +
      '</section>'
    );
  }).join('\n');

  const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>YApi 使用文档</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  color: #333;
  background: #fff;
}
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  z-index: 10;
}
.site-header .site-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2329;
}
.site-header .site-version {
  margin-left: 12px;
  padding: 1px 10px;
  font-size: 12px;
  line-height: 20px;
  color: #3782eb;
  background: #eef4fe;
  border: 1px solid #c6dcfb;
  border-radius: 10px;
}
.site-body { display: flex; padding-top: 56px; height: 100%; }
.site-nav {
  width: 240px;
  flex: none;
  border-right: 1px solid #e8e8e8;
  overflow-y: auto;
  padding: 16px 0 32px;
  background: #fafafa;
}
.nav-item {
  display: block;
  padding: 7px 24px;
  color: #4a4a4a;
  text-decoration: none;
  line-height: 22px;
  border-left: 3px solid transparent;
}
.nav-item:hover { color: #3782eb; }
.nav-item.active {
  color: #3782eb;
  background: #fff;
  border-left-color: #3782eb;
  font-weight: 600;
}
.site-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 64px;
}
.chapter { max-width: 820px; margin: 0 auto; }
.chapter img { max-width: 100%; height: auto; }
.chapter h1, .chapter h2, .chapter h3, .chapter h4 {
  color: #1f2329;
  line-height: 1.5;
  margin: 1.2em 0 0.6em;
}
.chapter h1 { font-size: 26px; border-bottom: 1px solid #e8e8e8; padding-bottom: 10px; }
.chapter h2 { font-size: 22px; }
.chapter h3 { font-size: 18px; }
.chapter h4 { font-size: 16px; }
.chapter p { line-height: 1.8; margin: 0.8em 0; }
.chapter li { line-height: 1.8; }
.chapter a { color: #3782eb; }
.chapter code {
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 13px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}
.chapter pre {
  background: #f8f9fb;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 12px 16px;
  overflow-x: auto;
  line-height: 1.6;
}
.chapter pre code { background: none; border: none; padding: 0; }
.chapter blockquote {
  margin: 1em 0;
  padding: 8px 16px;
  border-left: 4px solid #3782eb;
  background: #f5f9ff;
  color: #555;
}
.chapter table { border-collapse: collapse; margin: 1em 0; max-width: 100%; display: block; overflow-x: auto; }
.chapter th, .chapter td { border: 1px solid #e8e8e8; padding: 6px 12px; line-height: 1.6; }
.chapter th { background: #fafafa; font-weight: 600; }
.chapter hr { border: none; border-top: 1px solid #e8e8e8; margin: 1.5em 0; }
</style>
</head>
<body>
<header class="site-header">
  <h1 class="site-title">YApi 使用文档</h1>
  <!-- 版本号来源：package.json（当前 ${SITE_VERSION}） -->
  <span class="site-version">${SITE_VERSION}</span>
</header>
<div class="site-body">
  <nav class="site-nav">
${navItems}
  </nav>
  <main class="site-content" id="siteContent">
${sections}
  </main>
</div>
<script>
(function () {
  var chapters = [].slice.call(document.querySelectorAll('.chapter'));
  var navItems = [].slice.call(document.querySelectorAll('.nav-item'));
  var content = document.getElementById('siteContent');

  function activate(id, anchor) {
    var found = false;
    chapters.forEach(function (sec) {
      var match = sec.getAttribute('data-chapter') === id;
      sec.hidden = !match;
      if (match) {
        found = true;
      }
    });
    if (!found && chapters.length) {
      chapters[0].hidden = false;
      id = chapters[0].getAttribute('data-chapter');
    }
    navItems.forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-chapter') === id);
    });
    content.scrollTop = 0;
    if (anchor) {
      var target = document.getElementById(anchor);
      if (target && target.scrollIntoView) {
        target.scrollIntoView();
      }
    }
  }

  function route() {
    var hash = decodeURIComponent(location.hash || '');
    var m = hash.match(/^#\\/([\\w-]+)(?:\\/([^/]+))?$/);
    if (m) {
      activate(m[1], m[2] || '');
    } else {
      activate(chapters.length ? chapters[0].getAttribute('data-chapter') : '', '');
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
</script>
</body>
</html>
`;
  return shell;
}

function main() {
  const summaryTitles = readSummaryTitles();
  // 幂等：先清空输出目录再生成
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const md = createRenderer();
  const chapterHtmls = CHAPTERS.map(function (chapter) {
    return renderChapter(chapter, md);
  });
  const html = buildSiteHtml(summaryTitles, chapterHtmls);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

  const assetCount = Object.keys(assetNameBySrc).length;
  const size = fs.statSync(path.join(OUT_DIR, 'index.html')).size;
  console.log('[build-docs-site] 章节数:', CHAPTERS.length);
  console.log('[build-docs-site] 复制图片数:', assetCount);
  console.log('[build-docs-site] 输出:', path.join(OUT_DIR, 'index.html'), '(' + size + ' bytes)');
  const missing = CHAPTERS.filter(function (c) {
    return !fs.existsSync(path.join(SRC_DIR, c + '.md'));
  });
  if (missing.length) {
    console.error('[build-docs-site] 缺失章节源文件:', missing.join(', '));
    process.exitCode = 1;
  }
  // 站内文档不得残留旧外网文档站引用
  if (html.indexOf('hellosean1025') !== -1) {
    console.error('[build-docs-site] 产物仍包含旧外网文档站引用 hellosean1025，请检查改写规则');
    process.exitCode = 1;
  }
}

main();

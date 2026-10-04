// @ts-check
/**
 * 站内使用文档生成脚本（替代已移除的 ydoc `npm run docs`）。
 *
 * 按 docs/NAV.md 的原版结构生成 static/docs/index.html：
 * - 顶部页签栏 3 个：教程（documents 书）/ 内网部署（devops 书）/ 开放Api（iframe 整页
 *   嵌入站内 /openapi-doc.html）；
 * - 侧栏三级层级：组（SUMMARY `### 组名`，加粗小标题）→ 章节（顶层列表项）→
 *   章内锚点（两空格缩进子项），当前章节蓝色高亮，子锚点全量展开；
 * - 路由：`#/<页签key>`（切页签）、`#/<页签key>/<fileKey>`（章节）、
 *   `#/<页签key>/<fileKey>/<encodeURIComponent(锚点文字)>`（章内锚点）、`#/openapi`；
 * - heading id：`<书key>-<章节fileKey>-<slug>`（章内重名追加 -1/-2），防跨书/跨章同名
 *   标题 id 撞车，页面内联脚本 resolveAnchor 按同一前缀精确寻址，
 *   侧栏 data-route 三段式（书/章节/锚点原文）不变；
 * - md 中的图片（markdown 与内嵌 <img> 两种写法）复制到 static/docs/assets/
 *   （devops 书重名时加 devops- 前缀），引用改写为 ./assets/<文件名>；
 * - md 间互链（./xxx.md、xxx.md、documents/xxx.md #锚点）改写为对应书的站内路由，
 *   外链保留并加 target=_blank；
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
const OUT_DIR = path.join(ROOT, 'static', 'docs');
const ASSETS_DIR = path.join(OUT_DIR, 'assets');
// 版本号来源：package.json 的 version 字段（随发版自动同步，避免写死漂移）
const SITE_VERSION = require('../package.json').version;

/**
 * SUMMARY 条目（children 递归为章内锚点子项）
 * @typedef {{ title: string, file: string, anchor: string, children: SummaryEntry[] }} SummaryEntry
 */
/**
 * SUMMARY 组（组名 + 章节项）
 * @typedef {{ title: string, items: SummaryEntry[] }} SummaryGroup
 */
/**
 * 渲染用章节（html 于 main 中按源文件存在性填充）
 * @typedef {{ fileKey: string, title: string, html?: string }} Chapter
 */
/**
 * 书定义（初始化字面量形状：groups/chapters 尚不存在，由 main() 解析填充）。
 * 拆「初始化态 / 运行态」两型：把初始化字面量直接注解成运行态 Book（必填 groups/chapters）
 * 是对运行态的提前承诺，故初始化字面量按 BookDef 声明。
 * @typedef {{ key: string, label: string, summary: string, srcDir: string, assetPrefix: string, prependGroups: SummaryGroup[] }} BookDef
 */
/**
 * 书运行态（main() 解析后：groups = prependGroups + SUMMARY 组，chapters 由 groups 收集）。
 * 渲染/装配函数只接受运行态；使用点以「BookDef[] → Book[]」JSDoc 断言表达该承诺
 * （纯类型断言，不改变运行时值）。
 * @typedef {BookDef & { groups: SummaryGroup[], chapters: Chapter[] }} Book
 */
/**
 * markdown-it 渲染规则（common/types/global.d.ts 的 markdown-it 存根未声明 renderer
 * 与规则表；此处按官方 RendererRule 形态补齐参数，env 为渲染期注入的 book/chapter）
 * @typedef {(tokens: any[], idx: number, options: any, env: any, self: any) => string} MdRenderRule
 */
/**
 * markdown-it 渲染器（存根缺此成员，按实际 API 补齐规则表）
 * @typedef {{ rules: Record<string, MdRenderRule> }} MdRenderer
 */
/**
 * markdown-it 实例（存根实例 & 实际存在的 renderer；render 补 env 形参）
 * @typedef {{ render: (src: string, env?: any) => string, use: (plugin: any, ...args: any[]) => any, renderer: MdRenderer }} MdLike
 */

/**
 * 书定义（初始化态 BookDef[]）：key 即路由中的页签 key。
 * 教程书置顶插入「版本说明」组（version.md 不在 SUMMARY 内，标题带版本号）。
 * groups/chapters 由 main() 解析填充（态转换点与运行态视图见 main）。
 */
const BOOKS = /** @type {BookDef[]} */ ([
  {
    key: '教程',
    label: '教程',
    summary: path.join(ROOT, 'docs', 'documents', 'SUMMARY.md'),
    srcDir: path.join(ROOT, 'docs', 'documents'),
    assetPrefix: '',
    prependGroups: [
      {
        title: '版本说明',
        items: [{ title: '版本说明（v2.0.0）', file: 'version.md', anchor: '', children: [] }]
      }
    ]
  },
  {
    key: '内网部署',
    label: '内网部署',
    summary: path.join(ROOT, 'docs', 'devops', 'SUMMARY.md'),
    srcDir: path.join(ROOT, 'docs', 'devops'),
    assetPrefix: 'devops-',
    prependGroups: []
  }
]);

// 第三个页签：开放Api（不渲染章节，点击后正文区 iframe 整页加载 /openapi-doc.html）。
// 只贡献 key/label 两个字段（不具备 BookDef 的其余必填字段），页签清单按该结构面消费。
const OPENAPI_TAB = { key: 'openapi', label: '开放Api' };

/** @type {Record<string, string>} */
const assetNameBySrc = {};
/** @type {Record<string, string>} */
const assetNameTaken = {};

/**
 * SUMMARY 条目（标题 + 目标 md + 章内锚点）。
 * @param {string} title
 * @param {string} target 形如 `project.md` / `project.md#基本设置` / `index.md#安装`
 * @returns {SummaryEntry}
 */
function parseEntry(title, target) {
  const parts = String(target).split('#');
  const file = parts[0].trim();
  let anchor = '';
  if (parts.length > 1) {
    try {
      anchor = decodeURI(parts.slice(1).join('#'));
    } catch (e) {
      anchor = parts.slice(1).join('#');
    }
  }
  return { title, file, anchor, children: [] };
}

/**
 * 解析 SUMMARY 为「组 → 章节项 → 章内锚点」三级树。
 * 规则：`### X` 开新组；无缩进 `* [t](f#a)` 为章节项；两空格缩进为上一章节项的子锚点；
 * `---` 结束当前组，其后无组名的顶层列表归入无名组（组名空字符串）。
 * @param {string} summaryPath
 * @returns {SummaryGroup[]}
 */
function parseSummary(summaryPath) {
  /** @type {SummaryGroup[]} */
  const groups = [];
  /** @type {SummaryGroup|null} */
  let current = null;
  /** @type {SummaryEntry|null} */
  let lastItem = null;
  const lines = fs.readFileSync(summaryPath, 'utf8').split(/\r?\n/);
  lines.forEach(function (line) {
    const groupMatch = line.match(/^###\s+(.+?)\s*$/);
    if (groupMatch) {
      current = { title: groupMatch[1], items: [] };
      groups.push(current);
      lastItem = null;
      return;
    }
    if (/^---\s*$/.test(line)) {
      current = null;
      lastItem = null;
      return;
    }
    const childMatch = line.match(/^ {2,}\*\s*\[(.+?)\]\(([^)]+?)\)/);
    if (childMatch && lastItem) {
      lastItem.children.push(parseEntry(childMatch[1], childMatch[2]));
      return;
    }
    const topMatch = line.match(/^\*\s*\[(.+?)\]\(([^)]+?)\)/);
    if (topMatch) {
      if (!current) {
        // `---` 之后的无名组
        current = { title: '', items: [] };
        groups.push(current);
      }
      lastItem = parseEntry(topMatch[1], topMatch[2]);
      current.items.push(lastItem);
    }
  });
  return groups;
}

/**
 * 从树收集渲染用章节（fileKey 去重、保持树序）。
 * @param {SummaryGroup[]} groups
 * @returns {Array<{fileKey: string, title: string}>}
 */
function collectChapters(groups) {
  /** @type {Record<string, boolean>} */
  const seen = {};
  /** @type {Array<{fileKey: string, title: string}>} */
  const chapters = [];
  groups.forEach(function (group) {
    group.items.forEach(function (item) {
      const key = fileKeyOf(item.file);
      if (!seen[key]) {
        seen[key] = true;
        chapters.push({ fileKey: key, title: item.title });
      }
      item.children.forEach(function (child) {
        const childKey = fileKeyOf(child.file);
        if (!seen[childKey]) {
          seen[childKey] = true;
          chapters.push({ fileKey: childKey, title: child.title });
        }
      });
    });
  });
  return chapters;
}

/**
 * md 文件名 → 路由 fileKey（去目录前缀与扩展名）。
 * @param {string} file
 * @returns {string}
 */
function fileKeyOf(file) {
  return path.basename(String(file).replace(/\\/g, '/')).replace(/\.md$/i, '');
}

/**
 * 标题 slug（供锚点）：小写、中文/字母/数字/连字符保留，其余折叠为 -。
 * 与页面内联脚本中的 slugify 保持一致。
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 解析图片相对路径：相对书源目录。
 * @param {string} src
 * @returns {string}
 */
function resolveAssetSrc(src) {
  return src.replace(/^\.\//, '').split('?')[0].split('#')[0];
}

/**
 * 复制被引用图片到 assets/，返回改写后的引用名（防重名冲突）。
 * devops 书重名时加书配置的 assetPrefix 前缀（devops-）。
 * @param {string} src md 中的原始引用
 * @param {{srcDir: string, assetPrefix: string}} book
 * @returns {string|null} 改写后的 ./assets/<文件名>，文件不存在时返回 null
 */
function copyAsset(src, book) {
  const rel = resolveAssetSrc(src);
  const srcDir = path.resolve(book.srcDir);
  const abs = path.resolve(book.srcDir, rel);
  // 目录包含校验：解析后的绝对路径必须仍以源目录为前缀（带分隔符，防兄弟目录同名前缀绕过），
  // 否则视为 `../` 逃逸引用，跳过该图片（不复制源目录之外的任意文件进产物）
  if (!abs.startsWith(srcDir + path.sep)) {
    console.warn('[build-docs-site] 跳过逃逸出源目录的图片引用: ' + src);
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return null;
  }
  if (assetNameBySrc[rel]) {
    return assetNameBySrc[rel];
  }
  let name = path.basename(rel);
  if (assetNameTaken[name]) {
    // 跨书/跨目录同名文件：优先用书前缀（devops-），再退回父目录名前缀
    const prefix = book.assetPrefix || path.basename(path.dirname(rel));
    name = prefix + name;
    let i = 1;
    while (assetNameTaken[name]) {
      name = prefix + i + '-' + path.basename(rel);
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
 * @returns {MdLike}
 */
function createRenderer() {
  const md = /** @type {MdLike} */ (new MarkdownIt({ html: false, linkify: false, typographer: false }));
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

  // 链接改写：站内 md 互链 -> #/<书>/<章节>(/锚点文字)；外链 -> 补 target=_blank
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const href = String(token.attrs[hrefIndex][1]);
      const rewritten = rewriteLink(href, env.book, env.chapter);
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
    if (srcIndex >= 0 && env.book) {
      const src = String(token.attrs[srcIndex][1]);
      const copied = copyAsset(src, env.book);
      token.attrs[srcIndex][1] = copied || src;
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  // 标题 slug：为章节内锚点生成稳定 id——加「书 key + 章节 fileKey」前缀防跨书/跨章
  // 同名标题撞 id（章内重名仍追加 -1/-2；页面内联脚本的 resolveAnchor 按同一前缀寻址）
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
    token.attrSet('id', env.book.key + '-' + env.chapter + '-' + slug);
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

/**
 * 还原 markdown-it 解析期 normalizeLink（encodeURI）造成的锚点转义，
 * 再由调用方按路由格式统一 encodeURIComponent。
 * @param {string} anchor
 * @returns {string}
 */
function decodeLinkAnchor(anchor) {
  try {
    return decodeURI(anchor);
  } catch (e) {
    return anchor;
  }
}

/**
 * md 互链改写规则：`documents/X.md#锚` / `X.md#锚` / `./X.md` → 对应书路由；
 * 本章锚点 `#xxx` → 当前书当前章节路由；外链照旧（含旧外网 openapi 收敛）。
 * @param {string} href
 * @param {Book} book 当前章节所属书
 * @param {string} chapter 当前章节 fileKey
 * @returns {{url: string, external: boolean}}
 */
function rewriteLink(href, book, chapter) {
  // 站内 md 互链：./xxx.md / xxx.md / documents/xxx.md / devops/xxx.md（可带 #锚点）
  const mdLink = href.match(
    /^\.?\/?(?:(?:\.\.\/)?(?:documents|devops)\/)?([\w-]+)\.md(?:#(.*))?$/i
  );
  if (mdLink) {
    const targetFile = mdLink[1];
    // 先按当前书解析（devops 书内的 index.md 应落在内网部署），再全局查书
    let targetBook = null;
    if (book && book.chapters.some(function (c) { return c.fileKey === targetFile; })) {
      targetBook = book;
    } else {
      // 运行态视图断言（纯类型）：全局查书需要 chapters（main 解析后才存在）
      targetBook = /** @type {Book[]} */ (BOOKS).find(function (b) {
        return b.chapters.some(function (c) { return c.fileKey === targetFile; });
      }) || null;
    }
    if (targetBook) {
      let url = '#/' + targetBook.key + '/' + targetFile;
      if (mdLink[2]) {
        url += '/' + encodeURIComponent(decodeLinkAnchor(mdLink[2]));
      }
      return { url: url, external: false };
    }
  }
  // 本章锚点：#xxx -> #/当前书/当前章节/xxx（避免污染顶层路由 hash）
  if (/^#[^/]/.test(href)) {
    const key = book ? book.key : BOOKS[0].key;
    return {
      url: '#/' + key + '/' + chapter + '/' + encodeURIComponent(decodeLinkAnchor(href.slice(1))),
      external: false
    };
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
 * @param {Book} book
 * @param {string} fileKey
 * @param {MdLike} md
 * @returns {string}
 */
function renderChapter(book, fileKey, md) {
  const file = path.join(book.srcDir, fileKey + '.md');
  const raw = fs.readFileSync(file, 'utf8');
  const env = { book: book, chapter: fileKey };
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
 * 侧栏单个导航项（章节项或章内锚点子项）。
 * @param {Book} book
 * @param {SummaryEntry} item
 * @param {boolean} isSub
 * @returns {string}
 */
function navItemHtml(book, item, isSub) {
  let route = book.key + '/' + fileKeyOf(item.file);
  if (item.anchor) {
    route += '/' + item.anchor;
  }
  const href = '#/' + route.split('/').map(encodeURIComponent).join('/');
  return (
    '<a class="nav-item' + (isSub ? ' nav-sub' : '') + '" href="' +
    escapeHtml(href) +
    '" data-route="' +
    escapeHtml(route) +
    '">' +
    escapeHtml(item.title) +
    '</a>'
  );
}

/**
 * 单本书的侧栏树（组 → 章节 → 章内锚点）。
 * @param {Book} book
 * @returns {string}
 */
function sidebarHtml(book) {
  return book.groups
    .map(function (group) {
      const items = group.items
        .map(function (item) {
          const children = item.children
            .map(function (child) {
              return navItemHtml(book, child, true);
            })
            .join('\n');
          return navItemHtml(book, item, false) + (children ? '\n' + children : '');
        })
        .join('\n');
      return (
        (group.title
          ? '<div class="nav-group-title">' + escapeHtml(group.title) + '</div>\n'
          : '') + items
      );
    })
    .join('\n');
}

/**
 * 组装最终单文件站点。
 * @returns {string}
 */
function buildSiteHtml() {
  // 页签清单只消费 key/label：接收者按 Pick<BookDef,'key'|'label'> 收窄（对 BOOKS 是合法
  // 上溯），不再把只含两字段的 OPENAPI_TAB 断言成 Book（缺多数必填字段的假陈述）。
  const tabs = /** @type {Array<Pick<BookDef, 'key' | 'label'>>} */ (BOOKS)
    .concat([OPENAPI_TAB])
    .map(function (tab) {
      return (
        '<a class="site-tab" href="#/' +
        encodeURIComponent(tab.key) +
        '" data-tab="' +
        escapeHtml(tab.key) +
        '">' +
        escapeHtml(tab.label) +
        '</a>'
      );
    })
    .join('\n');

  // 运行态视图断言（纯类型）：本函数只由 main() 在 groups/chapters 填充后调用
  const navs = /** @type {Book[]} */ (BOOKS).map(function (book) {
    return (
      '<nav class="book-nav" data-book="' +
      escapeHtml(book.key) +
      '">\n' +
      sidebarHtml(book) +
      '\n</nav>'
    );
  }).join('\n');

  // 同上：运行态视图断言（纯类型）
  const sections = /** @type {Book[]} */ (BOOKS).map(function (book) {
    return book.chapters
      .map(function (chapter) {
        return (
          '<section class="chapter" data-book="' +
          escapeHtml(book.key) +
          '" data-file="' +
          escapeHtml(chapter.fileKey) +
          '" hidden>' +
          chapter.html +
          '</section>'
        );
      })
      .join('\n');
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
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}
.site-titlebar {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
}
.site-titlebar .site-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2329;
}
.site-titlebar .site-version {
  margin-left: 12px;
  padding: 1px 10px;
  font-size: 12px;
  line-height: 20px;
  color: #3782eb;
  background: #eef4fe;
  border: 1px solid #c6dcfb;
  border-radius: 10px;
}
.site-tabs {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 24px;
}
.site-tab {
  margin-right: 40px;
  line-height: 43px;
  font-size: 15px;
  color: #666;
  text-decoration: none;
  border-bottom: 3px solid transparent;
}
.site-tab:hover { color: #3782eb; }
.site-tab.active {
  color: #3782eb;
  font-weight: 600;
  border-bottom-color: #3782eb;
}
.site-body { display: flex; height: 100%; padding-top: 103px; }
.site-nav {
  width: 280px;
  flex: none;
  border-right: 1px solid #e8e8e8;
  overflow-y: auto;
  padding: 16px 0 32px;
  background: #fafafa;
}
.site-nav.hidden { display: none; }
.book-nav[hidden] { display: none; }
.nav-group-title {
  padding: 12px 24px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  letter-spacing: 1px;
}
.nav-item {
  display: block;
  padding: 6px 24px 6px 24px;
  color: #4a4a4a;
  text-decoration: none;
  line-height: 22px;
  border-left: 3px solid transparent;
}
.nav-item:hover { color: #3782eb; }
.nav-item.active {
  color: #3782eb;
  border-left-color: #3782eb;
  font-weight: 600;
}
.nav-sub {
  padding-left: 44px;
  font-size: 13px;
  color: #7a7a7a;
}
.nav-sub.active { background: #fff; }
.site-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 64px;
}
.site-content.hidden { display: none; }
.openapi-frame {
  flex: 1;
  height: 100%;
  border: none;
}
.openapi-frame[hidden] { display: none; }
.openapi-frame iframe { width: 100%; height: 100%; border: none; display: block; }
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
  <div class="site-titlebar">
    <h1 class="site-title">YApi 使用文档</h1>
    <!-- 版本号来源：package.json（当前 ${SITE_VERSION}） -->
    <span class="site-version">${SITE_VERSION}</span>
  </div>
  <nav class="site-tabs">
${tabs}
  </nav>
</header>
<div class="site-body">
  <aside class="site-nav" id="siteNav">
${navs}
  </aside>
  <main class="site-content" id="siteContent">
${sections}
  </main>
  <div class="openapi-frame" id="openapiFrame" hidden>
    <iframe title="开放Api" src="about:blank"></iframe>
  </div>
</div>
<script>
(function () {
  var TABS = ${JSON.stringify(
    /** @type {Array<Pick<BookDef, 'key' | 'label'>>} */ (BOOKS)
      .concat([OPENAPI_TAB])
      .map(function (t) {
        return t.key;
      })
  )};
  var chapters = [].slice.call(document.querySelectorAll('.chapter'));
  var navItems = [].slice.call(document.querySelectorAll('.nav-item'));
  var tabs = [].slice.call(document.querySelectorAll('.site-tab'));
  var bookNavs = [].slice.call(document.querySelectorAll('.book-nav'));
  var siteNav = document.getElementById('siteNav');
  var content = document.getElementById('siteContent');
  var frameWrap = document.getElementById('openapiFrame');
  var frame = frameWrap ? frameWrap.querySelector('iframe') : null;

  function slugify(text) {
    return String(text)
      .trim()
      .toLowerCase()
      .replace(/[^\\p{L}\\p{N}-]+/gu, '-')
      .replace(/^-+|-+$/g, '');
  }

  function findSection(bookKey, fileKey) {
    for (var i = 0; i < chapters.length; i++) {
      var sec = chapters[i];
      if (sec.getAttribute('data-book') === bookKey &&
          sec.getAttribute('data-file') === fileKey) {
        return sec;
      }
    }
    return null;
  }

  function defaultSection(bookKey) {
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].getAttribute('data-book') === bookKey) {
        return chapters[i];
      }
    }
    return chapters[0] || null;
  }

  // 章内锚点：先按「书 key + 章节 fileKey 前缀 + slug」找 heading id（id 带双重前缀，
  // 跨书/跨章同名标题不会命中他书他章），找不到再按标题文字包含匹配
  // （SUMMARY 锚点文字与实际 heading 文字可能略有出入，如「mongodb集群」 vs「如何配置mongodb集群」）
  function resolveAnchor(section, text) {
    if (!section || !text) {
      return null;
    }
    var fileKey = section.getAttribute('data-file');
    var bookKey = section.getAttribute('data-book');
    var slug = slugify(text);
    var byId =
      slug && fileKey && bookKey ? document.getElementById(bookKey + '-' + fileKey + '-' + slug) : null;
    if (byId && section.contains(byId)) {
      return byId;
    }
    var headings = section.querySelectorAll('h1,h2,h3,h4,h5,h6');
    var needle = String(text).replace(/\\s+/g, '');
    if (!needle) {
      return null;
    }
    for (var i = 0; i < headings.length; i++) {
      // SUMMARY 锚点与实际标题可能仅空格差异（如「YApi接口JSON数据导入」vs「YApi 接口 JSON 数据导入」）
      if (headings[i].textContent.replace(/\\s+/g, '').indexOf(needle) > -1) {
        return headings[i];
      }
    }
    return null;
  }

  function activate(tab, file, anchor) {
    var known = TABS.indexOf(tab) > -1;
    if (!known) {
      // 旧版 #/章节 兼容：fileKey 落在教程书时按教程章节处理，否则回首页签
      if (findSection('${BOOKS[0].key}', tab)) {
        anchor = file || '';
        file = tab;
        tab = '${BOOKS[0].key}';
      } else {
        tab = TABS[0];
        file = '';
        anchor = '';
      }
    }
    var isFrame = tab === '${OPENAPI_TAB.key}';
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });
    if (isFrame) {
      // 开放Api：侧栏与章节隐藏，iframe 整页占满内容区（懒加载）
      siteNav.classList.add('hidden');
      bookNavs.forEach(function (n) { n.hidden = true; });
      chapters.forEach(function (sec) { sec.hidden = true; });
      content.classList.add('hidden');
      frameWrap.hidden = false;
      if (frame && frame.getAttribute('src') === 'about:blank') {
        frame.setAttribute('src', '/openapi-doc.html');
      }
      return;
    }
    frameWrap.hidden = true;
    if (frame && frame.getAttribute('src') !== 'about:blank') {
      frame.setAttribute('src', 'about:blank');
    }
    siteNav.classList.remove('hidden');
    content.classList.remove('hidden');
    bookNavs.forEach(function (n) {
      n.hidden = n.getAttribute('data-book') !== tab;
    });
    var sec = (file && findSection(tab, file)) || defaultSection(tab);
    chapters.forEach(function (s) {
      s.hidden = s !== sec;
    });
    if (sec) {
      var effFile = sec.getAttribute('data-file');
      var fullRoute = tab + '/' + effFile + (anchor ? '/' + anchor : '');
      var baseRoute = tab + '/' + effFile;
      navItems.forEach(function (item) {
        var r = item.getAttribute('data-route');
        var isSub = item.classList.contains('nav-sub');
        var isActive = r === fullRoute ||
          (anchor && !isSub && r === baseRoute) ||
          (!anchor && r === baseRoute);
        item.classList.toggle('active', isActive);
      });
      content.scrollTop = 0;
      if (anchor) {
        var target = resolveAnchor(sec, anchor);
        if (target && target.scrollIntoView) {
          target.scrollIntoView();
        }
      }
    }
  }

  function route() {
    var raw = location.hash || '';
    var decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch (e) {
      /* 保留原文 */
    }
    var m = decoded.match(/^#\\/([^\\/]+)(?:\\/([^\\/]+))?(?:\\/(.+))?$/);
    if (m) {
      activate(m[1], m[2] || '', m[3] || '');
    } else {
      activate(TABS[0], '', '');
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
  // 幂等：先清空输出目录再生成
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // 解析两本书的 SUMMARY 树并收集章节。本语句是初始化态 → 运行态的转换点：
  // 断言后的视图自此处起 groups/chapters 必已存在（纯类型断言，无运行时影响）。
  /** @type {Book[]} */ (BOOKS).forEach(function (book) {
    const summaryGroups = parseSummary(book.summary);
    book.groups = book.prependGroups.concat(summaryGroups);
    book.chapters = collectChapters(book.groups);
  });

  const md = createRenderer();
  /** @type {string[]} */
  const missing = [];
  // 运行态视图断言（纯类型）：紧接转换点之后，groups/chapters 必已填充
  /** @type {Book[]} */ (BOOKS).forEach(function (book) {
    book.chapters.forEach(function (chapter) {
      const file = path.join(book.srcDir, chapter.fileKey + '.md');
      if (!fs.existsSync(file)) {
        missing.push(book.key + '/' + chapter.fileKey);
        chapter.html = '';
        return;
      }
      chapter.html = renderChapter(book, chapter.fileKey, md);
    });
  });

  const html = buildSiteHtml();
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

  // 统计与报告（运行态视图断言，纯类型）
  /** @type {Book[]} */ (BOOKS).forEach(function (book) {
    const anchorCount = book.groups.reduce(function (sum, group) {
      return (
        sum +
        group.items.reduce(function (s, item) {
          return s + (item.anchor ? 1 : 0) + item.children.length;
        }, 0)
      );
    }, 0);
    console.log(
      '[build-docs-site] 书「' + book.key + '」: 组=' + book.groups.length +
        ' 章节文件=' + book.chapters.length +
        ' 锚点子项=' + anchorCount
    );
    book.groups.forEach(function (group) {
      const titles = group.items.map(function (item) {
        return item.title + (item.children.length ? '(' + item.children.length + '锚点)' : '');
      });
      console.log('    组[' + (group.title || '(无名)') + ']: ' + titles.join(' / '));
    });
  });
  const assetCount = Object.keys(assetNameBySrc).length;
  const size = fs.statSync(path.join(OUT_DIR, 'index.html')).size;
  console.log('[build-docs-site] 页签数:', BOOKS.length + 1, '(' + BOOKS.map(function (b) { return b.key; }).join('/') + '/' + OPENAPI_TAB.key + ')');
  console.log('[build-docs-site] 复制图片数:', assetCount);
  console.log('[build-docs-site] 输出:', path.join(OUT_DIR, 'index.html'), '(' + size + ' bytes)');

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

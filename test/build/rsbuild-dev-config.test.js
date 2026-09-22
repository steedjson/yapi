import test from 'ava';
import path from 'path';
import { loadConfig, createRsbuild } from '@rsbuild/core';

const repoRoot = path.resolve(__dirname, '../..');

// ava 环境变量为 NODE_ENV=test（ava.config.cjs），加载 rsbuild.config.mjs 即 dev 分支；
// loadConfig({ fresh: true }) 绕过 jiti 模块缓存，同进程内切换 NODE_ENV 可再次加载
// 生产分支。所有用例 serial，避免 NODE_ENV 互踩。

test.serial('dev 分支 loadConfig：rspack 改写存活，dev 专属键在位，分包交还工具', async t => {
  const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
  t.is(typeof content.tools.rspack, 'function', 'tools.rspack 改写在 dev 分支必须存活');
  t.truthy(content.server, 'dev 分支应包含 server 配置');
  t.truthy(content.html, 'dev 分支应包含 html 配置');
  t.truthy(content.dev, 'dev 分支应包含 dev 配置');
  t.false(
    content.plugins.some(plugin => plugin && plugin.name === 'yapi:dev-html-tag-order'),
    '阶段三起 html 注入顺序由 entrypoint 决定，不得再挂 5 段钉序插件'
  );
  t.deepEqual(
    Object.keys(content.source.entry),
    ['index'],
    '阶段三起 entry 仅保留真实应用入口 index（手工 vendor entry 已删除）'
  );
});

test.serial('生产分支 loadConfig：tools 仅 rspack 改写，dev 专属键完全不存在', async t => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
    t.is(typeof content.tools.rspack, 'function');
    t.is(content.tools.htmlPlugin, undefined, 'html 注入清单钩子已随手工 vendor entry 一并删除');
    t.is(content.server, undefined);
    t.is(content.html, undefined);
    t.is(content.dev, undefined);
    t.false(
      content.plugins.some(plugin => plugin && plugin.name === 'yapi:dev-html-tag-order'),
      '生产分支不得携带 dev 顺序插件'
    );
    t.deepEqual(
      Object.keys(content.source.entry),
      ['index'],
      '生产分支 entry 同样仅剩 index'
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});

// ---- dev 分支 bundler 配置：html 注入与 rspack 改写全在位 ----
// inspectConfig 只构建配置链不触发编译，dump 即最终 rspack 配置。
let cachedBundlerDump = null;

async function getDevBundlerDump() {
  if (cachedBundlerDump === null) {
    const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
    const rsbuild = await createRsbuild({ rsbuildConfig: content });
    const result = await rsbuild.inspectConfig({ writeToDisk: false });
    cachedBundlerDump = result.bundlerConfigs[0];
  }
  return cachedBundlerDump;
}

function extractHtmlIndexBlock(dump) {
  const start = dump.indexOf("/* config.plugin('html-index') */");
  if (start === -1) {
    return null;
  }
  const next = dump.indexOf('/* config.plugin', start + 10);
  return dump.slice(start, next > -1 ? next : undefined);
}

test.serial('dev html 注入声明为单一入口 index，chunk 清单由 entrypoint 运行时决定', async t => {
  const dump = await getDevBundlerDump();
  const block = extractHtmlIndexBlock(dump);
  t.truthy(block, 'dump 应包含 html-index 插件配置块');
  const chunksMatch = block.match(/chunks:\s*\[([^\]]*)\]/);
  t.truthy(chunksMatch, 'html-index 配置块应包含 chunks 数组');
  const chunks = Array.from(chunksMatch[1].matchAll(/'([^']+)'/g), match => match[1]);
  t.deepEqual(chunks, ['index'], 'html-rspack-plugin 按入口名注入 entrypoint 全量文件');
  t.falsy(/lib[23]?'/.test(chunksMatch[1]), '手工 vendor entry 名不得回流注入清单');
});

test.serial('dev 分包配置：splitChunks 交还工具默认规则，且无手工 vendor entry', async t => {
  const dump = await getDevBundlerDump();
  t.regex(dump, /splitChunks:\s*\{/, 'splitChunks 必须在位（分包交还构建工具）');
  t.false(dump.includes("'lib2'"), '配置不得再出现 lib2 手工 vendor entry');
  t.false(dump.includes("'lib3'"), '配置不得再出现 lib3 手工 vendor entry');
  t.regex(dump, /runtimeChunk:\s*\{\s*name:\s*'manifest'\s*\}/, 'runtimeChunk(manifest) 必须在位');
});

test.serial('dev bundler 配置：runtimeChunk/noParse/fallback/ProvidePlugin 全在位且编辑器 loader 已退役', async t => {
  const dump = await getDevBundlerDump();

  t.regex(dump, /runtimeChunk:\s*\{\s*name:\s*'manifest'\s*\}/, 'runtimeChunk(manifest) 必须在位');

  t.regex(dump, /noParse:[^,]*jsondiffpatch[^\n]*/, 'jsondiffpatch noParse 必须在位');

  const fallbackMatch = dump.match(/fallback:\s*\{([^}]*)\}/);
  t.truthy(fallbackMatch, 'rspack resolve.fallback 必须在位');
  const fallbackBlock = fallbackMatch[1];
  for (const key of ['https', 'vm', 'buffer', 'punycode']) {
    t.regex(fallbackBlock, new RegExp(`${key}:`), `fallback.${key} 必须在位`);
  }
  t.regex(fallbackBlock, /empty-module\.js/, 'https/vm 空模块垫片必须在位');

  t.regex(dump, /ProvidePlugin/, 'ProvidePlugin 必须在位');
  t.regex(dump, /setImmediate\.js/, 'setImmediate shim 必须在位');
  t.regex(dump, /Buffer:\s*\[\s*'buffer'/, 'ProvidePlugin Buffer 必须在位');

  // 批次 4（编辑器自研收官）：json-schema-editor-visual 依赖与作用域 loader 已删除，
  // 负向门禁防止其接线回流（回流 = antd3 全量样式重新进依赖图）。
  t.false(dump.includes('json-schema-css-scope-loader'), '退役的样式前缀化 loader 不得回流 bundler 配置');
  t.false(dump.includes('json-schema-editor-visual'), '退役的旧编辑器依赖不得回流 bundler 配置');
});

import test from 'ava';
import path from 'path';
import { loadConfig, createRsbuild } from '@rsbuild/core';

const repoRoot = path.resolve(__dirname, '../..');

// ava 环境变量为 NODE_ENV=test（ava.config.cjs），加载 rsbuild.config.mjs 即 dev 分支；
// loadConfig({ fresh: true }) 绕过 jiti 模块缓存，同进程内切换 NODE_ENV 可再次加载
// 生产分支。所有用例 serial，避免 NODE_ENV 互踩。

test.serial('dev 分支 loadConfig：tools 顶层合并后 rspack 改写与 htmlPlugin 并存', async t => {
  const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
  t.is(typeof content.tools.rspack, 'function', 'tools.rspack 改写在 dev 分支必须存活');
  t.is(typeof content.tools.htmlPlugin, 'function', 'dev 分支必须挂载 htmlPlugin 注入清单');
  t.truthy(content.server, 'dev 分支应包含 server 配置');
  t.truthy(content.html, 'dev 分支应包含 html 配置');
  t.truthy(content.dev, 'dev 分支应包含 dev 配置');
  t.true(
    content.plugins.some(plugin => plugin && plugin.name === 'yapi:dev-html-tag-order'),
    'dev 分支必须挂载注入顺序钉死插件'
  );
});

test.serial('生产分支 loadConfig：tools 仅 rspack 改写，dev 专属键完全不存在', async t => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { content } = await loadConfig({ cwd: repoRoot, fresh: true });
    t.is(typeof content.tools.rspack, 'function');
    t.true(
      content.tools.htmlPlugin === undefined,
      '生产分支不得携带 htmlPlugin 注入清单（避免污染阶段一产物契约）'
    );
    t.is(content.server, undefined);
    t.is(content.html, undefined);
    t.is(content.dev, undefined);
    t.false(
      content.plugins.some(plugin => plugin && plugin.name === 'yapi:dev-html-tag-order'),
      '生产分支不得携带 dev 顺序插件'
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});

// ---- dev 分支 bundler 配置：注入清单与 rspack 改写全在位 ----
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

test.serial('dev html 注入清单恰为 5 段且顺序 manifest→lib3→lib2→lib→index', async t => {
  const dump = await getDevBundlerDump();
  const block = extractHtmlIndexBlock(dump);
  t.truthy(block, 'dump 应包含 html-index 插件配置块');
  const chunksMatch = block.match(/chunks:\s*\[([^\]]*)\]/);
  t.truthy(chunksMatch, 'html-index 配置块应包含 chunks 数组');
  const chunks = Array.from(chunksMatch[1].matchAll(/'([^']+)'/g), match => match[1]);
  t.deepEqual(chunks, ['manifest', 'lib3', 'lib2', 'lib', 'index']);
  t.regex(block, /chunksSortMode:\s*'manual'/);
});

test.serial('dev bundler 配置：runtimeChunk/noParse/fallback/ProvidePlugin/样式前缀化 loader 全在位', async t => {
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

  t.regex(dump, /json-schema-css-scope-loader\.js/, 'json-schema 样式前缀化 loader 必须在位');
  t.regex(dump, /enforce:\s*'pre'/, '样式前缀化规则必须 enforce: pre');
});

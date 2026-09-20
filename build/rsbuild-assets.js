'use strict';

// Rsbuild 产物适配器（阶段一）：把 static/prd 下的 Rsbuild 产物转译为
// static/index.html 消费的 window.WEBPACK_ASSETS 形状，并补齐 .gz 预压缩。
//
// 形状契约（与 webpack AssetsPlugin + clientBuildConfig.normalizeAssets 输出逐键对齐）：
//   window.WEBPACK_ASSETS = {"manifest":{"js":...},"index.js":{"css":...,"js":...},
//     "lib":{"js":...},"lib2":{"js":...},"lib3":{"js":...},"group":{...},"project":{...},
//     "user":{...},"follows":{...},"add-project":{...}}
// - index 入口映射为 'index.js' 键（index.html 直读 WEBPACK_ASSETS['index.js']）；
// - 文件名为裸文件名（无 /prd/ 前缀），index.html 自行拼接 '/prd/'；
// - 键顺序与 webpack 版 assets.js 保持一致，便于 diff 审查。
// 注意: 本适配器按固定键序白名单输出, 白名单之外的 chunk 键会被静默忽略——
// 阶段三引入 chunkSplit 自动分包产生新 chunk 键时, 必须同步扩展键序白名单或改为动态枚举。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 与 webpack 生产命名 [name]@[contenthash] 对齐。rspack 默认 hashFunction 为
// xxhash64，即便模板写 [contenthash:20] 实际也只产出 16 位十六进制（digest 熵上限），
// 故 hash 段按 8~32 位宽松匹配；.LICENSE.txt sidecar 与 .gz 不会命中。
const CHUNK_FILE_RE = /^([a-z0-9-]+)@([0-9a-f]{8,32})\.(js|css)$/;

// WEBPACK_ASSETS 输出键顺序（index 特例映射后的最终键名）。
const ASSET_KEY_ORDER = [
  'manifest',
  'index.js',
  'lib',
  'lib2',
  'lib3',
  'group',
  'project',
  'user',
  'follows',
  'add-project'
];

// CompressionPlugin 语义对齐：原文件 >= 10KB 且 gzip 后体积/原体积 <= 0.8 才落 .gz。
const GZIP_THRESHOLD = 10240;
const GZIP_MIN_RATIO = 0.8;

/**
 * 扫描产物目录，按 chunk 名归集 js/css 文件名（裸文件名，无目录前缀）。
 * @param {string} distDir static/prd 绝对路径
 * @returns {Record<string, {js?: string, css?: string}>}
 */
function collectChunks(distDir) {
  const chunks = {};
  for (const name of fs.readdirSync(distDir)) {
    const match = CHUNK_FILE_RE.exec(name);
    if (!match) {
      continue;
    }
    const chunkName = match[1];
    const ext = match[3];
    if (!chunks[chunkName]) {
      chunks[chunkName] = {};
    }
    chunks[chunkName][ext] = name;
  }
  return chunks;
}

/**
 * 归集结果 -> WEBPACK_ASSETS 形状（含 index -> 'index.js' 映射与固定键顺序）。
 * 缺少任一已知 chunk 时抛错，保证静默缺产物不会上线。
 * @param {Record<string, {js?: string, css?: string}>} chunks collectChunks 的结果
 * @returns {Record<string, {js: string, css?: string}>}
 */
function buildWebpackAssets(chunks) {
  const normalized = {};
  for (const chunkName of Object.keys(chunks)) {
    const item = chunks[chunkName];
    const targetKey = chunkName === 'index' ? 'index.js' : chunkName;
    // css 在前、js 在后：与 webpack 版 assets.js 的键序一致，便于 diff 审查。
    const cleanItem = {};
    if (item.css) {
      cleanItem.css = item.css;
    }
    cleanItem.js = item.js;
    normalized[targetKey] = cleanItem;
  }
  const missing = ASSET_KEY_ORDER.filter(key => !normalized[key] || !normalized[key].js);
  if (missing.length) {
    throw new Error('Rsbuild 产物缺少预期 chunk: ' + missing.join(', '));
  }
  const ordered = {};
  for (const key of ASSET_KEY_ORDER) {
    ordered[key] = normalized[key];
  }
  return ordered;
}

/**
 * 从产物目录生成 static/prd/assets.js。
 * @param {string} distDir static/prd 绝对路径
 * @returns {Record<string, {js: string, css?: string}>} 写入的清单（供报告/测试复用）
 */
function writeAssetsJs(distDir) {
  const assets = buildWebpackAssets(collectChunks(distDir));
  fs.writeFileSync(path.join(distDir, 'assets.js'), 'window.WEBPACK_ASSETS = ' + JSON.stringify(assets));
  return assets;
}

/**
 * CompressionPlugin 的 minRatio/threshold 判定等价物。
 * @param {number} size 原文件字节数
 * @param {number} gzSize gzip 后字节数
 * @returns {boolean}
 */
function shouldGzip(size, gzSize) {
  return size >= GZIP_THRESHOLD && gzSize / size <= GZIP_MIN_RATIO;
}

/**
 * 为产物目录内全部 js/css 生成 .gz 配对（server/app.js 的静态改写依赖该命名）。
 * @param {string} distDir static/prd 绝对路径
 * @returns {{file: string, size: number, gzSize: number}[]} 生成 .gz 的文件清单
 */
function gzipDistFiles(distDir) {
  const written = [];
  for (const name of fs.readdirSync(distDir)) {
    if (!/\.(js|css)$/.test(name)) {
      continue;
    }
    const fullPath = path.join(distDir, name);
    const content = fs.readFileSync(fullPath);
    if (content.length < GZIP_THRESHOLD) {
      continue;
    }
    const gz = zlib.gzipSync(content, { level: zlib.constants.Z_BEST_COMPRESSION });
    if (!shouldGzip(content.length, gz.length)) {
      continue;
    }
    fs.writeFileSync(fullPath + '.gz', gz);
    written.push({ file: name, size: content.length, gzSize: gz.length });
  }
  return written;
}

/**
 * 产物尺寸报告行（供构建结束打印，与 webpack 版产物对比）。
 * @param {string} distDir static/prd 绝对路径
 * @returns {{file: string, size: number, gzSize?: number}[]}
 */
function listArtifactReport(distDir) {
  return fs
    .readdirSync(distDir)
    .filter(name => /\.(js|css)(\.gz)?$/.test(name) && !name.endsWith('.LICENSE.txt'))
    .sort()
    .map(name => {
      const size = fs.statSync(path.join(distDir, name)).size;
      return name.endsWith('.gz') ? { file: name, size, gzSize: size } : { file: name, size };
    });
}

module.exports = {
  CHUNK_FILE_RE,
  ASSET_KEY_ORDER,
  GZIP_THRESHOLD,
  GZIP_MIN_RATIO,
  collectChunks,
  buildWebpackAssets,
  writeAssetsJs,
  shouldGzip,
  gzipDistFiles,
  listArtifactReport
};

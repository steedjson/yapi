'use strict';

// Rsbuild 产物适配器（阶段一引入，阶段三演进为动态枚举）：把 static/prd 下的 Rsbuild
// 产物转译为 static/index.html 消费的 window.WEBPACK_ASSETS 形状，补齐 .gz 预压缩，
// 并写入初始 chunk 注入清单。
//
// 形状契约（与 webpack AssetsPlugin + clientBuildConfig.normalizeAssets 输出形状对齐）：
//   window.WEBPACK_ASSETS = {"manifest":{"js":...},"index.js":{"css":...,"js":...},
//     "<chunk>":{"js":...}, ...}
//   window.WEBPACK_INITIAL_CHUNKS = ["manifest", "<vendor chunk>", ..., "index.js"]
// - index 入口映射为 'index.js' 键（index.html 借 WEBPACK_INITIAL_CHUNKS 定位入口）；
// - 文件名为裸文件名（无 /prd/ 前缀），index.html 自行拼接 '/prd/'；
// - 键顺序：既有键序约定（ASSET_KEY_ORDER）在前，其余 chunk 键按字典序动态追加——
//   分包交还构建工具（splitChunks 自动 vendor）后 chunk 键不再静态可知，
//   不允许静默忽略任何 chunk（阶段一白名单模式的隐患，阶段三消除）。
// - WEBPACK_INITIAL_CHUNKS 为 rspack entrypoint 的执行顺序（runtime 置首、入口置尾，
//   vendor 居中，文件名列表见 rsbuild-standalone.mjs），static/index.html 依序注入
//   CSS link（head）与 script 标签（body 尾部），替代 webpack 时代手工 5 段硬编码。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 与 webpack 生产命名 [name]@[contenthash] 对齐。rspack 默认 hashFunction 为
// xxhash64，即便模板写 [contenthash:20] 实际也只产出 16 位十六进制（digest 熵上限），
// 故 hash 段按 8~32 位宽松匹配。chunk 名允许点/下划线/@/波浪号（splitChunks 自动
// vendor 分包产出 vendors-node_modules_xxx 等长名）。.LICENSE.txt sidecar 与 .gz
// 因结尾不符不命中。
const CHUNK_FILE_RE = /^([\w.@~-]+)@([0-9a-f]{8,32})\.(js|css)$/;

// 既有键序约定（仅约束相对顺序，不再是完备性白名单）：命中者按此顺序排前，
// 新增 chunk 键（含自动 vendor 分包产物）按字典序动态追加。
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

// 唯一硬性产物要求：应用入口（index -> 'index.js'）必须存在且含 js，
// 缺失即抛错，保证静默缺产物不会上线。
const ENTRY_ASSET_KEY = 'index.js';

// extractInitialChunkFiles 的目标入口名（与 rsbuild.config.mjs source.entry 一致）。
const APP_ENTRY_NAME = 'index';

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
    // 同名同扩展名冲突防御：同一 chunk 的同一扩展名只允许一个产物文件（如
    // contenthash 模板被误改导致残留旧 hash 产物、或构建器异常重复产出）。
    // 静默覆盖会让 assets.js 指向被丢弃的文件，白屏类故障必须在此显式失败。
    if (chunks[chunkName][ext]) {
      throw new Error(
        '产物存在同名同扩展名的冲突 chunk 文件: ' + chunks[chunkName][ext] + ' 与 ' + name
      );
    }
    chunks[chunkName][ext] = name;
  }
  return chunks;
}

/**
 * chunk 名 -> 清单键名（index 入口的 'index.js' 特例映射）。
 * @param {string} chunkName
 * @returns {string}
 */
function toAssetKey(chunkName) {
  return chunkName === 'index' ? ENTRY_ASSET_KEY : chunkName;
}

/**
 * 从构建 stats 提取应用入口的初始 chunk 文件有序清单（entrypoint 执行顺序：
 * runtime 置首、入口 chunk 置尾、vendor 居中；文件名口径）。
 * assets.js 按裸文件名消费，这里只保留 js/css 产物名（css 与 js 同 key 归集，
 * 注入侧经 WEBPACK_ASSETS[key].css 读取，顺序由本清单决定）。
 * 阶段四自 rsbuild-standalone.mjs 迁入：stats 入参可伪造，便于纯函数级测试。
 * @param {import('@rsbuild/core').RspackStats|undefined} stats
 * @returns {string[]}
 */
function extractInitialChunkFiles(stats) {
  const jsonStats = stats.toJson({ all: false, entrypoints: true });
  const entrypoint = jsonStats.entrypoints && jsonStats.entrypoints[APP_ENTRY_NAME];
  if (!entrypoint) {
    throw new Error('构建 stats 缺少入口 entrypoint: ' + APP_ENTRY_NAME);
  }
  const files = (entrypoint.files && entrypoint.files.length ? entrypoint.files : entrypoint.assets.map(
    asset => (typeof asset === 'string' ? asset : asset.name)
  )).filter(name => /\.(js|css)$/.test(name));
  if (!files.length) {
    throw new Error('入口 entrypoint 未包含任何 js/css 产物');
  }
  return files;
}

/**
 * 归集结果 -> WEBPACK_ASSETS 形状（含 index -> 'index.js' 映射与键序）。
 * 动态枚举全部 chunk 键，不做静默忽略；仅校验入口键与初始清单可解析。
 * @param {Record<string, {js?: string, css?: string}>} chunks collectChunks 的结果
 * @param {string[]} [initialChunkNames] 初始 chunk 名有序清单（entrypoint 顺序，
 *        chunk 名口径，如 ['manifest','vendors-x','index']；缺省视为仅入口）
 * @returns {{ assets: Record<string, {js: string, css?: string}>, initialChunks: string[] }}
 */
function buildWebpackAssets(chunks, initialChunkNames) {
  const normalized = {};
  for (const chunkName of Object.keys(chunks)) {
    const item = chunks[chunkName];
    const cleanItem = {};
    if (item.css) {
      cleanItem.css = item.css;
    }
    if (!item.js) {
      throw new Error('Rsbuild 产物 chunk 缺少 js 文件: ' + chunkName);
    }
    cleanItem.js = item.js;
    normalized[toAssetKey(chunkName)] = cleanItem;
  }
  if (!normalized[ENTRY_ASSET_KEY]) {
    throw new Error('Rsbuild 产物缺少应用入口 chunk: ' + ENTRY_ASSET_KEY);
  }

  const initialChunks = (initialChunkNames || ['index']).map(toAssetKey);
  const unresolvable = initialChunks.filter(key => !normalized[key]);
  if (unresolvable.length) {
    throw new Error(
      '初始 chunk 清单存在无法解析的键（assets.js 与 entrypoint 不一致）: ' + unresolvable.join(', ')
    );
  }

  const preferred = ASSET_KEY_ORDER.filter(key => normalized[key]);
  const appended = Object.keys(normalized)
    .filter(key => preferred.indexOf(key) === -1)
    .sort();
  const ordered = {};
  for (const key of preferred.concat(appended)) {
    ordered[key] = normalized[key];
  }
  return { assets: ordered, initialChunks };
}

/**
 * 从产物目录与 entrypoint 初始清单生成 static/prd/assets.js
 * （WEBPACK_ASSETS 清单 + WEBPACK_INITIAL_CHUNKS 注入顺序，双语句单文件）。
 * @param {string} distDir static/prd 绝对路径
 * @param {string[]} [initialChunkNames] 初始 chunk 名有序清单（chunk 名口径）
 * @returns {Record<string, {js: string, css?: string}>} 写入的清单（供报告/测试复用）
 */
function writeAssetsJs(distDir, initialChunkNames) {
  const { assets, initialChunks } = buildWebpackAssets(collectChunks(distDir), initialChunkNames);
  const content =
    'window.WEBPACK_ASSETS = ' +
    JSON.stringify(assets) +
    ';window.WEBPACK_INITIAL_CHUNKS = ' +
    JSON.stringify(initialChunks);
  fs.writeFileSync(path.join(distDir, 'assets.js'), content);
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
  ENTRY_ASSET_KEY,
  APP_ENTRY_NAME,
  GZIP_THRESHOLD,
  GZIP_MIN_RATIO,
  collectChunks,
  toAssetKey,
  extractInitialChunkFiles,
  buildWebpackAssets,
  writeAssetsJs,
  shouldGzip,
  gzipDistFiles,
  listArtifactReport
};

// Rsbuild 生产构建编排（阶段一）：对齐 build/webpack-standalone.js 的职责顺序——
// 清理旧产物 -> 生成客户端插件入口（client/plugin-module.js）-> Rsbuild 构建 ->
// 生成 assets.js（WEBPACK_ASSETS 兼容形状 + WEBPACK_INITIAL_CHUNKS 初始注入清单）->
// 补齐 .gz 预压缩 -> 产物报告。
// 退出码取决于构建/适配是否出错，供 CI 与 npm script 判定。
// 回滚：npm run build-client:webpack（旧 webpack 链原样保留）。注意: 旧链 assets.js 无
// WEBPACK_INITIAL_CHUNKS, 回滚必须连同 static/index.html 一起回退到旧版, 否则白屏。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRsbuild, loadConfig, logger } from '@rsbuild/core';

const require = createRequire(import.meta.url);

const buildDir = import.meta.dirname;
const root = path.resolve(buildDir, '..');

const paths = require('./paths.js');
const clientPluginModule = require('./clientPluginModule.js');
const rsbuildAssets = require('./rsbuild-assets.js');

const distDir = path.join(paths.root, 'static/prd');

// 唯一应用入口（阶段三起 entry 仅剩 index，见 rsbuild.config.mjs）。
const APP_ENTRY_NAME = 'index';

// 构建前清理旧产物，避免残留文件被误认为新产物。
function cleanOutput() {
  if (!fs.existsSync(distDir)) {
    return;
  }
  for (const name of fs.readdirSync(distDir)) {
    fs.rmSync(path.join(distDir, name), { recursive: true, force: true });
  }
}

/**
 * 从构建 stats 提取应用入口的初始 chunk 名有序清单（entrypoint 执行顺序：
 * runtime 置首、入口 chunk 置尾、vendor 居中；文件名口径）。
 * assets.js 按裸文件名消费，这里只保留 js 产物名（css 与 js 同 key 归集，
 * 注入侧经 WEBPACK_ASSETS[key].css 读取，顺序由本清单决定）。
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

async function main() {
  cleanOutput();

  // 插件发现与 client/plugin-module.js 生成（与 webpack 配置加载期的 initPlugins 等价，
  // 必须在构建前执行）。
  clientPluginModule.initPlugins(root);

  const { content: rsbuildConfig } = await loadConfig({ cwd: root });
  const rsbuild = await createRsbuild({ rsbuildConfig: rsbuildConfig });
  const { stats, close } = await rsbuild.build();
  if (close) {
    await close();
  }

  const hasErrors = stats ? stats.hasErrors() : true;
  if (hasErrors) {
    logger.error('Rsbuild 构建失败，跳过 assets.js/.gz 适配步骤。');
    process.exitCode = 1;
    return;
  }

  // 产物适配：从 stats entrypoint 读取初始 chunk 清单（阶段三分包交还工具后不再静态
  // 可知），assets.js 形状/清单一致性校验失败会抛错并以非零码退出。
  const initialFiles = extractInitialChunkFiles(stats);
  logger.info('入口初始产物（entrypoint 顺序）: ' + initialFiles.join(', '));
  const initialChunkNames = initialFiles
    .filter(name => name.endsWith('.js'))
    .map(name => name.replace(/@[0-9a-f]{8,32}\.js$/, ''));
  const assets = rsbuildAssets.writeAssetsJs(distDir, initialChunkNames);
  const gzFiles = rsbuildAssets.gzipDistFiles(distDir);

  logger.info('Webpack 兼容清单 assets.js 已生成，chunk 键: ' + Object.keys(assets).join(', '));
  logger.info('初始注入顺序（WEBPACK_INITIAL_CHUNKS）: ' + initialChunkNames.join(' -> '));
  logger.info(`已生成 .gz 配对 ${gzFiles.length} 份（>=10KB 且压缩比 <=0.8 才落盘）。`);
  logger.info('产物清单（字节）：');
  for (const item of rsbuildAssets.listArtifactReport(distDir)) {
    const sizeText = item.gzSize !== undefined ? `${item.size} (gz ${item.gzSize})` : `${item.size}`;
    logger.info(`  ${item.file}  ${sizeText}`);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

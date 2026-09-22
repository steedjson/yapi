// Rsbuild 生产构建编排（阶段一）：清理旧产物 -> 生成客户端插件入口（client/plugin-module.js）
// -> Rsbuild 构建 -> 生成 assets.js（WEBPACK_ASSETS 兼容形状 + WEBPACK_INITIAL_CHUNKS
// 初始注入清单）-> 补齐 .gz 预压缩 -> 产物报告。
// 退出码取决于构建/适配是否出错，供 CI 与 npm script 判定。
// 回滚点（阶段四起）：旧 webpack 链（npm run build-client:webpack）已随阶段四删除，
// 本批之后的回滚 = git revert 本批之前的提交（webpack 依赖、build/webpack-* 脚本与
// static/index.html 注入逻辑一并还原，缺一不可，否则 assets.js 与 index.html 契约错配白屏）。
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
 * 从构建 stats 提取应用入口的初始 chunk 文件有序清单。
 * 实现迁于 build/rsbuild-assets.js（阶段四，stats 入参可伪造便于纯函数级测试），
 * 此处保留同名转发以维持本编排模块的调用面不变。
 * @param {import('@rsbuild/core').RspackStats|undefined} stats
 * @returns {string[]}
 */
const extractInitialChunkFiles = rsbuildAssets.extractInitialChunkFiles;

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
  // 批次 2（首屏性能优化）：.gz 旁并列生成 .br（level 11，判定独立 ratio<=0.9），
  // server/app.js 按 Accept-Encoding 协商、gzip 永远兜底。
  const brFiles = rsbuildAssets.brotliDistFiles(distDir);

  logger.info('Webpack 兼容清单 assets.js 已生成，chunk 键: ' + Object.keys(assets).join(', '));
  logger.info('初始注入顺序（WEBPACK_INITIAL_CHUNKS）: ' + initialChunkNames.join(' -> '));
  logger.info(`已生成 .gz 配对 ${gzFiles.length} 份（>=10KB 且压缩比 <=0.8 才落盘）。`);
  logger.info(`已生成 .br 配对 ${brFiles.length} 份（>=10KB 且压缩比 <=0.9 才落盘，level 11）。`);
  logger.info('产物清单（字节，原始行为 raw (gz …) (br …) 双轨传输量）：');
  for (const item of rsbuildAssets.listArtifactReport(distDir)) {
    const parts = [`${item.size}`];
    if (item.gzSize !== undefined) parts.push(`gz ${item.gzSize}`);
    if (item.brSize !== undefined) parts.push(`br ${item.brSize}`);
    logger.info(`  ${item.file}  ${parts.join(' / ')}`);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

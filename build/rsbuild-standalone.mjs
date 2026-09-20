// Rsbuild 生产构建编排（阶段一）：对齐 build/webpack-standalone.js 的职责顺序——
// 清理旧产物 -> 生成客户端插件入口（client/plugin-module.js）-> Rsbuild 构建 ->
// 生成 assets.js（WEBPACK_ASSETS 兼容形状）-> 补齐 .gz 预压缩 -> 产物报告。
// 退出码取决于构建/适配是否出错，供 CI 与 npm script 判定。
// 回滚：npm run build-client:webpack（旧 webpack 链原样保留）。
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

// 与现有 YKit/webpack 链一致，构建前清理旧产物，避免残留文件被误认为新产物。
function cleanOutput() {
  if (!fs.existsSync(distDir)) {
    return;
  }
  for (const name of fs.readdirSync(distDir)) {
    fs.rmSync(path.join(distDir, name), { recursive: true, force: true });
  }
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

  // 产物适配：assets.js 形状校验失败会抛错并以非零码退出。
  const assets = rsbuildAssets.writeAssetsJs(distDir);
  const gzFiles = rsbuildAssets.gzipDistFiles(distDir);

  logger.info('Webpack 兼容清单 assets.js 已生成，chunk 键: ' + Object.keys(assets).join(', '));
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

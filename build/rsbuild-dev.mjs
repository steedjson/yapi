// Rsbuild dev server 编排（阶段二：npm run dev-client 切换，见 docs/rsbuild-migration-plan.md）。
// 先做插件发现与 client/plugin-module.js 生成（构建前副作用），再 loadConfig
// 启动 Rsbuild dev server（端口 4000，代理/静态/回退语义见 rsbuild.config.mjs dev 分支与
// build/rsbuild-dev-server.js）。
// 回滚点（阶段四起）：旧 webpack dev 链（npm run dev-client:webpack /
// dev-client-standalone）已随阶段四删除，回滚 = git revert 本批之前的提交
// （生产回滚另需连同 static/index.html 一并还原，见 rsbuild-standalone.mjs 头注释）。
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRsbuild, loadConfig } from '@rsbuild/core';

const require = createRequire(import.meta.url);

const root = path.resolve(import.meta.dirname, '..');
const clientPluginModule = require('./clientPluginModule.js');

async function main() {
  // 必须在 loadConfig 之前：source.entry 引用 client/plugin-module.js（内联插件注册表）。
  clientPluginModule.initPlugins(root);

  const { content: rsbuildConfig } = await loadConfig({ cwd: root });
  const rsbuild = await createRsbuild({ rsbuildConfig: rsbuildConfig });
  // startDevServer 会完成监听并保持进程存活（等价旧链 server.listen 的前台语义）。
  await rsbuild.startDevServer();
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

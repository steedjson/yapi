'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const config = require('./webpack.standalone.config');

// babel-loader@6 依赖 webpack 2/3 的 loaderContext.options 获取 babel 配置，
// webpack 4 已从 loader context 移除该属性；5 行兼容 shim 将 compiler.options
// 挂回 loaderContext，保持 babel-loader@6 不升级（避免同时变更 Babel 核心）。
function makeBabelLoader6Compatible(compiler) {
  compiler.hooks.compilation.tap('BabelLoader6Compat', compilation => {
    compilation.hooks.normalModuleLoader.tap('BabelLoader6Compat', loaderContext => {
      loaderContext.options = compiler.options;
    });
  });
}

function cleanOutput() {
  const outputPath = config.output.path;
  if (!fs.existsSync(outputPath)) return;
  fs.readdirSync(outputPath).forEach(name => {
    fs.rmSync(path.join(outputPath, name), { recursive: true, force: true });
  });
}

// 与现有 YKit pack -m 一致，构建前清理旧产物，避免残留文件被误认为新产物。
cleanOutput();

const compiler = webpack(config);
makeBabelLoader6Compatible(compiler);
compiler.run((error, stats) => {
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
    return;
  }
  console.log(stats.toString({ colors: true, chunks: false, modules: false }));
  if (stats.hasErrors()) process.exitCode = 1;
});

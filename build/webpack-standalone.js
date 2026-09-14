'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const config = require('./webpack.standalone.config');

function cleanOutput() {
  const outputPath = config.output.path;
  if (!fs.existsSync(outputPath)) return;
  fs.readdirSync(outputPath).forEach(name => {
    fs.rmSync(path.join(outputPath, name), { recursive: true, force: true });
  });
}

// 与现有 YKit pack -m 一致，构建前清理旧产物，避免残留文件被误认为新产物。
cleanOutput();

// webpack 5 的 compiler.run 仍接受回调；结束后调用 compiler.close 释放缓存等资源，
// 保证进程干净退出（退出码取决于构建错误，见下）。
const compiler = webpack(config);
compiler.run((error, stats) => {
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
    compiler.close(() => {});
    return;
  }
  console.log(stats.toString({ colors: true, chunks: false, modules: false }));
  if (stats.hasErrors()) process.exitCode = 1;
  compiler.close(closeError => {
    if (closeError) console.error(closeError);
  });
});

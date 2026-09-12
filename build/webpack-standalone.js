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

webpack(config, (error, stats) => {
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
    return;
  }
  console.log(stats.toString({ colors: true, chunks: false, modules: false }));
  if (stats.hasErrors()) process.exitCode = 1;
});

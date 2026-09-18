// @ts-check
const path = require('path');
const fs = require('fs-extra');
// server/config.js 是不入库的运行时配置文件（本检出中不存在）；TS 环境模块声明
// 对相对路径导入不生效，故用 @ts-ignore 抑制 TS2307（config.js 存在时自动成为空操作）。
// @ts-ignore
const config = require('../config.js');

let runtimePath = config.runtime_path;
fs.ensureDirSync(runtimePath);
fs.ensureDirSync(path.join(runtimePath, 'log'));
let configPath = path.join(runtimePath, 'config.json');

fs.writeFileSync(configPath,
  JSON.stringify(config, null, '\t'),
  { encoding: 'utf8' }
);
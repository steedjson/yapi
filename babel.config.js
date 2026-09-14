// Babel 7 全局配置（单一来源）：客户端构建（babel-loader@8 自动读取）与
// 测试（@babel/register）共用。
// 注意：保持 modules: 'commonjs'，确保 common/ 目录下混用的 exports.xxx / require 正常转译，
// 避免 webpack 把包含 @babel/runtime 导入的文件当作 ESM 模块导致 exports is not defined。
module.exports = function (api) {
  const isTest = api.env('test');

  const presets = [
    [
      '@babel/preset-env',
      isTest
        ? { loose: true, targets: { node: 'current' }, modules: 'commonjs' }
        : { loose: true, targets: { ie: 11 }, modules: 'commonjs' }
    ],
    '@babel/preset-react'
  ];

  const plugins = [
    '@babel/plugin-transform-runtime',
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['babel-plugin-import', { libraryName: 'antd' }]
  ];

  return { presets, plugins };
};

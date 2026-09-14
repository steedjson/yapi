// Babel 7 全局配置（单一来源）：客户端构建（babel-loader@8 自动读取）与
// 测试（@babel/register）共用。测试环境转 commonjs 供 require 使用，
// 客户端保持 ESM 交给 webpack 处理；targets ie:11 对齐旧 es2015 预设的 ES5 输出。
module.exports = function (api) {
  const isTest = api.env('test');

  const presets = [
    [
      '@babel/preset-env',
      isTest
        ? { loose: true, targets: { node: 'current' }, modules: 'commonjs' }
        : { loose: true, targets: { ie: 11 } }
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

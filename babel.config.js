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
        ? {
            loose: true,
            targets: { node: 'current' },
            modules: 'commonjs',
            // rewire 的 __set__ 依赖 var 形态的模块内变量，测试管线强制 const 降级
            include: ['@babel/plugin-transform-block-scoping']
          }
        : {
            loose: true,
            targets: { ie: 11 },
            modules: 'commonjs',
            // 排除 dynamic import 转译：保留原生 import() 语法供 webpack 5 识别为
            // 分包点（路由级代码分割）；test 环境保持 commonjs（ava 依赖 require）
            exclude: ['proposal-dynamic-import']
          }
    ],
    '@babel/preset-react'
  ];

  const plugins = [
    '@babel/plugin-transform-runtime',
    ['@babel/plugin-proposal-decorators', { legacy: true }]
  ];

  return { presets, plugins };
};

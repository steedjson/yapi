'use strict';

const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const AssetsPlugin = require('assets-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const packageInfo = require('../package.json');
const yapi = require('../server/yapi');
const clientBuildConfig = require('./clientBuildConfig');
const clientPluginModule = require('./clientPluginModule');

// standalone 入口复用插件发现逻辑，但不加载 YKit 配置文件。
clientPluginModule.initPlugins(path.resolve(__dirname, '..'));

const root = path.resolve(__dirname, '..');
const client = path.join(root, 'client');
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

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

const config = {
  mode: isProduction ? 'production' : 'development',
  context: client,
  entry: {
    index: [ ...(isDevelopment ? ['webpack-hot-middleware/client?path=/__webpack_hmr&reload=true'] : []), './index.js' ],
    lib: ['react', 'react-dom', 'redux', 'redux-promise', 'react-router', 'react-router-dom', 'prop-types', 'react-dnd-html5-backend', 'react-dnd', 'reactabular-table', 'reactabular-dnd', 'table-resolver'],
    lib2: ['brace', 'json5', 'url', 'axios'],
    lib3: ['mockjs', 'moment', 'recharts']
  },
  devtool: isProduction ? false : 'cheap-module-source-map',
  output: {
    path: path.join(root, 'static/prd'),
    publicPath: isDevelopment ? '/prd/' : '',
    filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js',
    // webpack 4 下使用 runtimeChunk 后，index 等 entry chunk 的运行时被移入
    // manifest，其文件改走 chunkFilename；需按 [name] 命名以保持原产物文件名
    // （webpack 3 下 entry chunk 走 output.filename，不受此影响）。
    chunkFilename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.css', '.json', '.string', '.tpl'],
    alias: {
      client,
      common: path.join(root, 'common'),
      exts: path.join(root, 'exts')
    }
  },
  module: {
    noParse: /node_modules\/jsondiffpatch\/public\/build\/.*js/,
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: clientBuildConfig.getPluginExclude(process.platform === 'win32'),
        loader: 'babel-loader',
        query: clientBuildConfig.getBabelQuery()
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader?sourceMap']
      },
      {
        test: /\.less$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader?sourceMap', 'less-loader?sourceMap']
      },
      {
        test: /\.(sass|scss)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader?sourceMap', 'sass-loader?sourceMap']
      },
      {
        test: /.(gif|jpg|jpeg|png|woff|woff2|eot|ttf|svg)$/,
        loader: 'url-loader',
        options: { limit: 8192, name: '[path][name].[ext]?[sha256#base64:8]' }
      }
    ]
  },
  optimization: {
    runtimeChunk: { name: 'manifest' },
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        lib3: {
          test: /[\\/]node_modules[\\/](mockjs|moment|recharts)[\\/]/,
          name: 'lib3',
          chunks: 'initial',
          priority: 30,
          // 绕过 webpack 4 的 minSize/maxInitialRequests 限制，保证固定 vendor 分组
          // （index 入口需要 manifest+lib3+lib2+lib 共 4 个伴随 chunk）不被默认值阻断。
          enforce: true,
          // split 后 chunk 不再是 entry chunk，需显式指定文件名模板，
          // 否则生产模式会退回 chunkFilename（[id]@...）产出数字文件名。
          filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js'
        },
        lib2: {
          test: /[\\/]node_modules[\\/](brace|json5|url|axios)[\\/]/,
          name: 'lib2',
          chunks: 'initial',
          priority: 20,
          enforce: true,
          filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js'
        },
        lib: {
          // 排除 CSS 类资源，样式必须全部留在 index chunk：
          // dev.html 与 static/index.html 只引用 index 的 CSS，多出的 lib*.css 不会被加载。
          test: module => {
            const resource = module.resource || '';
            return /[\\/]node_modules[\\/]/.test(resource) && !/\.(css|less|sass|scss)$/.test(resource);
          },
          name: 'lib',
          chunks: 'initial',
          priority: 10,
          enforce: true,
          filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js'
        },
        // 关闭 webpack 4 默认注入的 vendors cacheGroup，避免把已分好组的
        // node_modules 模块再次拆出 vendors~* 杂散 chunk。
        vendors: false,
        default: { minChunks: 2, priority: -20, reuseExistingChunk: true }
      }
    }
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: isDevelopment ? '[name]@dev.css' : '[name]@[contenthash].css'
    }),
    ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin()] : []),
    new webpack.DefinePlugin(
      clientBuildConfig.getDefineValues(packageInfo, yapi.WEBCONFIG, isProduction ? 'prd' : 'dev')
    ),
    ...(isProduction ? [
      new AssetsPlugin({
        filename: 'static/prd/assets.js',
        processOutput: assets => {
          return 'window.WEBPACK_ASSETS = ' + JSON.stringify(clientBuildConfig.normalizeAssets(assets));
        }
      }),
      new CompressionPlugin({
        // cwp@1.1.12 peer 支持 webpack 2/3/4；ykit legacy 同样使用此版本（旧 .asset API）。
        asset: '[path].gz[query]',
        algorithm: 'gzip',
        test: /\.(js|css)$/,
        threshold: 10240,
        minRatio: 0.8
      }),
      new webpack.ContextReplacementPlugin(/moment[\\/]locale$/, /^\.\/(zh-cn|en-gb)$/)
    ] : [])
  ]
};

module.exports = config;

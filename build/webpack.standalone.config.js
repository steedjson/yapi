'use strict';

const path = require('path');
const webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
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

module.exports = {
  context: client,
  entry: {
    index: [ ...(isDevelopment ? ['webpack-hot-middleware/client?path=/__webpack_hmr&reload=true'] : []), './index.js' ],
    lib: ['react', 'react-dom', 'redux', 'redux-promise', 'react-router', 'react-router-dom', 'prop-types', 'react-dnd-html5-backend', 'react-dnd', 'reactabular-table', 'reactabular-dnd', 'table-resolver'],
    lib2: ['brace', 'json5', 'url', 'axios'],
    lib3: ['mockjs', 'moment', 'recharts']
  },
  devtool: isProduction ? false : 'cheap-module-eval-source-map',
  output: {
    path: path.join(root, 'static/prd'),
    publicPath: isDevelopment ? '/prd/' : '',
    filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js',
    chunkFilename: isDevelopment ? '[id]@dev.js' : '[id]@[chunkhash].js'
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
    loaders: [
      {
        test: /\.(js|jsx)$/,
        exclude: clientBuildConfig.getPluginExclude(process.platform === 'win32'),
        loader: 'babel-loader',
        query: clientBuildConfig.getBabelQuery()
      },
      {
        test: /\.json$/,
        loader: 'json-loader'
      },
      {
        test: /\.css$/,
        loader: ExtractTextPlugin.extract({ fallback: 'style-loader', use: 'css-loader?sourceMap' })
      },
      {
        test: /\.less$/,
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: 'css-loader?sourceMap!less-loader?sourceMap'
        })
      },
      {
        test: /\.(sass|scss)$/,
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: 'css-loader?sourceMap!sass-loader?sourceMap'
        })
      },
      {
        test: /.(gif|jpg|jpeg|png|woff|woff2|eot|ttf|svg)$/,
        loader: 'url-loader',
        options: { limit: 8192, name: '[path][name].[ext]?[sha256#base64:8]' }
      }
    ]
  },
  plugins: [
    new ExtractTextPlugin(isDevelopment ? '[name]@dev.css' : '[name]@[contenthash].css'),
    new webpack.optimize.CommonsChunkPlugin({
      names: ['lib3', 'lib2', 'lib'],
      // 限定抽取只发生在 lib 内部，避免把 index 与 lib3 共享的模块
      // （如 react/prop-types）抽进 lib2，导致 lib3 在 HTML 脚本顺序中
      // 先于 lib/lib2 执行时缺少依赖而白屏。
      chunks: ['lib'],
      filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js'
    }),
    new webpack.optimize.CommonsChunkPlugin({
      name: 'manifest',
      filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js',
      // 把 webpack runtime 依赖的 buildin polyfill（如 webpack/buildin/module.js）
      // 抽进最先加载的 manifest chunk，避免后续 chunk 依赖它时出现
      // "__webpack_require__(...) is not a function" 的加载顺序问题。
      minChunks: function(module) {
        return module.resource && /[\\/]node_modules[\\/]webpack[\\/]buildin[\\/]/.test(module.resource);
      }
    }),
    ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin()] : []),
    new webpack.DefinePlugin(
      clientBuildConfig.getDefineValues(packageInfo, yapi.WEBCONFIG, isProduction ? 'prd' : 'dev')
    ),
    ...(isProduction ? [
      new webpack.optimize.UglifyJsPlugin({ compress: { warnings: false } }),
      new AssetsPlugin({
        filename: 'static/prd/assets.js',
        processOutput: assets => {
          return 'window.WEBPACK_ASSETS = ' + JSON.stringify(clientBuildConfig.normalizeAssets(assets));
        }
      }),
      new CompressionPlugin({
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

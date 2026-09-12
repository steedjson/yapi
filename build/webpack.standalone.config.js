'use strict';

const path = require('path');
const webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const AssetsPlugin = require('assets-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const packageInfo = require('../package.json');
const yapi = require('../server/yapi');
const clientBuildConfig = require('./clientBuildConfig');

// 第一阶段 standalone 入口只替换 YKit 编排，继续使用现有 Webpack 2 和插件版本。
require('../ykit.config');

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
      name: ['lib3', 'lib2', 'lib', 'manifest'],
      filename: isDevelopment ? '[name]@dev.js' : '[name]@[chunkhash].js',
      minChunks: 2
    }),
    ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin()] : []),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'dev'),
      'process.env.version': JSON.stringify(packageInfo.version),
      'process.env.versionNotify': yapi.WEBCONFIG.versionNotify,
      'process.env.scriptEnable': JSON.stringify(yapi.WEBCONFIG.scriptEnable === true)
    }),
    ...(isProduction ? [
      new webpack.optimize.UglifyJsPlugin({ compress: { warnings: false } }),
      new AssetsPlugin({
        filename: 'static/prd/assets.js',
        processOutput: assets => 'window.WEBPACK_ASSETS = ' + JSON.stringify(assets)
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

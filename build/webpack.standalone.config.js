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

// mini-css-extract-plugin@0.9 不支持 filename 传函数，无法按 chunk 名切换命名模板。
// 皮肤主题(theme-*)需要无 contenthash 的固定文件名供运行时按皮肤名拼 URL 注入 link，
// 故在 emit 阶段把 `theme-*@[contenthash].css` 重命名为 `theme-*@prd.css`
// (开发模式产物本身就是固定的 `[name]@dev.css`，无需处理)。
// AssetsPlugin/CompressionPlugin 排在其后注册，产出的 assets.js 与 .gz 均基于重命名结果。
const THEME_CSS_RE = /^(theme-[a-z]+)@[^@]+\.css$/;
class ThemeCssFixedNamePlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('ThemeCssFixedNamePlugin', compilation => {
      Object.keys(compilation.assets).forEach(name => {
        const matched = name.match(THEME_CSS_RE);
        if (!matched) return;
        const fixed = matched[1] + '@prd.css';
        if (name !== fixed) {
          compilation.assets[fixed] = compilation.assets[name];
          delete compilation.assets[name];
        }
      });
    });
  }
}

const paths = require('./paths');
const root = paths.root;
const client = paths.client;
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

const config = {
  mode: isProduction ? 'production' : 'development',
  context: client,
  entry: {
    index: [ ...(isDevelopment ? ['webpack-hot-middleware/client?path=/__webpack_hmr&reload=true'] : []), './index.js' ],
    lib: ['react', 'react-dom', 'redux', 'redux-promise', 'react-router', 'react-router-dom', 'prop-types', 'react-dnd-html5-backend', 'react-dnd', 'reactabular-table', 'reactabular-dnd', 'table-resolver'],
    lib2: ['brace', 'json5', 'url', 'axios'],
    lib3: ['mockjs', 'moment', 'recharts'],
    // 皮肤预编译主题:纯 less 入口,产物为固定名 CSS(无 contenthash),由 client/theme.js
    // 运行时按需注入 <link id="skin-theme-link"> 加载。
    'theme-gov': './styles/themes/gov.less',
    'theme-anime': './styles/themes/anime.less',
    'theme-dark': './styles/themes/dark.less'
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
      common: paths.common,
      exts: paths.exts
    }
  },
  module: {
    noParse: /node_modules\/jsondiffpatch\/public\/build\/.*js/,
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: clientBuildConfig.getPluginExclude(process.platform === 'win32'),
        loader: 'babel-loader',
        // 只走根目录 babel.config.js（babel 7）；.babelrc 是 ava/babel-register
        // 测试管线的 babel 6 专用配置，客户端构建必须显式排除。
        query: { cacheDirectory: true, babelrc: false, configFile: true }
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
    // terser 默认走 worker-farm 多进程压缩，antd 3.26 全量 less 重算后子进程会
    // 僵死（0% CPU 挂起 35 分钟+），固定单进程串行压缩（实测 25s 完成）。
    minimizer: [new (require('terser-webpack-plugin'))({ parallel: false, cache: true })],
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
        default: {
          // 样式模块不参与 default 共享拆分：theme-* 入口与 index 共享 antd less 模块，
          // 若被 default 组(minChunks:2)抽出会生成 index~theme-* 的 CSS chunk，
          // 导致 index.css 丢失 antd 样式且页面无引用来源。排除样式后样式一律留在
          // 所属入口 chunk(index.css 与 theme-*.css 各自完整，行为与单入口时代一致)；
          // 对 JS 模块无影响(等价于原先的无 test)。
          test: module => {
            const resource = module.resource || '';
            return !/\.(css|less|sass|scss)$/.test(resource);
          },
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true
        }
      }
    }
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: isDevelopment ? '[name]@dev.css' : '[name]@[contenthash].css'
    }),
    ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin()] : []),
    ...(isProduction ? [new ThemeCssFixedNamePlugin()] : []),
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

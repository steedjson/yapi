'use strict';

const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const AssetsPlugin = require('assets-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const packageInfo = require('../package.json');
const yapi = require('../server/yapi');
const clientBuildConfig = require('./clientBuildConfig');
const clientPluginModule = require('./clientPluginModule');

// standalone 入口复用插件发现逻辑，但不加载 YKit 配置文件。
clientPluginModule.initPlugins(path.resolve(__dirname, '..'));

const paths = require('./paths');
const root = paths.root;
const client = paths.client;
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// mini-css-extract-plugin@2：其余 CSS 保持 [name]@[contenthash].css。
// (开发模式产物本身是固定的 `[name]@dev.css`，无需区分。)
// AssetsPlugin/CompressionPlugin 排在其后注册，产出的 assets.js 与 .gz 均基于最终文件名。

const config = {
  mode: isProduction ? 'production' : 'development',
  context: client,
  // webpack 5 禁止 cacheGroup 与 entry 同名拆分（SplitChunksPlugin 的 conflict 检查，
  // webpack < 5 的 entry+cacheGroup 同名 vendor 模式已被官方移除；官方迁移路径为
  // dependOn entry vendor 或删除 entry——后者被项目约束禁止）。
  // 故采用 dependOn 链：lib(react 系,根) ← lib2 ← lib3 ← index。dependOn 使被依赖
  // entry 的模块对下游 entry 去重共享（实测 react-dom/lodash 仅存在于 lib chunk，
  // dayjs 仅存在于 lib3 chunk），index 自身引入的 vendor（antd 等）留在 index chunk，
  // 由 runtime 依赖图保证加载顺序，index.html 固定的 5 个 script 标签顺序仍然成立。
  // splitChunks 关闭：各 entry 模块经 dependOn 去重后不存在跨 entry 重复；
  // 路由级动态 import()（Application.js）产出的异步 chunk 不受此开关影响，
  // 样式仍完整留在 index 与 theme-* 各自 chunk（index.css / theme-*@prd.css）。
  entry: {
    index: {
      dependOn: 'lib3',
      import: [ ...(isDevelopment ? ['webpack-hot-middleware/client?path=http://127.0.0.1:4000/__webpack_hmr&reload=true'] : []), './index.js' ]
    },
    lib: ['react', 'react-dom', 'redux', 'redux-promise', 'react-router', 'react-router-dom', 'prop-types'],
    lib2: {
      dependOn: 'lib',
      import: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/autocomplete',
        '@codemirror/lang-javascript',
        '@codemirror/lang-json',
        '@codemirror/lang-xml',
        '@codemirror/lang-html',
        'json5',
        'url',
        'axios'
      ]
    },
    lib3: {
      dependOn: 'lib2',
      import: ['mockjs', 'dayjs', 'recharts']
    }
  },
  devtool: isProduction ? false : 'cheap-module-source-map',
  output: {
    path: path.join(root, 'static/prd'),
    // 统一开发与生产均为 /prd/：异步 chunk 的运行时下载 URL 由 publicPath 决定，
    // 生产若为空串，深度嵌套路由（如 /project/:id/*）下会按相对路径请求导致 404
    publicPath: '/prd/',
    // 生产用 [contenthash] 而非 [chunkhash]：contenthash 基于 chunk 内容本身，
    // 纯注释/无关模块变更不会导致 JS 产物文件名变化（与 CSS 的 [contenthash] 统一）。
    filename: isDevelopment ? '[name]@dev.js' : '[name]@[contenthash].js',
    // webpack 5 下 runtimeChunk 与 splitChunks 产出的非 entry chunk 均可按 [name] 命名；
    // entry 与拆分 chunk 使用同一模板，产物文件名与 webpack 3/4 时代保持一致。
    chunkFilename: isDevelopment ? '[name]@dev.js' : '[name]@[contenthash].js'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.css', '.json', '.string', '.tpl'],
    alias: {
      client,
      common: paths.common,
      exts: paths.exts,
      // webpack 5 移除了 node 内置模块的自动 empty 垫片（webpack 4 的 node.https/vm:'empty'）。
      // common/postmanLib.js 的 require('https') 仅在 isNode 分支使用（axios httpsAgent），
      // require('vm') 同样仅在 isNode 分支的脚本沙箱使用；浏览器端不会执行，
      // 以空模块替代，保持 webpack 4 时代的打包语义。
      https: path.join(__dirname, 'empty-module.js'),
      vm: path.join(__dirname, 'empty-module.js')
    },
    // webpack 5 移除 node 内置模块自动 polyfill：sha.js/js-base64 等在浏览器端
    // 确实需要 Buffer 实现（webpack 4 经 node-libs-browser 自动注入 buffer 包），
    // 显式声明等价 fallback。markdown-it 依赖的 linkify-it 引用 node 内置 punycode，
    // 同样以 punycode.js 包（punycode/ 入口）补齐。
    fallback: {
      buffer: require.resolve('buffer/'),
      punycode: require.resolve('punycode/')
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
        options: { cacheDirectory: true, babelrc: false, configFile: true }
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { sourceMap: true } }]
      },
      {
        // json-schema-editor-visual(接口编辑的 JSON Schema 编辑器)内嵌 antd3,
        // 其全量 antd.css 不能再全局加载(antd3 body 基础样式与全局 .ant-* 规则
        // 污染 antd5 应用)。该文件先经自定义 loader 把每条选择器前缀化为
        // `.json-schema-editor-scope `,配合编辑器容器类名限定作用域
        // (enforce: 'pre' 保证在通用 css-loader 规则之前作用于源文本;
        // 详见 build/json-schema-css-scope-loader.js)。
        test: /node_modules[\\/]json-schema-editor-visual[\\/]node_modules[\\/]antd[\\/]dist[\\/]antd\.css$/,
        enforce: 'pre',
        use: [{ loader: path.join(__dirname, 'json-schema-css-scope-loader.js') }]
      },
      {
        test: /\.(sass|scss)$/,
        use: [
          MiniCssExtractPlugin.loader,
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } }
        ]
      },
      {
        // webpack 5 资源模块替代 url-loader（语义对齐：<8KB 内联 data URI，否则产出文件）。
        // 资源模块是 css-loader 7 的原生搭配；原 `?[sha256#base64:8]` 缓存查询串
        // 随 loader 体系一并移除。
        test: /.(gif|jpg|jpeg|png|woff|woff2|eot|ttf|svg)$/,
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: 8192 } },
        generator: { filename: '[path][name][ext]' }
      }
    ]
  },
  optimization: {
    // terser 使用默认多进程并行压缩（webpack 4 时代的 worker 僵死规避项已复验移除：
    // antd 4 + 预编译 CSS 不再触发，实测并行 18s 完成）。
    minimizer: [new TerserPlugin()],
    runtimeChunk: { name: 'manifest' },
    // 依赖拆分改由 entry dependOn 承担（见 entry 注释）；webpack 5 禁止 cacheGroup
    // 与 entry 同名，原 lib/lib2/lib3 cacheGroups 无法等价保留。
    splitChunks: false
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: isDevelopment ? '[name]@dev.css' : '[name]@[contenthash].css'
    }),
    ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin()] : []),
    // webpack 4 的 node.Buffer/node.setImmediate 默认垫片在 webpack 5 已移除，
    // 用 ProvidePlugin 显式补齐（部分依赖的预构建产物会引用这些自由变量）。
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      setImmediate: path.join(__dirname, 'shims/setImmediate.js')
    }),
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
        // compression-webpack-plugin 12 的命名模板：[path] 为相对输出目录的目录前缀，
        // [base] 为带扩展名的文件名，等价于 1.x 的 `asset: '[path].gz[query]'`。
        filename: '[path][base].gz',
        algorithm: 'gzip',
        test: /\.(js|css)$/,
        threshold: 10240,
        minRatio: 0.8
      })
    ] : [])
  ]
};

module.exports = config;

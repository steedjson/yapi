// Rsbuild 生产构建配置（阶段一：npm run build-client 切换，见 docs/rsbuild-migration-plan.md）。
// 设计对齐 build/webpack.standalone.config.js（生产分支），dev 链路仍走 webpack 不受影响：
// - 分包模型沿用 webpack 的 dependOn vendor 链（lib ← lib2 ← lib3 ← index，runtime 抽为
//   manifest），splitChunks 关闭。选该模型而非 chunkSplit 自动分包的原因：
//   1) 初始 chunk 拓扑与 webpack 完全一致，static/index.html 的固定 5 段 script 注入
//      （manifest → lib3 → lib2 → lib → index）零改动；
//   2) assets.js 的 WEBPACK_ASSETS 形状（含 lib/lib2/lib3 键）可原样保留；
//   3) rspack 原生支持 EntryDescription.dependOn（@rspack/core config/types.d.ts），
//      dependOn 让被依赖 entry 的模块对下游 entry 去重共享，无重复打包。
// - 转译经由 @rsbuild/plugin-babel 继承仓库根 babel.config.js（ie11 目标 / loose /
//   modules:commonjs / transform-runtime），swc 仅做语法识别前置，行为与 babel-loader 时期一致。
// - DefinePlugin 的 process.env.NODE_ENV 不再重复定义（Rsbuild 按 mode 注入），
//   webpack 时代的 34 条双重定义警告随之消除。
// - .gz 预压缩不在构建器内做：由 build/rsbuild-standalone.mjs 构建后用 node zlib 补齐
//   （阈值/比率对齐 CompressionPlugin：>=10KB 且压缩比 <=0.8），server/app.js 的 .gz
//   改写逻辑零改动。
import path from 'node:path';
import { createRequire } from 'node:module';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginSass } from '@rsbuild/plugin-sass';

const require = createRequire(import.meta.url);

const paths = require('./build/paths.js');
const clientBuildConfig = require('./build/clientBuildConfig.js');
const packageInfo = require('./package.json');
// 与 webpack 配置同源：define 值需要合并后的 WEBCONFIG（scriptEnable 等）。
const yapi = require('./server/yapi.js');

// webpack 侧 getDefineValues 的等价 define 集合；versionNotify 未定义时跳过
// （当前 client/server 代码均未消费该变量，与 webpack DefinePlugin 收到 undefined
// 值时的"不生效"结果一致）。
const defineValues = {
  'process.env.version': JSON.stringify(packageInfo.version),
  'process.env.scriptEnable': JSON.stringify(yapi.WEBCONFIG.scriptEnable === true)
};
if (yapi.WEBCONFIG.versionNotify !== undefined) {
  defineValues['process.env.versionNotify'] = JSON.stringify(yapi.WEBCONFIG.versionNotify);
}

export default {
  root: paths.root,
  mode: 'production',
  source: {
    // html 入口不由构建器生成（static/index.html 为手写模板），逐入口关闭。
    entry: {
      index: {
        dependOn: ['lib3'],
        import: [path.join(paths.client, 'index.js')],
        html: false
      },
      lib: {
        import: ['react', 'react-dom', 'redux', 'redux-promise', 'react-router', 'react-router-dom', 'prop-types'],
        html: false
      },
      lib2: {
        dependOn: ['lib'],
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
        ],
        html: false
      },
      lib3: {
        dependOn: ['lib2'],
        import: ['mockjs', 'dayjs', 'recharts'],
        html: false
      }
    },
    //Rsbuild 内置 JS 规则默认排除 node_modules；这里放行与 webpack babel-loader
    // 白名单一致的两类包（yapi-plugin-*（含 exts 内联插件）与 json-schema-editor-visual）。
    include: [/node_modules[\\/]_?(yapi-plugin|json-schema-editor-visual)/],
    define: defineValues
  },
  resolve: {
    // Rsbuild 2.x 的别名入口为顶层 resolve.alias；prefer-alias 让显式别名优先于
    // tsconfig paths（两者对 common/exts 的映射一致，client 仅存在于显式别名）。
    aliasStrategy: 'prefer-alias',
    alias: {
      client: paths.client,
      common: paths.common,
      exts: paths.exts
    }
  },
  output: {
    // 产物继续平铺在 static/prd 根目录（koaStatic 直接服务，assets.js 引用裸文件名）；
    // jsAsync/cssAsync 必须一并置空，否则异步 chunk 会落到 async/ 子目录。
    distPath: {
      root: 'static/prd',
      js: '',
      jsAsync: '',
      css: '',
      cssAsync: ''
    },
    // 统一 publicPath：深度路由（/project/:id/*）下异步 chunk 必须以绝对路径请求。
    assetPrefix: '/prd/',
    // 保持 webpack 时代的 [name]@[contenthash] 命名契约（20 位 hash 与现状一致）。
    filename: {
      js: '[name]@[contenthash:20].js',
      css: '[name]@[contenthash:20].css'
    },
    sourceMap: false,
    // 对齐 webpack 资源模块的 8KB 内联阈值（当前 CSS/SCSS 无 url() 资源，防御性对齐）。
    dataUriLimit: {
      image: 8192,
      svg: 8192,
      font: 8192,
      media: 8192
    },
    // 默认值即 'linked'：与 TerserPlugin 的 .LICENSE.txt sidecar 行为一致，显式声明。
    legalComments: 'linked',
    cleanDistPath: true
  },
  performance: {
    // 保留性能默认值（printFileSize 产物报告）；分包关闭走顶层 splitChunks: false。
  },
  // Rsbuild 2.x 顶层分包开关：false 直通 rspack optimization.splitChunks(false)。
  // 关闭原因见文件头「分包模型」说明——vendor 去重由 entry dependOn 链承担，
  // 路由级动态 import() 的异步 chunk 不受此开关影响。
  splitChunks: false,
  plugins: [
    // Rsbuild 2.x 将 Sass 支持拆分为独立插件（复用项目 devDependencies 的 sass 包）。
    pluginSass(),
    pluginBabel({
      // 整体接管 babel-loader options：转译唯一来源为仓库根 babel.config.js
      // （与 webpack babel-loader 的 options 完全一致：cacheDirectory + configFile）。
      babelLoaderOptions: config => {
        config.presets = [];
        config.plugins = [];
        config.babelrc = false;
        config.configFile = true;
        config.cacheDirectory = true;
        config.compact = false;
        return config;
      }
    })
  ],
  tools: {
    rspack: (config, { rspack }) => {
      // webpack 生产配置的 runtimeChunk: { name: 'manifest' } 等价物。
      config.optimization.runtimeChunk = { name: 'manifest' };
      // jsondiffpatch 预构建浏览器 bundle 不做依赖解析（与 webpack noParse 一致）。
      config.module.noParse = /node_modules\/jsondiffpatch\/public\/build\/.*js/;
      // webpack 5/rspack 的 node 内置模块 fallback 必须设在 rspack 层 resolve.fallback
      // （Rsbuild 的 resolve 用户命名空间不透传该字段）：sha.js/js-base64 需要 Buffer；
      // markdown-it 的 linkify-it 引用 node 内置 punycode；common/postmanLib.js 仅在
      // isNode 分支引用 https/vm，浏览器端以空模块替代（webpack 4 时代语义）。
      config.resolve.fallback = {
        ...config.resolve.fallback,
        https: path.join(paths.root, 'build/empty-module.js'),
        vm: path.join(paths.root, 'build/empty-module.js'),
        buffer: require.resolve('buffer/'),
        punycode: require.resolve('punycode/')
      };
      // json-schema-editor-visual 内嵌 antd3 全量样式必须先经自定义 loader 前缀化
      // （enforce: 'pre' 先于内置 CSS 处理），详见 build/json-schema-css-scope-loader.js。
      config.module.rules.unshift({
        test: /node_modules[\\/]json-schema-editor-visual[\\/]node_modules[\\/]antd[\\/]dist[\\/]antd\.css$/,
        enforce: 'pre',
        use: [{ loader: path.join(paths.root, 'build/json-schema-css-scope-loader.js') }]
      });
      // 部分依赖的预构建产物引用自由变量 Buffer/setImmediate（与 webpack ProvidePlugin 一致）。
      config.plugins.push(
        new rspack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          setImmediate: path.join(paths.root, 'build/shims/setImmediate.js')
        })
      );
    }
  }
};

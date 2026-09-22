// Rsbuild 构建配置（生产 + 开发条件化，见 docs/rsbuild-migration-plan.md）。
// 生产分支：npm run build-client（NODE_ENV=production，build/rsbuild-standalone.mjs）。
// 开发分支：npm run dev-client（NODE_ENV=development，build/rsbuild-dev.mjs，阶段二），
// 以 NODE_ENV 条件挂载 dev 专属配置——生产路径下这些键完全不存在，产物契约不被污染。
//
// 设计对齐旧 build/webpack.standalone.config.js（生产分支，阶段四已删除，见 git 历史）；
// dev 链路自阶段二起同走本
// 配置的 dev 分支（Rsbuild dev server），与生产共用 tools/分包模型（仅注入方式分支）：
// - 分包模型（阶段三起交还构建工具）：entry 仅保留真实应用入口 index；vendor 去重由
//   顶层 splitChunks（Rsbuild 2.x 对 performance.chunkSplit 的接替 API，2.2.8 中
//   chunkSplit 已标记 deprecated）按工具默认规则（preset 'default'：node_modules 自动
//   vendor 分包）承担；runtime 仍抽独立 manifest chunk，保证 vendor 内容稳定时 hash
//   不随应用代码变更。初始 chunk 清单不再静态可知：生产由 build/rsbuild-assets.js 从
//   构建 stats 的 entrypoint 读取并写入 assets.js 元数据，static/index.html 数据驱动
//   注入（不再硬编码 5 段 script）；dev 由 html-rspack-plugin 按 entrypoint 自动注入。
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
// dev server 语义平移层（/iconfont//image/ 静态服务 + 前端路由回退）。
const { createRsbuildDevServerSetup } = require('./build/rsbuild-dev-server.js');

const isProduction = process.env.NODE_ENV === 'production';

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

// 开发分支专属：entry index 启用构建器生成 HTML（devHtmlConfig 模板），script/link 由
// html-rspack-plugin 按 entrypoint 自动注入（runtime → vendor chunks → index）。
const devEntryHtml = { html: true };
const devHtmlConfig = {
  template: path.join(paths.root, 'build/rsbuild-dev.html')
};
const devServerConfig = {
  // 端口/绑定与阶段四前旧 webpack dev 链一致；strictPort 保持旧链"端口被占即失败"
  // 的语义（Rsbuild 缺省会顺延端口，必须显式关闭）。
  port: 4000,
  host: '127.0.0.1',
  strictPort: true,
  // HTML 服务与回退口径由 build/rsbuild-dev-server.js 接管（旧链 isHtmlFallbackCandidate）：
  // 关闭内置 htmlFallback（其无扩展名 dot 规则，会把 /prd/missing.js 这类请求也回退成 HTML，
  // 掩盖资源加载失败，正是旧链注释里明确要避免的行为）。
  htmlFallback: false,
  // 禁用默认 public/ 目录（仓库无该目录）；静态目录 /iconfont/ /image/ 由 dev setup 提供，
  // 不把整个 static/ 暴露为静态根，避免 static/prd 生产产物泄入 dev。
  publicDir: false,
  // /api/ 反代平移：保留 method/headers/body/query；changeOrigin 显式关闭以维持旧链
  // "Host 头原样透传"的行为；后端不可达时以 onError 保持 502 + JSON 语义。
  proxy: [
    {
      target: 'http://127.0.0.1:3000',
      changeOrigin: false,
      pathFilter: (_path, req) => (req.url || '').split('?')[0].startsWith('/api/'),
      on: {
        error: (error, _req, res) => {
          if (!res || typeof res.writeHead !== 'function') {
            return;
          }
          if (res.headersSent) {
            // 响应已开始，只能中断连接，无法再改写状态码（与旧链一致）。
            res.destroy();
            return;
          }
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              errCode: 502,
              errmsg: '开发代理无法连接后端 127.0.0.1:3000：' + error.message
            })
          );
        }
      }
    }
  ],
  // 静态目录与 HTML 回退中间件装配（build/rsbuild-dev-server.js，注入式可测）。
  setup: createRsbuildDevServerSetup()
};
// dev 专属构建态配置：dev.assetPrefix 缺省不继承 output.assetPrefix（实测 dev 产物
// publicPath 落在根路径 /），显式对齐旧链 output.publicPath: '/prd/'。
const devBuildConfig = {
  assetPrefix: '/prd/'
};

// tools.rspack 改写（生产/开发共用，与 webpack 生产配置逐条对齐；body 不得按分支分叉）。
const rspackTool = (config, { rspack }) => {
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
  // 部分依赖的预构建产物引用自由变量 Buffer/setImmediate（与 webpack ProvidePlugin 一致）。
  config.plugins.push(
    new rspack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      setImmediate: path.join(paths.root, 'build/shims/setImmediate.js')
    })
  );
};

// tools 顶层合并：生产/开发共用同一 rspack 改写（dev 阶段二起两分支同引用存活）。
// 阶段三起 dev 不再需要 htmlPlugin 注入清单与 5 段顺序钉死插件（yapi:dev-html-tag-order
// 已删除）：entry 只剩 index，html-rspack-plugin 对单一入口自动注入 entrypoint 全量
// 文件（runtime → vendor chunks → index，顺序即 rspack entrypoint chunks 的执行顺序），
// 不再存在 lib 时代 dependOn 链的"只注入直接依赖、manifest 位置漂移"问题。
const prodTools = { rspack: rspackTool };

export default {
  root: paths.root,
  mode: isProduction ? 'production' : 'development',
  source: {
    // entry 仅保留真实应用入口（阶段三）：group/project/user/follows/add-project 本就是
    // 路由级动态 import()（client/Application.js 的 webpackChunkName 注释）产出的异步
    // chunk，从来不是 entry；lib/lib2/lib3 手工 vendor entry（dependOn 链）已删除，
    // vendor 去重交还构建工具（见顶层 splitChunks）。
    // 生产：html 入口不由构建器生成（static/index.html 为手写模板）；开发：index 入口
    // 启用 HTML（devHtmlConfig 模板自动注入 script/link）。
    entry: {
      index: {
        import: [path.join(paths.client, 'index.js')],
        html: false,
        ...(isProduction ? {} : devEntryHtml)
      }
    },
    //Rsbuild 内置 JS 规则默认排除 node_modules；这里放行与 webpack babel-loader
    // 白名单一致的包（yapi-plugin-*，含 exts 内联插件）。
    include: [/node_modules[\\/]_?yapi-plugin/],
    // build/ 下的配置与 shim 文件不在模块图内，rspack 持久缓存无法感知其内容变化；
    // 显式登记 build/ 目录，其变更即触发全量重编译。
    buildDependencies: [path.join(paths.root, 'build')],
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
    // 生产保持 webpack 时代的 [name]@[contenthash] 命名契约（20 位 hash 与现状一致）；
    // 开发对齐旧 webpack dev 产物命名 [name]@dev.js / [name]@dev.css（仅内存态可感知）。
    filename: isProduction
      ? {
          js: '[name]@[contenthash:20].js',
          css: '[name]@[contenthash:20].css'
        }
      : {
          js: '[name]@dev.js',
          css: '[name]@dev.css'
        },
    // 生产关闭（与 webpack 链一致）；开发对齐旧链 devtool: cheap-module-source-map（开启）。
    sourceMap: !isProduction,
    // 对齐 webpack 资源模块的 8KB 内联阈值（当前 CSS/SCSS 无 url() 资源，防御性对齐）。
    dataUriLimit: {
      image: 8192,
      svg: 8192,
      font: 8192,
      media: 8192
    },
    // 默认值即 'linked'：与 TerserPlugin 的 .LICENSE.txt sidecar 行为一致，显式声明。
    legalComments: 'linked',
    // 必须条件化：cleanDistPath 显式 true 时 dev server 启动也会清空 dist（'auto' 才
    // 会在 dev 跳过清理），会把 static/prd 的生产产物抹掉——dev 分支显式关闭（dev
    // writeToDisk 缺省 false，产物全程在内存，与旧 webpack-dev-middleware 一致）。
    cleanDistPath: isProduction
  },
  performance: {
    // 保留性能默认值（printFileSize 产物报告）。
  },
  // Rsbuild 2.x 顶层 splitChunks（2.2.8 中 performance.chunkSplit 已 deprecated，该键为
  // 其接替 API）。批次1（docs/first-paint-perf-plan.md）起从 preset 'default' 升级为
  // 自定义分组：
  // - 保留 rspack 默认规则为底座（minSize 20KB / maxInitialRequests 30 / defaultVendors
  //   与 default 组）：初始 chunk 集合由 entrypoint 决定的语义不变；
  // - antd5 生态（antd + @ant-design/* + rc-* + @rc-component/*）经 cacheGroup 'antd'
  //   独立分包：它是首屏真必需（Login/Home/Header 同步引用）且为 vendor 最大头，独立
  //   chunk 让应用代码迭代不再打穿其缓存；enforce+高 priority 保证不被 defaultVendors
  //   合并回 '5'。enforce 组对初始/异步引用都生效，仅异步引用的 rc-*（如 rc-queue-anim）
  //   也会归入 'antd'，待页面按需加载，不回灌首屏（defaultVendors 的 chunks:'all' 只
  //   决定共享模块进哪个 vendor，初始清单仍由 entrypoint 决定）；
  // - CodeMirror/markdown-it/recharts 等仅异步域使用的库不再需要显式分组：其唯一同步
  //   引用链（插件 client.js / client/common.js）已异步化，defaultVendors 会把纯异步
  //   共享模块抽为异步 vendor chunk（对应既有 r/t/u 形态），首屏 vendor 仅剩真初始依赖。
  splitChunks: {
    cacheGroups: {
      // rc-scroll-anim/rc-tween-one/rc-queue-anim 仅被 Intro.js（barrel 链，只被异步
      // 路由消费）引用：以更高 priority + chunks:'async' 抢在 antd 组之前，强制它们
      // 落入异步专用 chunk，避免被 antd 组的 enforce+chunks:'all' 裹挟进初始 chunk。
      'rc-anim': {
        test: /[\\/]node_modules[\\/]rc-(scroll-anim|tween-one|queue-anim)[\\/]/,
        name: 'rc-anim',
        chunks: 'async',
        priority: 20,
        enforce: true
      },
      antd: {
        test: /[\\/]node_modules[\\/](antd|@ant-design[\\/][^\\/]+|rc-[a-z-]+|@rc-component[\\/][^\\/]+)[\\/]/,
        name: 'antd',
        chunks: 'all',
        priority: 10,
        enforce: true,
        reuseExistingChunk: true
      }
    }
  },
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
  // tools 生产/开发同一引用（rspack 改写两分支存活，回归测试
  // test/build/rsbuild-dev-config.test.js 双分支守护）。
  tools: prodTools,
  // 开发分支专属键以条件展开挂载：生产加载本配置（npm run build-client）时这些键
  // 完全不存在，阶段一的生产配置形态零变化。
  ...(isProduction ? {} : { html: devHtmlConfig, server: devServerConfig, dev: devBuildConfig })
};

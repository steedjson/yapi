var path = require('path');
var nodeUtil = require('util');

// 兼容 Node.js 24：旧版 HappyPack 仍调用已移除的 util.isRegExp。
if (typeof nodeUtil.isRegExp !== 'function') {
  nodeUtil.isRegExp = value => value instanceof RegExp;
}
var AssetsPlugin = require('assets-webpack-plugin');
var CompressionPlugin = require('compression-webpack-plugin');
var clientPluginModule = require('./build/clientPluginModule');
var assetsPluginInstance = new AssetsPlugin({
  filename: 'static/prd/assets.js',
  processOutput: function(assets) {
    return 'window.WEBPACK_ASSETS = ' + JSON.stringify(assets);
  }
});
var package = require('./package.json');
var yapi = require('./server/yapi');
var isWin = require('os').platform() === 'win32'
var useStandaloneBabel = process.env.YAPI_STANDALONE_BABEL === '1';
var clientBuildConfig = require('./build/clientBuildConfig');

var compressPlugin = new CompressionPlugin({
  asset: '[path].gz[query]',
  algorithm: 'gzip',
  test: /\.(js|css)$/,
  threshold: 10240,
  minRatio: 0.8
});

clientPluginModule.initPlugins(__dirname);

module.exports = {
  // 独立 Babel 模式不加载 YKit 配置插件，避免由插件注入 HappyPack。
  plugins: useStandaloneBabel ? [] : [
    {
      name: 'antd',
      options: {
        modifyQuery: function(defaultQuery) {
          // 可查看和编辑 defaultQuery
          defaultQuery.plugins = [];
          defaultQuery.plugins.push([
            'transform-runtime',
            {
              polyfill: false,
              regenerator: true
            }
          ]);
          defaultQuery.plugins.push('transform-decorators-legacy');
          defaultQuery.plugins.push(['import', { libraryName: 'antd' }]);
          return defaultQuery;
        },
        exclude: clientBuildConfig.getPluginExclude(isWin)
      }
    }
  ],
  devtool: 'cheap-source-map',
  config: function(ykit) {
    return {
      exports: ['./index.js'],
      commonsChunk: {
        vendors: {
          lib: [
            // 'anujs',
            'react',
            'react-dom',
            'redux',
            'redux-promise',
            'react-router',
            'react-router-dom',
            'prop-types',
            'react-dnd-html5-backend',
            'react-dnd',
            'reactabular-table',
            'reactabular-dnd',
            'table-resolver'
          ],
          lib2: ['brace', 'json5', 'url', 'axios'],
          lib3: ['mockjs', 'moment', 'recharts']
        }
      },
      modifyWebpackConfig: function(baseConfig) {
        var ENV_PARAMS = {};
        switch (this.env) {
          case 'local':
            ENV_PARAMS = 'dev';
            break;
          case 'dev':
            ENV_PARAMS = 'dev';
            break;
          case 'prd':
            ENV_PARAMS = 'production';
            break;
          default:
        }

        baseConfig.plugins.push(
          new this.webpack.DefinePlugin(
            clientBuildConfig.getDefineValues(package, yapi.WEBCONFIG, this.env)
          )
        );

        //初始化配置
        baseConfig.devtool = 'cheap-module-eval-source-map';
        baseConfig.context = path.resolve(__dirname, './client');
        baseConfig.resolve.alias.client = '/client';
        baseConfig.resolve.alias.common = '/common';

        baseConfig.resolve.alias.exts = '/exts';

        // baseConfig.resolve.alias.react = 'anujs';
        // baseConfig.resolve.alias['react-dom'] = 'anujs';

        baseConfig.output.prd.path = 'static/prd';
        baseConfig.output.prd.publicPath = '';
        baseConfig.output.prd.filename = '[name]@[chunkhash][ext]';

        if (useStandaloneBabel) {
          // 保留原配置插件的 Babel 规则，且继续转换需要被处理的第三方编辑器模块。
          baseConfig.module.loaders.push({
            test: /\.(js|jsx)$/,
            exclude: clientBuildConfig.getPluginExclude(isWin),
            loader: 'babel-loader',
            query: clientBuildConfig.getBabelQuery()
          });
        }

        // 允许在不改变默认构建行为的前提下，独立验证去除 HappyPack 后的构建链。
        // 通过环境变量显式开启，验证通过后再决定是否切换默认路径。
        if (process.env.YAPI_DISABLE_HAPPYPACK === '1') {
          baseConfig.module.loaders = baseConfig.module.loaders.map(loader => {
            if (loader.loader !== 'happypack/loader') return loader;
            return Object.assign({}, loader, {
              loader: 'babel-loader',
              // 复用原 HappyPack 的 Babel 配置，确保装饰器和 antd 按需加载行为不变。
              query: clientBuildConfig.getBabelQuery()
            });
          });
          baseConfig.plugins = baseConfig.plugins.filter(plugin => {
            return !(plugin && plugin.constructor && plugin.constructor.name === 'HappyPlugin');
          });
        }

        baseConfig.module.noParse = /node_modules\/jsondiffpatch\/public\/build\/.*js/;
        baseConfig.module.loaders.push(
          clientBuildConfig.getStyleRule(
            /\.less$/,
            ykit.ExtractTextPlugin,
            require.resolve('style-loader'),
            require.resolve('css-loader') + '?sourceMap!' + require.resolve('less-loader') + '?sourceMap'
          )
        );

        baseConfig.module.loaders.push(clientBuildConfig.getAssetRule());

        baseConfig.module.loaders.push(
          clientBuildConfig.getStyleRule(
            /\.(sass|scss)$/,
            ykit.ExtractTextPlugin,
            require.resolve('css-loader') + '?sourceMap!' + require.resolve('sass-loader') + '?sourceMap',
            undefined
          )
        );

        clientBuildConfig.getPreLoaders().forEach(loader => {
          baseConfig.module.preLoaders.push(loader);
        });

        if (this.env == 'prd') {
          baseConfig.plugins.push(
            new this.webpack.optimize.UglifyJsPlugin({
              compress: {
                warnings: false
              }
            })
          );
          baseConfig.plugins.push(assetsPluginInstance);
          baseConfig.plugins.push(compressPlugin);
          baseConfig.plugins.push(
            new this.webpack.ContextReplacementPlugin(/moment[\\\/]locale$/, /^\.\/(zh-cn|en-gb)$/)
          );
        }
        return baseConfig;
      }
    };
  },
  server: {
    // true/false，默认 false，效果相当于 ykit server --hot
    hot: true,
    // true/false，默认 false，开启后可在当前打开的页面提示打包错误
    overlay: false
  },
  hooks: {},
  commands: []
};

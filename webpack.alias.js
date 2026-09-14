const paths = require('./build/paths');

// babel（webpack-alias 插件）与构建共用的路径别名；与 standalone 构建同源。
module.exports = {
  resolve: {
    alias: {
      'common': paths.common,
      'client': paths.client,
      'exts': paths.exts
    }
  }
};

// 项目目录锚点的单一来源：webpack 别名（build/webpack.standalone.config.js、
// webpack.alias.js）等构建侧统一从这里取路径，避免多处手写后漂移。
const path = require('path');

const root = path.resolve(__dirname, '..');

module.exports = {
  root: root,
  client: path.join(root, 'client'),
  common: path.join(root, 'common'),
  exts: path.join(root, 'exts')
};

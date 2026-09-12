import test from 'ava';
import fs from 'fs';
import path from 'path';

const { normalizeAssets } = require('../../build/clientBuildConfig');

function webpackAssetKeys(html) {
  const keys = [];
  const mark = "WEBPACK_ASSETS['";
  let from = 0;
  while (true) {
    const start = html.indexOf(mark, from);
    if (start === -1) break;
    const keyStart = start + mark.length;
    const keyEnd = html.indexOf("']", keyStart);
    keys.push(html.slice(keyStart, keyEnd));
    from = keyEnd + 2;
  }
  return keys;
}

// 生产页面依赖历史 index.js 键名，standalone 清单必须保持该契约。
test('资源清单兼容 static/index.html 的入口键名', t => {
  const assets = {
    index: { js: 'index.js', css: 'index.css' },
    manifest: { js: 'manifest.js' }
  };

  t.deepEqual(normalizeAssets(assets), {
    'index.js': { js: 'index.js', css: 'index.css' },
    manifest: { js: 'manifest.js' }
  });
  t.true(Object.prototype.hasOwnProperty.call(assets, 'index'));
});

test('已有 index.js 键名时不重复改写资源清单', t => {
  const assets = { 'index.js': { js: 'index.js' } };

  t.deepEqual(normalizeAssets(assets), assets);
});

// 页面契约比构建配置更稳定：独立构建必须继续满足这些历史键。
test('生产页读取的资源清单键保持不变', t => {
  const html = fs.readFileSync(path.join(__dirname, '../../static/index.html'), 'utf8');
  t.deepEqual(webpackAssetKeys(html), [
    'index.js',
    'manifest',
    'lib3',
    'lib2',
    'lib',
    'index.js'
  ]);
});

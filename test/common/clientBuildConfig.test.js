import test from 'ava';

const { normalizeAssets } = require('../../build/clientBuildConfig');

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

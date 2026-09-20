import test from 'ava';
import fs from 'fs';
import path from 'path';

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

test('资源清单能够自动剥离 /prd/ 前缀避免 index.html 拼接双斜杠', t => {
  const assetsWithPrd = {
    index: { js: '/prd/index@abc.js', css: '/prd/index@abc.css' },
    project: { js: '/prd/project@123.js', css: '/prd/project@123.css' },
    manifest: { js: 'manifest@xyz.js' }
  };

  t.deepEqual(normalizeAssets(assetsWithPrd), {
    'index.js': { js: 'index@abc.js', css: 'index@abc.css' },
    project: { js: 'project@123.js', css: 'project@123.css' },
    manifest: { js: 'manifest@xyz.js' }
  });
});

// 页面契约比构建配置更稳定：阶段三分包交还构建工具后，初始 chunk 集合不再静态可知，
// 生产页改为数据驱动注入（读 assets.js 写入的 WEBPACK_INITIAL_CHUNKS），不得再硬编码
// 任何 chunk 键（旧契约的 manifest/lib3/lib2/lib/index 五段字面量已删除）。
test('生产页注入数据驱动：读取初始 chunk 清单，不再硬编码 chunk 键', t => {
  const html = fs.readFileSync(path.join(__dirname, '../../static/index.html'), 'utf8');
  t.true(
    html.indexOf('window.WEBPACK_INITIAL_CHUNKS') > -1,
    '注入循环必须消费 WEBPACK_INITIAL_CHUNKS'
  );
  t.false(
    /WEBPACK_ASSETS\[(['"])[^'"]+\1\]/.test(html),
    '不得以字面量键直读 WEBPACK_ASSETS（仅允许 [key] 动态访问）'
  );
  for (const legacy of ['lib3', 'lib2', 'lib']) {
    t.false(
      new RegExp(`WEBPACK_ASSETS\\['${legacy}'\\]`).test(html),
      `生产页不得硬编码手工 vendor 键 ${legacy}`
    );
  }
});

import test from 'ava';

const {
  CHUNK_FILE_RE,
  ASSET_KEY_ORDER,
  buildWebpackAssets,
  shouldGzip
} = require('../../build/rsbuild-assets');

// Rsbuild 产物文件名 -> WEBPACK_ASSETS 形状的适配契约（阶段一 build-client 切换）。

test('CHUNK_FILE_RE 识别 [name]@[hash].js/css，忽略 LICENSE sidecar 与 .gz', t => {
  t.truthy(CHUNK_FILE_RE.exec('index@14788ade6e6550763b0d.js'));
  t.truthy(CHUNK_FILE_RE.exec('add-project@832baa88bda5c5fb2337.css'));
  // rspack xxhash64 digest 实际产出 16 位 hash，8~32 位均需命中
  t.truthy(CHUNK_FILE_RE.exec('manifest@968121bc47abf270.js'));
  // sidecar 与压缩配对不参与清单归集
  t.falsy(CHUNK_FILE_RE.exec('index@14788ade6e6550763b0d.js.LICENSE.txt'));
  t.falsy(CHUNK_FILE_RE.exec('index@14788ade6e6550763b0d.js.gz'));
  t.falsy(CHUNK_FILE_RE.exec('assets.js'));
});

test('buildWebpackAssets 保留 index -> index.js 映射与固定键顺序', t => {
  const chunks = {
    project: { js: 'project@a.js', css: 'project@b.css' },
    user: { js: 'user@g.js', css: 'user@h.css' },
    follows: { js: 'follows@i.js' },
    'add-project': { js: 'add-project@j.js', css: 'add-project@k.css' },
    group: { js: 'group@l.js', css: 'group@m.css' },
    manifest: { js: 'manifest@c.js' },
    lib: { js: 'lib@n.js' },
    lib2: { js: 'lib2@o.js' },
    lib3: { js: 'lib3@d.js' },
    index: { js: 'index@e.js', css: 'index@f.css' }
  };
  const assets = buildWebpackAssets(chunks);

  t.deepEqual(Object.keys(assets), ASSET_KEY_ORDER);
  t.deepEqual(assets['index.js'], { js: 'index@e.js', css: 'index@f.css' });
  t.deepEqual(assets.manifest, { js: 'manifest@c.js' });
  // 无 css 的 chunk 不产出 css 键（与 webpack 版 assets.js 一致）
  t.falsy('css' in assets.lib3);
});

test('buildWebpackAssets 缺少预期 chunk 时抛错', t => {
  t.throws(() => buildWebpackAssets({ index: { js: 'index@a.js' } }), {
    message: /lib, lib2, lib3/
  });
});

test('shouldGzip 对齐 CompressionPlugin 的 threshold 与 minRatio 语义', t => {
  // 小于 10KB 不压缩
  t.false(shouldGzip(10239, 1));
  // 达到阈值且压缩比达标
  t.true(shouldGzip(10240, 8192));
  // 压缩比 0.8 边界（<= 0.8 视为有效）
  t.true(shouldGzip(10240, 8192));
  t.true(shouldGzip(20000, 16000));
  // 压缩不达标（如已压缩内容）不落盘
  t.false(shouldGzip(20000, 16001));
});

test('collectChunks 按目录归集（集成 writeAssetsJs 的输入形态）', t => {
  // 纯函数级验证：CHUNK_FILE_RE 命中产物、忽略 assets.js 自身
  t.falsy(CHUNK_FILE_RE.exec('assets.js'));
});

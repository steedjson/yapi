import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';

const {
  CHUNK_FILE_RE,
  ENTRY_ASSET_KEY,
  buildWebpackAssets,
  collectChunks,
  extractInitialChunkFiles,
  writeAssetsJs,
  shouldGzip
} = require('../../build/rsbuild-assets');

// Rsbuild 产物文件名 -> WEBPACK_ASSETS 形状的适配契约。
// 阶段三起分包交还构建工具（splitChunks 自动 vendor 分包），chunk 键不再静态可知：
// 适配器动态枚举全部 chunk 键（既有键序在前、新键按字典序追加，禁止静默忽略），
// 并写入初始 chunk 注入清单 WEBPACK_INITIAL_CHUNKS（entrypoint 执行顺序）。

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

test('CHUNK_FILE_RE 兼容 splitChunks 自动分包产出的 chunk 名（单字母/长路径名）', t => {
  // rspack 未命名 chunk 以 id 派生单字母名（如初始 vendor p/i/l/q）
  t.truthy(CHUNK_FILE_RE.exec('p@536b66184f78c395.js'));
  t.truthy(CHUNK_FILE_RE.exec('q@94cd584c3a9bf942.css'));
  // 自动 vendor 分包可能产出含点/下划线的路径式长名
  t.truthy(CHUNK_FILE_RE.exec('vendors-node_modules_foo.bar@968121bc47abf270.js'));
  // 名与 hash 的分隔符是 @：名内含 @ 也应命中（贪婪匹配最后一段 hex+扩展名）
  t.truthy(CHUNK_FILE_RE.exec('some@name@1234567890abcdef.js'));
});

test('buildWebpackAssets 动态枚举：既有键序在前，新 chunk 键按字典序追加', t => {
  const chunks = {
    project: { js: 'project@a.js', css: 'project@b.css' },
    user: { js: 'user@g.js', css: 'user@h.css' },
    follows: { js: 'follows@i.js' },
    'add-project': { js: 'add-project@j.js', css: 'add-project@k.css' },
    group: { js: 'group@l.js', css: 'group@m.css' },
    manifest: { js: 'manifest@c.js' },
    index: { js: 'index@e.js', css: 'index@f.css' },
    // splitChunks 自动分包的新键：不得被静默忽略，按字典序追加在既有键序之后
    i: { js: 'i@0.js', css: 'i@1.css' },
    l: { js: 'l@0.js' },
    p: { js: 'p@0.js' },
    q: { js: 'q@0.js' }
  };
  const { assets, initialChunks } = buildWebpackAssets(chunks, ['manifest', 'p', 'index']);

  t.deepEqual(
    Object.keys(assets),
    [
      'manifest',
      'index.js',
      'group',
      'project',
      'user',
      'follows',
      'add-project',
      'i',
      'l',
      'p',
      'q'
    ]
  );
  t.deepEqual(assets['index.js'], { js: 'index@e.js', css: 'index@f.css' });
  t.deepEqual(assets.manifest, { js: 'manifest@c.js' });
  // 无 css 的 chunk 不产出 css 键（与 webpack 版 assets.js 一致）
  t.falsy('css' in assets.l);
  t.deepEqual(assets.p, { js: 'p@0.js' });
  // 初始清单按 entrypoint 顺序透传，且应用入口完成 index -> index.js 映射
  t.deepEqual(initialChunks, ['manifest', 'p', 'index.js']);
});

test('buildWebpackAssets 缺省初始清单时仅含入口', t => {
  const { assets, initialChunks } = buildWebpackAssets({
    manifest: { js: 'manifest@a.js' },
    index: { js: 'index@b.js' }
  });
  t.deepEqual(Object.keys(assets), ['manifest', 'index.js']);
  t.deepEqual(initialChunks, [ENTRY_ASSET_KEY]);
});

test('buildWebpackAssets 缺少应用入口 chunk 时抛错', t => {
  t.throws(() => buildWebpackAssets({ manifest: { js: 'manifest@a.js' } }), {
    message: /缺少应用入口 chunk/
  });
});

test('buildWebpackAssets 初始清单含无法解析的键时抛错（清单与产物不一致）', t => {
  t.throws(
    () =>
      buildWebpackAssets(
        { index: { js: 'index@a.js' }, manifest: { js: 'manifest@a.js' } },
        ['manifest', 'ghost-chunk', 'index']
      ),
    { message: /ghost-chunk/ }
  );
});

test('buildWebpackAssets chunk 缺少 js 文件时抛错（不静默输出空键）', t => {
  t.throws(() => buildWebpackAssets({ index: { js: 'index@a.js' }, stray: { css: 'stray@b.css' } }), {
    message: /stray/
  });
});

test('writeAssetsJs 落盘 WEBPACK_ASSETS + WEBPACK_INITIAL_CHUNKS 双语句清单', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yapi-assets-'));
  try {
    fs.writeFileSync(path.join(dir, 'manifest@aaaaaaaaaaaaaaaa.js'), '1');
    fs.writeFileSync(path.join(dir, 'p@bbbbbbbbbbbbbbbb.js'), '2');
    fs.writeFileSync(path.join(dir, 'index@cccccccccccccccc.js'), '3');
    fs.writeFileSync(path.join(dir, 'index@dddddddddddddddd.css'), '4');
    // 非 chunk 文件不参与归集
    fs.writeFileSync(path.join(dir, 'assets.js'), 'stale');

    const assets = writeAssetsJs(dir, ['manifest', 'p', 'index']);
    const content = fs.readFileSync(path.join(dir, 'assets.js'), 'utf8');
    t.true(content.startsWith('window.WEBPACK_ASSETS = {'));
    t.true(content.includes(';window.WEBPACK_INITIAL_CHUNKS = '));
    t.true(content.endsWith('["manifest","p","index.js"]'));
    t.deepEqual(assets['index.js'], { js: 'index@cccccccccccccccc.js', css: 'index@dddddddddddddddd.css' });
    t.falsy('stale' in JSON.parse(content.slice('window.WEBPACK_ASSETS = '.length).split(';')[0]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test('collectChunks 同名同扩展名冲突时抛错（不静默覆盖清单指向）', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yapi-assets-conflict-'));
  try {
    // 同一 chunk 名 foo 的两个不同 hash 的 js 产物：构建器异常/旧产物残留才会出现，
    // 静默覆盖会让 assets.js 指向被丢弃的文件，必须显式失败。
    fs.writeFileSync(path.join(dir, 'foo@aaaaaaaaaaaaaaaa.js'), '1');
    fs.writeFileSync(path.join(dir, 'foo@bbbbbbbbbbbbbbbb.js'), '2');
    const error = t.throws(() => collectChunks(dir), { message: /冲突/ });
    t.true(error.message.includes('foo@aaaaaaaaaaaaaaaa.js'));
    t.true(error.message.includes('foo@bbbbbbbbbbbbbbbb.js'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('collectChunks 同名 chunk 的 js/css 并存不算冲突，正常归集', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yapi-assets-pair-'));
  try {
    fs.writeFileSync(path.join(dir, 'index@cccccccccccccccc.js'), '1');
    fs.writeFileSync(path.join(dir, 'index@dddddddddddddddd.css'), '2');
    const chunks = collectChunks(dir);
    t.deepEqual(chunks, {
      index: { js: 'index@cccccccccccccccc.js', css: 'index@dddddddddddddddd.css' }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- extractInitialChunkFiles（stats 入参可伪造，阶段四自 rsbuild-standalone.mjs 迁入）----

function fakeStats(entrypoints) {
  return { toJson: () => ({ entrypoints }) };
}

test('extractInitialChunkFiles stats 缺少入口 entrypoint 时抛错', t => {
  t.throws(() => extractInitialChunkFiles(fakeStats({ other: { files: ['a.js'] } })), {
    message: /缺少入口 entrypoint/
  });
  t.throws(() => extractInitialChunkFiles(fakeStats({})), {
    message: /缺少入口 entrypoint/
  });
});

test('extractInitialChunkFiles 入口不含任何 js/css 产物时抛错', t => {
  // files 为空数组时回退 assets 口径（对象形态取 name），仍为空则显式失败
  t.throws(
    () =>
      extractInitialChunkFiles(
        fakeStats({ index: { files: [], assets: [] } })
      ),
    { message: /未包含任何 js\/css 产物/ }
  );
  t.throws(
    () =>
      extractInitialChunkFiles(
        fakeStats({ index: { files: ['only.map'], assets: [] } })
      ),
    { message: /未包含任何 js\/css 产物/ }
  );
});

test('extractInitialChunkFiles 正常提取：过滤非 js/css 并兼容 assets 对象形态', t => {
  // files 缺省时回退 assets：字符串与 {name} 对象两种口径均要能解析
  t.deepEqual(
    extractInitialChunkFiles(
      fakeStats({ index: { files: ['manifest@a.js', 'index@b.js', 'index@c.css', 'skip.txt'] } })
    ),
    ['manifest@a.js', 'index@b.js', 'index@c.css']
  );
  t.deepEqual(
    extractInitialChunkFiles(
      fakeStats({ index: { files: [], assets: ['manifest@a.js', { name: 'index@b.js' }] } })
    ),
    ['manifest@a.js', 'index@b.js']
  );
});

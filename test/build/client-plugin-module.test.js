import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { initPlugins } = require('../../build/clientPluginModule');

// client/plugin-module.js 生成器（构建期插件发现）的直接用例。
// 生成物首两行为契约：@ts-check 头 + 生成说明——源码注释明确要求「调整文案须同步回归
// client/plugin-module.js 的 @ts-check 头不丢失」，本文件把该契约连同过滤/别名分支钉死。
//
// 夹具只伪造「根目录三件套」（config.json、common/config.js、client/），插件本体仍经
// common/plugin.js 按真实模块解析：ext 用仓库内插件（exts/），外部插件用声明依赖
// yapi-plugin-qsso（node_modules，两条别名分支因此都有真实覆盖）。

const GENERATED_HEADER =
  '// @ts-check\n// 注意:本文件由 build/clientPluginModule.js 的 initPlugins() 生成,重新构建会覆盖手工改动。\n';

function writeFixture({ plugins, exts }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yapi-plugin-module-'));
  fs.mkdirSync(path.join(root, 'client'), { recursive: true });
  fs.mkdirSync(path.join(root, 'common'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ plugins: plugins || [] }));
  fs.writeFileSync(
    path.join(root, 'common/config.js'),
    'module.exports = { exts: ' + JSON.stringify(exts || []) + ' };'
  );
  return root;
}

function generate(t, fixture) {
  const root = writeFixture(fixture);
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  initPlugins(root);
  return fs.readFileSync(path.join(root, 'client/plugin-module.js'), 'utf8');
}

test('空配置生成仅含契约头的空模块', t => {
  const output = generate(t, { plugins: [], exts: [] });
  t.is(output, GENERATED_HEADER + 'module.exports = {}');
});

test('ext 插件经 exts 别名生成，options 序列化，@ts-check 契约头保持', t => {
  const output = generate(t, { plugins: [], exts: [{ name: 'statistics', options: { a: 1 } }] });
  t.true(output.startsWith(GENERATED_HEADER), '生成物必须以 @ts-check 契约头起始');
  t.true(
    output.includes(
      '"statistics" : {module: require(\'exts/yapi-plugin-statistics/client.js\'),options: {"a":1}}'
    )
  );
});

test('node_modules 插件经包名别名生成，无 options 时为 null', t => {
  const output = generate(t, { plugins: [{ name: 'qsso' }], exts: [] });
  t.true(
    output.includes('"qsso" : {module: require(\'yapi-plugin-qsso/client.js\'),options: null}')
  );
});

test('enable:false 的插件被过滤，不落任何注册片段', t => {
  const output = generate(t, { plugins: [], exts: [{ name: 'statistics', enable: false }] });
  t.is(output, GENERATED_HEADER + 'module.exports = {}');
});
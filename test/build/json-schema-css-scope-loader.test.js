import test from 'ava';
import path from 'path';

// json-schema-css-scope-loader 的双作用域语义守护：每条非全局规则必须同时产出
// `.json-schema-editor-scope <sel>`（编辑器容器内组件）与
// `.ant-modal-root:not([class*="css-"]) <sel>`（antd3 Modal Portal 弹窗内组件，
// :not([class*="css-"]) 用于在 dev/prod 同时排除带 css-* hash 类的 antd5 弹窗）
// 两个副本；全局规则（html/body/*/:root）含副本在内整条丢弃；
// @media 内部递归生成双副本；@keyframes 原样保留不加前缀。

const loader = require(path.resolve(__dirname, '../../build/json-schema-css-scope-loader.js'));

test('非全局规则同时输出编辑器容器与 antd3 Modal 两个作用域副本', t => {
  const out = loader('.a .b{color:red}');
  t.true(out.includes('.json-schema-editor-scope .a .b'), '必须含编辑器容器作用域副本');
  t.true(
    out.includes('.ant-modal-root:not([class*="css-"]) .a .b'),
    '必须含 antd3 Modal 作用域副本'
  );
});

test('全局规则 html/body 整条丢弃，不残留任何作用域副本', t => {
  const out = loader('html{font-size:14px}body{margin:0}');
  t.false(out.includes('font-size:14px'), 'html 规则必须整条丢弃');
  t.false(out.includes('margin:0'), 'body 规则必须整条丢弃');
  t.false(out.includes('.json-schema-editor-scope html'), '不得残留 SCOPE 副本');
  t.false(out.includes('.ant-modal-root'), '不得残留 MODAL_SCOPE 副本');
});

test('@media 内部规则递归生成两个作用域副本', t => {
  const out = loader('@media (max-width:100px){.x{color:blue}}');
  t.true(out.includes('@media (max-width:100px)'), 'media 条件必须保留');
  t.is(out.split('.json-schema-editor-scope .x').length - 1, 1, 'SCOPE 副本在 media 块内出现一次');
  t.is(
    out.split('.ant-modal-root:not([class*="css-"]) .x').length - 1,
    1,
    'MODAL_SCOPE 副本在 media 块内出现一次'
  );
});

test('@keyframes 原样保留，不加任何作用域前缀', t => {
  const css = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
  const out = loader(css);
  t.true(out.includes('@keyframes spin'), 'keyframes 必须原样保留');
  t.false(out.includes('.json-schema-editor-scope'), 'keyframes 不得加 SCOPE 前缀');
  t.false(out.includes('.ant-modal-root'), 'keyframes 不得加 MODAL_SCOPE 前缀');
});

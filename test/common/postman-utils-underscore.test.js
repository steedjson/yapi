import test from 'ava';
import _ from 'underscore';

// utils._（common/postmanLib.js 沙箱上下文）把整个 underscore 暴露给用户脚本，
// 属 YApi 文档承诺的公开 API。本批依赖升级 1.8.3 -> 1.13.8，A/B 复核（134 例）
// 确认语义一致后固化以下基线：版本钉扎 + 核心语义抽检，防止未来升级无意漂移。

test('版本钉扎：公开 API 基线为 1.13.x（升级时须同步 A/B 并更新此钉）', t => {
  t.is(_.VERSION, '1.13.8');
});

test('公开 API 面完整：沙箱用户脚本依赖的核心方法均存在', t => {
  const required = [
    'each',
    'map',
    'filter',
    'reduce',
    'find',
    'isEqual',
    'isEmpty',
    'flatten',
    'extend',
    'clone',
    'keys',
    'values',
    'pick',
    'omit',
    'defaults',
    'template',
    'chain',
    'mixin',
    'partial',
    'debounce',
    'throttle',
    'escape',
    'unescape',
    'uniqueId',
    'random',
    'isArray',
    'isObject',
    'isFunction',
    'isString',
    'isNumber'
  ];
  t.deepEqual(
    required.filter(name => typeof _[name] !== 'function'),
    [],
    '以上方法缺失会破坏沙箱 utils._ 公开契约'
  );
});

test('each: undefined/null 输入为 no-op 且不抛错', t => {
  const calls = [];
  _.each(undefined, v => calls.push(v));
  _.each(null, v => calls.push(v));
  t.deepEqual(calls, []);
});

test('isEqual: NaN 相等、日期按时间值比较、深嵌套递归', t => {
  t.true(_.isEqual(NaN, NaN));
  t.true(_.isEqual(new Date(0), new Date(0)));
  t.false(_.isEqual(new Date(0), new Date(1)));
  t.true(_.isEqual({ a: { b: [1, { c: NaN }] } }, { a: { b: [1, { c: NaN }] } }));
  t.false(_.isEqual({ a: { b: 1 } }, { a: { b: 2 } }));
});

test('template: <%- %> 转义 HTML 敏感字符；<%= %> 原样插值（两版本一致）', t => {
  t.is(_.template('<%- v %>')({ v: '<b>&"\'' }), '&lt;b&gt;&amp;&quot;&#x27;');
  t.is(_.template('<%= v %>')({ v: '<b>' }), '<b>');
  t.throws(() => _.template('[<%= v %>]')({}), { instanceOf: ReferenceError });
});

test('flatten: 默认深展开，shallow 仅展开一层', t => {
  t.deepEqual(_.flatten([1, [2], [3, [4]]]), [1, 2, 3, 4]);
  t.deepEqual(_.flatten([1, [2], [3, [4]]], true), [1, 2, 3, [4]]);
});

test('extend/clone: 浅拷贝语义（嵌套引用共享）', t => {
  const src = { n: { x: 1 } };
  const ext = _.extend({}, src);
  const cln = _.clone(src);
  t.true(ext.n === src.n);
  t.true(cln.n === src.n);
  src.n.x = 9;
  t.is(ext.n.x, 9);
  t.is(cln.n.x, 9);
});

test('chain: 链式调用返回值语义不变', t => {
  t.deepEqual(_.chain([1, 2, 3, 4]).map(x => x * 2).filter(x => x > 4).value(), [6, 8]);
});

test('partial: 占位符语义（1.8.3 无此能力，1.13.8 为行为修复）', t => {
  const f = (a, b, c) => [a, b, c];
  t.deepEqual(_.partial(f, _.partial.placeholder, 2)(1, 3), [1, 2, 3]);
});

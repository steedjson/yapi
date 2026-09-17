import test from 'ava';

const jsondiffpatch = require('jsondiffpatch');
// jsondiffpatch 0.3.11 发布包不含 src/ 目录, HTML formatter 由主入口 formatters 导出,
// 与 server/controllers/interface.js、exts/yapi-plugin-wiki/controller.js 的取法一致
const formattersHtml = jsondiffpatch.formatters.html;
// common/diff-view.js 只暴露一个工厂入口: (jsondiffpatch, formattersHtml, curDiffData)
// 返回 [{ title, content }] 数组, diffText/diffJson/diffArray/valueMaps 均为内部闭包,
// 与生产调用方式一致地通过 curDiffData 间接触达
const showDiffMsg = require('../../common/diff-view.js');

function buildInterface(overrides) {
  return Object.assign(
    {
      path: '/api/pet',
      title: '宠物接口',
      method: 'GET',
      catid: 1,
      status: 'undone',
      tag: 'v1',
      req_params: [{ _id: 'p1', name: 'id', required: '1', type: 'text' }],
      req_query: [],
      req_headers: [],
      req_body_type: 'json',
      req_body_other: '{"a":1}',
      res_body_type: 'json',
      res_body: '{"r":1}'
    },
    overrides
  );
}

test('diff-view 未传入 curDiffData 时返回空数组', t => {
  t.deepEqual(showDiffMsg(jsondiffpatch, formattersHtml), []);
});

test('wiki 类型: 文本相同不产出 diff 条目(diffText 相同文本返回 null 被过滤)', t => {
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    type: 'wiki',
    current: '同一段描述文本',
    old: '同一段描述文本'
  });
  t.deepEqual(view, []);
});

test('wiki 类型: 文本不同返回包含双方文本的 HTML diff(diffText 差异分支)', t => {
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    type: 'wiki',
    current: 'hello world',
    old: 'hello there'
  });
  t.is(view.length, 1);
  t.is(view[0].title, 'wiki更新');
  t.truthy(view[0].content);
  t.true(view[0].content.indexOf('jsondiffpatch-delta') > -1);
  t.true(view[0].content.indexOf('hello there') > -1);
  t.true(view[0].content.indexOf('hello world') > -1);
});

test('接口 diff: status 枚举经 valueMaps 翻译为中文后参与对比', t => {
  const oldInterface = buildInterface({});
  const currentInterface = buildInterface({ status: 'done' });
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    current: currentInterface,
    old: oldInterface
  });
  // 仅 status 变化: 其余 diff 内容为空串被过滤
  t.deepEqual(view.map(item => item.title), ['接口状态']);
  t.true(view[0].content.indexOf('未完成') > -1);
  t.true(view[0].content.indexOf('已完成') > -1);
});

test('接口 diff: req_params 的 required/type 枚举经 valueMaps 翻译(diffArray + handleParams)', t => {
  const oldInterface = buildInterface({});
  const currentInterface = buildInterface({
    req_params: [{ _id: 'p2', name: 'id', required: '0', type: 'file' }]
  });
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    current: currentInterface,
    old: oldInterface
  });
  // status/body 无变化, 仅 req_params 差异: required '1'->'0', type 'text'->'file'
  t.deepEqual(view.map(item => item.title), ['Request Path Params']);
  const content = view[0].content;
  // 使用完整带引号的 HTML 文本断言, 防止 '必需' 被包含在 '非必需' 中导致单侧变异逃逸
  t.true(content.indexOf('&quot;必需&quot;') > -1);
  t.true(content.indexOf('&quot;非必需&quot;') > -1);
  t.true(content.indexOf('&quot;文本&quot;') > -1);
  t.true(content.indexOf('&quot;文件&quot;') > -1);
});

test('接口 diff: req_body_other JSON 变更经 diffJson 产出带 data-key 的 HTML 差异', t => {
  const oldInterface = buildInterface({});
  const currentInterface = buildInterface({ req_body_other: '{"a":2}' });
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    current: currentInterface,
    old: oldInterface
  });
  t.deepEqual(view.map(item => item.title), ['Request Body']);
  t.true(view[0].content.indexOf('jsondiffpatch-modified') > -1);
  t.true(view[0].content.indexOf('data-key="a"') > -1);
});

test('接口 diff: 两份完全相同的接口数据返回空数组', t => {
  const oldInterface = buildInterface({});
  const currentInterface = buildInterface({});
  const view = showDiffMsg(jsondiffpatch, formattersHtml, {
    current: currentInterface,
    old: oldInterface
  });
  t.deepEqual(view, []);
});

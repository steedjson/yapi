import test from 'ava';
import renderToHtml from '../../server/utils/reportHtml';

// 模块应导出可调用的渲染函数。
test('模块导出 renderToHtml 函数', t => {
  t.is(typeof renderToHtml, 'function');
});

// ---------- 全部用例通过 ----------

test('failedNum 为 0 时输出 HTML5 文档并包含全部验证通过文案', t => {
  const html = renderToHtml({
    list: [
      {
        name: '接口一',
        path: '/api/case',
        status: 'ok',
        code: 0,
        validRes: [{ message: '断言通过' }],
        url: 'http://example.com/api/case',
        headers: { 'content-type': 'application/json' },
        data: { id: 1 },
        res_header: { server: 'nginx' },
        res_body: { code: 0 }
      }
    ],
    message: { failedNum: 0, successNum: 5, len: 5 },
    runTime: '33ms'
  });

  t.true(html.includes('<!DOCTYPE html>'));
  t.true(html.includes('<html>'));
  t.true(html.includes('<head>'));
  t.true(html.includes('<meta charset="utf-8" />'));
  t.true(html.includes('<title>测试报告</title>'));
  t.true(html.includes('<body class="yapi-run-auto-test">'));
  t.true(html.includes('<svg'));
  t.true(html.includes('YAPI 测试结果文档'));
  t.true(html.includes('全部验证通过'));
  t.true(html.includes('<span class="success">5</span> 测试用例， 全部验证通过(33ms)'));
  t.true(html.includes('<h2 id=0>接口一</h2>'));
  t.true(html.includes('<div class="col-21">/api/case</div>'));
  t.true(html.includes('<div class="col-21">ok</div>'));
});

test('渲染结果始终包含页头导航与页脚信息', t => {
  const html = renderToHtml({ list: [], message: { failedNum: 0, successNum: 0, len: 0 } });

  t.true(html.includes('https://hellosean1025.github.io/yapi'));
  t.true(html.includes('Build by'));
  t.true(html.includes('YMFE'));
});

// ---------- 存在失败用例 ----------

test('failedNum 大于 0 时输出失败数量与未通过文案', t => {
  const html = renderToHtml({
    list: [
      {
        name: '失败接口',
        path: '/api/fail',
        status: 400,
        code: 400,
        validRes: [{ message: '期望 200 但实际 500' }]
      }
    ],
    message: { failedNum: 2, successNum: 3, len: 5 },
    runTime: '52ms'
  });

  t.false(html.includes('全部验证通过'));
  t.true(html.includes('一共 5 测试用例'));
  t.true(html.includes('<span class="success"> 3</span> 个验证通过'));
  t.true(html.includes('2 个未通过(52ms)'));
});

// ---------- 状态码分支（左侧目录图标） ----------

test('code 为 0 时左侧目录渲染验证通过图标 check-circle', t => {
  const html = renderToHtml({
    list: [{ name: 'ok 用例', code: 0 }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<div title="验证通过" class="status status-ok"><i class="icon icon-check-circle"></i></div>'));
  // 注意：内嵌主题 CSS 含有 icon-close-circle 选择器文本，此处只应断言渲染元素而非 CSS 文本。
  t.false(html.includes('class="status status-ko"'));
});

test('code 为 400 时左侧目录渲染请求异常图标 close-circle', t => {
  const html = renderToHtml({
    list: [{ name: '异常用例', code: 400 }],
    message: { failedNum: 1, successNum: 0, len: 1 }
  });

  t.true(html.includes('<div title="请求异常" class="status status-ko"><i class="icon icon-close-circle"></i></div>'));
});

test('code 为 1 时左侧目录渲染验证失败图标 warning-circle', t => {
  const html = renderToHtml({
    list: [{ name: '警告用例', code: 1 }],
    message: { failedNum: 1, successNum: 0, len: 1 }
  });

  t.true(html.includes('<div title="验证失败" class="status status-warning"><i class="icon icon-warning-circle"></i></div>'));
});

test('code 缺失或其他值时走默认分支渲染 warning-circle 与验证通过标题', t => {
  [undefined, 200, 'ok'].forEach(code => {
    const html = renderToHtml({
      list: [{ name: '默认分支用例', code }],
      message: { failedNum: 0, successNum: 1 }
    });

    t.true(html.includes('<div title="验证通过" class="status status-warning"><i class="icon icon-warning-circle"></i></div>'));
  });
});

// ---------- 验证结果 validRes ----------

test('validRes 为数组时逐条渲染 message 列表', t => {
  const html = renderToHtml({
    list: [
      {
        name: '多断言用例',
        validRes: [{ message: '断言一通过' }, { message: '断言二通过' }]
      }
    ],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<div class="col-3 case-report-title">验证结果</div>'));
  t.true(html.includes('<div key=0>断言一通过</div>'));
  t.true(html.includes('<div key=1>断言二通过</div>'));
});

test('validRes 为空数组时不渲染任何 message 条目', t => {
  const html = renderToHtml({
    list: [{ name: '空断言用例', validRes: [] }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('验证结果'));
  t.false(html.includes('<div key='));
});

test('validRes 为非数组时按原始值直接输出', t => {
  const html = renderToHtml({
    list: [{ name: '非数组断言用例', validRes: '校验失败详情' }],
    message: { failedNum: 1, successNum: 0, len: 1 }
  });

  t.true(html.includes('校验失败详情'));
  t.false(html.includes('<div key='));
});

test('validRes 缺失时占位输出 undefined 且不抛错', t => {
  const html = renderToHtml({
    list: [{ name: '无断言用例' }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('验证结果'));
  t.true(html.includes('undefined'));
});

// ---------- 请求信息 ----------

test('请求 headers 与 data 为对象时格式化为 JSON 字符串', t => {
  const headers = { 'content-type': 'application/json' };
  const data = { id: 1 };
  const html = renderToHtml({
    list: [
      {
        name: '请求用例',
        url: 'http://example.com/api',
        headers,
        data
      }
    ],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<h3>Request</h3>'));
  t.true(html.includes('<div class="col-21">http://example.com/api</div>'));
  t.true(html.includes(`<pre>${JSON.stringify(headers, null, '   ')}</pre>`));
  t.true(html.includes(`<pre>${JSON.stringify(data, null, '   ')}</pre>`));
});

test('请求 data 为字符串等非对象时直接输出', t => {
  const html = renderToHtml({
    list: [{ name: '原始请求用例', url: 'http://example.com/raw', data: 'raw body text' }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<pre>raw body text</pre>'));
});

test('请求 headers/data 为 null 或缺失时不渲染对应区块', t => {
  const html = renderToHtml({
    list: [{ name: '空请求用例', url: 'http://example.com/empty', headers: null, data: undefined }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<h3>Request</h3>'));
  t.false(html.includes('<pre>'));
});

// ---------- 响应信息 ----------

test('响应 res_header/res_body 为对象时格式化为 JSON 字符串', t => {
  const resHeader = { server: 'nginx' };
  const resBody = { errcode: 0 };
  const html = renderToHtml({
    list: [{ name: '响应用例', res_header: resHeader, res_body: resBody }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<h3>Reponse</h3>'));
  t.true(html.includes(`<pre>${JSON.stringify(resHeader, null, '   ')}</pre>`));
  t.true(html.includes(`<pre>${JSON.stringify(resBody, null, '   ')}</pre>`));
});

test('响应 res_body 为字符串时直接输出，缺失区块不渲染', t => {
  const html = renderToHtml({
    list: [{ name: '原始响应用例', res_body: 'plain text body' }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<pre>plain text body</pre>'));
  // 仅 res_body 一个区块被渲染，缺失的 res_header 不产生额外 pre。
  t.is(html.split('<pre>').length - 1, 1);
});

test('响应 res_header/res_body 均为 null 时不渲染任何 pre 区块', t => {
  const html = renderToHtml({
    list: [{ name: '空响应用例', res_header: null, res_body: null }],
    message: { failedNum: 0, successNum: 1 }
  });

  t.true(html.includes('<h3>Reponse</h3>'));
  t.false(html.includes('<pre>'));
});

// ---------- 边界情况 ----------

test('list 为空数组时仍输出完整的报告框架', t => {
  const html = renderToHtml({
    list: [],
    message: { failedNum: 0, successNum: 0, len: 0 },
    runTime: '1ms'
  });

  t.true(html.includes('<!DOCTYPE html>'));
  t.true(html.includes('全部验证通过'));
  t.true(html.includes('<span class="success">0</span> 测试用例， 全部验证通过(1ms)'));
  t.false(html.includes('<h2 id='));
  t.false(html.includes('class="list"'));
});

test('list 含多条用例时按索引生成目录锚点链接', t => {
  const html = renderToHtml({
    list: [
      { name: '用例 A', path: '/a', code: 0 },
      { name: '用例 B', path: '/b', code: 400 }
    ],
    message: { failedNum: 1, successNum: 1, len: 2 }
  });

  t.true(html.includes('<h2 id=0>用例 A</h2>'));
  t.true(html.includes('<h2 id=1>用例 B</h2>'));
  t.true(html.includes('<a class="list" href="#0">用例 A</a>'));
  t.true(html.includes('<a class="list" href="#1">用例 B</a>'));
  t.true(html.includes('icon-check-circle'));
  t.true(html.includes('icon-close-circle'));
});

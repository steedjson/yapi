import test from 'ava';
import fs from 'fs';
import path from 'path';
const markdownIt = require('markdown-it');
const md = require('../../common/markdown.js');

/**
 * common/markdown.js 注入面修复回归测试
 *
 * golden 夹具(golden_inter_*.md)与修复前基线(commit a8715839)逐字节一致,
 * 唯一计划内差异为锚点 id 属性值加引号(无引号属性位加固, 属结构性变更):
 *   <a id=查询接口5f1a...>  →  <a id="查询接口5f1a...">
 * 转义函数仅中和含 & < > " ' 的数据, 良性数据输出不变。
 */

// 复刻 export-data / gen-services 两个消费方的渲染管线: markdownIt(html:true) + unescape
const renderLikePlugin = src => unescape(markdownIt({ html: true, breaks: true }).render(src));

const readGolden = name =>
  fs.readFileSync(path.join(__dirname, 'fixtures/markdown', name), 'utf8');

const benignInter = {
  title: '查询接口',
  catid: '5f1a2b3c4d5e6f7a8b9c0d1e',
  path: '/api/user',
  method: 'GET',
  desc: '获取用户信息',
  req_headers: [{ name: 'token', value: 'abc123', required: 1, example: 'x-token', desc: '令牌' }],
  req_params: [{ name: 'id', example: '42', desc: '用户ID' }],
  req_query: [{ name: 'page', required: 0, example: '1', desc: '页码' }],
  req_body_type: 'form',
  req_body_form: [{ name: 'avatar', type: 'text', required: 0, example: 'a.png', desc: '头像' }],
  req_body_is_json_schema: true,
  req_body_other: '',
  res_body: JSON.stringify({
    type: 'object',
    required: ['user'],
    properties: {
      code: { type: 'integer', default: 0, maximum: 100 },
      user: {
        type: 'object',
        properties: {
          nick: {
            type: 'string',
            default: 'tom',
            example: 'tom',
            mock: { mock: '@name' },
            enum: ['a', 'b'],
            enumDesc: '枚举说明',
            format: 'email'
          }
        }
      }
    }
  }),
  res_body_is_json_schema: true,
  res_body_type: 'json'
};

const benignCategory = {
  name: '用户分类',
  list: [benignInter]
};

const benignProject = { name: '演示项目', basepath: '/v1', desc: '项目描述' };

test('createInterMarkdown 良性数据输出与修复前基线逐字节一致(仅 id 属性按计划加引号)', t => {
  t.is(md.createInterMarkdown('/v1', benignInter, false), readGolden('golden_inter_plain.md'));
  t.is(md.createInterMarkdown('/v1', benignInter, true), readGolden('golden_inter_toc.md'));
});

test('createClassMarkdown 良性数据输出与修复前基线逐字节一致(仅 id 属性按计划加引号)', t => {
  const goldenPlain = readGolden('golden_inter_plain.md');
  const goldenToc = readGolden('golden_inter_toc.md');
  t.is(
    md.createClassMarkdown(benignProject, [benignCategory], false),
    '\n# 用户分类\n' + goldenPlain
  );
  t.is(
    md.createClassMarkdown(benignProject, [benignCategory], true),
    '\n# %u7528%u6237%u5206%u7C7B\n[TOC]\n\n' + goldenToc
  );
});

test('createProjectMarkdown 良性数据输出不变', t => {
  t.is(
    md.createProjectMarkdown(benignProject, { desc: '公共字段说明' }),
    '\n <h1 class="curproject-name"> 演示项目 </h1> \n 项目描述\n\n\n### 公共信息\n公共字段说明\n'
  );
});

test('锚点 id 属性位注入被中和: 双引号 payload 不能逃逸属性边界', t => {
  const src = md.createInterMarkdown(
    '/b',
    Object.assign({}, benignInter, {
      title: 'x" onerror=alert(1) x\' y',
      catid: 'abc'
    }),
    false
  );
  // 属性值必须保持引号包裹且内部引号被实体化
  t.true(src.includes('<a id="x&quot; onerror=alert(1) x&#39; yabc"> </a>'));
  // 修复前的无引号逃逸形态必须消失
  t.false(src.includes('<a id=x'));
  // 经消费方管线渲染后同样中和: id 为纯字符串值, 不产生事件处理器
  const html = renderLikePlugin(src);
  t.true(html.includes('<a id="x&quot; onerror=alert(1) x&#39; yabc"> </a>'));
  t.false(/<a id=[^"]/.test(html));
});

test('锚点 id 属性位注入被中和: 复刻插件层输入(转义 & < > 但引号保留)仍不能逃逸', t => {
  // 真实管线中 export-data/gen-services 已对 title 做 & < > 转义, 但引号不被转义(残余缺陷根源);
  // 此处构造插件层转义后的到达形态, 验证 common 属性位加固中和引号逃逸
  const pluginEscapedTitle = '&lt;img src=x onerror=alert(5)&gt;" onmouseover="alert(4)';
  const src = md.createInterMarkdown(
    '/b',
    Object.assign({}, benignInter, {
      title: pluginEscapedTitle,
      catid: 'ab'
    }),
    false
  );
  // 属性值保持引号包裹: 插件层实体 &lt; 被 & 重转义为 &amp;lt;(属性值内双重转义无害),
  // 引号 " ' 均被实体化, 无法逃逸属性边界
  t.true(
    src.includes(
      '<a id="&amp;lt;img src=x onerror=alert(5)&amp;gt;&quot; onmouseover=&quot;alert(4)ab"> </a>'
    )
  );
  t.false(src.includes('<a id=x'));
  const html = renderLikePlugin(src);
  t.false(/<(img)\s[^>]*onerror[^>]*>/i.test(html));
  t.false(/<a id=[^"]/.test(html));
});

test('请求头/路径/Query/Form 表格单元格注入被中和', t => {
  const src = md.createInterMarkdown(
    '/b',
    {
      title: 'T',
      catid: 'c',
      path: '/p',
      method: 'GET',
      req_headers: [
        {
          name: 'h<img src=x onerror=alert(2)>',
          value: 'v<i>x</i>',
          required: 1,
          example: 'e<b>x</b>',
          desc: 'hd'
        }
      ],
      req_params: [
        { name: 'p<img src=x onerror=alert(3)>', example: 'pe<img src=y onerror=alert(4)>', desc: 'pd' }
      ],
      req_query: [
        { name: 'q<img src=x onerror=alert(5)>', required: 0, example: 'qe<img src=y onerror=alert(6)>', desc: 'qd' }
      ],
      req_body_type: 'form',
      req_body_form: [
        {
          name: 'f<img src=x onerror=alert(7)>',
          type: 'text',
          required: 1,
          example: 'fe<img src=y onerror=alert(8)>',
          desc: 'fd'
        }
      ]
    },
    false
  );
  // markdown 源中纯文本位已实体化
  t.true(src.includes('h&lt;img src=x onerror=alert(2)&gt;'));
  t.true(src.includes('v&lt;i&gt;x&lt;/i&gt;'));
  t.true(src.includes('e&lt;b&gt;x&lt;/b&gt;'));
  t.true(src.includes('p&lt;img src=x onerror=alert(3)&gt;'));
  t.true(src.includes('pe&lt;img src=y onerror=alert(4)&gt;'));
  t.true(src.includes('q&lt;img src=x onerror=alert(5)&gt;'));
  t.true(src.includes('qe&lt;img src=y onerror=alert(6)&gt;'));
  t.true(src.includes('f&lt;img src=x onerror=alert(7)&gt;'));
  t.true(src.includes('fe&lt;img src=y onerror=alert(8)&gt;'));
  // 经消费方管线渲染后无任何原始元素注入
  const html = renderLikePlugin(src);
  t.false(/<(img|i|b|script)\s[^>]*onerror[^>]*>/i.test(html));
});

test('schema 表格单元格(name/type/default/枚举/mock)注入被中和', t => {
  const src = md.createInterMarkdown(
    '/b',
    Object.assign({}, benignInter, {
      res_body: JSON.stringify({
        type: 'object',
        properties: {
          // 属性 type 为用户自由编写的 schema 字段, 可为任意字符串(经 default 分支渲染)
          'n<img src=x onerror=alert(9)>': {
            type: '<i>evil</i>',
            default: 'd<img src=y onerror=alert(10)>',
            mock: { mock: '<u>@m</u>' }
          },
          // string 类型才会携带 enum/enumDesc(经 sub 其他信息渲染)
          tags: {
            type: 'string',
            enum: ['<i>e1</i>'],
            enumDesc: '<i>ed</i>'
          },
          arr: {
            type: 'array',
            items: { type: '<img src=z onerror=alert(11)>' }
          }
        }
      })
    }),
    false
  );
  // 属性名 / 类型 / 默认值 / 枚举 / 枚举备注 / mock / itemType 均为纯文本位, 已实体化
  t.true(src.includes('n&lt;img src=x onerror=alert(9)&gt;'));
  t.true(src.includes('<span>&lt;i&gt;evil&lt;/i&gt;</span>'));
  t.true(src.includes('d&lt;img src=y onerror=alert(10)&gt;'));
  t.true(src.includes('&lt;u&gt;@m&lt;/u&gt;'));
  t.true(src.includes('&lt;i&gt;e1&lt;/i&gt;'));
  t.true(src.includes('&lt;i&gt;ed&lt;/i&gt;'));
  t.true(src.includes('&lt;img src=z onerror=alert(11)&gt;'));
  const html = renderLikePlugin(src);
  t.false(/<(img|i|u)\s[^>]*onerror[^>]*>/i.test(html));
});

test('desc 创作面字段保持 html:true 行为, 不转义', t => {
  const src = md.createInterMarkdown(
    '/b',
    Object.assign({}, benignInter, {
      desc: '说明<b>加粗</b>',
      req_headers: [{ name: 'token', value: 'v', required: 1, example: 'e', desc: '<i>斜体备注</i>' }],
      res_body: JSON.stringify({
        type: 'object',
        properties: {
          a: { type: 'string', description: '<em>schema备注</em>' }
        }
      })
    }),
    false
  );
  // markdown 源保留原始 HTML(与站内 Markdown 创作面行为一致)
  t.true(src.includes('说明<b>加粗</b>'));
  t.true(src.includes('<i>斜体备注</i>'));
  t.true(src.includes('<em>schema备注</em>'));
  const html = renderLikePlugin(src);
  t.true(html.includes('说明<b>加粗</b>'));
  t.true(html.includes('<i>斜体备注</i>'));
  t.true(html.includes('<em>schema备注</em>'));
});

test('良性边界值(数字 0 / 空数组字符串化 / 空串)渲染不变形', t => {
  const src = md.createInterMarkdown(
    '/b',
    Object.assign({}, benignInter, {
      title: '0',
      catid: '',
      req_headers: [{ name: '0', value: '0', required: 1, example: '0', desc: '' }],
      req_params: [],
      req_query: [{ name: '0', required: 0, example: '0', desc: '' }],
      req_body_type: 'form',
      req_body_form: [{ name: '0', type: 'text', required: 1, example: '0', desc: '' }],
      res_body: JSON.stringify({
        type: 'object',
        properties: {
          num: { type: 'integer', default: 0, maximum: 0 },
          empty: { type: 'string', default: '', enum: [] }
        }
      })
    }),
    false
  );
  // 数字 0 不得因转义或 || '' 回退丢失
  t.true(src.includes('| 0  |  0 |'));
  t.true(src.includes('| 0 | text  |  是 |  0  |'));
  t.true(src.includes('| 0 | 否  |  0 |'));
  t.true(src.includes('<td key=3>0</td>'));
  t.true(src.includes('<span>0</span>'));
  t.true(src.includes('<a id="0"> </a>'));
});

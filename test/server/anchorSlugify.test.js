import test from 'ava';
const anchorSlugify = require('../../server/utils/anchorSlugify.js');

/**
 * anchor v10 安全 slug 生成器回归:
 * 导出管线末端有 unescape(render(md)), slug 中任何 %XX 序列都会被还原为原始字符,
 * 因此 slug 白名单必须不含 % 与引号/尖括号, 否则构成属性边界逃逸注入。
 */

test('对抗性标题: 引号/尖括号/百分号/onerror payload 不产生可复活序列', t => {
  const payloads = [
    'x"><img src=x onerror=alert(1)>',
    "y'><svg onload=alert(2)>",
    'z%3Cscript%3E',
    '<script>alert(3)</script>',
    '`backtick`&amp;'
  ];
  for (const p of payloads) {
    const s = anchorSlugify(p);
    t.is(typeof s, 'string');
    t.false(/%[0-9a-fA-F]{2}/.test(s), 'slug 不应含 %XX 序列: ' + s);
    for (const ch of ['"', "'", '<', '>', '&', '%', '`']) {
      t.false(s.includes(ch), `slug 不应含 ${ch}: ${s}`);
    }
  }
});

test('CJK 与字母数字保留(实现约定: 统一转小写, 空白折叠为连字符)', t => {
  t.is(anchorSlugify('查询接口'), '查询接口');
  t.is(anchorSlugify('User Profile 01'), 'user-profile-01');
  t.is(anchorSlugify('path_to-resource.2'), 'path_to-resource2');
});

test('纯特殊字符输入返回空串(交由 anchor 处理空 id)', t => {
  t.is(anchorSlugify('"\'<>&%'), '');
  t.is(anchorSlugify('%%%'), '');
  t.is(anchorSlugify(''), '');
});

test('非字符串输入按 String() 语义转字符串(与 anchor 传入标题文本的契约一致)', t => {
  t.is(anchorSlugify(undefined), 'undefined');
  t.is(anchorSlugify(null), 'null');
  t.is(anchorSlugify(123), '123');
});

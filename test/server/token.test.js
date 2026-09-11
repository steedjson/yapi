import test from 'ava';

const yapi = require('../../server/yapi');
const token = require('../../server/utils/token');

// 固定历史密文，验证 Node.js 24 替换加密 API 后仍能读取旧 token。
test('兼容历史 token 加密格式', t => {
  const originalSalt = yapi.WEBCONFIG.passsalt;
  yapi.WEBCONFIG.passsalt = 'abcde';

  try {
    const encoded = token.getToken('abc', '123');
    t.is(encoded, 'b5a3bf0826c8c7162b8b6d4f88e81c3d');
    t.deepEqual(token.parseToken(encoded), { uid: '123', projectToken: 'abc' });
    t.deepEqual(token.parseToken('b5a3bf0826c8c7162b8b6d4f88e81c3d'), {
      uid: '123',
      projectToken: 'abc'
    });
  } finally {
    yapi.WEBCONFIG.passsalt = originalSalt;
  }
});

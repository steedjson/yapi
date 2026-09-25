import test from 'ava';

const crypto = require('crypto');
const commons = require('../../server/utils/commons.js');

// 用 node:crypto 独立复现历史 sha1 公式, 作为与实现无关的 legacy 向量
function legacyDigest(password, passsalt) {
  const sha1Hex = str => crypto.createHash('sha1').update(String(str)).digest('hex');
  return sha1Hex(password + sha1Hex(passsalt));
}

test('verifyPassword 支持 legacy sha1 向量且标记 legacy=true', t => {
  const stored = legacyDigest('pw123456', 'salt456');

  const result = commons.verifyPassword('pw123456', 'salt456', stored);

  t.true(result.valid);
  t.true(result.legacy);
});

test('hashPassword 产物为自描述 scrypt 格式且可被 verifyPassword 校验', t => {
  const stored = commons.hashPassword('pw123456');

  t.regex(stored, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);

  const result = commons.verifyPassword('pw123456', 'unused-salt', stored);

  t.true(result.valid);
  t.false(result.legacy);
});

test('hashPassword 每次生成不同盐, 两次哈希互不相同但均可验证', t => {
  const first = commons.hashPassword('same-password');
  const second = commons.hashPassword('same-password');

  t.not(first, second);
  t.true(commons.verifyPassword('same-password', 'x', first).valid);
  t.true(commons.verifyPassword('same-password', 'x', second).valid);
});

test('verifyPassword 错误密码返回 valid=false(legacy 与 scrypt 两种格式)', t => {
  const legacyStored = legacyDigest('pw123456', 'salt456');
  const scryptStored = commons.hashPassword('pw123456');

  const legacyResult = commons.verifyPassword('wrong-password', 'salt456', legacyStored);
  t.false(legacyResult.valid);
  t.true(legacyResult.legacy);

  const scryptResult = commons.verifyPassword('wrong-password', 'salt456', scryptStored);
  t.false(scryptResult.valid);
  t.false(scryptResult.legacy);
});

test('verifyPassword 对损坏的 scrypt 串返回 valid=false 而不抛错', t => {
  const result = commons.verifyPassword('pw123456', 'salt456', 'scrypt$bad$hash');

  t.false(result.valid);
  t.false(result.legacy);
});

test('generatePassword 产出 scrypt 自描述格式且可被 verifyPassword 往返校验', t => {
  // 新写入口令统一走 scrypt（legacy sha1 仅存在于存量数据，由 verifyPassword 兼容）
  const stored = commons.generatePassword('pw123456', 'salt456');

  t.regex(stored, /^scrypt\$16384\$8\$1\$/);

  const result = commons.verifyPassword('pw123456', 'salt456', stored);

  t.true(result.valid);
  t.false(result.legacy);
});

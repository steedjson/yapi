import test from 'ava';
import { filter, utils, PowerString } from '../../common/power-string.js';

// —— 16 种 stringHandles 方法全覆盖（经 filter 管道语法调用） ——

test('md5: 输出 32 位小写十六进制摘要', t => {
  t.is(filter('abc | md5'), '900150983cd24fb0d6963f7d28e17f72');
});

test('sha: 按参数指定的算法名生成摘要', t => {
  t.is(
    filter('abc | sha: sha256'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('sha1: 输出固定算法摘要', t => {
  t.is(filter('abc | sha1'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
});

test('sha224: 输出固定算法摘要', t => {
  t.is(filter('abc | sha224'), '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
});

test('sha256: 输出固定算法摘要', t => {
  t.is(
    filter('abc | sha256'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('sha384: 输出固定算法摘要', t => {
  t.is(
    filter('abc | sha384'),
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
  );
});

test('sha512: 输出固定算法摘要', t => {
  t.is(
    filter('abc | sha512'),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
  );
});

test('base64: 编码英文与中文', t => {
  t.is(filter('abc | base64'), 'YWJj');
  t.is(filter('hello 你好 | base64'), 'aGVsbG8g5L2g5aW9');
});

test('unbase64: 解码 base64 字符串', t => {
  t.is(filter('aGVsbG8= | unbase64'), 'hello');
});

test('substr: 支持起始位置与长度、负数起始', t => {
  t.is(filter('abcdef | substr: 1, 3'), 'bcd');
  t.is(filter('abcdef | substr: 4'), 'ef');
  t.is(filter('abcdef | substr: -3'), 'def');
});

test('concat: 右拼接单参数、多参数与空参数', t => {
  t.is(filter('abc | concat: 123'), 'abc123');
  t.is(filter('abc | concat: 1, 2'), 'abc12');
  t.is(filter('abc | concat'), 'abc');
});

// lconcat 历史缺陷回归：循环内曾误用 this._string 覆盖累积结果，
// 多参数时仅最后一个参数生效（旧实现输出 'babc'），修复后前缀应按序完整累加
test('lconcat: 单参数左拼接', t => {
  t.is(filter('abc | lconcat: pre_'), 'pre_abc');
});

test('lconcat: 多参数按左拼接语义完整累加前缀（回归修复）', t => {
  t.is(filter('abc | lconcat: a, b'), 'ababc');
  t.is(filter('abc | lconcat: x, y, z'), 'xyzabc');
});

test('lconcat: 空参数时原样返回', t => {
  t.is(filter('abc | lconcat'), 'abc');
});

test('lower: 转小写', t => {
  t.is(filter('AbCdEf | lower'), 'abcdef');
});

test('upper: 转大写', t => {
  t.is(filter('AbCdEf | upper'), 'ABCDEF');
});

test('length: 输出字符串长度', t => {
  t.is(filter('abcd | length'), 4);
  t.is(filter(' | length'), 0);
});

test('number: 纯数字串转数值、非数字串原样返回', t => {
  t.is(filter('4444 | number'), 4444);
  t.true(typeof utils.number('4444') === 'number', 'utils 直调时应返回 number 类型');
  t.is(utils.number('4444'), 4444);
  t.is(filter('abc | number'), 'abc');
  t.is(utils.number('12ab'), '12ab');
});

// —— 管道语法 ——

test('管道链式过滤: 多个方法按序执行', t => {
  t.is(filter('abc | upper | concat: 123'), 'ABC123');
  t.is(filter('abc | upper | base64'), 'QUJD');
  t.is(filter('Y2F0 | unbase64 | upper'), 'CAT');
});

test('管道转义符: \\| 不作为分隔符参与分段', t => {
  t.is(filter('a\\|b | length'), 3);
  t.is(filter('a\\|b | upper'), 'A|B');
});

test('参数转义: \\, 不作为参数分隔符', t => {
  t.is(filter('abc | concat: a\\,b'), 'abca,b');
});

test('参数引号: 成对引号被剥离且保留内部空格', t => {
  t.is(filter("abc | concat: ' x '"), 'abc x ');
});

test('未知方法名应抛出明确错误', t => {
  t.throws(() => filter('abc | notExist'), {
    instanceOf: Error,
    message: 'This method name(notExist) is not exist.'
  });
});

// —— utils 直调与 PowerString 原型链 ——

test('utils 直调与原型方法链式调用语义一致', t => {
  t.is(utils.upper('abc'), 'ABC');
  t.is(utils.lconcat('abc', 'a', 'b'), 'ababc');
  t.is(new PowerString('abc').upper().concat('123').toString(), 'ABC123');
  t.is(new PowerString('abc').lconcat('x', 'y').toString(), 'xyabc');
});

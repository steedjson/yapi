import test from 'ava';

const sandboxFn = require('../../server/utils/sandbox.js');

// 子进程隔离沙箱：验证脚本执行、上下文改写回传、内建注入与超时行为
test('脚本可改写上下文并按 return this 语义返回', async t => {
  const result = await sandboxFn({ a: 1 }, 'a = 2');
  t.is(result.a, 2);
});

test('脚本显式 return 时返回该值', async t => {
  const result = await sandboxFn({ a: 1 }, 'return {custom: 42}');
  t.deepEqual(result, { custom: 42 });
});

test('async/await 脚本可用', async t => {
  const result = await sandboxFn({ a: 1 }, 'await Promise.resolve(1); a = a + 1');
  t.is(result.a, 2);
});

test('assert 由子进程注入真实实现', async t => {
  try {
    await sandboxFn({}, 'assert.equal(1, 1)');
    t.pass();
  } catch (e) {
    t.fail('合法断言不应抛错: ' + e.message);
  }
});

test('断言失败产生可读错误', async t => {
  try {
    await sandboxFn({}, 'assert.equal(1, 2)');
    t.fail('断言失败应抛错');
  } catch (e) {
    t.regex(e.message, /1 == 2|1 !== 2/);
  }
});

test('log() 输出被子进程收集', async t => {
  const result = await sandboxFn({}, 'log("你好")');
  t.deepEqual(result.logs, ['你好']);
});

test('Random 由子进程注入 mockjs', async t => {
  const result = await sandboxFn({}, 'value = Random.integer(3, 3)');
  t.is(result.value, 3);
});

test('脚本抛错时以可读错误拒绝', async t => {
  try {
    await sandboxFn({}, 'throw new Error("boom")');
    t.fail('脚本抛错应拒绝');
  } catch (e) {
    t.regex(e.message, /boom/);
  }
});

test('同步死循环受 vm timeout 保护', async t => {
  try {
    await sandboxFn({}, 'while(true){}');
    t.fail('死循环应超时拒绝');
  } catch (e) {
    t.regex(e.message, /执行超时|timed out|Script execution/i);
  }
});

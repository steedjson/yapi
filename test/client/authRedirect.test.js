import test from 'ava';

// menu reducer 在模块顶层读取 window.location.hash，Node 测试环境需先垫片
global.window = global.window || { location: { hash: '/' } };

const { resolveSafeRedirect } = require('../../client/components/AuthenticatedComponent');

test('登录回跳接受站内绝对路径, 支持字符串与 location 形态', t => {
  t.is(resolveSafeRedirect('/project/123'), '/project/123');
  t.is(resolveSafeRedirect('/group/7?a=1#tab'), '/group/7?a=1#tab');
  t.is(
    resolveSafeRedirect({ pathname: '/group/7', search: '?a=1', hash: '#tab' }),
    '/group/7?a=1#tab'
  );
  t.is(resolveSafeRedirect({ pathname: '/' }), '/');
});

test('登录回跳拒绝外部地址与协议相对写法, 回落 /group', t => {
  t.is(resolveSafeRedirect('https://evil.com/x'), '/group');
  t.is(resolveSafeRedirect('//evil.com'), '/group');
  t.is(resolveSafeRedirect('/\\evil.com'), '/group');
  t.is(resolveSafeRedirect('javascript:alert(1)'), '/group');
});

test('登录回跳不回到登录页本身, 非法/缺失 from 回落 /group', t => {
  t.is(resolveSafeRedirect('/login'), '/group');
  t.is(resolveSafeRedirect({ pathname: '/login' }), '/group');
  t.is(resolveSafeRedirect(undefined), '/group');
  t.is(resolveSafeRedirect(null), '/group');
  t.is(resolveSafeRedirect(''), '/group');
  t.is(resolveSafeRedirect({}), '/group');
  t.is(resolveSafeRedirect(123), '/group');
});

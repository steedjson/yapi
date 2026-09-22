// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';

const { default: useUserStore } = require('../../../client/store/userStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// 与 store initialState 逐字段一致的复位种子（模块级单例，不复位会串场）
const INITIAL_STATE = {
  isLogin: false,
  canRegister: true,
  isLDAP: false,
  userName: null,
  uid: null,
  email: '',
  loginState: 0,
  loginWrapActiveKey: '1',
  role: '',
  type: '',
  breadcrumb: [],
  studyTip: 0,
  study: false,
  imageUrl: ''
};

test.beforeEach(() => {
  useUserStore.setState(INITIAL_STATE);
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

test('初始状态：与旧 reducer initialState 严格一致（三态门禁初始为 LOADING=0）', t => {
  const state = useUserStore.getState();
  t.is(state.loginState, 0, 'loginState 初始应为 LOADING_STATUS(0)');
  t.false(state.isLogin);
  t.true(state.canRegister);
  t.false(state.isLDAP);
  t.is(state.userName, null);
  t.is(state.uid, null);
  t.is(state.loginWrapActiveKey, '1');
  t.is(state.role, '');
  t.is(state.type, '');
  t.deepEqual(state.breadcrumb, []);
  t.is(state.studyTip, 0);
  t.false(state.study);
  t.is(state.imageUrl, '');
});

test.serial('checkLoginState errcode=0：进入成员态并回填用户字段', async t => {
  axios.get = url => {
    t.is(url, '/api/user/status');
    return Promise.resolve({
      data: {
        errcode: 0,
        canRegister: false,
        ladp: true,
        data: { _id: 11, username: 'alice', role: 'admin', type: 'ldap', study: true }
      }
    });
  };

  await useUserStore.getState().checkLoginState();

  const state = useUserStore.getState();
  t.is(state.loginState, 2, 'errcode=0 应进入 MEMBER_STATUS(2)');
  t.true(state.isLogin);
  t.false(state.canRegister);
  t.true(state.isLDAP, '应保留旧 reducer 的 ladp 拼写（读响应体 ladp 字段）');
  t.is(state.uid, 11);
  t.is(state.userName, 'alice');
  t.is(state.role, 'admin');
  t.is(state.type, 'ldap');
  t.true(state.study);
});

test.serial('checkLoginState errcode=40011：写入游客态（旧链路唯一放行的非 0 码）', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 40011, errmsg: '请登录' } });

  await useUserStore.getState().checkLoginState();

  const state = useUserStore.getState();
  t.is(state.loginState, 1, '40011 应进入 GUEST_STATUS(1)');
  t.false(state.isLogin);
  t.is(state.userName, null);
  t.is(state.uid, null);
});

test.serial('checkLoginState 其余 errcode：不写状态（旧 messageMiddleware 拦截语义）', async t => {
  useUserStore.setState({ loginState: 2, isLogin: true });
  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: 'no perm' } });

  await useUserStore.getState().checkLoginState();

  const state = useUserStore.getState();
  t.is(state.loginState, 2, '非 0/40011 errcode 不应写状态');
  t.true(state.isLogin, '保留旧状态');
});

test.serial('checkLoginState 网络错误：返回 null 且保留旧状态', async t => {
  useUserStore.setState({ loginState: 2 });
  axios.get = () => Promise.reject(new Error('network down'));

  const res = await useUserStore.getState().checkLoginState();

  t.is(res, null, '网络错误应返回 null');
  t.is(useUserStore.getState().loginState, 2);
});

test.serial('loginActions errcode=0：写入成员态；errcode 非 0：不写状态', async t => {
  axios.post = (url, body) => {
    t.is(url, '/api/user/login');
    t.deepEqual(body, { email: 'a@b.c', password: 'p' });
    return Promise.resolve({
      data: { errcode: 0, data: { uid: 9, username: 'bob', role: 'member', type: 'site', study: false } }
    });
  };
  await useUserStore.getState().loginActions({ email: 'a@b.c', password: 'p' });

  let state = useUserStore.getState();
  t.is(state.loginState, 2);
  t.is(state.uid, 9);
  t.is(state.userName, 'bob');
  t.is(state.role, 'member');
  t.is(state.type, 'site');

  // 登录失败：不写状态（旧链路被 messageMiddleware 拦截，reducer else 分支等价）
  useUserStore.setState(INITIAL_STATE);
  axios.post = () => Promise.resolve({ data: { errcode: 400, errmsg: '密码错误' } });
  const res = await useUserStore.getState().loginActions({ email: 'a@b.c', password: 'x' });
  t.is(res.data.errcode, 400, '应返回响应供消费方分支提示');
  state = useUserStore.getState();
  t.is(state.loginState, 0, '登录失败不应写状态');
  t.false(state.isLogin);
});

test.serial('loginLdapActions：命中 login_by_ldap 端点且 errcode=0 才写状态', async t => {
  axios.post = (url, body) => {
    t.is(url, '/api/user/login_by_ldap', 'LDAP 登录应使用独立端点');
    t.deepEqual(body, { username: 'ldap-u' });
    return Promise.resolve({
      data: { errcode: 0, data: { uid: 7, username: 'dave', role: 'member', type: 'ldap', study: false } }
    });
  };
  await useUserStore.getState().loginLdapActions({ username: 'ldap-u' });

  const state = useUserStore.getState();
  t.is(state.loginState, 2);
  t.true(state.isLogin);
  t.is(state.uid, 7);
  t.is(state.type, 'ldap');

  // errcode 非 0：不写状态（旧链路被 messageMiddleware 拦截）
  useUserStore.setState(INITIAL_STATE);
  axios.post = () => Promise.resolve({ data: { errcode: 40011, errmsg: 'LDAP 校验失败' } });
  const res = await useUserStore.getState().loginLdapActions({ username: 'ldap-u' });
  t.is(res.data.errcode, 40011, '应返回响应供消费方分支提示');
  t.is(useUserStore.getState().loginState, 0, '登录失败不应写状态');
});

test.serial('regActions：参数映射 username 且 errcode=0 才写状态', async t => {
  axios.post = (url, body) => {
    t.is(url, '/api/user/reg');
    t.deepEqual(body, { email: 'a@b.c', password: 'p', username: 'carol' }, 'userName 应映射为 username');
    return Promise.resolve({
      data: { errcode: 0, data: { uid: 5, username: 'carol', type: 'site', study: false } }
    });
  };
  await useUserStore.getState().regActions({ email: 'a@b.c', password: 'p', userName: 'carol' });

  const state = useUserStore.getState();
  t.is(state.loginState, 2);
  t.is(state.uid, 5);
  t.is(state.userName, 'carol');
  t.is(state.type, 'site');
});

test.serial('logoutActions：请求落地即复位游客态（网络错误亦复位）并返回响应', async t => {
  useUserStore.setState({ isLogin: true, loginState: 2, userName: 'bob', uid: 9, role: 'member', type: 'site' });
  let calls = 0;
  axios.get = url => {
    t.is(url, '/api/user/logout');
    calls++;
    if (calls === 1) {
      return Promise.resolve({ data: { errcode: 0 } });
    }
    return Promise.reject(new Error('network down'));
  };

  const res = await useUserStore.getState().logoutActions();
  t.is(res.data.errcode, 0, '成功时返回 axios 响应');
  let state = useUserStore.getState();
  t.is(state.loginState, 1, '应复位为游客态');
  t.false(state.isLogin);
  t.is(state.uid, null);
  t.is(state.role, '');

  // 旧 LOGIN_OUT case 不读 payload：网络错误同样复位（旧链路经 error action 仍进 reducer）
  const res2 = await useUserStore.getState().logoutActions();
  t.is(res2, null, '网络错误返回 null');
  state = useUserStore.getState();
  t.is(state.loginState, 1, '网络错误后仍应为游客态');
  t.false(state.isLogin);
});

test.serial('同步动作：loginTypeAction/setBreadcrumb/setImageUrl/changeStudyTip 直写状态', t => {
  useUserStore.getState().loginTypeAction('2');
  t.is(useUserStore.getState().loginWrapActiveKey, '2');

  const crumb = [{ name: '我的关注' }];
  useUserStore.getState().setBreadcrumb(crumb);
  t.is(useUserStore.getState().breadcrumb, crumb, 'setBreadcrumb 应原样写入引用');

  useUserStore.getState().setImageUrl('data:image/png;base64,xxx');
  t.is(useUserStore.getState().imageUrl, 'data:image/png;base64,xxx');

  useUserStore.getState().changeStudyTip();
  useUserStore.getState().changeStudyTip();
  t.is(useUserStore.getState().studyTip, 2, 'changeStudyTip 应基于最新值 +1');
});

test.serial('finishStudy：请求落地即写 study=true/studyTip=0', async t => {
  useUserStore.setState({ studyTip: 2, study: false });
  axios.get = url => {
    t.is(url, '/api/user/up_study');
    return Promise.resolve({ data: { errcode: 0 } });
  };

  await useUserStore.getState().finishStudy();

  const state = useUserStore.getState();
  t.true(state.study);
  t.is(state.studyTip, 0);
});

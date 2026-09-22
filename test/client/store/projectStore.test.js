// 纯 store 单测：无 DOM 依赖，不引入 jsdom（参照 followStore.test.js 的纯 node 风格）
import test from 'ava';
import axios from 'axios';

const { default: useProjectStore } = require('../../../client/store/projectStore');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// 与 store initialState 逐字段一致的复位种子（模块级单例，不复位会串场）
const INITIAL_STATE = {
  isUpdateModalShow: false,
  handleUpdateIndex: -1,
  projectList: [],
  projectMsg: {},
  userInfo: {},
  tableLoading: true,
  total: 0,
  currPage: 1,
  token: '',
  currProject: {},
  projectEnv: {
    env: [
      {
        header: []
      }
    ]
  },
  swaggerUrlData: ''
};

test.beforeEach(() => {
  useProjectStore.setState(INITIAL_STATE);
});

test.afterEach.always(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

test('初始状态：与旧 reducer initialState 严格一致', t => {
  const state = useProjectStore.getState();
  t.false(state.isUpdateModalShow);
  t.is(state.handleUpdateIndex, -1);
  t.deepEqual(state.projectList, []);
  t.deepEqual(state.projectMsg, {});
  t.deepEqual(state.userInfo, {});
  t.true(state.tableLoading);
  t.is(state.total, 0);
  t.is(state.currPage, 1);
  t.is(state.token, '');
  t.deepEqual(state.currProject, {});
  t.deepEqual(state.projectEnv, { env: [{ header: [] }] });
  t.is(state.swaggerUrlData, '');
});

test.serial('fetchProjectList 成功：写入 list/total/userinfo 并携带分页参数', async t => {
  const list = [{ _id: 1, name: '项目A' }];
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list, total: 25, userinfo: { uid: 9 } } } });
  };

  const res = await useProjectStore.getState().fetchProjectList(7, 2);

  t.deepEqual(gets, [{ url: '/api/project/list', params: { group_id: 7, page: 2, limit: 10 } }], '应以 GET /api/project/list?group_id&page 拉取');
  t.is(res.data.errcode, 0, '返回 axios 响应（res.data 对应旧 res.payload.data）');
  const state = useProjectStore.getState();
  t.deepEqual(state.projectList, list);
  t.is(state.total, 25);
  t.deepEqual(state.userInfo, { uid: 9 });
});

test.serial('fetchProjectList：pageNum 缺省回退 1，limit 取 variable.PAGE_LIMIT', async t => {
  const gets = [];
  axios.get = (url, config) => {
    gets.push(config && config.params);
    return Promise.resolve({ data: { errcode: 0, data: { list: [], total: 0, userinfo: {} } } });
  };

  await useProjectStore.getState().fetchProjectList(3);

  t.deepEqual(gets, [{ group_id: 3, page: 1, limit: 10 }], '缺省页码应为 1，limit 应为 PAGE_LIMIT');
});

test.serial('fetchProjectList errcode 非 0 / 网络错误：不写状态', async t => {
  useProjectStore.setState({ projectList: [{ _id: 99 }] });
  axios.get = () => Promise.resolve({ data: { errcode: 400, errmsg: 'no perm' } });
  await useProjectStore.getState().fetchProjectList(7);
  t.deepEqual(useProjectStore.getState().projectList, [{ _id: 99 }], '失败保留旧列表');

  axios.get = () => Promise.reject(new Error('down'));
  const res = await useProjectStore.getState().fetchProjectList(7);
  t.is(res, null, '网络错误返回 null');
  t.deepEqual(useProjectStore.getState().projectList, [{ _id: 99 }]);
});

test.serial('getProject 成功：写入 currProject；errcode 非 0 保留旧值', async t => {
  const project = { _id: 12, name: '演示项目', basepath: '/base' };
  const gets = [];
  axios.get = url => {
    gets.push(url);
    return Promise.resolve({ data: { errcode: 0, data: project } });
  };

  const res = await useProjectStore.getState().getProject(12);

  t.is(gets[0], '/api/project/get?id=12');
  t.is(res.data.errcode, 0);
  t.deepEqual(useProjectStore.getState().currProject, project);

  axios.get = () => Promise.resolve({ data: { errcode: 40011, errmsg: 'no perm' } });
  await useProjectStore.getState().getProject(13);
  t.deepEqual(useProjectStore.getState().currProject, project, 'errcode 非 0 保留旧 currProject');
});

test.serial('getToken/updateToken：写入 token（updateToken 取 data.token 字段）', async t => {
  axios.get = url => {
    if (url === '/api/project/token') {
      return Promise.resolve({ data: { errcode: 0, data: 'tk_str_123' } });
    }
    return Promise.resolve({ data: { errcode: 0, data: { token: 'tk_new_456' } } });
  };

  await useProjectStore.getState().getToken(12);
  t.is(useProjectStore.getState().token, 'tk_str_123', 'GET_TOKEN 写入裸 token');

  await useProjectStore.getState().updateToken(12);
  t.is(useProjectStore.getState().token, 'tk_new_456', 'UPDATE_TOKEN 写入 data.token');
});

test.serial('getEnv 成功：写入 projectEnv；网络错误保留旧值', async t => {
  const env = { env: [{ name: 'dev', domain: 'http://dev' }] };
  axios.get = (url, config) => {
    t.is(url, '/api/project/get_env');
    t.deepEqual(config && config.params, { project_id: 12 });
    return Promise.resolve({ data: { errcode: 0, data: env } });
  };

  await useProjectStore.getState().getEnv(12);
  t.deepEqual(useProjectStore.getState().projectEnv, env);

  axios.get = () => Promise.reject(new Error('down'));
  const res = await useProjectStore.getState().getEnv(12);
  t.is(res, null);
  t.deepEqual(useProjectStore.getState().projectEnv, env, '网络错误保留旧 projectEnv');
});

test.serial('handleSwaggerUrlData：URL 双重 encodeURI 且成功写入 swaggerUrlData', async t => {
  axios.get = url => {
    t.is(url, '/api/project/swagger_url?url=' + encodeURI(encodeURI('http://x.com/sw?a b')));
    return Promise.resolve({ data: { errcode: 0, data: { apis: [] } } });
  };

  await useProjectStore.getState().handleSwaggerUrlData('http://x.com/sw?a b');
  t.deepEqual(useProjectStore.getState().swaggerUrlData, { apis: [] });
});

test.serial('纯请求动作：addProject 走 htmlFilter 且不改状态', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: { _id: 33 } } });
  };

  const before = useProjectStore.getState();
  await useProjectStore.getState().addProject({
    name: '项目<b>x</b>',
    prd_host: 'http://a.com',
    basepath: '/p',
    desc: 'd',
    group_id: 1,
    group_name: 'g',
    protocol: 'http:',
    icon: 'code-o',
    color: 'blue',
    project_type: '站点'
  });

  t.is(posts[0].url, '/api/project/add');
  t.is(posts[0].body.name, '项目x', 'name 应经 htmlFilter 过滤 html 标签');
  t.deepEqual(useProjectStore.getState(), before, '旧 reducer 无状态写入，纯请求动作');
});

test.serial('纯请求动作：updateEnv 参数重组（_id → id）；成员动作返回响应', async t => {
  const posts = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };

  await useProjectStore.getState().updateEnv({ _id: 12, env: [{ name: 'dev' }] });
  await useProjectStore.getState().delMember({ id: 12, member_uid: 9 });
  await useProjectStore.getState().changeMemberEmailNotice({ id: 12, member_uid: 9, notice: true });
  await useProjectStore.getState().delProject(12);

  t.deepEqual(
    posts.map(p => p.url),
    [
      '/api/project/up_env',
      '/api/project/del_member',
      '/api/project/change_member_email_notice',
      '/api/project/del'
    ],
    '各纯请求动作应命中各自端点'
  );
  t.deepEqual(posts[0].body, { id: 12, env: [{ name: 'dev' }] }, 'updateEnv 应将 _id 重组为 id');

  // checkProjectName 为 GET 纯请求动作
  const gets = [];
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { isExist: false } } });
  };
  await useProjectStore.getState().checkProjectName('n', 1);
  t.deepEqual(gets, [
    { url: '/api/project/check_project_name', params: { name: 'n', group_id: 1 } }
  ], 'checkProjectName 应以 GET 携带 name/group_id');
});

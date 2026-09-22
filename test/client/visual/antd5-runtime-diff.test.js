/**
 * antd5 覆盖面视觉巡检 · 层 B：运行时计算样式差分（批次 1）
 * ============================================================
 * 对层 A（scripts/antd5-candidate-scan.mjs）登记的自定义候选规则逐条实测：
 * 在 jsdom 中挂载可达页面（复用 containers.js / 既有页面测试的挂载配方），
 * 找到携带候选自定义类的元素，用级联仿真（test/client/visual/antd5Cascade.js，
 * 因 jsdom getComputedStyle 不级联样式表）求每个观察属性的胜出规则，
 * 与候选声明比对，产出 confirmed-override / ambiguous / not-overridden 判定；
 * dev（带 css-dev-only- 哈希，0,2,0）与 prod（单哈希，0,1,0）双口径同时给出。
 *
 * 产物：os.tmpdir()/yapi-antd5-layerb/findings.json ——
 * docs/antd5-visual-audit-findings.md 登记表的数据源；断言锚点：已知事故点位 .card-login margin-top——引擎必须能对照
 * 提交态产物复现 979dfa67 原始事故（产物滞后于源码修复，见登录页锚点用例注释）。
 *
 * 批次 2 起本文件维持全量页面域挂载：login/register、home（游客/登录）、
 * group（列表/成员/设置/动态）、interface（用例集合/运行/列表/详情/编辑）、
 * project setting（项目配置/token/数据）、project activity、statistics、
 * user（列表/资料）、follows、add-project。
 * 批次 2a 起，原 8 条 confirmed-override 中的 7 条（F-1 border-radius、N-1、N-3、
 * N-4、N-5、N-6、N-7）已修复并逐条固化为 not-overridden 锚点；N-2 按裁决保持
 * confirmed 在案（待层 C 后修），汇总用例把「confirmed 仅剩 N-2」钉为门禁。
 * 仍无法挂载或伪类选择器静态不匹配的候选在汇总用例标注 needs-manual，
 * 由主 Agent 层 C 浏览器走查补全。
 *
 * jsdom 环境必须在任何生产代码之前装载
 */
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cleanupDom, renderWithProviders, flushEffects, stubDefaultExport, REPO_ROOT } from '../../helpers/containers';

const Module = require('module');

// client/、exts/ 裸前缀别名（webpack alias 等价物），必须在 require 生产代码之前安装：
// Home.js require('client/plugin.js')、statistics 页 import 'client/reducer/modules/user'
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (
    typeof request === 'string' &&
    (request.indexOf('client/') === 0 || request.indexOf('exts/') === 0)
  ) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// ---- 层 A 扫描库（scripts/antd5-css-lib.cjs：pirates 不钩 .cjs，双端同源口径）----
const cascade = require('./antd5Cascade.js');

// ---- 静态产物规则与候选（共享装载器 prdRules.js：真实注入序 initial → runtime → 异步 chunk）----
const { PRD_DIR, scanLib, loadPrdRules, buildRuntimeRules } = require('./prdRules.js');
const scanResult = scanLib.scanCandidates(PRD_DIR);
const candidates = scanResult.candidates;
const PRD_RULES = loadPrdRules();

// ---- antd5 运行时样式归集（跨页面按文本去重，保持首次注入顺序）----
const runtimeStyleTexts = [];
const runtimeStyleSeen = new Set();

function collectRuntimeStyles() {
  Array.from(document.querySelectorAll('style')).forEach(style => {
    const text = String(style.textContent || '');
    if (text && !runtimeStyleSeen.has(text)) {
      runtimeStyleSeen.add(text);
      runtimeStyleTexts.push(text);
    }
  });
}

// ---- axios 桩：宽松兜底（未知端点返回空数据），页面挂载各自覆盖关心的端点 ----
const axios = require('axios');

// group 切片已迁至 Zustand（批次3）：GroupList/GroupSetting/ProjectMessage/AddProject 等经 useGroupStore 读取
const useGroupStore = require('../../../client/store/groupStore').default;
const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

function seedGroupStore(groupState) {
  useGroupStore.setState(Object.assign({}, INITIAL_GROUP_STATE, groupState));
}

function stubAxios(overrides) {
  const routes = overrides || [];
  const respond = (url) => {
    for (const r of routes) {
      const hit = typeof r.match === 'string' ? url.indexOf(r.match) === 0 : r.match.test(url);
      if (hit) return r.respond(url);
    }
    return { errcode: 0, data: [] };
  };
  axios.get = url => Promise.resolve({ data: respond(String(url)) });
  axios.post = url => Promise.resolve({ data: respond(String(url)) });
}

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// ---- AceEditor / crossRequest 桩（Postman 页需要；对其他页面无影响）----
const FAKE_ACE_EDITOR = { editor: { insertCode: () => {}, editor: { getCursorIndex: () => 0 } } };
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => FAKE_ACE_EDITOR, []);
    return React.createElement(
      'div',
      {
        className: props.className,
        'data-data': String(props.data == null ? '' : props.data),
        'data-mode': String(props.mode),
        'data-readonly': String(!!props.readOnly)
      },
      'STUB_ACE'
    );
  })
);

// ---- 批次 2 扩充页面所需的重型子组件桩（与各自既有容器测试同源口径）----
// TimeLine：GroupLog / Activity 页挂载即发网络请求，桩为回显 props 的静态组件
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/TimeLine/TimeLine.js'),
  function StubTimeLine(props) {
    return React.createElement(
      'section',
      { className: 'stub-timeline', 'data-type': String(props.type), 'data-typeid': String(props.typeid) },
      'STUB_TIMELINE'
    );
  }
);
// SchemaTable：View 页返回数据 schema 表格，依赖 Ace 与测量环境
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/SchemaTable/SchemaTable.js'),
  function StubSchemaTable() {
    return React.createElement('div', { className: 'stub-schema-table' }, 'STUB_SCHEMA_TABLE');
  }
);
// mockEditor / MarkdownEditor：interface 编辑页（Edit → InterfaceEditForm）
stubDefaultExport(path.join(REPO_ROOT, 'client/components/AceEditor/mockEditor.js'), function StubMockEditor() {
  return { setValue: function() {} };
});
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/MarkdownEditor/index.js'),
  React.forwardRef(function StubMarkdownEditor(props, ref) {
    React.useImperativeHandle(ref, () => ({}), []);
    return React.createElement(
      'div',
      { className: 'stub-markdown-editor', 'data-value': String(props.value == null ? '' : props.value) },
      'STUB_MARKDOWN'
    );
  })
);
// 批次 3 消费方切换后 schemaEditors.js 渲染真实自研组件；批次 4 旧包
// json-schema-editor-visual 已删除，此处的 jsv require.cache 工厂死桩一并清除。

const postmanLibPath = path.join(REPO_ROOT, 'common/postmanLib.js');
const realPostmanLib = require(postmanLibPath);
{
  const stubModule = new Module(postmanLibPath, null);
  stubModule.filename = postmanLibPath;
  stubModule.loaded = true;
  stubModule.exports = Object.assign({}, realPostmanLib, {
    crossRequest() {
      return new Promise(resolve => {
        setTimeout(
          () =>
            resolve({
              res: {
                header: { 'content-type': 'application/json' },
                body: { echo: 'ok' },
                status: 200,
                statusText: 'OK'
              },
              runTime: 5
            }),
          10
        );
      });
    }
  });
  require.cache[postmanLibPath] = stubModule;
}

test.serial.beforeEach(() => {
  stubAxios();
});

// ================= 页面挂载配方 =================

// ---- login（含已知事故点位 .card-login / .login-form-button）----
async function mountLogin() {
  const { default: LoginContainer } = require('../../../client/containers/Login/LoginContainer.js');
  renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '1', canRegister: true } },
    routePath: '/login',
    initialPath: '/login'
  });
  await flushEffects(60);
}

// ---- home 游客落地页 ----
async function mountHome() {
  const { default: Home } = require('../../../client/containers/Home/Home.js');
  renderWithProviders(React.createElement(Home), {
    seedState: { user: { isLogin: false, loginState: 1 } },
    routePath: '/',
    initialPath: '/'
  });
  await flushEffects(60);
}

// ---- group 列表（GroupList 配方；静态种子 store，菜单直接由种子 groupList 渲染）----
const G1 = { _id: 71, group_name: '前端组', group_desc: 'd1', type: 'public' };
const G2 = { _id: 72, group_name: '后端组', group_desc: 'd2', type: 'public' };
const G3 = { _id: 73, group_name: '私有组', group_desc: 'd3', type: 'private' };
async function mountGroupList() {
  stubAxios([
    {
      match: '/api/group/list',
      respond: () => ({ errcode: 0, data: [G1, G2, G3] })
    },
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: G1 }) },
    { match: '/api/log/', respond: () => ({ errcode: 0, data: { list: [], total: 0 } }) }
  ]);
  const { default: GroupList } = require('../../../client/containers/Group/GroupList/GroupList.js');
  renderWithProviders(React.createElement(GroupList), {
    seedState: {
      group: { currGroup: G1, groupList: [G1, G2, G3], role: 'dev' },
      user: { role: 'regular', studyTip: 1, study: true }
    },
    routePath: '/group/*',
    initialPath: '/group/71'
  });
  await flushEffects(120);
}

// ---- interface 用例集合（InterfaceColContent 配方，容器测试同源 fixtures）----
async function mountInterfaceCol() {
  stubAxios([
    { match: '/api/col/list', respond: () => ({ errcode: 0, data: [{ _id: 5, name: '集合A', desc: 'x' }] }) },
    { match: '/api/project/token', respond: () => ({ errcode: 0, data: { token: 'T' } }) },
    {
      match: '/api/col/case_list',
      respond: () => ({
        errcode: 0,
        colData: { test_report: '{}', checkHttpCodeIs200: false, checkResponseField: {}, checkResponseSchema: false, checkScript: {} },
        data: [
          {
            _id: 'c1',
            id: 'c1',
            casename: '用例一',
            path: '/api/one',
            method: 'GET',
            project_id: 'p1',
            interface_id: 'i1',
            case_env: 'dev',
            test_status: '',
            req_headers: [],
            req_params: [],
            req_query: [],
            req_body_form: [],
            req_body_type: 'json',
            req_body_other: ''
          }
        ]
      })
    },
    { match: '/api/col/case_env_list', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  const { default: InterfaceColContent } = require(
    '../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js'
  );
  renderWithProviders(React.createElement(InterfaceColContent), {
    seedState: {
      interfaceCol: {
        interfaceColList: [{ _id: 5, name: '集合A', desc: 'x' }],
        currColId: 5,
        currCaseId: null,
        isShowCol: false,
        isRander: false,
        currCaseList: [],
        envList: [{ _id: 'p1', name: '演示项目', env: [{ _id: 'e1', name: 'dev', domain: 'http://d.example.com', header: [] }] }]
      },
      project: { currProject: { _id: 12, name: '演示项目', role: 'admin', pre_script: '', after_script: '' }, token: 'T', projectEnv: [] },
      user: { uid: 7 }
    },
    initialPath: '/project/12/interface/col/5',
    routePath: '/project/:id/interface/col/:actionId'
  });
  await flushEffects(400);
}

// ---- interface 运行（Postman 配方，容器测试同源 fixtures）----
const POSTMAN_INTER = {
  _id: 100,
  title: '接口一',
  method: 'POST',
  path: '/api/pet/{id}',
  project_id: 12,
  req_headers: [{ name: 'Content-Type', value: 'application/json', required: '1' }],
  req_params: [{ name: 'id', desc: '路径参数', value: '42' }],
  req_query: [{ name: 'q', required: '1', example: 'hello' }],
  req_body_type: 'json',
  req_body_form: [],
  req_body_other: '{"name":"zhang"}',
  req_body_is_json_schema: false,
  res_body_type: 'json',
  res_body: '{"a":1}',
  res_body_is_json_schema: false,
  env: [{ name: 'local', domain: 'http://localhost:3000', header: [] }],
  case_env: 'local',
  pre_script: '',
  after_script: ''
};

async function mountPostman() {
  stubAxios([
    { match: '/api/interface/schema2json', respond: () => ({ mockKey: 'mockValue' }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  window.crossRequest = function() {};
  const { default: Postman } = require('../../../client/components/Postman/Postman.js');
  renderWithProviders(React.createElement(Postman, { curUid: 9, interfaceId: 100, projectId: 12, save: () => {}, data: POSTMAN_INTER, type: 'inter' }), {
    seedState: {
      group: { field: { enable: false, name: '' } },
      project: { currProject: { _id: 12, name: '演示项目' } },
      user: { uid: 9 }
    }
  });
  await flushEffects(400);
}

// ---- statistics（插件统计页配方，statisticsPage.test.js 同源）----
async function mountStatistics() {
  stubAxios([
    { match: '/api/plugin/statismock/count', respond: () => ({ errcode: 0, data: { groupCount: 3, projectCount: 8, interfaceCount: 66, interfaceCaseCount: 90 } }) },
    { match: '/api/plugin/statismock/get_system_status', respond: () => ({ errcode: 0, data: { mail: 'true', systemName: 'darwin', totalmem: '16', freemem: '8' } }) },
    { match: '/api/plugin/statismock/group_data_statis', respond: () => ({ errcode: 0, data: [{ name: 'group1', project: 2, interface: 10, mock: 5 }] }) },
    { match: '/api/plugin/statismock/get', respond: () => ({ errcode: 0, data: { mockCount: 12345, mockDateList: [] } }) }
  ]);
  const statisticsPage = require('../../../exts/yapi-plugin-statistics/statisticsClientPage');
  renderWithProviders(React.createElement(statisticsPage.default), {
    seedState: {},
    routePath: '/statistic',
    initialPath: '/statistic'
  });
  await flushEffects(150);
}

// ================= 批次 2 扩充页面挂载配方 =================

// ---- register（LoginWrap 页签 2，login chunk 注册域）----
async function mountRegister() {
  const { default: LoginContainer } = require('../../../client/containers/Login/LoginContainer.js');
  renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '2', canRegister: true } },
    routePath: '/login',
    initialPath: '/login'
  });
  await flushEffects(60);
}

// ---- 全局 Header/Footer（index chunk 登录后全局外壳深层结构）。
// 注：Home 组件在 isLogin=true 时 <Navigate to="/group">，登录态首页即 group 页
// （已由 mountGroupList 覆盖），此处补挂全局外壳组件而非重复挂 group。----
async function mountGlobalChrome() {
  const { default: Header } = require('../../../client/components/Header/Header.js');
  const { default: Footer } = require('../../../client/components/Footer/Footer.js');
  renderWithProviders(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Header),
      React.createElement('main'),
      React.createElement(Footer)
    ),
    {
      seedState: {
        user: { isLogin: true, uid: 9, role: 'member', userName: 'alice', email: 'a@b.c', type: 'site' },
        group: { groupList: [G1], currGroup: G1, role: 'dev' },
        project: { projectList: [] }
      },
      routePath: '/',
      initialPath: '/'
    }
  );
  await flushEffects(120);
}

// ---- group 成员管理（MemberList 配方）----
const GROUP_MEMBERS = [
  { uid: 11, username: '张三', email: 'zhangsan@test.com', role: 'owner' },
  { uid: 22, username: '李四', email: 'lisi@test.com', role: 'dev' }
];
async function mountGroupMember() {
  // 注意 stubAxios 按前缀匹配且顺序敏感：'/api/group/get' 是
  // '/api/group/get_member_list' 的前缀，具体路由必须排在前面
  stubAxios([
    { match: '/api/group/get_member_list', respond: () => ({ errcode: 0, data: GROUP_MEMBERS.slice() }) },
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: Object.assign({}, G1, { role: 'owner', custom_field1: { name: '', enable: false } }) }) }
  ]);
  const { default: MemberList } = require('../../../client/containers/Group/MemberList/MemberList.js');
  renderWithProviders(React.createElement(MemberList), {
    seedState: { user: { uid: 11 }, group: { currGroup: G1, role: 'owner' } }
  });
  await flushEffects(120);
}

// ---- group 设置（GroupSetting 配方；custom_field1 为表单回填必填形状）----
async function mountGroupSetting() {
  stubAxios([
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: Object.assign({ custom_field1: { name: '业务线', enable: true } }, G1, { role: 'owner' }) }) },
    { match: '/api/log/', respond: () => ({ errcode: 0, data: { list: [], total: 0 } }) }
  ]);
  seedGroupStore({
    currGroup: Object.assign({ custom_field1: { name: '业务线', enable: true } }, G1),
    groupList: [G1],
    role: 'owner'
  });
  const { default: GroupSetting } = require('../../../client/containers/Group/GroupSetting/GroupSetting.js');
  renderWithProviders(React.createElement(GroupSetting), {
    seedState: {
      user: { uid: 11 },
      group: { currGroup: Object.assign({ custom_field1: { name: '业务线', enable: true } }, G1), role: 'owner' },
      news: { newsData: { notRead: {} } }
    }
  });
  await flushEffects(120);
}

// ---- group 动态（GroupLog 配方；TimeLine 已桩）----
async function mountGroupLog() {
  seedGroupStore({ currGroup: G1 });
  const { default: GroupLog } = require('../../../client/containers/Group/GroupLog/GroupLog.js');
  renderWithProviders(React.createElement(GroupLog), {
    seedState: { user: { uid: 11 }, group: { currGroup: G1 } }
  });
  await flushEffects(60);
}

// ---- project 域共享 fixtures（ProjectSetting.test.js / InterfaceListAndView.test.js 同源）----
const CURR_PROJECT_FULL = {
  _id: 12,
  name: '演示项目',
  desc: '项目描述',
  project_type: '站点',
  group_id: 1,
  basepath: '/base',
  switch_notice: false,
  strice: false,
  is_json5: false,
  tag: [],
  role: 'owner',
  is_mock_open: true,
  project_mock_script: 'const a = 1;',
  pre_script: 'console.log(1);',
  after_script: 'console.log(2);',
  env: [],
  cat: [{ _id: 5, name: '分类五', desc: '分类五描述' }]
};
const PROJECT_SEED = {
  user: { uid: 11 },
  group: {
    currGroup: { _id: 1, group_name: '分组一', group_desc: '', custom_field1: { name: '', enable: false } },
    groupList: [{ _id: 1, group_name: '分组一' }]
  },
  project: { currProject: CURR_PROJECT_FULL, projectList: [], token: 'tk_seed_9f8e7d6c', swaggerUrlData: '' },
  inter: { curdata: { catid: 3 } },
  news: { updateLogList: [] }
};

function stubProjectApis() {
  stubAxios([
    { match: '/api/project/get', respond: () => ({ errcode: 0, data: Object.assign({}, CURR_PROJECT_FULL) }) },
    // 真实契约：list 的 data 直接是数组（旧桩多包一层 data.data，被旧冻结 reducer 掩盖）
    { match: '/api/group/list', respond: () => ({ errcode: 0, data: [{ _id: 1, group_name: '分组一' }] }) },
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: { group_name: '分组一', _id: 1, custom_field1: { name: '', enable: false } } }) },
    { match: '/api/project/token', respond: () => ({ errcode: 0, data: 'tk_fetched_abcd' }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
}

// ---- project setting（Setting，默认激活「项目配置」面板）----
async function mountProjectSetting() {
  stubProjectApis();
  seedGroupStore({
    currGroup: { _id: 1, group_name: '分组一', group_desc: '', custom_field1: { name: '', enable: false } },
    groupList: [{ _id: 1, group_name: '分组一' }]
  });
  const { default: Setting } = require('../../../client/containers/Project/Setting/Setting.js');
  renderWithProviders(React.createElement(Setting), {
    seedState: PROJECT_SEED,
    routePath: '/project/:id/setting',
    initialPath: '/project/12/setting'
  });
  await flushEffects(150);
}

// ---- project token 配置页 ----
async function mountProjectToken() {
  stubProjectApis();
  const { default: ProjectToken } = require('../../../client/containers/Project/Setting/ProjectToken/ProjectToken.js');
  renderWithProviders(React.createElement(ProjectToken, { projectId: 12, curProjectRole: 'admin' }), {
    seedState: PROJECT_SEED
  });
  await flushEffects(120);
}

// ---- project 数据导出页 ----
async function mountProjectData() {
  stubProjectApis();
  const { default: ProjectData } = require('../../../client/containers/Project/Setting/ProjectData/ProjectData.js');
  renderWithProviders(React.createElement(ProjectData), {
    seedState: PROJECT_SEED,
    routePath: '/project/:id/data',
    initialPath: '/project/12/data'
  });
  await flushEffects(120);
}

// ---- project 动态页（Activity 配方；TimeLine 已桩）----
async function mountProjectActivity() {
  const { default: Activity } = require('../../../client/containers/Project/Activity/Activity.js');
  const withRouter = require('../../../client/withRouter.jsx').default;
  renderWithProviders(React.createElement(withRouter(Activity)), {
    seedState: { user: { uid: 11 }, inter: { curdata: { _id: 1 } }, project: { currProject: { _id: 12, basepath: '/mock-path' } } },
    routePath: '/project/:id/*',
    initialPath: '/project/12/activity'
  });
  await flushEffects(60);
}

// ---- interface 列表页（InterfaceList 配方，容器测试同源 fixtures）----
const INTERFACE_MENU_TREE = [
  { _id: 5, name: '分类五', list: [{ _id: 100, title: '接口一', path: '/api/a' }], children: [] }
];
const INTERFACE_LIST_SEED = {
  inter: {
    curdata: {},
    list: INTERFACE_MENU_TREE,
    editStatus: false,
    totalTableList: [
      { _id: 100, title: '接口一', path: '/a', method: 'GET', project_id: 12, catid: 5, status: 'done', tag: ['核心'] },
      { _id: 101, title: '接口二', path: '/b', method: 'POST', project_id: 12, catid: 5, status: 'undone', tag: [] }
    ],
    totalCount: 2,
    catTableList: [
      { _id: 100, title: '接口一', path: '/a', method: 'GET', project_id: 12, status: 'done', tag: ['核心'] }
    ],
    count: 1
  },
  project: { currProject: CURR_PROJECT_FULL },
  user: { uid: 9 }
};

async function mountInterfaceList() {
  stubAxios([
    { match: '/api/interface/', respond: () => ({ errcode: 0, data: { count: 1, list: [] } }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  const { default: InterfaceList } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceList.js');
  renderWithProviders(React.createElement(InterfaceList), {
    seedState: INTERFACE_LIST_SEED,
    routePath: '/project/:id/interface/api',
    initialPath: '/project/12/interface/api'
  });
  await flushEffects(200);
}

// ---- interface 详情页（View 配方）----
const INTERFACE_CURDATA = {
  _id: 100,
  title: '接口一',
  path: '/api/a',
  method: 'GET',
  project_id: 12,
  uid: 9,
  username: '创建者',
  status: 'done',
  up_time: 1600000000,
  desc: '<p>接口描述</p>',
  req_headers: [{ name: 'Content-Type', value: 'application/json', required: '1', example: '', desc: '' }],
  req_params: [{ name: 'id', desc: '路径参数', example: '1' }],
  req_query: [{ name: 'q', desc: '查询', example: 'x', required: '0' }],
  req_body_type: 'form',
  req_body_form: [{ name: 'f1', type: 'text', required: '1', example: 'e1', desc: '表单项' }],
  req_body_other: '',
  req_body_is_json_schema: false,
  res_body_type: 'json',
  res_body: '{"a":1}',
  res_body_is_json_schema: false,
  custom_field_value: '自定义'
};

async function mountInterfaceView() {
  stubAxios([
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  const { default: View } = require('../../../client/containers/Project/Interface/InterfaceList/View.js');
  renderWithProviders(React.createElement(View), {
    seedState: {
      inter: { curdata: INTERFACE_CURDATA, list: INTERFACE_MENU_TREE, editStatus: false },
      group: { field: { enable: true, name: '业务线' } },
      project: { currProject: CURR_PROJECT_FULL }
    },
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects(200);
}

// ---- interface 编辑页（Edit → InterfaceEditForm；冲突检测 WebSocket 桩）----
async function mountInterfaceEdit() {
  // Edit.js 挂载即连 /api/interface/solve_conflict；jsdom 无真实服务，
  // 用「异步触发 onerror」的桩走容器既有语义：连接失败 → 用 store curdata 进入编辑态
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function StubConflictSocket() {
    const socket = this;
    socket.close = function() {};
    socket.readyState = 0;
    setTimeout(() => {
      if (socket.onerror) socket.onerror({});
    }, 0);
  };
  stubAxios([
    { match: '/api/interface/getMenu', respond: () => ({ errcode: 0, data: INTERFACE_MENU_TREE }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  const { default: Edit } = require('../../../client/containers/Project/Interface/InterfaceList/Edit.js');
  renderWithProviders(React.createElement(Edit), {
    seedState: {
      inter: { curdata: INTERFACE_CURDATA, list: [], editStatus: false },
      group: { field: { enable: true, name: '业务线' }, currGroup: G1 },
      project: { currProject: CURR_PROJECT_FULL },
      user: { uid: 9 }
    },
    routePath: '/project/:id/interface/api/:actionId',
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects(400);
  window.WebSocket = OriginalWebSocket;
}

// ---- user 域（User 路由容器：候选选择器均在 .g-doc/.user-box 包装下，
// 必须挂容器而非裸 List/Profile）----
function stubUserApis() {
  stubAxios([
    {
      match: '/api/user/list',
      respond: () => ({
        errcode: 0,
        data: {
          list: [
            { _id: 1, username: '管理员甲', email: 'admin@test.com', role: 'admin', disabled: false, up_time: 1700000000 },
            { _id: 2, username: '成员乙', email: 'member@test.com', role: 'member', disabled: true, up_time: 1700000100 }
          ],
          count: 25
        }
      })
    },
    {
      match: '/api/user/find',
      respond: () => ({
        errcode: 0,
        data: { uid: 9, username: 'alice', email: 'a@b.c', role: 'member', type: 'site', add_time: 1700000000, up_time: 1700000100 }
      })
    }
  ]);
}

async function mountUserList() {
  stubUserApis();
  const { default: User } = require('../../../client/containers/User/User.js');
  renderWithProviders(React.createElement(User), {
    seedState: { user: { role: 'admin', uid: 1 } },
    routePath: '/user/*',
    initialPath: '/user/list'
  });
  await flushEffects(150);
}

async function mountUserProfile() {
  stubUserApis();
  const { default: User } = require('../../../client/containers/User/User.js');
  renderWithProviders(React.createElement(User), {
    seedState: { user: { uid: 9, type: 'site', role: 'member' } },
    routePath: '/user/*',
    initialPath: '/user/profile/9'
  });
  await flushEffects(150);
}

// ---- follows 我的关注页（Follows 配方）----
async function mountFollows() {
  stubAxios([
    {
      match: '/api/follow/list',
      respond: () => ({
        errcode: 0,
        data: {
          list: [
            { _id: 101, name: '项目A', icon: 'star-o', color: 'blue', up_time: 1700000001 },
            { _id: 102, name: '项目B', icon: 'star-o', color: 'red', up_time: 1700000002 }
          ]
        }
      })
    }
  ]);
  const { default: Follows } = require('../../../client/containers/Follows/Follows.js');
  renderWithProviders(React.createElement(Follows), {
    seedState: { user: { uid: 11 }, follow: { data: [] }, project: { currPage: 1 } }
  });
  await flushEffects(150);
}

// ---- add-project 新建项目页（AddProject 配方）----
async function mountAddProject() {
  stubAxios([
    { match: '/api/group/list', respond: () => ({ errcode: 0, data: [G1, G2] }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  seedGroupStore({ currGroup: G1, groupList: [G1, G2] });
  const { default: AddProject } = require('../../../client/containers/AddProject/AddProject.js');
  renderWithProviders(React.createElement(AddProject), {
    seedState: {
      user: { uid: 11, role: 'member' },
      group: { currGroup: G1, groupList: [G1, G2] },
      project: { currPage: 1 }
    },
    routePath: '/add-project',
    initialPath: '/add-project'
  });
  await flushEffects(150);
}

// ================= 层 B 差分运行器 =================

const MAX_ELEMENTS_PER_CANDIDATE = 5;

// registry: Map<candidateId, { candidate, pages: { page: { matchedElements, props: { prop: { dev, prod } } } } }>
const REGISTRY = new Map();
const PAGE_STATS = {};

/**
 * @param {string} page
 */
async function runDiffForPage(page, mountFn) {
  stubAxios();
  await mountFn();
  collectRuntimeStyles();

  const allRules = PRD_RULES.concat(buildRuntimeRules(runtimeStyleTexts));
  const index = cascade.computeIndex(allRules);
  const pageStat = { matchedCandidates: 0, unsupportedSelectors: 0, evaluated: 0 };
  const matchedSelectorIds = new Set();

  for (const candidate of candidates) {
    let elements;
    try {
      elements = Array.from(document.body.querySelectorAll(candidate.selector));
    } catch (e) {
      pageStat.unsupportedSelectors++;
      continue;
    }
    if (!elements.length) continue;
    if (!REGISTRY.has(candidate.id)) {
      REGISTRY.set(candidate.id, { candidate, pages: {} });
    }
    const entry = REGISTRY.get(candidate.id);
    const limited = elements.slice(0, MAX_ELEMENTS_PER_CANDIDATE);
    const props = {};
    let pageTouched = false;
    for (const watched of candidate.props) {
      const verdicts = { dev: null, prod: null };
      for (const el of limited) {
        for (const mode of ['dev', 'prod']) {
          const v = cascade.evaluate(candidate, el, watched, index, mode);
          // 同页多元素取「更严重」判定，保证 confirmed-override 不被同选择器其他元素稀释
          if (!verdicts[mode] || severity(v) > severity(verdicts[mode])) {
            verdicts[mode] = v;
          }
          pageStat.evaluated++;
        }
      }
      props[watched.prop] = verdicts;
      if (verdicts.dev || verdicts.prod) pageTouched = true;
    }
    if (pageTouched) {
      if (!matchedSelectorIds.has(candidate.id)) {
        matchedSelectorIds.add(candidate.id);
        pageStat.matchedCandidates++;
      }
      entry.pages[page] = { matchedElements: elements.length, props };
    }
  }
  PAGE_STATS[page] = pageStat;
  cleanup();
  cleanupDom();
}

const STATUS_SEVERITY = { 'not-overridden': 0, ambiguous: 1, 'confirmed-override': 2 };
function severity(verdict) {
  return STATUS_SEVERITY[verdict && verdict.status] != null ? STATUS_SEVERITY[verdict && verdict.status] : 0;
}

function candidateStatus(entry) {
  let worst = 'not-overridden';
  let worstScore = 0;
  for (const pageName of Object.keys(entry.pages)) {
    const props = entry.pages[pageName].props;
    for (const prop of Object.keys(props)) {
      for (const mode of ['dev', 'prod']) {
        const v = props[prop][mode];
        if (v) {
          const score = severity(v);
          if (score > worstScore) {
            worstScore = score;
            worst = v.status;
          }
        }
      }
    }
  }
  return worst;
}

// ================= 页面用例 =================

test.serial('层B：login 页差分（登录卡片锚点）', async t => {
  await runDiffForPage('login', mountLogin);
  t.true(PAGE_STATS.login.matchedCandidates >= 10, 'login 挂载应命中足够多候选（实际 ' + PAGE_STATS.login.matchedCandidates + '）');

  // 锚点（批次 2a 翻转后口径）：979dfa67 修复的 .card-login margin-top + 本批 F-1
  // 修复的 border-radius。源码已加 !important（client/containers/Login/Login.scss），
  // 重建后产物已含 margin-top/margin-bottom/border-radius 的 !important 声明——
  // 三属性均应判定 not-overridden（!important 自保险胜）。
  const cardLogin = Array.from(REGISTRY.values()).find(e => e.candidate.selector === '.card-login');
  t.truthy(cardLogin, '应在 login 页找到 .card-login 候选');
  t.truthy(cardLogin.pages.login, '.card-login 应在 login 页渲染');
  t.true(
    cardLogin.candidate.props.find(p => p.prop === 'margin-top').important,
    '前置事实：产物中 card-login margin-top 已含 !important（979dfa67）'
  );
  t.true(
    cardLogin.candidate.props.find(p => p.prop === 'border-radius').important,
    '前置事实：产物中 card-login border-radius 已含 !important（批次 2a F-1 修复）'
  );
  for (const mode of ['dev', 'prod']) {
    const vMargin = cardLogin.pages.login.props['margin-top'][mode];
    t.is(vMargin && vMargin.status, 'not-overridden', mode + ' 口径下 margin-top 应自保获胜（产物已同步修复）');
    const vMarginBottom = cardLogin.pages.login.props['margin-bottom'][mode];
    t.is(vMarginBottom && vMarginBottom.status, 'not-overridden', mode + ' 口径下 margin-bottom 应自保获胜');
    const vRadius = cardLogin.pages.login.props['border-radius'][mode];
    t.is(
      vRadius && vRadius.status,
      'not-overridden',
      mode + ' 口径下 border-radius 应自保获胜（F-1 修复：!important 压过 :where(...).ant-card{border-radius:8px}）'
    );
  }
});

test.serial('层B：home 游客页差分', async t => {
  await runDiffForPage('home-guest', mountHome);
  t.true(PAGE_STATS['home-guest'].matchedCandidates >= 10);
});

test.serial('层B：group 列表页差分', async t => {
  await runDiffForPage('group-list', mountGroupList);
  t.true(PAGE_STATS['group-list'].matchedCandidates >= 5, 'group 挂载应命中候选（实际 ' + PAGE_STATS['group-list'].matchedCandidates + '）');

  // F-2 锚点（批次 2 修复位）：搜索按钮前景色。修复前自定义 0,5,0 被
  // :where(...)...:not(.ant-btn-color-primary)（:where 计零后 0,6,0、运行时注入）
  // 反超；批次 2 借 .search/.ant-input-group/.ant-input-group-addon 真实祖先链
  // 提升到 0,7,0，color/background/border 应全部自保获胜。
  const searchBtn = Array.from(REGISTRY.values()).find(
    e => e.candidate.selector.indexOf('.ant-input-search-button.ant-btn') !== -1
  );
  t.truthy(searchBtn, '应在 group-list 页找到搜索按钮候选（F-2 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = searchBtn.pages['group-list'] && searchBtn.pages['group-list'].props.color[mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 F-2 修复位 color 应自保获胜（specificity 提升）');
  }

  // M-1 锚点（批次 2a 修复）：hover/focus 态判定。jsdom 对 :hover/:focus 静态不匹配
  // （层 B 结构性盲区，动态态留层 C 走查），此处按引擎口径做静态级联裁定：
  // 产物中按钮自身的 hover/focus 规则（含 :not([disabled]) 镜像）应为 0,9,0，压过
  // antd 运行时 hover 前景色规则实测的 0,8,0（批 2 注释曾误记 0,7,0）——
  // 修复前我方 hover 仅 0,8,0 打平、运行时序反被压过。只取最右复合子为按钮
  // 自身的规则，排除其后代规则（.anticon-search 色随按钮已天然更高）。
  const isSearchBtnSelfRule = sel => {
    const rightmost = sel.split(/[\s>+~]+/).pop();
    return rightmost.indexOf('.ant-input-search-button.ant-btn') !== -1;
  };
  const prdHoverSelectors = PRD_RULES.filter(
    r => isSearchBtnSelfRule(r.selector) && /:(hover|focus)/.test(r.selector)
  ).map(r => r.selector);
  t.true(prdHoverSelectors.length >= 2, '产物应含搜索按钮 hover/focus 规则（实际 ' + prdHoverSelectors.length + ' 条）');
  for (const sel of prdHoverSelectors) {
    t.is(cascade.computeSpecificity(sel).join(','), '0,9,0', 'M-1：hover/focus 规则应提级到 0,9,0（' + sel + '）');
  }
  const antdHoverColorRule = buildRuntimeRules(runtimeStyleTexts).find(
    r =>
      r.sourceKind === 'runtime' &&
      r.selector.indexOf('.ant-input-search-button:not(.ant-btn-color-primary):not([disabled]):hover') !== -1 &&
      r.declarations.some(d => String(d.prop).toLowerCase() === 'color')
  );
  t.truthy(antdHoverColorRule, 'antd 运行时应注入搜索按钮 hover 前景色规则');
  t.is(
    antdHoverColorRule && cascade.computeSpecificity(antdHoverColorRule.selector).join(','),
    '0,9,0',
    'M-1 前置事实：antd hover 前景色规则为 0,9,0（hash 类计 1；层 C 修正前误按 :where() 计零记为 0,8,0）'
  );
});

test.serial('层B：interface 用例集合页差分', async t => {
  await runDiffForPage('interface-col', mountInterfaceCol);
  t.true(PAGE_STATS['interface-col'].matchedCandidates >= 5);
});

test.serial('层B：interface 运行页（Postman）差分', async t => {
  await runDiffForPage('postman', mountPostman);
  t.true(PAGE_STATS.postman.matchedCandidates >= 5);
});

test.serial('层B：statistics 页差分', async t => {
  await runDiffForPage('statistics', mountStatistics);
  t.true(PAGE_STATS.statistics.matchedCandidates >= 3, 'statistics 挂载应命中候选（实际 ' + PAGE_STATS.statistics.matchedCandidates + '）');
});

// ================= 批次 2 扩充页面用例 =================
// 每个页面域只断言「挂载可达 + 命中足量候选」，逐属性判定由汇总用例统一登记。
// 命中下限按各页可达自定义类数量经验值设定，跌破即提示配方失效（页面渲染崩溃/桩漂移）。

test.serial('层B：register 注册页签差分', async t => {
  await runDiffForPage('register', mountRegister);
  t.true(PAGE_STATS.register.matchedCandidates >= 5, 'register 挂载应命中候选（实际 ' + PAGE_STATS.register.matchedCandidates + '）');
});

test.serial('层B：全局 Header/Footer 差分', async t => {
  await runDiffForPage('global-chrome', mountGlobalChrome);
  t.true(
    PAGE_STATS['global-chrome'].matchedCandidates >= 3,
    '全局外壳挂载应命中候选（实际 ' + PAGE_STATS['global-chrome'].matchedCandidates + '）'
  );

  // N-1 锚点（批次 2a 翻转后口径）：line-height 已从 .header-box 基础规则并入
  // &.ant-layout-header + !important 通道（client/components/Header/Header.scss），
  // 产物中对应候选为 .header-box.ant-layout-header（含 line-height:! 声明），
  // 应压过 :where(...).ant-layout-header{line-height:64px}（0,1,0, 运行时序）自保获胜。
  const headerChannel = Array.from(REGISTRY.values()).find(
    e =>
      e.candidate.selector === '.header-box.ant-layout-header' &&
      e.candidate.props.some(p => p.prop === 'line-height')
  );
  t.truthy(headerChannel, '应找到携带 line-height 的 .header-box.ant-layout-header 候选（N-1 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = headerChannel.pages['global-chrome'] && headerChannel.pages['global-chrome'].props['line-height'][mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 line-height 应自保获胜（N-1 修复：!important 通道）');
    t.true(v && v.reason === 'self-wins', 'line-height 获胜者应为 .header-box 自身声明');
  }

  // N-2 裁决（层 C，2026-09）：.search-wrapper .search-input 的 width:2rem 为
  // antd3 时代遗留死声明——真实 prod 下 antd 的 width:100%（0,4,0）稳定获胜，
  // 且 2rem=200px 反而宽于搜索框实际宽度（层 C 实测 190/198px），强行压过会造成
  // 溢出；已按「修外壳类而非硬压」删除该声明。此断言防止死声明回流。
  const n2 = Array.from(REGISTRY.values()).find(e => e.candidate.selector === '.search-wrapper .search-input');
  t.falsy(n2, 'N-2 死声明已删除，.search-wrapper .search-input 不应再作为层 A 候选出现（防回流）');
});

test.serial('层B：group 成员管理页差分', async t => {
  await runDiffForPage('group-member', mountGroupMember);
  t.true(PAGE_STATS['group-member'].matchedCandidates >= 3, 'group 成员页挂载应命中候选（实际 ' + PAGE_STATS['group-member'].matchedCandidates + '）');
});

test.serial('层B：group 设置页差分', async t => {
  await runDiffForPage('group-setting', mountGroupSetting);
  t.true(PAGE_STATS['group-setting'].matchedCandidates >= 3, 'group 设置页挂载应命中候选（实际 ' + PAGE_STATS['group-setting'].matchedCandidates + '）');
});

test.serial('层B：group 动态页差分', async t => {
  await runDiffForPage('group-log', mountGroupLog);
  t.true(PAGE_STATS['group-log'].matchedCandidates >= 1, 'group 动态页挂载应命中候选（实际 ' + PAGE_STATS['group-log'].matchedCandidates + '）');
});

test.serial('层B：project setting 项目配置面板差分', async t => {
  await runDiffForPage('project-setting', mountProjectSetting);
  t.true(PAGE_STATS['project-setting'].matchedCandidates >= 5, 'project setting 挂载应命中候选（实际 ' + PAGE_STATS['project-setting'].matchedCandidates + '）');

  // N-4/N-5 锚点（批次 2a 翻转后口径）：
  //   N-4 project chunk .form-item margin-bottom —— 同元素联合类 .form-item.ant-form-item
  //   提一档（0,2,0），压过 :where(...).ant-form-item{margin:0}（0,1,0, 运行时序）；
  //   N-5 project chunk（Setting.scss，自 ProjectList.scss 迁入）.dynamic-delete-button.anticon
  //   color —— 提一档（0,2,0），
  //   压过运行时 .anticon{color:inherit}（0,1,0）。
  // 注意同名候选成对出现（add-project chunk 的 N-3 在 add-project 用例锚定），此处按 chunk 区分。
  const n4 = Array.from(REGISTRY.values()).find(
    e => e.candidate.selector === '.form-item.ant-form-item' && e.candidate.chunk === 'project'
  );
  t.truthy(n4, '应找到 project chunk 的 .form-item.ant-form-item 候选（N-4 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = n4.pages['project-setting'] && n4.pages['project-setting'].props['margin-bottom'][mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 N-4 margin-bottom 应自保获胜（specificity 提升一档）');
  }
  const n5 = Array.from(REGISTRY.values()).find(e => e.candidate.selector === '.dynamic-delete-button.anticon');
  t.truthy(n5, '应找到 .dynamic-delete-button.anticon 候选（N-5 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = n5.pages['project-setting'] && n5.pages['project-setting'].props.color[mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 N-5 color 应自保获胜（specificity 提升一档）');
  }
});

test.serial('层B：project token 配置页差分', async t => {
  await runDiffForPage('project-token', mountProjectToken);
  t.true(PAGE_STATS['project-token'].matchedCandidates >= 1, 'project token 页挂载应命中候选（实际 ' + PAGE_STATS['project-token'].matchedCandidates + '）');
});

test.serial('层B：project 数据导出页差分', async t => {
  await runDiffForPage('project-data', mountProjectData);
  t.true(PAGE_STATS['project-data'].matchedCandidates >= 1, 'project data 页挂载应命中候选（实际 ' + PAGE_STATS['project-data'].matchedCandidates + '）');
});

test.serial('层B：project 动态页差分', async t => {
  await runDiffForPage('project-activity', mountProjectActivity);
  t.true(PAGE_STATS['project-activity'].matchedCandidates >= 1, 'project activity 页挂载应命中候选（实际 ' + PAGE_STATS['project-activity'].matchedCandidates + '）');
});

test.serial('层B：interface 列表页差分', async t => {
  await runDiffForPage('interface-list', mountInterfaceList);
  t.true(PAGE_STATS['interface-list'].matchedCandidates >= 3, 'interface 列表页挂载应命中候选（实际 ' + PAGE_STATS['interface-list'].matchedCandidates + '）');
});

test.serial('层B：interface 详情页差分', async t => {
  await runDiffForPage('interface-view', mountInterfaceView);
  t.true(PAGE_STATS['interface-view'].matchedCandidates >= 3, 'interface 详情页挂载应命中候选（实际 ' + PAGE_STATS['interface-view'].matchedCandidates + '）');

  // N-6/N-7 锚点（层 C 修正后口径）：用例表头 color/background——
  // N-6 在 .ant-table-wrapper 之后再补真实祖先 .ant-table-container 提至 0,4,1
  // （层 C 实测：批次 2a 的 0,3,1 写法不敌 antd 运行时 .css-<hash>.ant-table-wrapper
  // .ant-table-thead >tr>th 的 0,3,2）；N-7 background 0,3,2 与 antd 平局，
  // 静态源序后发获胜（hashPriority=high 下 cssinjs prepend 先于全部静态 CSS）。
  const n6 = Array.from(REGISTRY.values()).find(
    e => e.candidate.selector === '.caseContainer .ant-table-wrapper .ant-table-container .ant-table-thead th'
  );
  t.truthy(n6, '应找到 .caseContainer .ant-table-wrapper .ant-table-container .ant-table-thead th 候选（N-6 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = n6.pages['interface-view'] && n6.pages['interface-view'].props.color[mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 N-6 表头 color 应自保获胜（specificity 提升到 0,4,1）');
  }
  const n7 = Array.from(REGISTRY.values()).find(
    e => e.candidate.selector === '.caseContainer .ant-table-wrapper .ant-table-thead>tr>th'
  );
  t.truthy(n7, '应找到 .caseContainer .ant-table-wrapper .ant-table-thead>tr>th 候选（N-7 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = n7.pages['interface-view'] && n7.pages['interface-view'].props.background[mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 N-7 表头 background 应自保获胜（specificity 提升一档）');
  }
});

test.serial('层B：interface 编辑页差分', async t => {
  await runDiffForPage('interface-edit', mountInterfaceEdit);
  t.true(PAGE_STATS['interface-edit'].matchedCandidates >= 10, 'interface 编辑页挂载应命中足量候选（实际 ' + PAGE_STATS['interface-edit'].matchedCandidates + '）');
});



test.serial('层B：user 列表页差分', async t => {
  await runDiffForPage('user-list', mountUserList);
  t.true(PAGE_STATS['user-list'].matchedCandidates >= 3, 'user 列表页挂载应命中候选（实际 ' + PAGE_STATS['user-list'].matchedCandidates + '）');
});

test.serial('层B：user 个人资料页差分', async t => {
  await runDiffForPage('user-profile', mountUserProfile);
  t.true(PAGE_STATS['user-profile'].matchedCandidates >= 3, 'user 资料页挂载应命中候选（实际 ' + PAGE_STATS['user-profile'].matchedCandidates + '）');
});

test.serial('层B：follows 我的关注页差分', async t => {
  await runDiffForPage('follows', mountFollows);
  t.true(PAGE_STATS.follows.matchedCandidates >= 3, 'follows 挂载应命中候选（实际 ' + PAGE_STATS.follows.matchedCandidates + '）');
});

test.serial('层B：add-project 新建项目页差分', async t => {
  await runDiffForPage('add-project', mountAddProject);
  t.true(PAGE_STATS['add-project'].matchedCandidates >= 3, 'add-project 挂载应命中候选（实际 ' + PAGE_STATS['add-project'].matchedCandidates + '）');

  // N-3 锚点（批次 2a 翻转后口径）：add-project chunk .form-item margin-bottom——
  // 同元素联合类 .form-item.ant-form-item 提一档（0,2,0），压过
  // :where(...).ant-form-item{margin:0}（0,1,0, 运行时序）自保获胜。
  // 与 project chunk 的 N-4 同名异源，此处按 chunk 前缀锚定 add-project 侧。
  const n3 = Array.from(REGISTRY.values()).find(
    e => e.candidate.selector === '.form-item.ant-form-item' && e.candidate.chunk === 'add-project'
  );
  t.truthy(n3, '应找到 add-project chunk 的 .form-item.ant-form-item 候选（N-3 修复位）');
  for (const mode of ['dev', 'prod']) {
    const v = n3.pages['add-project'] && n3.pages['add-project'].props['margin-bottom'][mode];
    t.is(v && v.status, 'not-overridden', mode + ' 口径下 N-3 margin-bottom 应自保获胜（specificity 提升一档）');
  }
});

// ================= 汇总与登记产物 =================

test.serial('层B：汇总登记产物与运行时样式 sanity', async t => {
  t.true(runtimeStyleTexts.length >= 20, 'antd5 运行时应注入足量样式块（实际 ' + runtimeStyleTexts.length + '）');

  const findings = [];
  const totals = {
    candidates: candidates.length,
    rendered: 0,
    'confirmed-override': 0,
    ambiguous: 0,
    'not-overridden': 0,
    'needs-manual': 0,
    'antd3-scoped': 0
  };

  for (const entry of REGISTRY.values()) {
    const status = candidateStatus(entry);
    totals.rendered++;
    totals[status]++;
    const overrides = [];
    for (const pageName of Object.keys(entry.pages)) {
      const props = entry.pages[pageName].props;
      for (const prop of Object.keys(props)) {
        for (const mode of ['dev', 'prod']) {
          const v = props[prop][mode];
          if (v && v.status === 'confirmed-override') {
            overrides.push({
              page: pageName,
              mode,
              prop,
              customValue: entry.candidate.props.find(p => p.prop === prop).value,
              winnerSelector: v.winnerSelector,
              winnerValue: v.winnerValue,
              specCustom: v.specCustom,
              specWinner: v.specWinner
            });
          }
        }
      }
    }
    findings.push({
      id: entry.candidate.id,
      selector: entry.candidate.selector,
      chunk: entry.candidate.chunk,
      media: entry.candidate.media || '',
      hasAntdRef: entry.candidate.hasAntdRef,
      props: entry.candidate.props.map(p => p.prop + (p.important ? ':!' : '')),
      status,
      pages: Object.keys(entry.pages),
      // 逐属性双口径判定明细（文档登记与人工复核用）
      verdicts: Object.fromEntries(
        Object.keys(entry.pages).map(pageName => [
          pageName,
          Object.fromEntries(
            Object.keys(entry.pages[pageName].props).map(prop => [
              prop,
              {
                dev: entry.pages[pageName].props[prop].dev,
                prod: entry.pages[pageName].props[prop].prod
              }
            ])
          )
        ])
      ),
      overrides
    });
    // 层 C 修正后（hashPriority=high + prepend 注入序）：confirmed 面仅剩 N-2/N-6，
    // 均已随本批处理；保留以下兜底导出便于后续回归时快速定位。
    if (overrides.length) console.log('/*DEBUG-CONFIRMED*/ ' + JSON.stringify({ id: entry.candidate.id, selector: entry.candidate.selector, chunk: entry.candidate.chunk, props: entry.candidate.props.map(p => p.prop), overrides }));  }

  // 未在任何挂载页面渲染的候选：
  //   - 携带 antd3 双作用域守卫（:not([class*=css-])，21964bbc 引入）的规则按设计
  //     不作用于 antd5 元素（antd5 组件全带 css- 哈希类），属计划 §6 范围外
  //     （json-schema-editor 内嵌 antd3，编辑器自研立项处理）→ antd3-scoped；
  //   - 其余 → needs-manual（层 B 盲区，转人工/无头浏览器巡检）。
  const renderedIds = new Set(findings.map(f => f.id));
  const ANT_D3_SCOPE_GUARD = ':not([class*=css-])';
  for (const candidate of candidates) {
    if (!renderedIds.has(candidate.id)) {
      if (candidate.selector.indexOf(ANT_D3_SCOPE_GUARD) !== -1) {
        totals['antd3-scoped']++;
        findings.push({
          id: candidate.id,
          selector: candidate.selector,
          chunk: candidate.chunk,
          media: candidate.media || '',
          hasAntdRef: candidate.hasAntdRef,
          props: candidate.props.map(p => p.prop + (p.important ? ':!' : '')),
          status: 'antd3-scoped',
          pages: [],
          overrides: [],
          note: 'antd3 双作用域守卫规则（:not([class*=css-])），按设计不作用于 antd5 元素，属计划 §6 范围外'
        });
        continue;
      }
      totals['needs-manual']++;
      findings.push({
        id: candidate.id,
        selector: candidate.selector,
        chunk: candidate.chunk,
        media: candidate.media || '',
        hasAntdRef: candidate.hasAntdRef,
        props: candidate.props.map(p => p.prop + (p.important ? ':!' : '')),
        status: 'needs-manual',
        pages: [],
        overrides: [],
        note: 'jsdom 批次 2 未挂载对应页面或选择器在测试环境静态不匹配（:hover 等伪类）'
      });
    }
  }

  const outDir = path.join(os.tmpdir(), 'yapi-antd5-layerb');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'findings.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        method: 'jsdom 挂载 + 级联仿真（antd5Cascade.js），dev/prod 双口径',
        prdStats: scanResult.stats,
        pages: Object.keys(PAGE_STATS),
        pageStats: PAGE_STATS,
        runtimeStyleBlocks: runtimeStyleTexts.length,
        totals,
        findings
      },
      null,
      2
    )
  );
  console.log('[层B] 判定汇总: ' + JSON.stringify(totals));
  console.log('[层B] 页面命中: ' + JSON.stringify(PAGE_STATS));
  console.log('[层B] 登记产物: ' + outPath);

  // 批次 2a 门禁（层 C 修正后口径）：原 8 条 confirmed-override 经真实口径重扫
  // （hashPriority=high：hash 类计 1；cssinjs prepend：全部静态规则源序晚于运行时）
  // 后，F-1/N-1/N-3/N-4/N-5/N-7 均自保获胜；N-6 的 0,3,1 写法在真实口径下不敌
  // antd 0,3,2，已补 .ant-table-container 提至 0,4,1 修正；N-2 死声明已删除。
  // 翻转口径：候选级 status 不得为 confirmed-override，且全部页面/属性/口径无任何
  // confirmed-override 判定（overrides 为空）。允许残留同值 ambiguous（如
  // .card-login 的 position，批 2 即存在、无视觉差异，层 C 口径）。
  // 若出现其他 confirmed，说明修复引发了新覆盖或 antd 升级改变了运行时规则，必须逐条分析登记。
  const FIXED_CONFIRMED = [
    { id: 'F-1', selector: '.card-login', prop: 'border-radius' },
    { id: 'N-1', selector: '.header-box.ant-layout-header', prop: 'line-height' },
    { id: 'N-3', selector: '.form-item.ant-form-item', chunk: 'add-project', prop: 'margin-bottom' },
    { id: 'N-4', selector: '.form-item.ant-form-item', chunk: 'project', prop: 'margin-bottom' },
    { id: 'N-5', selector: '.dynamic-delete-button.anticon', prop: 'color' },
    { id: 'N-6', selector: '.caseContainer .ant-table-wrapper .ant-table-container .ant-table-thead th', prop: 'color' },
    { id: 'N-7', selector: '.caseContainer .ant-table-wrapper .ant-table-thead>tr>th', prop: 'background' }
  ];
  for (const fix of FIXED_CONFIRMED) {
    const entry = findings.find(
      f =>
        f.selector === fix.selector &&
        (!fix.chunk || f.chunk === fix.chunk)
    );
    t.truthy(entry, '修复位候选应仍在登记中（' + fix.id + ' ' + fix.selector + '）');
    t.true(
      entry && entry.overrides.length === 0,
      fix.id + '（' + fix.selector + ' ' + fix.prop + '）不应残留任何 confirmed-override 判定'
    );
    t.not(entry && entry.status, 'confirmed-override', fix.id + '（' + fix.selector + '）候选级状态不应为 confirmed-override');
  }
  const stillConfirmed = findings.filter(f => f.status === 'confirmed-override');
  t.is(stillConfirmed.length, 0, '层 C 修正后 confirmed-override 应为 0（N-2 已删除、N-6 已修正），实际 ' + stillConfirmed.length + ' 条');

  t.true(findings.length === candidates.length, '登记应覆盖全部层 A 候选');
  t.true(totals.rendered > 0, '至少应有候选在挂载页面渲染');
});

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  useGroupStore.setState(INITIAL_GROUP_STATE);
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  delete window.crossRequest;
});

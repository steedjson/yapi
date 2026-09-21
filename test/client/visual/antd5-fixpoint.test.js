/**
 * antd5 覆盖面视觉巡检 · 批次 3：修复点位计算样式快照门禁。
 * ============================================================
 * 计划 §4 的交付物：不追求全页截图 diff，只锁定修复过的点位——对每个修复位
 * （层 A 候选 × 观察属性）在 jsdom 挂载页面上做级联仿真判定（复用层 B 引擎
 * antd5Cascade.js，dev/prod 双口径），断言：
 *   1. 胜出规则为该修复位自定义规则自身（self-wins，即 computed 值 == 声明值）；
 *   2. 声明值与 !important 标记与源码/产物一致（值级快照，防回归性静默漂移）。
 *
 * 覆盖点位（批次 2/2a 全部修复 + F-2 保留锚点）：
 *   F-1  .card-login border-radius/margin-top/margin-bottom（login）
 *   N-1  .header-box.ant-layout-header line-height（全局外壳）
 *   F-2  group 搜索按钮前景色基础态（group-list）
 *   M-1  搜索按钮 hover/focus 静态级联裁定 0,9,0 > antd hover 0,8,0（jsdom 对
 *        :hover 静态不匹配，动态态由主 Agent 层 C 走查，此处固化特异性关系）
 *   N-3  add-project chunk .form-item margin-bottom（add-project）
 *   N-4  project chunk .form-item margin-bottom（add-project/project-setting 双页）
 *   N-5  .dynamic-delete-button.anticon color（project chunk 覆盖域）
 *   N-6  .caseContainer .ant-table-wrapper .ant-table-thead th color（interface-view）
 *   N-7  .caseContainer .ant-table-wrapper .ant-table-thead>tr>th background（interface-view）
 *
 * jsdom 环境必须在任何生产代码之前装载
 */
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { cleanupDom, renderWithProviders, flushEffects, stubDefaultExport, REPO_ROOT } from '../../helpers/containers';

const Module = require('module');

// client/、exts/ 裸前缀别名（webpack alias 等价物），必须在 require 生产代码之前安装
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

// ---- 层 A 扫描库与层 B 级联引擎（与 antd5-runtime-diff.test.js 同源口径）----
const scanLib = require('../../../scripts/antd5-css-lib.cjs');
const cascade = require('./antd5Cascade.js');

const PRD_DIR = path.join(REPO_ROOT, 'static', 'prd');
const PRD_CHUNK_RANK = { index: 0 };
const scanResult = scanLib.scanCandidates(PRD_DIR);
const candidates = scanResult.candidates;

function loadPrdRules() {
  const files = fs
    .readdirSync(PRD_DIR)
    .filter(f => f.endsWith('.css'))
    .sort();
  const rules = [];
  files.forEach((file, fileIdx) => {
    const rank = file in PRD_CHUNK_RANK ? PRD_CHUNK_RANK[file] : 1 + fileIdx;
    const raw = scanLib.parseCssRules(fs.readFileSync(path.join(PRD_DIR, file), 'utf8'), file);
    rules.push(
      ...cascade.buildCascadeRules(raw, {
        sourceKind: 'prd',
        sourceName: file,
        rank,
        orderBase: (1 + rank) * 1000000
      })
    );
  });
  return rules;
}
const PRD_RULES = loadPrdRules();

// ---- 重型子组件桩（与 antd5-runtime-diff.test.js 同源口径）----
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => ({}), []);
    return React.createElement('div', { className: props.className }, 'STUB_ACE');
  })
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/SchemaTable/SchemaTable.js'),
  function StubSchemaTable() {
    return React.createElement('div', { className: 'stub-schema-table' }, 'STUB_SCHEMA_TABLE');
  }
);
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
stubDefaultExport(path.join(REPO_ROOT, 'client/components/AceEditor/mockEditor.js'), function StubMockEditor() {
  return { setValue: function() {} };
});

// ---- axios 桩（宽松兜底，各挂载按需覆盖）----
const axios = require('axios');
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

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

// ---- antd5 运行时样式归集（与层 B 同口径：按文本去重，保持首次注入顺序）----
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

function buildRuntimeRules() {
  const rules = [];
  runtimeStyleTexts.forEach((text, idx) => {
    const raw = scanLib.parseCssRules(text, 'runtime:' + idx);
    rules.push(
      ...cascade.buildCascadeRules(raw, {
        sourceKind: 'runtime',
        sourceName: 'runtime:' + idx,
        rank: 9,
        orderBase: 10000000 + idx * 100000
      })
    );
  });
  return rules;
}

// ================= 挂载配方（与 antd5-runtime-diff.test.js 同源的最小集）=================

async function mountLogin() {
  const { default: LoginContainer } = require('../../../client/containers/Login/LoginContainer.js');
  renderWithProviders(React.createElement(LoginContainer), {
    seedState: { user: { loginWrapActiveKey: '1', canRegister: true } },
    routePath: '/login',
    initialPath: '/login'
  });
  await flushEffects(60);
}

const G1 = { _id: 71, group_name: '前端组', group_desc: 'd1', type: 'public' };
const G2 = { _id: 72, group_name: '后端组', group_desc: 'd2', type: 'public' };
const G3 = { _id: 73, group_name: '私有组', group_desc: 'd3', type: 'private' };

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

async function mountGroupList() {
  stubAxios([
    { match: '/api/group/list', respond: () => ({ errcode: 0, data: [G1, G2, G3] }) },
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: G1 }) },
    { match: '/api/log/', respond: () => ({ errcode: 0, data: { data: [], total: 0 } }) }
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

async function mountAddProject() {
  stubAxios([
    { match: '/api/group/list', respond: () => ({ errcode: 0, data: { data: [G1, G2] } }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
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
    { match: '/api/group/list', respond: () => ({ errcode: 0, data: { data: [{ _id: 1, group_name: '分组一' }] } }) },
    { match: '/api/group/get', respond: () => ({ errcode: 0, data: { group_name: '分组一', _id: 1 } }) },
    { match: '/api/project/token', respond: () => ({ errcode: 0, data: 'tk_fetched_abcd' }) },
    { match: '/', respond: () => ({ errcode: 0, data: [] }) }
  ]);
}

async function mountProjectSetting() {
  stubProjectApis();
  const { default: Setting } = require('../../../client/containers/Project/Setting/Setting.js');
  renderWithProviders(React.createElement(Setting), {
    seedState: PROJECT_SEED,
    routePath: '/project/:id/setting',
    initialPath: '/project/12/setting'
  });
  await flushEffects(150);
}

const INTERFACE_MENU_TREE = [
  { _id: 5, name: '分类五', list: [{ _id: 100, title: '接口一', path: '/api/a' }], children: [] }
];
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

// ================= 快照断言辅助 =================

const MAX_ELEMENTS = 5;
const STATUS_SEVERITY = { 'not-overridden': 0, ambiguous: 1, 'confirmed-override': 2 };
function severity(verdict) {
  return verdict && STATUS_SEVERITY[verdict.status] != null ? STATUS_SEVERITY[verdict.status] : 0;
}

/**
 * 单个修复位快照：候选必须在当前 DOM 渲染，观察属性在 dev/prod 双口径下
 * 均由候选规则自身获胜（self-wins），声明值/!important 与期望逐字一致。
 * @param {any} t ava 断言上下文
 * @param {{id: string, selector: string, chunk: string, prop: string, value: string, important?: boolean}} fix
 */
function assertFixpoint(t, fix) {
  const candidate = candidates.find(c => c.selector === fix.selector && c.chunk === fix.chunk);
  t.truthy(candidate, fix.id + '：层 A 候选应存在（' + fix.selector + ' @ ' + fix.chunk + '）');
  if (!candidate) return;

  const watched = candidate.props.find(p => p.prop === fix.prop);
  t.truthy(watched, fix.id + '：候选应观察属性 ' + fix.prop);
  t.is(watched && watched.value, fix.value, fix.id + '：声明值应与源码/产物一致');
  t.is(!!(watched && watched.important), !!fix.important, fix.id + '：!important 标记应符合修复手法');

  let elements;
  try {
    elements = Array.from(document.body.querySelectorAll(fix.selector));
  } catch (e) {
    elements = [];
  }
  t.true(elements.length > 0, fix.id + '：当前挂载页面应渲染 ' + fix.selector + '（实际 ' + elements.length + ' 个）');

  const allRules = PRD_RULES.concat(buildRuntimeRules());
  const index = cascade.computeIndex(allRules);
  let worst = null;
  for (const el of elements.slice(0, MAX_ELEMENTS)) {
    for (const mode of ['dev', 'prod']) {
      const v = cascade.evaluate(candidate, el, watched, index, mode);
      if (!worst || severity(v) > severity(worst)) worst = v;
    }
  }
  t.is(worst && worst.status, 'not-overridden', fix.id + '：' + fix.prop + ' 应自保获胜（实际 ' + JSON.stringify(worst) + '）');
  if (worst && worst.reason === 'custom-wins') {
    // 同名异源声明按 chunk 源序接管（如 .form-item 双 chunk 各自声明）：
    // 胜出者仍是自定义 CSS 且声明值一致，computed 值不受影响
    t.is(worst && worst.winnerValue, fix.prop + ': ' + fix.value, fix.id + '：接管规则声明值应与期望一致');
  } else {
    t.is(worst && worst.reason, 'self-wins', fix.id + '：获胜规则应为修复位自定义规则自身');
  }
}

test.serial.beforeEach(() => {
  stubAxios();
});

// ================= 修复位快照用例 =================

test.serial('快照：login 页 F-1 登录卡片（border-radius/margin 自保）', async t => {
  await mountLogin();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'F-1 border-radius',
    selector: '.card-login',
    chunk: 'index',
    prop: 'border-radius',
    value: '.04rem',
    important: true
  });
  // 同规则已修复属性一并钉住（979dfa67，rem 基准 100px：1.6rem ≈ 160px）
  assertFixpoint(t, { id: 'F-1 margin-top', selector: '.card-login', chunk: 'index', prop: 'margin-top', value: '1.6rem', important: true });
  assertFixpoint(t, { id: 'F-1 margin-bottom', selector: '.card-login', chunk: 'index', prop: 'margin-bottom', value: '1.6rem', important: true });
  cleanup();
  cleanupDom();
});

test.serial('快照：全局外壳 N-1 头部行高（!important 通道）', async t => {
  await mountGlobalChrome();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'N-1 line-height',
    selector: '.header-box.ant-layout-header',
    chunk: 'index',
    prop: 'line-height',
    value: 'normal',
    important: true
  });
  cleanup();
  cleanupDom();
});

test.serial('快照：group 列表 F-2 搜索按钮基础态 + M-1 hover/focus 特异性裁定', async t => {
  await mountGroupList();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'F-2 color',
    selector: '.group-bar .group-operate .search .ant-input-group .ant-input-group-addon .ant-input-search-button.ant-btn',
    chunk: 'group',
    prop: 'color',
    value: '#ffffffd9'
  });

  // M-1 静态级联裁定：jsdom 对 :hover/:focus 静态不匹配（层 B 结构性盲区，
  // 动态态由主 Agent 层 C 走查），此处固化特异性关系——
  // 我方 hover/focus 规则（:not([disabled]) 镜像）0,9,0 必须 > antd 运行时
  // hover 前景色规则 0,8,0（批 2 曾误记 0,7,0，评审勘误），修复前 0,8,0 打平
  // 会被运行时序反超。
  const btnPrefix = '.ant-input-search-button.ant-btn';
  const isSelfRule = sel => {
    const rightmost = sel.split(/[\s>+~]+/).pop();
    return rightmost.indexOf(btnPrefix) !== -1;
  };
  const ourHoverRules = PRD_RULES.filter(r => isSelfRule(r.selector) && /:(hover|focus)/.test(r.selector));
  t.true(ourHoverRules.length >= 2, '产物应含搜索按钮 hover/focus 规则（实际 ' + ourHoverRules.length + ' 条）');
  for (const rule of ourHoverRules) {
    t.is(cascade.computeSpecificity(rule.selector).join(','), '0,9,0', 'M-1：' + rule.selector);
  }
  const antdHoverColor = buildRuntimeRules().find(
    r =>
      r.sourceKind === 'runtime' &&
      r.selector.indexOf('.ant-input-search-button:not(.ant-btn-color-primary):not([disabled]):hover') !== -1 &&
      r.declarations.some(d => String(d.prop).toLowerCase() === 'color')
  );
  t.truthy(antdHoverColor, 'antd 运行时应注入搜索按钮 hover 前景色规则');
  const antdHoverSpec = cascade.computeSpecificity(antdHoverColor.selector).join(',');
  t.is(antdHoverSpec, '0,8,0', 'M-1 前置事实：antd hover 前景色规则应为 0,8,0');
  for (const rule of ourHoverRules) {
    const ours = cascade.computeSpecificity(rule.selector);
    const theirs = cascade.computeSpecificity(antdHoverColor.selector);
    t.true(
      ours[0] > theirs[0] || (ours[0] === theirs[0] && ours[1] > theirs[1]) || (ours[0] === theirs[0] && ours[1] === theirs[1] && ours[2] > theirs[2]),
      'M-1：我方 hover/focus（' + ours.join(',') + '）应压过 antd hover（' + theirs.join(',') + '）'
    );
  }
  cleanup();
  cleanupDom();
});

test.serial('快照：add-project 页 N-3/N-4 表单行距（双 chunk 各自自保）', async t => {
  await mountAddProject();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'N-3 margin-bottom（add-project chunk）',
    selector: '.form-item.ant-form-item',
    chunk: 'add-project',
    prop: 'margin-bottom',
    value: '.16rem'
  });
  assertFixpoint(t, {
    id: 'N-4 margin-bottom（project chunk）',
    selector: '.form-item.ant-form-item',
    chunk: 'project',
    prop: 'margin-bottom',
    value: '.16rem'
  });
  cleanup();
  cleanupDom();
});

test.serial('快照：project setting 页 N-4 表单行距 + N-5 删除图标色', async t => {
  await mountProjectSetting();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'N-4 margin-bottom（project chunk，setting 页）',
    selector: '.form-item.ant-form-item',
    chunk: 'project',
    prop: 'margin-bottom',
    value: '.16rem'
  });
  assertFixpoint(t, {
    id: 'N-5 color（规则已迁 project chunk 覆盖域——含接口编辑，见巡检批次 2a）',
    selector: '.dynamic-delete-button.anticon',
    chunk: 'project',
    prop: 'color',
    value: '#999'
  });
  cleanup();
  cleanupDom();
});

test.serial('快照：interface 详情页 N-6/N-7 用例表头前景/背景', async t => {
  await mountInterfaceView();
  collectRuntimeStyles();
  assertFixpoint(t, {
    id: 'N-6 color',
    selector: '.caseContainer .ant-table-wrapper .ant-table-thead th',
    chunk: 'project',
    prop: 'color',
    value: '#6d6c6c'
  });
  assertFixpoint(t, {
    id: 'N-7 background',
    selector: '.caseContainer .ant-table-wrapper .ant-table-thead>tr>th',
    chunk: 'project',
    prop: 'background',
    value: 'var(--sk-bg-faint)'
  });
  cleanup();
  cleanupDom();
});

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

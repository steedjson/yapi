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
 * 产物：/tmp/yapi-antd5-layerb/findings.json —— docs/antd5-visual-audit-findings.md
 * 登记表的数据源；断言锚点：已知事故点位 .card-login margin-top——引擎必须能对照
 * 提交态产物复现 979dfa67 原始事故（产物滞后于源码修复，见登录页锚点用例注释）。
 *
 * 本批（批次 1）jsdom 可达页面：login、home 游客、group 列表、interface 用例集合、
 * interface 运行（Postman）、statistics。其余页面在 findings 登记表标注
 * needs-manual / headless 待巡检（批次 2 前由主 Agent 浏览器走查补全）。
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
const scanLib = require('../../../scripts/antd5-css-lib.cjs');
const cascade = require('./antd5Cascade.js');

// ---- 静态产物规则与候选（全 chunk 一次性载入，只读提交态产物）----
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
    // index 是真实页面的首载公共包（rank 0）；其余路由包按字典序排在其后。
    // 秩空间互相错开（×1e6），路由包整体晚于 index、早于运行时注入（1e7 起）。
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

function buildRuntimeRules() {
  const rules = [];
  runtimeStyleTexts.forEach((text, idx) => {
    const raw = scanLib.parseCssRules(text, 'runtime:' + idx);
    rules.push(
      ...cascade.buildCascadeRules(raw, {
        sourceKind: 'runtime',
        sourceName: 'runtime:' + idx,
        // 运行时 <style> 注入晚于一切静态 <link>：源序从 1e7 起，压过 prd 全部秩空间
        rank: 9,
        orderBase: 10000000 + idx * 100000
      })
    );
  });
  return rules;
}

// ---- axios 桩：宽松兜底（未知端点返回空数据），页面挂载各自覆盖关心的端点 ----
const axios = require('axios');

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

  const allRules = PRD_RULES.concat(buildRuntimeRules());
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

  // 锚点（引擎对照已知事故）：979dfa67 修复的 .card-login margin-top。
  // 注意：源码已加 !important（client/containers/Login/Login.scss），但 static/prd
  // 产物最后一次重建在 e50cae0b（早于修复），提交态产物中仍是无 !important 的
  // margin-top:1.6rem——引擎按产物状态应复现「被 :where(...).ant-card{margin:0}
  // 同特异性 (0,1,0)、运行时序胜出」的原始事故。产物重建后本锚点应翻转为
  // not-overridden（批次 2 前置动作，见 findings 登记表）。
  const cardLogin = Array.from(REGISTRY.values()).find(e => e.candidate.selector === '.card-login');
  t.truthy(cardLogin, '应在 login 页找到 .card-login 候选');
  t.truthy(cardLogin.pages.login, '.card-login 应在 login 页渲染');
  t.false(
    cardLogin.candidate.props.find(p => p.prop === 'margin-top').important,
    '前置事实：提交态产物中 card-login margin-top 不含 !important（产物滞后于修复）'
  );
  for (const mode of ['dev', 'prod']) {
    const v = cardLogin.pages.login.props['margin-top'][mode];
    t.is(v && v.status, 'confirmed-override', mode + ' 口径下应复现 979dfa67 原始事故（产物态）');
    t.true(
      /ant-card/.test(v && v.winnerSelector),
      '获胜规则应为 antd Card 运行时样式（实际: ' + (v && v.winnerSelector) + '）'
    );
    t.is(v && v.specCustom, '0,1,0', '自定义 .card-login 特异性 (0,1,0)');
    t.is(v && v.specWinner, '0,1,0', 'antd 获胜规则特异性 (0,1,0)——运行时序决胜，与事故分析一致');
  }
});

test.serial('层B：home 游客页差分', async t => {
  await runDiffForPage('home-guest', mountHome);
  t.true(PAGE_STATS['home-guest'].matchedCandidates >= 10);
});

test.serial('层B：group 列表页差分', async t => {
  await runDiffForPage('group-list', mountGroupList);
  t.true(PAGE_STATS['group-list'].matchedCandidates >= 5, 'group 挂载应命中候选（实际 ' + PAGE_STATS['group-list'].matchedCandidates + '）');
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
    'needs-manual': 0
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
  }

  // 未在任何挂载页面渲染的候选 → needs-manual（层 B 盲区，转人工/无头浏览器巡检）
  const renderedIds = new Set(findings.map(f => f.id));
  for (const candidate of candidates) {
    if (!renderedIds.has(candidate.id)) {
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
        note: 'jsdom 批次 1 未挂载对应页面或选择器在测试环境静态不匹配（:hover 等伪类）'
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

  t.true(findings.length === candidates.length, '登记应覆盖全部层 A 候选');
  t.true(totals.rendered > 0, '至少应有候选在挂载页面渲染');
});

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  delete window.crossRequest;
});

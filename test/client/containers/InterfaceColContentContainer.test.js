// InterfaceColContent 容器级测试（M1）：
//   ① 整容器 DOM 树快照门禁（含 CaseTable 内部结构，任何多包一层 div 都检出）；
//   ② 用例行渲染集（顺序 / 截断 / 报告按钮归属）；
//   ③ onDragOver 重排 → onDragEnd → POST /api/col/up_case_index 载荷链路；
//   ④ openReport → CaseReportModal 打开链路（body portal）；
//   ⑤ 通用规则配置弹窗：colData 合并回显（patchState 函数式更新回归门禁）。
//
// 为什么需要本文件：render 子组件化批次的「DOM 字节等价」门禁依赖抽取前的旧文件
// （git worktree @ ff2d426c），旧文件在合并后消失、门禁随之失效——当时唯一能检出
// 「CaseTable 外包一层 div」这类内部结构漂移的只有未入库的 /tmp harness。本文件把
// 该门禁以「整容器规范化 DOM 快照」永久入库；规范化（共享严版序列化器，详见
// test/helpers/domSnapshot.js）只剥离对结构无信息量的部分（style 布局白名单之外的内
// 联声明、SVG path 数据、antd CSS-in-JS 哈希、rc-select/react useId 生成 id、dnd-kit
// 自增 id），tag/class/role/aria/href/值/text 全部保留，故结构变更必被检出
// （见「快照门禁灵敏度」用例）。
//
// 拖拽链为何注入而非真实 pointer：jsdom 无布局，dnd-kit 的 pointer 序列算不出 over
// （InterfaceColContentCaseTableDnd.test.js 已实证 over 恒为 null），故本文件在
// require 容器前包装 @dnd-kit/core 的 DndContext，记录「最近一次渲染的
// onDragOver/onDragEnd」并按真实时序注入事件——等价真实拖拽「拖拽经过（重排已提交）
// → 松手」的顺序，从而确定性地钉住 POST 载荷；TECH_DEBT 登记的「pointerup 先于重排
// render 提交」竞态属非确定性路径，不在本文件断言范围。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects } from '../../helpers/containers';
import { snapshot } from '../../helpers/domSnapshot';

const path = require('path');
const Module = require('module');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// 补 client/ 前缀别名（webpack alias 等价物），必须在 require 生产代码之前
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// ---- cross-request 插件探测打桩：暴露就绪回调，避免真实轮询（jsdom 无插件）----
// 容器以 initCrossRequest(cb) 接收 hasPlugin；既有用例依赖回调不触发（工具栏保持
// 「开始测试」禁用态，见 DOM 快照），故此处只登记回调，由需要 hasPlugin=true 的用例显式触发。
const crossRequestStub = { callback: null };
const crossRequestPath = path.join(REPO_ROOT, 'client/components/Postman/CheckCrossInstall.js');
const crossRequestModule = new Module(crossRequestPath, null);
crossRequestModule.filename = crossRequestPath;
crossRequestModule.loaded = true;
crossRequestModule.exports = {
  __esModule: true,
  initCrossRequest: cb => {
    crossRequestStub.callback = cb;
    return 0;
  },
  default: () => null
};
require.cache[crossRequestPath] = crossRequestModule;

// ---- DndContext 包装：记录最近一次渲染的拖拽回调，供测试按真实时序注入 ----
const dndCore = require('@dnd-kit/core');
const RealDndContext = dndCore.DndContext;
const capturedDnd = { current: null };
dndCore.DndContext = function CapturedDndContext(props) {
  capturedDnd.current = props;
  return React.createElement(RealDndContext, props);
};

const axios = require('axios');

// ---- axios 打桩（按 URL 返回固定 fixture，并记录调用顺序与载荷）----
const CALLS = [];
function ok(data) {
  return Promise.resolve({ data: data });
}
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}
axios.get = function(url, config) {
  CALLS.push(['GET', url, safeStringify(config && config.params ? config.params : null)]);
  if (url.indexOf('/api/col/list') === 0) {
    return ok({ errcode: 0, data: FIXTURES.interfaceColList });
  }
  if (url.indexOf('/api/project/token') === 0) {
    return ok({ errcode: 0, data: { token: 'TEST_TOKEN' } });
  }
  if (url.indexOf('/api/col/case_list') === 0) {
    return ok({ errcode: 0, colData: FIXTURES.colData, data: FIXTURES.caseList });
  }
  if (url.indexOf('/api/col/case_env_list') === 0) {
    return ok({ errcode: 0, data: [] });
  }
  return ok({ errcode: 0, data: [] });
};
axios.post = function(url, body) {
  CALLS.push(['POST', url, safeStringify(body)]);
  return ok({ errcode: 0 });
};

// ---- fixtures ----
const LONG_CASENAME = '超长用例名称用于验证二十字符截断行为的第一条用例';
const LONG_PATH = '/api/base/very/long/interface/path/for/truncation/check';
const REPORT_URL = 'http://dev.example.com/api/base/two';

/**
 * @param {string} _id
 * @param {string} casename
 * @param {string} p
 */
function makeCase(_id, casename, p) {
  return {
    _id: _id,
    id: _id,
    casename: casename,
    path: p,
    method: 'GET',
    project_id: 'proj-1',
    interface_id: 'if-' + _id,
    case_env: 'dev',
    test_status: '',
    test_script: 'assert.equal(status, 200)',
    req_headers: [],
    req_params: [],
    req_query: [],
    req_body_form: [],
    req_body_type: 'json',
    req_body_other: ''
  };
}

const FIXTURES = {
  interfaceColList: [{ _id: 5, name: '测试集合A', desc: '集合描述' }],
  colData: {
    test_report: JSON.stringify({
      'case-2': {
        code: 0,
        status: 200,
        url: REPORT_URL,
        params: {},
        res_body: { code: 0 },
        validRes: []
      },
      'case-3': {
        code: 400,
        status: 500,
        params: {},
        res_body: { err: 1 },
        validRes: [{ message: '请求异常' }]
      }
    }),
    // 与服务端保存形态一致；刻意与父组件初始 state 取不同值，供「合并生效」断言区分
    checkHttpCodeIs200: true,
    checkResponseField: { name: 'biz_code', value: '7', enable: true },
    checkResponseSchema: true,
    checkScript: { enable: true, content: 'assert.equal(status, 200)' }
  },
  caseList: [
    makeCase('case-1', LONG_CASENAME, LONG_PATH),
    makeCase('case-2', '用例二', '/api/base/two'),
    makeCase('case-3', '用例三', '/api/base/three')
  ]
};

const SEED_STATE = {
  interfaceCol: {
    interfaceColList: FIXTURES.interfaceColList,
    currColId: 5,
    currCaseId: null,
    isShowCol: false,
    isRander: false,
    currCaseList: FIXTURES.caseList,
    envList: [
      {
        _id: 'proj-1',
        name: '演示项目',
        env: [
          { _id: 'e1', name: 'dev', domain: 'http://dev.example.com', header: [] },
          { _id: 'e2', name: 'test', domain: 'http://test.example.com', header: [] }
        ]
      }
    ]
  },
  project: {
    currProject: {
      _id: 12,
      name: '演示项目',
      role: 'admin',
      pre_script: '',
      after_script: ''
    },
    token: 'TEST_TOKEN',
    projectEnv: []
  },
  user: { uid: 7 }
};

const {
  default: InterfaceColContent
} = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  CALLS.length = 0;
});

async function renderContainer() {
  const utils = renderWithProviders(React.createElement(InterfaceColContent), {
    seedState: SEED_STATE,
    initialPath: '/project/12/interface/col/5',
    routePath: '/project/:id/interface/col/:actionId'
  });
  await flushEffects(400);
  return utils;
}

function rowsOf(container) {
  return Array.from(container.querySelectorAll('.interface-col-table tbody tr'));
}

function rowKeysOf(container) {
  return rowsOf(container).map(tr => tr.getAttribute('data-row-key'));
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').trim() === text
  )[0];
}

// ---- 规范化 DOM 快照序列化器已下沉为共享模块 test/helpers/domSnapshot.js ----
// （原松版本地实现整体剥离 style 且不采集受控值；接入严版后由基线 diff 逐条确认
//   仅含「新增采集字段导致的增量」）

const EXPECTED_INITIAL_SNAPSHOT = `<div>
  <div class="interface-col">
    <div class="ant-row.ant-row-center.ant-row-top.CSSHASH" type="flex">
      <div class="ant-col.ant-col-5.CSSHASH">
        <h2 class="interface-title" style="display:inline-block">
          "测试集合"
          <a href="https://hellosean1025.github.io/yapi/documents/case.html" rel="noopener noreferrer" target="_blank">
            <span aria-describedby="test-id" aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
              <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
                <path d="SVG_PATH">
      <div class="ant-col.ant-col-10.CSSHASH">
        <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
          <div class="ant-collapse-item.ant-collapse-item-active">
            <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
              <div class="ant-collapse-expand-icon">
                <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
                  <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
              <span class="ant-collapse-header-text">
                <span>
                  "选择测试用例环境"
                  <span aria-describedby="test-id">
                    <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                      <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
                        <path d="SVG_PATH">
            <div class="ant-collapse-content.ant-collapse-content-active">
              <div class="ant-collapse-content-box">
                <div class="case-env">
                  <div>
                    <div class="ant-row.ant-row-space-around.ant-row-middle.env-item.CSSHASH" type="flex">
                      <div class="ant-col.ant-col-6.label.CSSHASH">
                        <span aria-describedby="test-id" class="label-name">
                          "演示项目"
                      <div class="ant-col.ant-col-18.CSSHASH">
                        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow">
                          <div class="ant-select-selector">
                            <span class="ant-select-selection-wrap">
                              <span class="ant-select-selection-search">
                                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
                              <span class="ant-select-selection-item" title="默认环境">
                                "默认环境"
                          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                                <path d="SVG_PATH">
      <div class="ant-col.ant-col-9.CSSHASH">
        <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" disabled="" type="button">
          <span>
            "开始测试"
    <div class="component-label-wrapper">
      <div>
        <div class="component-label">
          <div>
            <p>
              "集合描述"
              <span aria-describedby="test-id" aria-label="edit" class="anticon.anticon-edit.interface-delete-icon" role="img" tabindex="-1">
                <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                  <path d="SVG_PATH">
    <div class="ant-table-wrapper.interface-col-table.CSSHASH">
      <div class="ant-spin-nested-loading.CSSHASH">
        <div class="ant-spin-container">
          <div class="ant-table.CSSHASH">
            <div class="ant-table-container">
              <div class="ant-table-content">
                <table>
                  <colgroup>
                    <col>
                    <col>
                    <col>
                    <col>
                    <col>
                  <thead class="ant-table-thead">
                    <tr>
                      <th class="ant-table-cell" scope="col">
                        "用例名称"
                      <th class="ant-table-cell" scope="col">
                        <span aria-describedby="test-id">
                          "Key"
                      <th class="ant-table-cell" scope="col">
                        "状态"
                      <th class="ant-table-cell" scope="col">
                        "接口路径"
                      <th class="ant-table-cell" scope="col">
                        "测试报告"
                  <tbody class="ant-table-tbody">
                    <tr aria-describedby="DndDescribedBy-N" aria-disabled="false" aria-roledescription="sortable" class="ant-table-row.ant-table-row-level-0" data-row-key="case-1" role="button" tabindex="0">
                      <td class="ant-table-cell">
                        <a href="/project/12/interface/case/case-1">
                          "超长用例名称用于验证二十字符截断行为的第..."
                      <td class="ant-table-cell">
                        "case-1"
                      <td class="ant-table-cell">
                        <div>
                          <span aria-describedby="test-id" aria-label="check-circle" class="anticon.anticon-check-circle" role="img">
                            <svg aria-hidden="true" data-icon="check-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                              <path d="SVG_PATH">
                      <td class="ant-table-cell">
                        <a aria-describedby="test-id" href="/project/proj-1/interface/api/if-case-1">
                          "/api/base/very/long/..."
                      <td class="ant-table-cell">
                        <div class="interface-col-table-action">
                    <tr aria-describedby="DndDescribedBy-N" aria-disabled="false" aria-roledescription="sortable" class="ant-table-row.ant-table-row-level-0" data-row-key="case-2" role="button" tabindex="0">
                      <td class="ant-table-cell">
                        <a href="/project/12/interface/case/case-2">
                          "用例二"
                      <td class="ant-table-cell">
                        "case-2"
                      <td class="ant-table-cell">
                        <div>
                          <span aria-describedby="test-id" aria-label="check-circle" class="anticon.anticon-check-circle" role="img">
                            <svg aria-hidden="true" data-icon="check-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                              <path d="SVG_PATH">
                      <td class="ant-table-cell">
                        <a aria-describedby="test-id" href="/project/proj-1/interface/api/if-case-2">
                          "/api/base/two"
                      <td class="ant-table-cell">
                        <div class="interface-col-table-action">
                          <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                            <span>
                              "测试报告"
                    <tr aria-describedby="DndDescribedBy-N" aria-disabled="false" aria-roledescription="sortable" class="ant-table-row.ant-table-row-level-0" data-row-key="case-3" role="button" tabindex="0">
                      <td class="ant-table-cell">
                        <a href="/project/12/interface/case/case-3">
                          "用例三"
                      <td class="ant-table-cell">
                        "case-3"
                      <td class="ant-table-cell">
                        <div>
                          <span aria-describedby="test-id" aria-label="info-circle" class="anticon.anticon-info-circle" role="img">
                            <svg aria-hidden="true" data-icon="info-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                              <path d="SVG_PATH">
                      <td class="ant-table-cell">
                        <a aria-describedby="test-id" href="/project/proj-1/interface/api/if-case-3">
                          "/api/base/three"
                      <td class="ant-table-cell">
                        <div class="interface-col-table-action">
                          <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                            <span>
                              "测试报告"
    <div id="DndDescribedBy-N" style="display:none">
      "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel."
    <div aria-atomic="true" aria-live="assertive" id="DndLiveRegion-N" role="status">`;

// ① 初始渲染：整容器 DOM 树逐行等价 + 行渲染集 + 挂载期数据加载链
test.serial('容器级 DOM 快照：初始渲染整容器 DOM 树逐行等价', async t => {
  const utils = await renderContainer();

  t.is(
    snapshot(utils.container),
    EXPECTED_INITIAL_SNAPSHOT,
    '整容器 DOM 树应与基线快照逐行一致（render 子树结构漂移——例如子组件外层多包一层 div——会在此检出）'
  );

  // 行渲染集：3 行、顺序与 data-row-key 一致
  t.deepEqual(rowKeysOf(utils.container), ['case-1', 'case-2', 'case-3'], '行渲染集应按 rows 顺序');

  const cellTexts = rowsOf(utils.container).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim())
  );
  t.is(cellTexts[0][0], LONG_CASENAME.substr(0, 20) + '...', '超长用例名应截断为 20 字符 + ...');
  t.is(cellTexts[0][1], 'case-1', 'Key 列应为用例 id');
  t.is(cellTexts[0][3], LONG_PATH.substr(0, 20) + '...', '超长接口路径应截断为 20 字符 + ...');
  t.is(cellTexts[1][3], '/api/base/two', '短路径不应截断');
  // 报告按钮只归属有报告的用例（case-2 / case-3），无报告行为空
  t.is(
    rowsOf(utils.container)[0].querySelectorAll('.interface-col-table-action button').length,
    0,
    'case-1 无报告，不应渲染「测试报告」按钮'
  );
  t.is(
    rowsOf(utils.container)[1].querySelectorAll('.interface-col-table-action button').length,
    1,
    'case-2 有报告，应渲染「测试报告」按钮'
  );

  // 挂载期加载链：集合列表 → token → 用例列表（+ 环境列表）
  const getUrls = CALLS.filter(c => c[0] === 'GET').map(c => c[1]);
  t.true(getUrls.indexOf('/api/col/list?project_id=12') !== -1, '挂载应加载集合列表');
  t.true(getUrls.indexOf('/api/project/token') !== -1, '挂载应加载项目 token');
  t.true(getUrls.indexOf('/api/col/case_list/?col_id=5') !== -1, '应加载集合 5 的用例列表');
});

// ② 快照门禁灵敏度：结构突变（CaseTable 外包一层 div）必被检出
test.serial('快照门禁灵敏度：CaseTable 外包一层 div 即被检出（M1 突变等价）', async t => {
  const utils = await renderContainer();
  const baseline = snapshot(utils.container);

  const clone = utils.container.cloneNode(true);
  const table = clone.querySelector('.interface-col-table');
  t.truthy(table, '前置条件：容器内应存在 .interface-col-table');
  const wrapper = clone.ownerDocument.createElement('div');
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);

  t.not(
    snapshot(clone),
    baseline,
    '给 CaseTable 外包一层 div 必须改变快照（否则该门禁形同虚设）'
  );
  t.true(
    snapshot(clone).indexOf('\n    <div>\n      <div class="ant-table-wrapper') !== -1,
    '突变后应可观察到多出的一层 div'
  );
});

// ③ 拖拽链：onDragOver 重排 → onDragEnd → POST /api/col/up_case_index（载荷为新顺序）
test.serial('拖拽重排链：onDragOver 重排后 onDragEnd 上送新顺序 index', async t => {
  const utils = await renderContainer();
  t.deepEqual(rowKeysOf(utils.container), ['case-1', 'case-2', 'case-3'], '前置条件：初始顺序');

  // 拖拽经过：case-1 移到 case-3 的位置（arrayMove 0 → 2）
  await act(async () => {
    capturedDnd.current.onDragOver({ active: { id: 'case-1' }, over: { id: 'case-3' } });
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  t.deepEqual(
    rowKeysOf(utils.container),
    ['case-2', 'case-3', 'case-1'],
    'onDragOver 应实时重排（父组件 setRows → 表格以新顺序渲染）'
  );

  // 松手：onDragEnd → onDrop → POST 当前顺序
  await act(async () => {
    capturedDnd.current.onDragEnd({ active: { id: 'case-1' }, over: { id: 'case-3' } });
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  const posts = CALLS.filter(c => c[0] === 'POST' && c[1] === '/api/col/up_case_index');
  t.is(posts.length, 1, '松手应恰好上送一次顺序接口');
  t.deepEqual(
    JSON.parse(posts[0][2]),
    [
      { id: 'case-2', index: 0 },
      { id: 'case-3', index: 1 },
      { id: 'case-1', index: 2 }
    ],
    'POST 载荷应反映重排后的顺序与 index'
  );
  t.true(
    CALLS.filter(c => c[0] === 'GET' && c[1] === '/api/col/list?project_id=12').length >= 2,
    '上送后应重新拉取集合列表'
  );
});

// ③b 未换位不产生冗余请求（onDragEnd 的既有守卫）
test.serial('拖拽未换位时 onDragEnd 不上送顺序接口', async t => {
  await renderContainer();

  await act(async () => {
    capturedDnd.current.onDragEnd({ active: { id: 'case-1' }, over: { id: 'case-1' } });
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  t.is(
    CALLS.filter(c => c[0] === 'POST' && c[1] === '/api/col/up_case_index').length,
    0,
    'active.id === over.id 时不应上送'
  );
});

// ④ openReport → CaseReportModal：报告按钮打开弹窗（body portal）并展示对应报告
test.serial('openReport → CaseReportModal：点击测试报告打开弹窗并展示对应用例报告', async t => {
  const utils = await renderContainer();

  t.falsy(document.body.querySelector('.ant-modal'), '前置条件：初始不应有弹窗');

  await act(async () => {
    fireEvent.click(buttonByText(utils.container, '测试报告'));
    await new Promise(resolve => setTimeout(resolve, 60));
  });

  const modal = document.body.querySelector('.ant-modal');
  t.truthy(modal, 'openReport 后应在 body 中渲染弹窗（portal）');
  t.is(
    modal.querySelector('.ant-modal-title').textContent,
    '测试报告',
    '弹窗标题应为「测试报告」'
  );
  t.true(utils.container.querySelector('.ant-modal') === null, '弹窗不应渲染在容器内（portal 语义）');

  const modalText = modal.textContent;
  t.true(modalText.indexOf(REPORT_URL) !== -1, '弹窗应展示所点用例的报告内容（Url）');
  t.truthy(modal.querySelector('.case-report'), '弹窗正文应复用 CaseReport 组件');
});

test.serial('通用规则配置：集合 colData 合并进 commonSetting 并在弹窗回显（patchState 函数式更新）', async t => {
  const utils = await renderContainer();

  // cross-request 插件就绪回调（真实实现为轮询；此处注入 true 以渲染工具栏三按钮）
  await act(async () => {
    crossRequestStub.callback(true);
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  t.truthy(buttonByText(utils.container, '通用规则配置'), 'hasPlugin=true 后应渲染通用规则配置按钮');

  await act(async () => {
    fireEvent.click(buttonByText(utils.container, '通用规则配置'));
    await new Promise(resolve => setTimeout(resolve, 80));
  });

  const modal = document.body.querySelector('.ant-modal');
  t.truthy(modal, '点击「通用规则配置」应打开弹窗');
  t.is(
    modal.querySelector('input[placeholder="字段名"]').value,
    'biz_code',
    '字段名应回显集合 colData（修复前 patchState(fn) 空操作，此处为默认 code）'
  );
  t.is(modal.querySelector('input[placeholder="值"]').value, '7', '字段值应回显集合 colData');
  const sws = modal.querySelectorAll('.ant-switch');
  t.is(sws.length, 4, '四项通用规则开关');
  t.deepEqual(
    Array.from(sws).map(sw => sw.getAttribute('aria-checked')),
    ['true', 'true', 'true', 'true'],
    '开关状态应回显集合 colData（默认 state 全 false）'
  );
});
test.serial('拖拽竞态：pointerup 先于重排提交时按最新顺序上送（同一闭包 dragOver→dragEnd）', async t => {
  const utils = await renderContainer();
  t.deepEqual(rowKeysOf(utils.container), ['case-1', 'case-2', 'case-3'], '前置条件：初始顺序');

  // 同一渲染闭包内连续触发 dragOver → dragEnd（模拟 pointerup 先于重排 render 提交）：
  // 旧实现 onDrop 读渲染期 state.rows（仍为初始序）会持久化旧顺序
  const dnd = capturedDnd.current;
  await act(async () => {
    dnd.onDragOver({ active: { id: 'case-1' }, over: { id: 'case-3' } });
    dnd.onDragEnd({ active: { id: 'case-1' }, over: { id: 'case-3' } });
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  const posts = CALLS.filter(c => c[0] === 'POST' && c[1] === '/api/col/up_case_index');
  t.is(posts.length, 1, '松手应恰好上送一次顺序接口');
  t.deepEqual(
    JSON.parse(posts[0][2]),
    [
      { id: 'case-2', index: 0 },
      { id: 'case-3', index: 1 },
      { id: 'case-1', index: 2 }
    ],
    'POST 载荷应为换位后的最新顺序（旧实现为渲染期旧序 case-1/2/3）'
  );
  t.deepEqual(
    rowKeysOf(utils.container),
    ['case-2', 'case-3', 'case-1'],
    '重排最终仍应渲染为新顺序'
  );
});

// Postman 容器级测试（render 子组件化批次三 · 前置项 M-2）：
//   ① 整容器规范化 DOM 快照门禁：inter 初始（含 cross-request 插件提示）/ case 型 /
//      params 展开态（含受控编辑）/ 响应回填态 / Test 页签切换，任何「多包一层 div」
//      或子组件装配漂移都在此逐行检出；
//   ② 快照门禁灵敏度：外包 div 必被检出 + 受控输入值/勾选变化必被检出。
//
// 为什么需要本文件：render 子组件化批次（Postman.js 748 行仅剩 hooks + 渲染组装，
// 拆分见 client/components/Postman/PostmanParts/）的「DOM 字节等价」门禁原本只存在于
// 批次交付期的临时 harness（/tmp，未入库）；旧文件在合并后消失、门禁随之失效。本文件
// 把该门禁以「整容器规范化 DOM 快照」永久入库，覆盖 Postman 容器装配与 8 个子组件的
// 组合结果（UrlBar / RequestParamsPanel / BodyPanel / ParamsName / ResponsePanel /
// TestPanel / PostmanModals / CheckCrossInstall）。
//
// 规范化策略（共享严版序列化器，详见 test/helpers/domSnapshot.js）：
//   - 保留：tag / class（剥离 antd CSS-in-JS 哈希）/ 全部 attributes / 文本（空白折叠）；
//   - style：按「布局类白名单」采集 display / flex-basis / flex-grow / visibility，
//     布局漂移可检出，其余内联样式仍剥离；
//   - 受控值：对 input/textarea/select 采集实时 value / checked（checkbox·radio 取
//     checked，其余取 value）；灵敏度用例②钉住该采集确实生效；
//   - 其余沿用：SVG path 的 d 数据、rc-select 与 react useId 生成 id、dnd-kit 自增 id
//     归一化（与结构无关且跨挂载不稳定），以及 rc-motion 过渡态类名归一化。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, act } from '@testing-library/react';
import {
  cleanupDom,
  renderWithProviders,
  flushEffects,
  stubDefaultExport,
  REPO_ROOT
} from '../../helpers/containers';
import { snapshot } from '../../helpers/domSnapshot';

const path = require('path');
const Module = require('module');

// Postman.js 里经 webpack 别名引用 client/...，jsdom-setup 只映射了 common/ 前缀，
// 这里补 client/ 前缀映射，必须在 require 生产代码之前安装
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// AceEditor（CodeMirror 6）依赖真实测量环境，与 Postman.test.js / PostmanParts* 一致
// 打桩为静态替身；替身把父组件下传的 props（data / mode / readOnly / className）与
// ref 接线一并暴露为 data-* 属性，故「编辑器接线漂移」同样落在快照门禁内。
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

// crossRequest 桩：保留 postmanLib 的真实导出（handleParams 等），仅替换 crossRequest，
// 使「发送」链路的响应回填确定可期（真实实现依赖 cross-request 插件与浏览器端 XHR）
const realPostmanLib = require(path.join(REPO_ROOT, 'common/postmanLib.js'));
const postmanLibPath = path.join(REPO_ROOT, 'common/postmanLib.js');
const crossRequestCalls = [];
{
  const stubModule = new Module(postmanLibPath, null);
  stubModule.filename = postmanLibPath;
  stubModule.loaded = true;
  stubModule.exports = Object.assign({}, realPostmanLib, {
    crossRequest(options) {
      crossRequestCalls.push(options);
      return new Promise(resolve => {
        setTimeout(
          () =>
            resolve({
              res: {
                header: { 'content-type': 'application/json', 'x-stub': 'p7' },
                body: { echo: 'ok' },
                status: 200,
                statusText: 'OK'
              },
              runTime: 12
            }),
          20
        );
      });
    }
  });
  require.cache[postmanLibPath] = stubModule;
}

// axios 打桩：initState 在 json-schema body 时请求 /api/interface/schema2json
const axios = require('axios');
axios.post = function(url) {
  if (url.indexOf('/api/interface/schema2json') === 0) {
    return Promise.resolve({ data: { mockKey: 'mockValue' } });
  }
  return Promise.resolve({ data: { errcode: 0 } });
};
axios.get = function() {
  return Promise.resolve({ data: { errcode: 0, data: [] } });
};

const { default: Postman } = require('../../../client/components/Postman/Postman.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 接口夹具：POST /api/pet/{id}，path/query/header/json body 齐备（与 Postman.test.js 同源）
const INTER_DATA = {
  _id: 100,
  title: '接口一',
  method: 'POST',
  path: '/api/pet/{id}',
  project_id: 12,
  req_headers: [{ name: 'Content-Type', value: 'application/json', required: '1' }],
  req_params: [{ name: 'id', desc: '路径参数', value: '42' }],
  req_query: [
    { name: 'q', required: '1', example: 'hello' },
    { name: 'opt', required: '0', example: '' }
  ],
  req_body_type: 'json',
  req_body_form: [],
  req_body_other: '{"name":"zhang"}',
  req_body_is_json_schema: false,
  res_body_type: 'json',
  res_body: '{"a":1}',
  res_body_is_json_schema: false,
  env: [
    { name: 'local', domain: 'http://localhost:3000', header: [{ name: 'X-Env', value: 'local' }] },
    { name: 'prod', domain: 'https://prod.example.com', header: [] }
  ],
  case_env: 'local',
  pre_script: 'console.log("pre")',
  after_script: 'console.log("after")'
};

const CASE_DATA = Object.assign({}, INTER_DATA, {
  _id: 900,
  casename: '用例一',
  case_env: 'prod',
  test_script: 'assert.equal(status, 200)',
  enable_script: false
});

const BASE_PROPS = { curUid: 9, interfaceId: 100, projectId: 12, save: () => {} };

// Postman 自身不消费 store；仍按容器级测试模式以 Provider + Router 包裹，
// 保证 PostmanModals → ProjectEnv 等既有消费方在任何场景下都有等价上下文
const SEED_STATE = {
  group: { field: { enable: false, name: '' } },
  project: { currProject: { _id: 12, name: '演示项目' } },
  user: { uid: 9 }
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  crossRequestCalls.length = 0;
  delete window.crossRequest;
});

/**
 * 挂载 Postman 容器并等待挂载期副作用（插件探测定时器 + initState 异步）落定
 * @param {any} data
 * @param {string} type
 * @param {any} [opts] opts.plugin=false 时不注入 window.crossRequest（插件缺失场景）
 */
async function renderPostman(data, type, opts) {
  const options = opts || {};
  if (options.plugin !== false) {
    window.crossRequest = function() {};
  }
  const utils = renderWithProviders(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, { data, type })),
    { seedState: SEED_STATE }
  );
  await flushEffects(options.waitMs == null ? 400 : options.waitMs);
  return utils;
}

function buttonByText(container, text) {
  // antd Button 会在两个汉字间插入空格，比较前去除空白
  return Array.from(container.querySelectorAll('button')).find(
    b => b.textContent.replace(/\s/g, '') === text
  );
}

// 「发送 → 响应回填」两段 act：与生产 discrete 事件同步提交语义一致
async function clickSend(container) {
  await act(async () => {
    fireEvent.click(buttonByText(container, '发送'));
  });
  await act(async () => {
    await sleep(150);
  });
}

/**
 * 轮询等待某个渲染结果出现（每轮在 act 内推进 30ms）。
 * 用于「插件探测定时器 / 跨端请求响应」这两条异步链路：固定 sleep 在整库并发跑测时
 * 可能不足（曾观测到响应快照比终态早一拍），改为等待终态标记后再取快照，消除时序 flake。
 * @param {any} predicate 终态判定（返回真即停止等待）
 * @param {number} [timeoutMs]
 */
async function waitFor(predicate, timeoutMs) {
  const limit = timeoutMs == null ? 3000 : timeoutMs;
  const start = Date.now();
  while (Date.now() - start < limit) {
    let reached = false;
    await act(async () => {
      await sleep(30);
      reached = !!predicate();
    });
    if (reached) {
      return true;
    }
  }
  return false;
}

// ---- 规范化 DOM 快照序列化器已下沉为共享模块 test/helpers/domSnapshot.js ----

// ---- 基线快照（5 场景）----
// 场景①：inter 型初始 + 无 cross-request 插件（等满 500ms 探测周期后 hasPlugin=false，
// 渲染 CheckCrossInstall 告警、发送按钮转禁用）
const EXPECTED_INTER_INITIAL_SNAPSHOT = `<div>
  <div class="interface-test.postman">
    <div class="has-plugin">
      <div class="ant-alert.ant-alert-warning.ant-alert-no-icon.CSSHASH" data-show="true" role="alert">
        <div class="ant-alert-content">
          <div class="ant-alert-message">
            <div>
              "重要：当前的接口测试服务，需安装免费测试增强插件,仅支持 chrome 浏览器，选择下面任意一种安装方式："
              <div>
                <a href="https://juejin.im/post/5e3bbd986fb9a07ce152b53d" target="blank">
                  "[谷歌请求插件详细安装教程]"
    <div class="url">
      <span class="ant-input-group.ant-input-group-compact.CSSHASH" style="display:flex">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow.ant-select-disabled" style="flex-basis:60px">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" disabled="" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="POST">
                "POST"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow" style="flex-basis:180px;flex-grow:1">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="local：http://localhost:3000">
                "local：http://localhost:3000"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" spellcheck="false" style="flex-basis:180px;flex-grow:1" type="text" value="/api/pet/{id}">
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" disabled="" type="button">
        <span>
          "发 送"
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "保 存"
    <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "PATH PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="id">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0" placeholder="参数值" type="text" value="42">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Path参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "QUERY PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="q">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-disabled.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked.ant-checkbox-disabled">
                  <input checked="true" class="ant-checkbox-input" disabled="" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0" placeholder="参数值" type="text" value="hello">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="opt">
              <label class="ant-checkbox-wrapper.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH">
                  <input checked="false" class="ant-checkbox-input" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_1" placeholder="参数值" type="text" value="">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Query参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "HEADERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="Content-Type">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0" placeholder="参数值" type="text" value="application/json">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="X-Env">
              <span class="eq-symbol">
                "="
              <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.value" disabled="" id="req_headers_1" placeholder="参数值" type="text" value="local">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Header"
      <div class="ant-collapse-item.ant-collapse-item-active.POST">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            <div style="display:flex">
              <span aria-describedby="test-id">
                "BODY(F9)"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div style="display:block">
              <div class="adv-button">
                <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                  <span>
                    "高级参数设置"
                <span aria-describedby="test-id">
                  <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                    <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                      <path d="SVG_PATH">
                      <path d="SVG_PATH">
              <div class="pretty-editor" data-data="{\\"name\\":\\"zhang\\"}" data-mode="null" data-readonly="false">
                "STUB_ACE"
    <div class="ant-tabs.ant-tabs-top.ant-tabs-large.response-tab.CSSHASH">
      <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
        <div class="ant-tabs-nav-wrap">
          <div class="ant-tabs-nav-list">
            <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="res">
              <div aria-controls="rc-tabs-test-panel-res" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-res" role="tab" tabindex="0">
                "Response"
            <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
        <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
          <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
            <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
              <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
      <div class="ant-tabs-content-holder">
        <div class="ant-tabs-content.ant-tabs-content-top">
          <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-res" class="ant-tabs-tabpane.ant-tabs-tabpane-active" id="rc-tabs-test-panel-res" role="tabpanel" tabindex="0">
            <div class="ant-spin-nested-loading.CSSHASH">
              <div class="ant-spin-container">
                <h2 class="res-code.fail" style="display:none">
                  "null null"
                <div>
                  <a href="https://juejin.im/post/5c888a3e5188257dee0322af" rel="noopener noreferrer" target="_blank">
                    "YApi 新版如何查看 http 请求数据"
                <div class="container-header-body">
                  <div class="header">
                    <div class="container-title">
                      <h4>
                        "Headers"
                    <div class="pretty-editor-header" data-data="" data-mode="json" data-readonly="true">
                      "STUB_ACE"
                  <div class="resizer">
                    <div class="container-title">
                      <h4 style="visibility:hidden">
                        "1"
                  <div class="body">
                    <div class="container-title">
                      <h4>
                        "Body"
                      <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.CSSHASH">
                        <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                          <input checked="true" class="ant-checkbox-input" type="checkbox">
                          <span class="ant-checkbox-inner">
                        <span class="ant-checkbox-label">
                          <span>
                            "自动预览HTML"
                    <div class="pretty-editor-body" data-data="" data-mode="text" data-readonly="true">
                      "STUB_ACE"`;

// 场景②：case 型初始（插件在位、无告警，保存按钮文案为「更新」）
const EXPECTED_CASE_INITIAL_SNAPSHOT = `<div>
  <div class="interface-test.postman">
    <div>
    <div class="url">
      <span class="ant-input-group.ant-input-group-compact.CSSHASH" style="display:flex">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow.ant-select-disabled" style="flex-basis:60px">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" disabled="" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="POST">
                "POST"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow" style="flex-basis:180px;flex-grow:1">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="prod：https://prod.example.com">
                "prod：https://prod.example.com"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" spellcheck="false" style="flex-basis:180px;flex-grow:1" type="text" value="/api/pet/{id}">
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "发 送"
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "更 新"
    <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "PATH PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="id">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0" placeholder="参数值" type="text" value="42">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Path参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "QUERY PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="q">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-disabled.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked.ant-checkbox-disabled">
                  <input checked="true" class="ant-checkbox-input" disabled="" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0" placeholder="参数值" type="text" value="hello">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="opt">
              <label class="ant-checkbox-wrapper.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH">
                  <input checked="false" class="ant-checkbox-input" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_1" placeholder="参数值" type="text" value="">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Query参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "HEADERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="Content-Type">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0" placeholder="参数值" type="text" value="application/json">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Header"
      <div class="ant-collapse-item.ant-collapse-item-active.POST">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            <div style="display:flex">
              <span aria-describedby="test-id">
                "BODY(F9)"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div style="display:block">
              <div class="adv-button">
                <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                  <span>
                    "高级参数设置"
                <span aria-describedby="test-id">
                  <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                    <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                      <path d="SVG_PATH">
                      <path d="SVG_PATH">
              <div class="pretty-editor" data-data="{\\"name\\":\\"zhang\\"}" data-mode="null" data-readonly="false">
                "STUB_ACE"
    <div class="ant-tabs.ant-tabs-top.ant-tabs-large.response-tab.CSSHASH">
      <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
        <div class="ant-tabs-nav-wrap">
          <div class="ant-tabs-nav-list">
            <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="res">
              <div aria-controls="rc-tabs-test-panel-res" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-res" role="tab" tabindex="0">
                "Response"
            <div class="ant-tabs-tab" data-node-key="test">
              <div aria-controls="rc-tabs-test-panel-test" aria-selected="false" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-test" role="tab" tabindex="-1">
                <span aria-describedby="test-id">
                  "Test"
            <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
        <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
          <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
            <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
              <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
      <div class="ant-tabs-content-holder">
        <div class="ant-tabs-content.ant-tabs-content-top">
          <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-res" class="ant-tabs-tabpane.ant-tabs-tabpane-active" id="rc-tabs-test-panel-res" role="tabpanel" tabindex="0">
            <div class="ant-spin-nested-loading.CSSHASH">
              <div class="ant-spin-container">
                <h2 class="res-code.fail" style="display:none">
                  "null null"
                <div>
                  <a href="https://juejin.im/post/5c888a3e5188257dee0322af" rel="noopener noreferrer" target="_blank">
                    "YApi 新版如何查看 http 请求数据"
                <div class="container-header-body">
                  <div class="header">
                    <div class="container-title">
                      <h4>
                        "Headers"
                    <div class="pretty-editor-header" data-data="" data-mode="json" data-readonly="true">
                      "STUB_ACE"
                  <div class="resizer">
                    <div class="container-title">
                      <h4 style="visibility:hidden">
                        "1"
                  <div class="body">
                    <div class="container-title">
                      <h4>
                        "Body"
                      <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.CSSHASH">
                        <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                          <input checked="true" class="ant-checkbox-input" type="checkbox">
                          <span class="ant-checkbox-inner">
                        <span class="ant-checkbox-label">
                          <span>
                            "自动预览HTML"
                    <div class="pretty-editor-body" data-data="" data-mode="text" data-readonly="true">
                      "STUB_ACE"`;

// 场景③：params 展开态 + 受控编辑（query 第 1 行改值、第 2 行勾选启用）
const EXPECTED_PARAMS_EDITED_SNAPSHOT = `<div>
  <div class="interface-test.postman">
    <div>
    <div class="url">
      <span class="ant-input-group.ant-input-group-compact.CSSHASH" style="display:flex">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow.ant-select-disabled" style="flex-basis:60px">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" disabled="" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="POST">
                "POST"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow" style="flex-basis:180px;flex-grow:1">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="local：http://localhost:3000">
                "local：http://localhost:3000"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" spellcheck="false" style="flex-basis:180px;flex-grow:1" type="text" value="/api/pet/{id}">
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "发 送"
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "保 存"
    <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "PATH PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="id">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0" placeholder="参数值" type="text" value="42">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Path参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "QUERY PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="q">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-disabled.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked.ant-checkbox-disabled">
                  <input checked="true" class="ant-checkbox-input" disabled="" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0" placeholder="参数值" type="text" value="zz">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="opt">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                  <input checked="true" class="ant-checkbox-input" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_1" placeholder="参数值" type="text" value="">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Query参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "HEADERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="Content-Type">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0" placeholder="参数值" type="text" value="application/json">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="X-Env">
              <span class="eq-symbol">
                "="
              <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.value" disabled="" id="req_headers_1" placeholder="参数值" type="text" value="local">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Header"
      <div class="ant-collapse-item.ant-collapse-item-active.POST">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            <div style="display:flex">
              <span aria-describedby="test-id">
                "BODY(F9)"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div style="display:block">
              <div class="adv-button">
                <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                  <span>
                    "高级参数设置"
                <span aria-describedby="test-id">
                  <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                    <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                      <path d="SVG_PATH">
                      <path d="SVG_PATH">
              <div class="pretty-editor" data-data="{\\"name\\":\\"zhang\\"}" data-mode="null" data-readonly="false">
                "STUB_ACE"
    <div class="ant-tabs.ant-tabs-top.ant-tabs-large.response-tab.CSSHASH">
      <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
        <div class="ant-tabs-nav-wrap">
          <div class="ant-tabs-nav-list">
            <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="res">
              <div aria-controls="rc-tabs-test-panel-res" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-res" role="tab" tabindex="0">
                "Response"
            <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
        <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
          <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
            <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
              <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
      <div class="ant-tabs-content-holder">
        <div class="ant-tabs-content.ant-tabs-content-top">
          <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-res" class="ant-tabs-tabpane.ant-tabs-tabpane-active" id="rc-tabs-test-panel-res" role="tabpanel" tabindex="0">
            <div class="ant-spin-nested-loading.CSSHASH">
              <div class="ant-spin-container">
                <h2 class="res-code.fail" style="display:none">
                  "null null"
                <div>
                  <a href="https://juejin.im/post/5c888a3e5188257dee0322af" rel="noopener noreferrer" target="_blank">
                    "YApi 新版如何查看 http 请求数据"
                <div class="container-header-body">
                  <div class="header">
                    <div class="container-title">
                      <h4>
                        "Headers"
                    <div class="pretty-editor-header" data-data="" data-mode="json" data-readonly="true">
                      "STUB_ACE"
                  <div class="resizer">
                    <div class="container-title">
                      <h4 style="visibility:hidden">
                        "1"
                  <div class="body">
                    <div class="container-title">
                      <h4>
                        "Body"
                      <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.CSSHASH">
                        <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                          <input checked="true" class="ant-checkbox-input" type="checkbox">
                          <span class="ant-checkbox-inner">
                        <span class="ant-checkbox-label">
                          <span>
                            "自动预览HTML"
                    <div class="pretty-editor-body" data-data="" data-mode="text" data-readonly="true">
                      "STUB_ACE"`;

// 场景④：响应回填态（发送 → crossRequest → 200/Headers/Body 全量回填）
const EXPECTED_RESPONSE_SNAPSHOT = `<div>
  <div class="interface-test.postman">
    <div>
    <div class="url">
      <span class="ant-input-group.ant-input-group-compact.CSSHASH" style="display:flex">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow.ant-select-disabled" style="flex-basis:60px">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" disabled="" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="POST">
                "POST"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow" style="flex-basis:180px;flex-grow:1">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="local：http://localhost:3000">
                "local：http://localhost:3000"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" spellcheck="false" style="flex-basis:180px;flex-grow:1" type="text" value="/api/pet/{id}">
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span class="ant-btn-icon.ant-btn-loading-icon.ant-btn-loading-icon-motion-STATE.ant-btn-loading-icon-motion">
          <span aria-label="loading" class="anticon.anticon-loading.anticon-spin" role="img">
            <svg aria-hidden="true" data-icon="loading" fill="currentColor" focusable="false" height="1em" viewBox="0 0 1024 1024" width="1em">
              <path d="SVG_PATH">
        <span>
          "发 送"
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "保 存"
    <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "PATH PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="id">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0" placeholder="参数值" type="text" value="42">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Path参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "QUERY PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="q">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-disabled.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked.ant-checkbox-disabled">
                  <input checked="true" class="ant-checkbox-input" disabled="" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0" placeholder="参数值" type="text" value="hello">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="opt">
              <label class="ant-checkbox-wrapper.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH">
                  <input checked="false" class="ant-checkbox-input" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_1" placeholder="参数值" type="text" value="">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Query参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "HEADERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="Content-Type">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0" placeholder="参数值" type="text" value="application/json">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="X-Env">
              <span class="eq-symbol">
                "="
              <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.value" disabled="" id="req_headers_1" placeholder="参数值" type="text" value="local">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Header"
      <div class="ant-collapse-item.ant-collapse-item-active.POST">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            <div style="display:flex">
              <span aria-describedby="test-id">
                "BODY(F9)"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div style="display:block">
              <div class="adv-button">
                <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                  <span>
                    "高级参数设置"
                <span aria-describedby="test-id">
                  <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                    <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                      <path d="SVG_PATH">
                      <path d="SVG_PATH">
              <div class="pretty-editor" data-data="{\\"name\\":\\"zhang\\"}" data-mode="null" data-readonly="false">
                "STUB_ACE"
    <div class="ant-tabs.ant-tabs-top.ant-tabs-large.response-tab.CSSHASH">
      <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
        <div class="ant-tabs-nav-wrap">
          <div class="ant-tabs-nav-list">
            <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="res">
              <div aria-controls="rc-tabs-test-panel-res" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-res" role="tab" tabindex="0">
                "Response"
            <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
        <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
          <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
            <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
              <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
      <div class="ant-tabs-content-holder">
        <div class="ant-tabs-content.ant-tabs-content-top">
          <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-res" class="ant-tabs-tabpane.ant-tabs-tabpane-active" id="rc-tabs-test-panel-res" role="tabpanel" tabindex="0">
            <div class="ant-spin-nested-loading.CSSHASH">
              <div class="ant-spin-container">
                <h2 class="res-code.success">
                  "200 OK"
                <div>
                  <a href="https://juejin.im/post/5c888a3e5188257dee0322af" rel="noopener noreferrer" target="_blank">
                    "YApi 新版如何查看 http 请求数据"
                <div class="container-header-body">
                  <div class="header">
                    <div class="container-title">
                      <h4>
                        "Headers"
                    <div class="pretty-editor-header" data-data="[object Object]" data-mode="json" data-readonly="true">
                      "STUB_ACE"
                  <div class="resizer">
                    <div class="container-title">
                      <h4 style="visibility:hidden">
                        "1"
                  <div class="body">
                    <div class="container-title">
                      <h4>
                        "Body"
                      <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.CSSHASH">
                        <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                          <input checked="true" class="ant-checkbox-input" type="checkbox">
                          <span class="ant-checkbox-inner">
                        <span class="ant-checkbox-label">
                          <span>
                            "自动预览HTML"
                    <div class="pretty-editor-body" data-data="{\\n  \\"echo\\": \\"ok\\"\\n}" data-mode="json" data-readonly="true">
                      "STUB_ACE"`;

// 场景⑤：Test 页签切换（case 型，脚本开关 + 编辑器 + 断言片段列表）
const EXPECTED_TEST_TAB_SNAPSHOT = `<div>
  <div class="interface-test.postman">
    <div>
    <div class="url">
      <span class="ant-input-group.ant-input-group-compact.CSSHASH" style="display:flex">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow.ant-select-disabled" style="flex-basis:60px">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" disabled="" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="POST">
                "POST"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow" style="flex-basis:180px;flex-grow:1">
          <div class="ant-select-selector">
            <span class="ant-select-selection-wrap">
              <span class="ant-select-selection-search">
                <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
              <span class="ant-select-selection-item" title="prod：https://prod.example.com">
                "prod：https://prod.example.com"
          <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
            <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
              <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
        <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" spellcheck="false" style="flex-basis:180px;flex-grow:1" type="text" value="/api/pet/{id}">
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "发 送"
      <button aria-describedby="test-id" class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" type="button">
        <span>
          "更 新"
    <div class="ant-collapse.ant-collapse-icon-position-start.CSSHASH">
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "PATH PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="id">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0" placeholder="参数值" type="text" value="42">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Path参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "QUERY PARAMETERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="q">
              <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-disabled.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked.ant-checkbox-disabled">
                  <input checked="true" class="ant-checkbox-input" disabled="" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0" placeholder="参数值" type="text" value="hello">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="opt">
              <label class="ant-checkbox-wrapper.params-enable.CSSHASH">
                <span class="ant-checkbox.ant-wave-target.CSSHASH">
                  <input checked="false" class="ant-checkbox-input" type="checkbox">
                  <span class="ant-checkbox-inner">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_1" placeholder="参数值" type="text" value="">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Query参数"
      <div class="ant-collapse-item.ant-collapse-item-active">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            "HEADERS"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div class="key-value-wrap">
              <div>
                <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined.key" disabled="" type="text" value="Content-Type">
              <span class="eq-symbol">
                "="
              <span class="ant-input-group-wrapper.ant-input-group-wrapper-outlined.CSSHASH.value">
                <span class="ant-input-wrapper.ant-input-group.CSSHASH">
                  <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0" placeholder="参数值" type="text" value="application/json">
                  <span class="ant-input-group-addon">
                    <span aria-label="edit" class="anticon.anticon-edit" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="edit" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
            <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid" style="display:none" type="button">
              <span class="ant-btn-icon">
                <span aria-label="plus" class="anticon.anticon-plus" role="img">
                  <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
              <span>
                "添加Header"
      <div class="ant-collapse-item.ant-collapse-item-active.POST">
        <div aria-disabled="false" aria-expanded="true" class="ant-collapse-header" role="button" tabindex="0">
          <div class="ant-collapse-expand-icon">
            <span aria-label="expanded" class="anticon.anticon-right.ant-collapse-arrow" role="img">
              <svg aria-hidden="true" data-icon="right" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
          <span class="ant-collapse-header-text">
            <div style="display:flex">
              <span aria-describedby="test-id">
                "BODY(F9)"
        <div class="ant-collapse-content.ant-collapse-content-active">
          <div class="ant-collapse-content-box">
            <div style="display:block">
              <div class="adv-button">
                <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined" type="button">
                  <span>
                    "高级参数设置"
                <span aria-describedby="test-id">
                  <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                    <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                      <path d="SVG_PATH">
                      <path d="SVG_PATH">
              <div class="pretty-editor" data-data="{\\"name\\":\\"zhang\\"}" data-mode="null" data-readonly="false">
                "STUB_ACE"
    <div class="ant-tabs.ant-tabs-top.ant-tabs-large.response-tab.CSSHASH">
      <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
        <div class="ant-tabs-nav-wrap">
          <div class="ant-tabs-nav-list">
            <div class="ant-tabs-tab" data-node-key="res">
              <div aria-controls="rc-tabs-test-panel-res" aria-selected="false" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-res" role="tab" tabindex="-1">
                "Response"
            <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="test">
              <div aria-controls="rc-tabs-test-panel-test" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-test" role="tab" tabindex="0">
                <span aria-describedby="test-id">
                  "Test"
            <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
        <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
          <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
            <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
              <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
      <div class="ant-tabs-content-holder">
        <div class="ant-tabs-content.ant-tabs-content-top">
          <div aria-hidden="true" aria-labelledby="rc-tabs-test-tab-res" class="ant-tabs-tabpane.ant-tabs-tabpane-hidden" id="rc-tabs-test-panel-res" role="tabpanel" tabindex="-1">
            <div class="ant-spin-nested-loading.CSSHASH">
              <div class="ant-spin-container">
                <h2 class="res-code.fail" style="display:none">
                  "null null"
                <div>
                  <a href="https://juejin.im/post/5c888a3e5188257dee0322af" rel="noopener noreferrer" target="_blank">
                    "YApi 新版如何查看 http 请求数据"
                <div class="container-header-body">
                  <div class="header">
                    <div class="container-title">
                      <h4>
                        "Headers"
                    <div class="pretty-editor-header" data-data="" data-mode="json" data-readonly="true">
                      "STUB_ACE"
                  <div class="resizer">
                    <div class="container-title">
                      <h4 style="visibility:hidden">
                        "1"
                  <div class="body">
                    <div class="container-title">
                      <h4>
                        "Body"
                      <label class="ant-checkbox-wrapper.ant-checkbox-wrapper-checked.CSSHASH">
                        <span class="ant-checkbox.ant-wave-target.CSSHASH.ant-checkbox-checked">
                          <input checked="true" class="ant-checkbox-input" type="checkbox">
                          <span class="ant-checkbox-inner">
                        <span class="ant-checkbox-label">
                          <span>
                            "自动预览HTML"
                    <div class="pretty-editor-body" data-data="" data-mode="text" data-readonly="true">
                      "STUB_ACE"
          <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-test" class="ant-tabs-tabpane.ant-tabs-tabpane-active.response-test" id="rc-tabs-test-panel-test" role="tabpanel" tabindex="0">
            <h3>
              "是否开启:"
              <button aria-checked="false" class="ant-switch.CSSHASH" role="switch" type="button">
                <div class="ant-switch-handle">
                <span class="ant-switch-inner">
                  <span class="ant-switch-inner-checked">
                  <span class="ant-switch-inner-unchecked">
            <p>
              "注：Test 脚本只有做自动化测试才执行"
            <div class="ant-row.CSSHASH">
              <div class="ant-col.ant-col-18.CSSHASH">
                <div class="case-script" data-data="assert.equal(status, 200)" data-mode="undefined" data-readonly="false">
                  "STUB_ACE"
              <div class="ant-col.ant-col-6.CSSHASH">
                <div class="insert-code">
                  <div class="code-item">
                    "断言 httpCode 等于 200"
                  <div class="code-item">
                    "断言返回数据 code 是 0"
                  <div class="code-item">
                    "断言 httpCode 不是 404"
                  <div class="code-item">
                    "断言返回数据 code 不是 40000"
                  <div class="code-item">
                    "断言对象 body 等于 {"code": 0}"
                  <div class="code-item">
                    "断言对象 body 不等于 {"code": 0}"`;

// ① inter 型初始：整容器 DOM 树逐行等价（含插件告警）
test.serial('容器级 DOM 快照：inter 型初始（含插件提示）整容器逐行等价', async t => {
  const utils = await renderPostman(INTER_DATA, 'inter', { plugin: false, waitMs: 100 });

  // 无插件时 hasPlugin 由 500ms 插件探测定时器翻转为 false（探测定时器 5s 后自停），
  // 等终态标记（告警告警节点出现）后再取快照，避免固定 sleep 在并发跑测下不足
  t.true(
    await waitFor(() => utils.container.querySelector('.has-plugin .ant-alert-warning'), 3000),
    '前置条件：插件探测定时器应把 hasPlugin 置为 false 并渲染安装提示告警'
  );

  t.is(
    snapshot(utils.container),
    EXPECTED_INTER_INITIAL_SNAPSHOT,
    '整容器 DOM 树应与基线逐行一致（子组件装配漂移——例如多包一层 div——会在此检出）'
  );
  t.true(buttonByText(utils.container, '发送').disabled, '无插件时发送按钮应禁用');
});

// ② case 型：整容器 DOM 树逐行等价（无告警、保存按钮文案随 type 变化）
test.serial('容器级 DOM 快照：case 型整容器逐行等价', async t => {
  const utils = await renderPostman(CASE_DATA, 'case');

  t.is(snapshot(utils.container), EXPECTED_CASE_INITIAL_SNAPSHOT, 'case 型整容器 DOM 树应与基线逐行一致');
  t.falsy(utils.container.querySelector('.ant-alert-warning'), '插件在位时不应渲染安装提示告警');
  t.truthy(buttonByText(utils.container, '更新'), 'case 型保存按钮文案应为「更新」');
});

// ③ params 展开态：受控编辑（改值 + 勾选）后的整容器 DOM 树逐行等价
test.serial('容器级 DOM 快照：params 展开态（受控编辑后）整容器逐行等价', async t => {
  const utils = await renderPostman(INTER_DATA, 'inter');

  await act(async () => {
    fireEvent.change(utils.container.querySelector('#req_query_0'), { target: { value: 'zz' } });
    await sleep(20);
  });
  await act(async () => {
    const boxes = utils.container.querySelectorAll('.params-enable input[type="checkbox"]');
    fireEvent.click(boxes[1]);
    await sleep(20);
  });

  t.is(
    snapshot(utils.container),
    EXPECTED_PARAMS_EDITED_SNAPSHOT,
    '受控编辑后的整容器 DOM 树应与基线逐行一致'
  );
  t.true(
    EXPECTED_PARAMS_EDITED_SNAPSHOT.indexOf('id="req_query_0" placeholder="参数值" type="text" value="zz"') !== -1,
    '前置条件：基线应记录第 1 行 query 的编辑后值'
  );
});

// ④ 响应回填态：发送 → 响应回填后的整容器 DOM 树逐行等价
test.serial('容器级 DOM 快照：响应回填态整容器逐行等价', async t => {
  const utils = await renderPostman(INTER_DATA, 'inter');

  await clickSend(utils.container);

  t.is(crossRequestCalls.length, 1, '前置条件：应恰好发送一次请求');
  // 终态标记：res-code 为 success 仅在「状态码已回填且 loading 已复位」时成立
  // （loading 未复位时会落在 fail 分支），以此代替固定 sleep 取快照
  t.true(
    await waitFor(() => utils.container.querySelector('h2.res-code.success'), 4000),
    '前置条件：响应回填并复位 loading 后状态行应为 success'
  );
  t.is(snapshot(utils.container), EXPECTED_RESPONSE_SNAPSHOT, '响应回填后的整容器 DOM 树应与基线逐行一致');
  t.is(
    utils.container.querySelector('h2.res-code').textContent.trim(),
    '200  OK',
    '前置条件：状态行应回填 200'
  );
});

// ⑤ Test 页签切换：切到 Test 页签后的整容器 DOM 树逐行等价
test.serial('容器级 DOM 快照：Test 页签切换后整容器逐行等价', async t => {
  const utils = await renderPostman(CASE_DATA, 'case');

  const testTab = Array.from(utils.container.querySelectorAll('.ant-tabs-tab')).find(
    tab => tab.textContent.indexOf('Test') !== -1
  );
  t.truthy(testTab, '前置条件：case 型应展示 Test 页签');
  await act(async () => {
    fireEvent.click(testTab);
    await sleep(40);
  });

  t.is(snapshot(utils.container), EXPECTED_TEST_TAB_SNAPSHOT, 'Test 页签激活后的整容器 DOM 树应与基线逐行一致');
  t.truthy(utils.container.querySelector('.ant-switch'), '前置条件：Test 面板应渲染脚本开关');
});

// ⑥ 快照门禁灵敏度①：结构突变（任一子组件外包一层 div）必被检出
test.serial('快照门禁灵敏度：子组件外包一层 div 即被检出', async t => {
  const utils = await renderPostman(CASE_DATA, 'case');
  const baseline = snapshot(utils.container);

  const clone = utils.container.cloneNode(true);
  const url = clone.querySelector('.url');
  t.truthy(url, '前置条件：容器内应存在 .url（UrlBar 根节点）');
  const wrapper = clone.ownerDocument.createElement('div');
  url.parentNode.insertBefore(wrapper, url);
  wrapper.appendChild(url);

  t.not(snapshot(clone), baseline, '给 UrlBar 外包一层 div 必须改变快照（否则该门禁形同虚设）');
  t.true(
    snapshot(clone).indexOf('\n    <div>\n      <div class="url">') !== -1,
    '突变后应可观察到多出的一层 div'
  );
});

// ⑦ 快照门禁灵敏度②：受控输入值 / 勾选状态变化必被检出
//   （批 1 序列化器只采集 attributes，React 写在元素属性上的受控值不可见——本批修正）
test.serial('快照门禁灵敏度：受控输入值与勾选变化即被检出（value/checked 采集生效）', async t => {
  const utils = await renderPostman(INTER_DATA, 'inter');
  const baseline = snapshot(utils.container);

  await act(async () => {
    fireEvent.change(utils.container.querySelector('#req_query_0'), { target: { value: 'changed-value' } });
    await sleep(20);
  });
  const afterValue = snapshot(utils.container);
  t.not(afterValue, baseline, '受控输入改值必须改变快照（value 采集生效）');
  t.true(afterValue.indexOf('value="changed-value"') !== -1, '快照应记录改值后的实时 value');

  await act(async () => {
    const boxes = utils.container.querySelectorAll('.params-enable input[type="checkbox"]');
    fireEvent.click(boxes[1]);
    await sleep(20);
  });
  const afterCheck = snapshot(utils.container);
  t.not(afterCheck, afterValue, '勾选启用开关必须改变快照（checked 采集生效）');
  t.true(
    afterCheck.indexOf('<input checked="true" class="ant-checkbox-input" type="checkbox">') !== -1,
    '快照应记录勾选后的实时 checked'
  );
});

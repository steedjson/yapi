// InterfaceEditForm 容器级 DOM 快照门禁（antd5 覆盖面视觉巡检 · 批次 2 交付物，
// findings 登记表 §6 pending 项的恢复执行）。
//
// 背景：e50cae0b 将 InterfaceEditForm 子组件化时以「抽取前后 DOM 逐字节等价」交付，
// 但当时 InterfaceEditForm.js 处于用户进行中改动（WIP），容器快照无法入库（见批次 1
// findings §6 pending 登记）。21964bbc 已将 WIP 合入，本文件按共享严版序列化器
// （test/helpers/domSnapshot.js）接入口径补齐容器级门禁，与
// InterfaceColContentContainer / PostmanContainer 两容器快照互补。
//
// 基线口径说明（重要）：批次 1 登记基线时 InterfaceEditForm.js 含用户未提交改动，
// 本文件基线以 **当前提交态（21964bbc 合入后）** 为准重新采集——与批次 1 登记表中
// 「基线以用户 WIP 前的提交态」描述存在口径切换，属预期（WIP 已成为新的提交基线）。
//
// 挂载方式：经 Edit.js（接口编辑 Tab 容器）间接挂载 InterfaceEditForm，复刻真实
// 页面数据链（store 种子 curdata + 冲突检测 WebSocket 失败语义）。重型编辑器
// （AceEditor / mockEditor / MarkdownEditor）按既有容器测试同源口径打桩；
// 批次 3 消费方切换后 schema 编辑器为真实自研 JsonSchemaEditor（antd5 纯栈可进
// jsdom，不再打桩，旧 .stub-json-schema-editor 替身基线已随本批重采）；
// 序列化器已剥离 antd CSS-in-JS 哈希（CSSHASH）与 SVG path。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects, stubDefaultExport, REPO_ROOT } from '../../helpers/containers';
import { snapshot } from '../../helpers/domSnapshot';

const path = require('path');
const Module = require('module');

// 补 client/、exts/ 前缀别名（webpack alias 等价物），必须在 require 生产代码之前
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

// ---- 批次 3 消费方切换：json-schema-editor-visual 不再被 schemaEditors.js require，
// 旧工厂桩成为死代码，删除之——容器渲染真实自研 JsonSchemaEditor，快照基线本批重采。
// （基线口径同文件头说明：以当前提交态为准重新采集。）

// ---- 重型编辑器打桩（与 InterfaceEditFormParts.test.js / PostmanContainer 同源）----
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props, ref) {
    React.useImperativeHandle(ref, () => ({ editor: { insertCode: () => {}, editor: { getCursorIndex: () => 0 } } }), []);
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
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/SchemaTable/SchemaTable.js'),
  function StubSchemaTable() {
    return React.createElement('div', { className: 'stub-schema-table' }, 'STUB_SCHEMA_TABLE');
  }
);

const axios = require('axios');

// group 切片已迁至 Zustand（批次3）：InterfaceEditForm 经 useGroupStore 读取 field
const useGroupStore = require('../../../client/store/groupStore').default;
// user/project 切片已迁 Zustand（批次4）：currProject 改经 projectStore 播种
const {
  seedUserStore,
  seedProjectStore,
  resetUserProjectStores
} = require('../../helpers/userProjectStores');
const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  useGroupStore.setState(INITIAL_GROUP_STATE);
  resetUserProjectStores();
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  delete window.WebSocket;
});

// ---- fixtures（与层 B interface-edit 配方同源）----
const CURRDATA = {
  _id: 100,
  title: '接口一',
  path: '/api/a/{id}',
  method: 'POST',
  project_id: 12,
  uid: 9,
  username: '创建者',
  status: 'done',
  up_time: 1600000000,
  desc: '<p>接口描述</p>',
  markdown: '接口备注',
  req_headers: [{ name: 'Content-Type', value: 'application/json', required: '1', example: '', desc: '' }],
  req_params: [{ name: 'id', desc: '路径参数', example: '1' }],
  req_query: [{ name: 'q', desc: '查询', example: 'x', required: '0' }],
  req_body_type: 'json',
  req_body_form: [],
  req_body_other: '{"name":"zhang"}',
  req_body_is_json_schema: false,
  res_body_type: 'json',
  res_body: '{"a":1}',
  res_body_is_json_schema: false,
  tag: ['核心']
};

async function renderEditForm() {
  // Edit.js 挂载即连 /api/interface/solve_conflict；用「异步触发 onerror」的桩走
  // 容器既有语义：连接失败 → 用 store curdata 进入编辑态（status 1）
  window.WebSocket = function StubConflictSocket() {
    const socket = this;
    socket.close = function() {};
    socket.readyState = 0;
    setTimeout(() => {
      if (socket.onerror) socket.onerror({});
    }, 0);
  };
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: [] } });
  axios.post = () => Promise.resolve({ data: { errcode: 0, data: [] } });
  const { default: Edit } = require('../../../client/containers/Project/Interface/InterfaceList/Edit.js');
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    field: { enable: true, name: '业务线' },
    currGroup: { _id: 1, group_name: '分组一' }
  });
  seedUserStore({ uid: 9 });
  seedProjectStore({
    currProject: {
      _id: 12,
      name: '演示项目',
      basepath: '/base',
      switch_notice: true,
      is_json5: false,
      strice: false,
      tag: [{ name: '核心' }, { name: '网关' }],
      env: [],
      cat: [{ _id: 5, name: '分类五', desc: '' }]
    }
  });
  const utils = renderWithProviders(React.createElement(Edit), {
    seedState: {
      inter: { curdata: CURRDATA, list: [], editStatus: false }
    },
    routePath: '/project/:id/interface/api/:actionId',
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects(400);
  return utils;
}

// ---- 基线快照（21964bbc 提交态采集，见文件头基线口径说明）----
const EXPECTED_EDITFORM_SNAPSHOT = `<div>
  <div class="interface-edit">
    <div>
      <form class="ant-form.ant-form-horizontal.CSSHASH">
        <h2 class="interface-title">
          "基本设置"
        <div class="panel-sub">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="ant-form-item-required" for="title" title="接口名称">
                  "接口名称"
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <input aria-required="true" class="ant-input.CSSHASH.ant-input-outlined" id="title" placeholder="接口名称" type="text" value="接口一">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="ant-form-item-required" for="catid" title="选择分类">
                  "选择分类"
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <div aria-required="true" class="ant-select.ant-tree-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-single.ant-select-show-arrow">
                      <div class="ant-select-selector">
                        <span class="ant-select-selection-wrap">
                          <span class="ant-select-selection-search">
                            <input aria-autocomplete="list" aria-controls="catid_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="catid_list" aria-required="true" autocomplete="off" class="ant-select-selection-search-input" id="catid" readonly="" role="combobox" type="search" unselectable="on" value="">
                          <span class="ant-select-selection-item" title="undefined">
                            "undefined"
                      <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                        <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                          <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                            <path d="SVG_PATH">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" title="">
                  <span>
                    "接口路径"
                    <span aria-describedby="test-id" aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                      <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
                        <path d="SVG_PATH">
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <span class="ant-input-group.ant-input-group-compact.CSSHASH">
                      <div class="ant-select.ant-select-outlined.CSSHASH.ant-select-single.ant-select-show-arrow">
                        <div class="ant-select-selector">
                          <span class="ant-select-selection-wrap">
                            <span class="ant-select-selection-search">
                              <input aria-autocomplete="list" aria-controls="rc_select_TEST_OR_SSR_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="rc_select_TEST_OR_SSR_list" autocomplete="off" class="ant-select-selection-search-input" id="rc_select_TEST_OR_SSR" readonly="" role="combobox" type="search" unselectable="on" value="">
                            <span class="ant-select-selection-item" title="POST">
                              "POST"
                        <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                          <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                            <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                              <path d="SVG_PATH">
                      <input aria-describedby="test-id" class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" readonly="" type="text" value="/base">
                      <input aria-required="true" class="ant-input.CSSHASH.ant-input-outlined" id="path" placeholder="/path" type="text" value="/api/a/{id}">
                    <div class="ant-row.interface-edit-item.CSSHASH">
                      <div class="ant-col.ant-col-24.CSSHASH">
                        <div class="ant-row.interface-edit-item-content.CSSHASH">
                          <div class="ant-col.ant-col-6.interface-edit-item-content-col.CSSHASH">
                            <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                              <div class="ant-row.ant-form-item-row.CSSHASH">
                                <div class="ant-col.ant-form-item-control.CSSHASH">
                                  <div class="ant-form-item-control-input">
                                    <div class="ant-form-item-control-input-content">
                                      <input class="ant-input.ant-input-disabled.CSSHASH.ant-input-outlined" disabled="" id="req_params_0_name" placeholder="参数名称" type="text" value="id">
                          <div class="ant-col.ant-col-7.interface-edit-item-content-col.CSSHASH">
                            <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                              <div class="ant-row.ant-form-item-row.CSSHASH">
                                <div class="ant-col.ant-form-item-control.CSSHASH">
                                  <div class="ant-form-item-control-input">
                                    <div class="ant-form-item-control-input-content">
                                      <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0_example" placeholder="参数示例" rows="1" value="1">
                                        "1"
                          <div class="ant-col.ant-col-11.interface-edit-item-content-col.CSSHASH">
                            <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                              <div class="ant-row.ant-form-item-row.CSSHASH">
                                <div class="ant-col.ant-form-item-control.CSSHASH">
                                  <div class="ant-form-item-control-input">
                                    <div class="ant-form-item-control-input-content">
                                      <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_params_0_desc" placeholder="备注" rows="1" value="路径参数">
                                        "路径参数"
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" for="tag" title="Tag">
                  "Tag"
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <div class="ant-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-multiple.ant-select-show-arrow.ant-select-show-search">
                      <div class="ant-select-selector">
                        <span class="ant-select-selection-wrap">
                          <div class="ant-select-selection-overflow">
                            <div class="ant-select-selection-overflow-item">
                              <span class="ant-select-selection-item" title="核心">
                                <span class="ant-select-selection-item-content">
                                  "核心"
                                <span aria-hidden="true" class="ant-select-selection-item-remove" unselectable="on">
                                  <span aria-label="close" class="anticon.anticon-close" role="img">
                                    <svg aria-hidden="true" data-icon="close" fill="currentColor" fill-rule="evenodd" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                                      <path d="SVG_PATH">
                            <div class="ant-select-selection-overflow-item.ant-select-selection-overflow-item-suffix">
                              <div class="ant-select-selection-search">
                                <input aria-autocomplete="list" aria-controls="tag_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="tag_list" autocomplete="off" class="ant-select-selection-search-input" id="tag" readonly="" role="combobox" type="search" unselectable="on" value="">
                                <span aria-hidden="true" class="ant-select-selection-search-mirror">
                      <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                        <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                          <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                            <path d="SVG_PATH">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" for="status" title="状态">
                  "状态"
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <div class="ant-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-single.ant-select-show-arrow">
                      <div class="ant-select-selector">
                        <span class="ant-select-selection-wrap">
                          <span class="ant-select-selection-search">
                            <input aria-autocomplete="list" aria-controls="status_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="status_list" autocomplete="off" class="ant-select-selection-search-input" id="status" readonly="" role="combobox" type="search" unselectable="on" value="">
                          <span class="ant-select-selection-item" title="已完成">
                            "已完成"
                      <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                        <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                          <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                            <path d="SVG_PATH">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" for="custom_field_value" title="业务线">
                  "业务线"
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <input class="ant-input.CSSHASH.ant-input-outlined" id="custom_field_value" placeholder="请输入" type="text" value="">
        <h2 class="interface-title">
          "请求参数设置"
        <div class="container-radiogroup">
          <div class="ant-radio-group.ant-radio-group-outline.ant-radio-group-large.radioGroup.CSSHASH">
            <label class="ant-radio-button-wrapper.ant-radio-button-wrapper-checked.CSSHASH">
              <span class="ant-radio-button.ant-radio-button-checked">
                <input checked="true" class="ant-radio-button-input" name="test-id" type="radio">
                <span class="ant-radio-button-inner">
              <span class="ant-radio-button-label">
                "Body"
            <label class="ant-radio-button-wrapper.CSSHASH">
              <span class="ant-radio-button">
                <input checked="false" class="ant-radio-button-input" name="test-id" type="radio">
                <span class="ant-radio-button-inner">
              <span class="ant-radio-button-label">
                "Query"
            <label class="ant-radio-button-wrapper.CSSHASH">
              <span class="ant-radio-button">
                <input checked="false" class="ant-radio-button-input" name="test-id" type="radio">
                <span class="ant-radio-button-inner">
              <span class="ant-radio-button-label">
                "Headers"
        <div class="panel-sub">
          <div class="ant-form-item.interface-edit-item.hide.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <div class="ant-row.ant-row-space-around.CSSHASH" type="flex">
                      <div class="ant-col.ant-col-12.CSSHASH">
                        <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid.ant-btn-sm" type="button">
                          <span>
                            "添加Query参数"
                      <div class="ant-col.ant-col-12.CSSHASH">
                        <div class="bulk-import">
                          "批量添加"
          <div class="ant-row.interface-edit-item.hide.CSSHASH">
            <div class="ant-col.CSSHASH">
              <div>
                <div class="ant-row.interface-edit-item-content.CSSHASH" data-ref="x0" draggable="false">
                  <div class="ant-col.ant-col-1.interface-edit-item-content-col.interface-edit-item-content-col-drag.CSSHASH" easy_drag_sort_child="true">
                    <span aria-label="bars" class="anticon.anticon-bars" role="img">
                      <svg aria-hidden="true" data-icon="bars" fill="currentColor" focusable="false" height="1em" viewBox="0 0 1024 1024" width="1em">
                        <path d="SVG_PATH">
                  <div class="ant-col.ant-col-4.interface-edit-item-content-col.CSSHASH" draggable="false">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <input class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0_name" placeholder="参数名称" type="text" value="q">
                  <div class="ant-col.ant-col-3.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <div class="ant-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-single.ant-select-show-arrow">
                                <div class="ant-select-selector">
                                  <span class="ant-select-selection-wrap">
                                    <span class="ant-select-selection-search">
                                      <input aria-autocomplete="list" aria-controls="req_query_0_required_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="req_query_0_required_list" autocomplete="off" class="ant-select-selection-search-input" id="req_query_0_required" readonly="" role="combobox" type="search" unselectable="on" value="">
                                    <span class="ant-select-selection-item" title="非必需">
                                      "非必需"
                                <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                                  <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                                    <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                                      <path d="SVG_PATH">
                  <div class="ant-col.ant-col-6.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0_example" placeholder="参数示例" rows="1" value="x">
                                "x"
                  <div class="ant-col.ant-col-9.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_query_0_desc" placeholder="备注" rows="1" value="查询">
                                "查询"
                  <div class="ant-col.ant-col-1.interface-edit-item-content-col.CSSHASH">
                    <span aria-label="delete" class="anticon.anticon-delete.interface-edit-del-icon" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="delete" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
          <div class="ant-form-item.interface-edit-item.hide.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid.ant-btn-sm" type="button">
                      <span>
                        "添加Header"
          <div class="ant-row.interface-edit-item.hide.CSSHASH">
            <div class="ant-col.CSSHASH">
              <div>
                <div class="ant-row.interface-edit-item-content.CSSHASH" data-ref="x0" draggable="false">
                  <div class="ant-col.ant-col-1.interface-edit-item-content-col.interface-edit-item-content-col-drag.CSSHASH" easy_drag_sort_child="true">
                    <span aria-label="bars" class="anticon.anticon-bars" role="img">
                      <svg aria-hidden="true" data-icon="bars" fill="currentColor" focusable="false" height="1em" viewBox="0 0 1024 1024" width="1em">
                        <path d="SVG_PATH">
                  <div class="ant-col.ant-col-4.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <div class="ant-select.ant-select-outlined.ant-select-in-form-item.ant-select-auto-complete.CSSHASH.ant-select-single.ant-select-show-search">
                                <div class="ant-select-selector">
                                  <span class="ant-select-selection-wrap">
                                    <span class="ant-select-selection-search">
                                      <input aria-autocomplete="list" aria-controls="req_headers_0_name_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="req_headers_0_name_list" autocomplete="off" class="ant-select-selection-search-input" id="req_headers_0_name" role="combobox" type="search" value="Content-Type">
                  <div class="ant-col.ant-col-5.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <input class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0_value" placeholder="参数值" type="text" value="application/json">
                  <div class="ant-col.ant-col-5.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0_example" placeholder="参数示例" rows="1" value="">
                  <div class="ant-col.ant-col-8.interface-edit-item-content-col.CSSHASH">
                    <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                      <div class="ant-row.ant-form-item-row.CSSHASH">
                        <div class="ant-col.ant-form-item-control.CSSHASH">
                          <div class="ant-form-item-control-input">
                            <div class="ant-form-item-control-input-content">
                              <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_headers_0_desc" placeholder="备注" rows="1" value="">
                  <div class="ant-col.ant-col-1.interface-edit-item-content-col.CSSHASH">
                    <span aria-label="delete" class="anticon.anticon-delete.interface-edit-del-icon" role="img" tabindex="-1">
                      <svg aria-hidden="true" data-icon="delete" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
          <div>
            <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
              <div class="ant-row.ant-form-item-row.CSSHASH">
                <div class="ant-col.ant-form-item-control.CSSHASH">
                  <div class="ant-form-item-control-input">
                    <div class="ant-form-item-control-input-content">
                      <div class="ant-radio-group.ant-radio-group-outline.CSSHASH" id="req_body_type">
                        <label class="ant-radio-wrapper.ant-radio-wrapper-in-form-item.CSSHASH">
                          <span class="ant-radio.ant-wave-target">
                            <input checked="false" class="ant-radio-input" name="req_body_type" type="radio">
                            <span class="ant-radio-inner">
                          <span class="ant-radio-label">
                            "form"
                        <label class="ant-radio-wrapper.ant-radio-wrapper-checked.ant-radio-wrapper-in-form-item.CSSHASH">
                          <span class="ant-radio.ant-wave-target.ant-radio-checked">
                            <input checked="true" class="ant-radio-input" name="req_body_type" type="radio">
                            <span class="ant-radio-inner">
                          <span class="ant-radio-label">
                            "json"
                        <label class="ant-radio-wrapper.ant-radio-wrapper-in-form-item.CSSHASH">
                          <span class="ant-radio.ant-wave-target">
                            <input checked="false" class="ant-radio-input" name="req_body_type" type="radio">
                            <span class="ant-radio-inner">
                          <span class="ant-radio-label">
                            "file"
                        <label class="ant-radio-wrapper.ant-radio-wrapper-in-form-item.CSSHASH">
                          <span class="ant-radio.ant-wave-target">
                            <input checked="false" class="ant-radio-input" name="req_body_type" type="radio">
                            <span class="ant-radio-inner">
                          <span class="ant-radio-label">
                            "raw"
            <div class="ant-row.interface-edit-item.hide.CSSHASH">
              <div class="ant-col.CSSHASH">
                <div class="ant-row.ant-row-space-around.CSSHASH" type="flex">
                  <div class="ant-col.ant-col-12.interface-edit-item.CSSHASH">
                    <button class="ant-btn.CSSHASH.ant-btn-primary.ant-btn-color-primary.ant-btn-variant-solid.ant-btn-sm" type="button">
                      <span>
                        "添加form参数"
                  <div class="ant-col.ant-col-12.CSSHASH">
                    <div class="bulk-import">
                      "批量添加"
                <div>
                  <div class="ant-row.interface-edit-item-content.CSSHASH" data-ref="x0" draggable="false">
                    <div class="ant-col.ant-col-1.interface-edit-item-content-col.interface-edit-item-content-col-drag.CSSHASH" easy_drag_sort_child="true">
                      <span aria-label="bars" class="anticon.anticon-bars" role="img">
                        <svg aria-hidden="true" data-icon="bars" fill="currentColor" focusable="false" height="1em" viewBox="0 0 1024 1024" width="1em">
                          <path d="SVG_PATH">
                    <div class="ant-col.ant-col-4.interface-edit-item-content-col.CSSHASH">
                      <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                        <div class="ant-row.ant-form-item-row.CSSHASH">
                          <div class="ant-col.ant-form-item-control.CSSHASH">
                            <div class="ant-form-item-control-input">
                              <div class="ant-form-item-control-input-content">
                                <input class="ant-input.CSSHASH.ant-input-outlined" id="req_body_form_0_name" placeholder="name" type="text" value="">
                    <div class="ant-col.ant-col-3.interface-edit-item-content-col.CSSHASH">
                      <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                        <div class="ant-row.ant-form-item-row.CSSHASH">
                          <div class="ant-col.ant-form-item-control.CSSHASH">
                            <div class="ant-form-item-control-input">
                              <div class="ant-form-item-control-input-content">
                                <div class="ant-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-single.ant-select-show-arrow">
                                  <div class="ant-select-selector">
                                    <span class="ant-select-selection-wrap">
                                      <span class="ant-select-selection-search">
                                        <input aria-autocomplete="list" aria-controls="req_body_form_0_type_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="req_body_form_0_type_list" autocomplete="off" class="ant-select-selection-search-input" id="req_body_form_0_type" readonly="" role="combobox" type="search" unselectable="on" value="">
                                      <span class="ant-select-selection-item" title="text">
                                        "text"
                                  <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                                    <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                                      <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                                        <path d="SVG_PATH">
                    <div class="ant-col.ant-col-3.interface-edit-item-content-col.CSSHASH">
                      <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                        <div class="ant-row.ant-form-item-row.CSSHASH">
                          <div class="ant-col.ant-form-item-control.CSSHASH">
                            <div class="ant-form-item-control-input">
                              <div class="ant-form-item-control-input-content">
                                <div class="ant-select.ant-select-outlined.ant-select-in-form-item.CSSHASH.ant-select-single.ant-select-show-arrow">
                                  <div class="ant-select-selector">
                                    <span class="ant-select-selection-wrap">
                                      <span class="ant-select-selection-search">
                                        <input aria-autocomplete="list" aria-controls="req_body_form_0_required_list" aria-expanded="false" aria-haspopup="listbox" aria-owns="req_body_form_0_required_list" autocomplete="off" class="ant-select-selection-search-input" id="req_body_form_0_required" readonly="" role="combobox" type="search" unselectable="on" value="">
                                      <span class="ant-select-selection-item" title="必需">
                                        "必需"
                                  <span aria-hidden="true" class="ant-select-arrow" unselectable="on">
                                    <span aria-label="down" class="anticon.anticon-down.ant-select-suffix" role="img">
                                      <svg aria-hidden="true" data-icon="down" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                                        <path d="SVG_PATH">
                    <div class="ant-col.ant-col-5.interface-edit-item-content-col.CSSHASH">
                      <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                        <div class="ant-row.ant-form-item-row.CSSHASH">
                          <div class="ant-col.ant-form-item-control.CSSHASH">
                            <div class="ant-form-item-control-input">
                              <div class="ant-form-item-control-input-content">
                                <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_body_form_0_example" placeholder="参数示例" rows="1" value="">
                    <div class="ant-col.ant-col-7.interface-edit-item-content-col.CSSHASH">
                      <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                        <div class="ant-row.ant-form-item-row.CSSHASH">
                          <div class="ant-col.ant-form-item-control.CSSHASH">
                            <div class="ant-form-item-control-input">
                              <div class="ant-form-item-control-input-content">
                                <textarea class="ant-input.CSSHASH.ant-input-outlined" id="req_body_form_0_desc" placeholder="备注" rows="1" value="">
                    <div class="ant-col.ant-col-1.interface-edit-item-content-col.CSSHASH">
                      <span aria-label="delete" class="anticon.anticon-delete.interface-edit-del-icon" role="img" tabindex="-1">
                        <svg aria-hidden="true" data-icon="delete" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                          <path d="SVG_PATH">
          <div class="ant-row.interface-edit-item.CSSHASH">
            <span>
              "JSON-SCHEMA:"
              <span aria-describedby="test-id">
                <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                  <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                    <path d="SVG_PATH">
                    <path d="SVG_PATH">
            <button aria-checked="true" class="ant-switch.CSSHASH.ant-switch-checked.ant-switch-disabled" disabled="" id="req_body_is_json_schema" role="switch" type="button">
              <div class="ant-switch-handle">
              <span class="ant-switch-inner">
                <span class="ant-switch-inner-checked">
                  "开"
                <span class="ant-switch-inner-unchecked">
                  "关"
            <div class="ant-col.interface-edit-json-info.json-schema-editor-scope.CSSHASH">
              <div class="json-schema-editor">
                <div class="jse-toolbar">
                  <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined.ant-btn-sm.jse-add-root" type="button">
                    <span class="ant-btn-icon">
                      <span aria-label="plus" class="anticon.anticon-plus" role="img">
                        <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                          <path d="SVG_PATH">
                          <path d="SVG_PATH">
                    <span>
                      "添加属性"
                <div class="jse-tree">
            <div class="ant-col.CSSHASH">
        <h2 class="interface-title">
          "返回数据设置"
          <span aria-describedby="test-id">
            <span aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
              <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                <path d="SVG_PATH">
                <path d="SVG_PATH">
          <button aria-checked="true" class="ant-switch.CSSHASH.ant-switch-checked.ant-switch-disabled" disabled="" id="res_body_is_json_schema" role="switch" type="button">
            <div class="ant-switch-handle">
            <span class="ant-switch-inner">
              <span class="ant-switch-inner-checked">
                "json-schema"
              <span class="ant-switch-inner-unchecked">
                "json"
        <div class="container-radiogroup">
          <div class="ant-radio-group.ant-radio-group-outline.ant-radio-group-large.radioGroup.CSSHASH" id="res_body_type">
            <label class="ant-radio-button-wrapper.ant-radio-button-wrapper-checked.CSSHASH">
              <span class="ant-radio-button.ant-radio-button-checked">
                <input checked="true" class="ant-radio-button-input" name="res_body_type" type="radio">
                <span class="ant-radio-button-inner">
              <span class="ant-radio-button-label">
                "JSON"
            <label class="ant-radio-button-wrapper.CSSHASH">
              <span class="ant-radio-button">
                <input checked="false" class="ant-radio-button-input" name="res_body_type" type="radio">
                <span class="ant-radio-button-inner">
              <span class="ant-radio-button-label">
                "RAW"
        <div class="panel-sub">
          <div class="ant-row.interface-edit-item.CSSHASH" style="display:block">
            <div class="ant-col.CSSHASH">
              <div class="ant-tabs.ant-tabs-top.ant-tabs-large.CSSHASH">
                <div aria-orientation="horizontal" class="ant-tabs-nav" role="tablist">
                  <div class="ant-tabs-nav-wrap">
                    <div class="ant-tabs-nav-list">
                      <div class="ant-tabs-tab.ant-tabs-tab-active" data-node-key="tpl">
                        <div aria-controls="rc-tabs-test-panel-tpl" aria-selected="true" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-tpl" role="tab" tabindex="0">
                          "模板"
                      <div class="ant-tabs-tab" data-node-key="preview">
                        <div aria-controls="rc-tabs-test-panel-preview" aria-selected="false" class="ant-tabs-tab-btn" id="rc-tabs-test-tab-preview" role="tab" tabindex="-1">
                          "预览"
                      <div class="ant-tabs-ink-bar.ant-tabs-ink-bar-animated">
                  <div class="ant-tabs-nav-operations.ant-tabs-nav-operations-hidden">
                    <button aria-controls="rc-tabs-test-more-popup" aria-expanded="false" aria-haspopup="listbox" class="ant-tabs-nav-more" id="rc-tabs-test-more" style="visibility:hidden" type="button">
                      <span aria-label="ellipsis" class="anticon.anticon-ellipsis" role="img">
                        <svg aria-hidden="true" data-icon="ellipsis" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                          <path d="SVG_PATH">
                <div class="ant-tabs-content-holder">
                  <div class="ant-tabs-content.ant-tabs-content-top">
                    <div aria-hidden="false" aria-labelledby="rc-tabs-test-tab-tpl" class="ant-tabs-tabpane.ant-tabs-tabpane-active" id="rc-tabs-test-panel-tpl" role="tabpanel" tabindex="0">
              <div>
                <div class="json-schema-editor-scope" style="display:block">
                  <div class="json-schema-editor">
                    <div class="jse-toolbar">
                      <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined.ant-btn-sm.jse-add-root" type="button">
                        <span class="ant-btn-icon">
                          <span aria-label="plus" class="anticon.anticon-plus" role="img">
                            <svg aria-hidden="true" data-icon="plus" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                              <path d="SVG_PATH">
                              <path d="SVG_PATH">
                        <span>
                          "添加属性"
                    <div class="jse-tree">
                <div id="mock-preview" style="display:none">
          <div class="ant-row.interface-edit-item.CSSHASH" style="display:none">
            <div class="ant-col.CSSHASH">
              <div class="ant-form-item.CSSHASH.ant-form-item-horizontal">
                <div class="ant-row.ant-form-item-row.CSSHASH">
                  <div class="ant-col.ant-form-item-control.CSSHASH">
                    <div class="ant-form-item-control-input">
                      <div class="ant-form-item-control-input-content">
                        <textarea class="ant-input.CSSHASH.ant-input-outlined" id="res_body" placeholder="" value="{\\"a\\":1}">
                          "{"a":1}"
        <h2 class="interface-title">
          "备 注"
        <div class="panel-sub">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <div>
                      <div class="stub-markdown-editor" data-value="接口备注">
                        "STUB_MARKDOWN"
        <h2 class="interface-title">
          "其 他"
        <div class="panel-sub">
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" for="switch_notice" title="">
                  <span>
                    "消息通知"
                    <span aria-describedby="test-id" aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                      <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
                        <path d="SVG_PATH">
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <button aria-checked="true" class="ant-switch.CSSHASH.ant-switch-checked" id="switch_notice" role="switch" type="button">
                      <div class="ant-switch-handle">
                      <span class="ant-switch-inner">
                        <span class="ant-switch-inner-checked">
                          "开"
                        <span class="ant-switch-inner-unchecked">
                          "关"
          <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
            <div class="ant-row.ant-form-item-row.CSSHASH">
              <div class="ant-col.ant-col-4.ant-form-item-label.CSSHASH">
                <label class="" for="api_opened" title="">
                  <span>
                    "开放接口"
                    <span aria-describedby="test-id" aria-label="question-circle" class="anticon.anticon-question-circle" role="img">
                      <svg aria-hidden="true" data-icon="question-circle" fill="currentColor" focusable="false" height="1em" viewBox="64 64 896 896" width="1em">
                        <path d="SVG_PATH">
                        <path d="SVG_PATH">
              <div class="ant-col.ant-col-18.ant-form-item-control.CSSHASH">
                <div class="ant-form-item-control-input">
                  <div class="ant-form-item-control-input-content">
                    <button aria-checked="false" class="ant-switch.CSSHASH" id="api_opened" role="switch" type="button">
                      <div class="ant-switch-handle">
                      <span class="ant-switch-inner">
                        <span class="ant-switch-inner-checked">
                          "开"
                        <span class="ant-switch-inner-unchecked">
                          "关"
        <div class="ant-form-item.interface-edit-item.CSSHASH.ant-form-item-horizontal">
          <div class="ant-row.ant-form-item-row.CSSHASH">
            <div class="ant-col.ant-form-item-control.CSSHASH">
              <div class="ant-form-item-control-input">
                <div class="ant-form-item-control-input-content">
                  <div>
                    <div class="">
                      <button class="ant-btn.CSSHASH.ant-btn-default.ant-btn-color-default.ant-btn-variant-outlined.ant-btn-lg.interface-edit-submit-button" type="submit">
                        <span>
                          "保 存"`;

test.serial('InterfaceEditForm 容器快照：整容器 DOM 树与基线逐行等价', async t => {
  const utils = await renderEditForm();

  t.truthy(utils.container.querySelector('form'), '应渲染接口编辑表单');
  const html = utils.container.innerHTML;
  t.true(html.indexOf('基本设置') !== -1, '应渲染基本设置区块');
  t.true(html.indexOf('请求参数设置') !== -1, '应渲染请求参数设置区块');
  t.true(html.indexOf('返回数据设置') !== -1, '应渲染返回数据区块');
  t.true(html.indexOf('其 他') !== -1, '应渲染其他区块（其 他）');

  t.is(
    snapshot(utils.container),
    EXPECTED_EDITFORM_SNAPSHOT,
    '整容器 DOM 树应与基线快照逐行一致（结构漂移——例如子组件外层多包一层 div——会在此检出）'
  );
});

test.serial('InterfaceEditForm 容器快照：字段回填与表单值钉住', async t => {
  const utils = await renderEditForm();

  t.is(
    utils.container.querySelector('input[id="title"]').getAttribute('value'),
    '接口一',
    '接口名称应回填 curdata.title'
  );
  t.is(
    utils.container.querySelector('input[id="path"]').getAttribute('value'),
    '/api/a/{id}',
    '接口路径应回填 curdata.path'
  );
  t.is(
    utils.container.querySelector('#switch_notice').getAttribute('aria-checked'),
    'true',
    '消息通知开关应回填 currProject.switch_notice=true'
  );
  const tags = Array.from(utils.container.querySelectorAll('.ant-select-selection-item')).map(el => el.textContent);
  t.true(tags.indexOf('核心') !== -1, 'tag 选择器应回填「核心」标签');
});

test.serial('InterfaceEditForm 容器快照：序列化器灵敏度（结构漂移可检出）', async t => {
  const utils = await renderEditForm();
  const baseline = snapshot(utils.container);
  t.is(baseline, EXPECTED_EDITFORM_SNAPSHOT, '重挂载应复现同一基线（确定性验证）');

  // 模拟「子组件外层多包一层 div」的结构漂移：克隆树并注入一层包装，
  // 序列化结果必须变化（若不变化说明快照门禁失明）
  const clone = utils.container.cloneNode(true);
  const form = clone.querySelector('form');
  const wrapper = clone.ownerDocument.createElement('div');
  form.parentNode.replaceChild(wrapper, form);
  wrapper.appendChild(form);
  t.not(
    snapshot(clone),
    EXPECTED_EDITFORM_SNAPSHOT,
    '结构漂移（多包一层 div）必须被序列化器检出'
  );
});

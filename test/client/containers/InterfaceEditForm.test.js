// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../../helpers/containers';

const path = require('path');

// InterfaceEditForm 经裸路径引入 client/components/AceEditor 等，jsdom-setup 只映射
// common/ 前缀，这里补 client/ 前缀的等价映射，必须在 require 被测组件之前安装
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// God file 拆分第一批抽离的纯逻辑模块（client/.../interfaceEditFormUtils/）
const {
  checkIsJsonSchema,
  validJson,
  dataTpl,
  HTTP_METHOD,
  HTTP_METHOD_KEYS,
  HTTP_REQUEST_HEADER,
  initState,
  formItemLayout,
  DEMOPATH
} = require('../../../client/containers/Project/Interface/InterfaceList/interfaceEditFormUtils/formDefaults.js');
const { queryTpl, paramsTpl } = require('../../../client/containers/Project/Interface/InterfaceList/interfaceEditFormUtils/paramTemplates.js');

// 批次 3 消费方切换后，schemaEditors.js 已不再 require json-schema-editor-visual，
// 两处 schema 编辑器渲染真实自研 JsonSchemaEditor（antd5 纯栈，可直接进 jsdom）：
// 旧版 require.cache 工厂桩（替身 .stub-json-schema-editor）随之删除，提升测试真实性。

// AceEditor / mockEditor / MarkdownEditor 挂载即依赖 Ace 编辑器与测量环境，
// 与既有容器测试一致打桩为回显 props 的静态组件，隔离编辑器内部实现
const stubDefaultExport = require('../../helpers/containers').stubDefaultExport;
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  function StubAceEditor(props) {
    return React.createElement(
      'div',
      { className: 'stub-ace-editor', 'data-data': String(props.data == null ? '' : props.data) },
      'STUB_ACE'
    );
  }
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/mockEditor.js'),
  function StubMockEditor() {
    return { setValue: function() {} };
  }
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/MarkdownEditor/index.js'),
  React.forwardRef(function StubMarkdownEditor(props) {
    return React.createElement(
      'div',
      { className: 'stub-markdown-editor', 'data-value': String(props.value == null ? '' : props.value) },
      'STUB_MARKDOWN'
    );
  })
);

// ---------- checkIsJsonSchema：json-schema 合法性与类型规整 ----------

test('checkIsJsonSchema: 含 properties 且缺 type 时补全 object 类型并序列化返回', t => {
  const out = checkIsJsonSchema('{"properties": {"a": {"type": "string"}}}');
  t.true(typeof out === 'string');
  const parsed = JSON.parse(out);
  t.is(parsed.type, 'object');
  t.truthy(parsed.properties.a);
});

test('checkIsJsonSchema: 合法 object/array schema 原样类型小写化返回', t => {
  const obj = JSON.parse(checkIsJsonSchema('{"type": "OBJECT", "properties": {}}'));
  t.is(obj.type, 'object');
  const arr = JSON.parse(checkIsJsonSchema('{"type": "Array", "items": {"type": "string"}}'));
  t.is(arr.type, 'array');
});

test('checkIsJsonSchema: 非法类型 / 非法 json / 缺 type 返回 false', t => {
  t.false(checkIsJsonSchema('{"type": "function"}'));
  t.false(checkIsJsonSchema('{invalid json'));
  t.false(checkIsJsonSchema('{"description": "no type"}'));
});

// ---------- validJson：json5 合法性 ----------

test('validJson: 合法 json5 返回 true，非法返回 false', t => {
  t.true(validJson('{"a": 1}'));
  // json5 特性：无引号键与注释
  t.true(validJson('{a: 1 /* comment */}'));
  t.false(validJson('{a: '));
});

// ---------- dataTpl / HTTP 常量 / 布局常量 ----------

test('dataTpl: 四类参数行的默认字段模板', t => {
  t.deepEqual(dataTpl.req_query, { name: '', required: '1', desc: '', example: '' });
  t.deepEqual(dataTpl.req_headers, { name: '', required: '1', desc: '', example: '' });
  t.deepEqual(dataTpl.req_params, { name: '', desc: '', example: '' });
  t.is(dataTpl.req_body_form.type, 'text');
  t.is(dataTpl.req_body_form.required, '1');
});

test('HTTP_METHOD 常量表: 大写方法键与 request_body/default_tab 配置', t => {
  t.is(HTTP_METHOD.GET.request_body, false);
  t.is(HTTP_METHOD.GET.default_tab, 'query');
  t.is(HTTP_METHOD.POST.request_body, true);
  t.is(HTTP_METHOD.POST.default_tab, 'body');
  t.true(HTTP_METHOD_KEYS.includes('GET'));
  t.true(HTTP_METHOD_KEYS.includes('POST'));
  t.true(Array.isArray(HTTP_REQUEST_HEADER) && HTTP_REQUEST_HEADER.length > 0);
  t.is(formItemLayout.labelCol.span, 4);
  t.is(formItemLayout.wrapperCol.span, 18);
  t.is(DEMOPATH, '/api/user/{id}');
});

// ---------- initState：编辑表单初始 state 组装 ----------

test('initState: 空数据时返回完整默认 state 并按 GET 展开 query 页签', t => {
  const s = initState({ method: 'GET' }, 'http://mock');
  t.is(s.method, 'GET');
  t.is(s.req_body_type, 'form');
  t.is(s.res_body_type, 'json');
  t.is(s.jsonType, 'tpl');
  t.is(s.mockUrl, 'http://mock');
  t.is(s.req_radio_type, 'req-query');
  t.is(s.hideTabs.req.query, '');
  t.is(s.hideTabs.req.body, 'hide');
  t.is(s.hideTabs.req.headers, 'hide');
  t.is(s.req_query.length, 1);
  t.true(typeof s.startTime === 'number');
});

test('initState: POST 接口展开 body 页签，空数组字段被清理', t => {
  const s = initState(
    {
      method: 'POST',
      req_query: [],
      req_headers: [],
      req_body_form: [],
      req_params: [],
      title: '已有接口'
    },
    'http://mock'
  );
  t.is(s.hideTabs.req.body, '');
  t.is(s.hideTabs.req.query, 'hide');
  // 空数组在初始化时删除，回落到默认值
  t.is(s.req_query.length, 1);
  t.false('req_headers' in s && s.req_headers.length === 0);
  t.is(s.title, '已有接口');
});

test('initState: req_body_form 的 type 规整为 text/file 二值，且只处理副本', t => {
  const source = {
    method: 'POST',
    req_body_form: [
      { name: 'a', type: 'text' },
      { name: 'b', type: 'whatever' }
    ]
  };
  const s = initState(source, 'http://mock');
  t.is(s.req_body_form[0].type, 'text');
  t.is(s.req_body_form[1].type, 'file');
  // 深拷贝语义：入参不被修改
  t.is(source.req_body_form[1].type, 'whatever');
  t.is(source.hideTabs, undefined);
});

// ---------- paramTemplates：纯渲染行模板 ----------

test('queryTpl/paramsTpl: 给定 data/index/delParams 输出确定性行结构', t => {
  const deleted = [];
  const delParams = (key, name) => deleted.push([key, name]);
  const row = queryTpl({ name: 'page', required: '0', desc: '页码', example: '1' }, 2, delParams);
  t.is(row.key, '2');
  t.is(row.props.className, 'interface-edit-item-content');
  const html = JSON.stringify(row);
  t.true(html.indexOf('page') !== -1);
  t.true(html.indexOf('req_query') !== -1);

  // 删除按钮回调透传 delParams(key, name)
  const paramsRow = paramsTpl({ name: 'id', desc: '', example: '' }, 0);
  t.is(paramsRow.key, '0');
  t.is(JSON.stringify(paramsRow).indexOf('disabled') !== -1, true);
  t.deepEqual(deleted, []);
});

// ---------- 组件渲染冒烟（渲染编排等价性已由迁移期逐字节对比单独证明）----------
// 两个渲染用例共享 document.body（挂载 + 末尾 cleanup/cleanupDom），必须串行
//（ava 中普通 test() 为文件内并发语义，与本仓库其他渲染测试同口径用 test.serial）

test.serial('InterfaceEditForm: 空表单渲染出基础表单骨架', async t => {
  const Comp = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js').default;
  const seedState = {
    group: { field: { enable: true, name: '自定义字段' } },
    project: {
      currProject: {
        tag: [{ _id: 't1', name: 'tagA' }],
        is_json5: true
      }
    }
  };
  const utils = renderWithProviders(
    React.createElement(Comp, {
      cat: [{ _id: '1', name: '分类A' }],
      curdata: { method: 'GET' },
      mockUrl: 'http://mock/11',
      basepath: '/api/base',
      noticed: true,
      onSubmit: () => Promise.resolve({}),
      onTagClick: () => {}
    }),
    { seedState }
  );
  await flushEffects(30);
  t.true(utils.container.querySelector('input#title') !== null);
  t.true(utils.container.querySelector('.interface-edit-submit-button') !== null);
  t.true(utils.container.innerHTML.indexOf('基本设置') !== -1);
  t.true(utils.container.innerHTML.indexOf('请求参数设置') !== -1);
  t.true(utils.container.innerHTML.indexOf('返回数据设置') !== -1);
  t.true(utils.container.innerHTML.indexOf('自定义字段') !== -1);
  cleanup();
  cleanupDom();
});

// ---------- 编辑 Tab 端到端（批次 3 消费方切换）：json-schema 开启态渲染自研编辑器 ----------

test.serial('InterfaceEditForm: json-schema 开启态渲染自研编辑器且编辑操作上抛父组件', async t => {
  const Comp = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js').default;
  const seedState = {
    group: { field: { enable: false } },
    project: {
      currProject: {
        tag: [],
        // 项目未开 json5：两个 JSON-SCHEMA 开关按初值规约（is_json_schema || !is_json5）恒为开
        is_json5: false
      }
    }
  };
  const utils = renderWithProviders(
    React.createElement(Comp, {
      cat: [{ _id: '1', name: '分类A' }],
      curdata: {
        method: 'POST',
        title: 'POST 接口',
        req_body_type: 'json',
        req_body_other: JSON.stringify({
          type: 'object',
          properties: { user: { type: 'string' } },
          required: ['user']
        }),
        res_body_type: 'json',
        res_body: '{"a":1}'
      },
      mockUrl: 'http://mock/11',
      basepath: '/api/base',
      noticed: true,
      onSubmit: () => Promise.resolve({}),
      onTagClick: () => {}
    }),
    { seedState }
  );
  await flushEffects(30);

  // json-schema 开启态：请求 BODY 与返回数据两处各渲染一个自研编辑器
  //（批次 3 前此处为旧编辑器工厂桩 .stub-json-schema-editor）
  const editors = utils.container.querySelectorAll(
    '.json-schema-editor-scope .json-schema-editor'
  );
  t.is(editors.length, 2, '请求 BODY 与返回数据应各渲染一个自研 json-schema 编辑器');

  // data 契约（入）：req_body_other 的 schema 树渲染为可编辑行
  const bodyEditor = editors[0];
  const userNameInput = Array.from(bodyEditor.querySelectorAll('.jse-name-input')).find(
    i => i.value === 'user'
  );
  t.truthy(userNameInput, 'BODY 编辑器应按 req_body_other 的 schema 渲染出 user 行');

  // 编辑上抛：点「添加属性」→ 编辑器新增一行，且 onChange 经父组件 handler 链
  //（handleReqBodySchemaChange → changeEditStatus）派发 redux action。
  // 父 handler 的 changeEditStatus 调度带 1 秒静默窗，先等窗口过去再编辑。
  const rowCountBefore = bodyEditor.querySelectorAll('.jse-row').length;
  await new Promise(resolve => setTimeout(resolve, 1100));
  await act(async () => {
    fireEvent.click(bodyEditor.querySelector('.jse-add-root'));
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  t.is(
    bodyEditor.querySelectorAll('.jse-row').length,
    rowCountBefore + 1,
    '「添加属性」后编辑器应新增一行'
  );
  t.true(
    utils.dispatched.some(a => a.type === 'yapi/interface/CHANGE_EDIT_STATUS' && a.status === true),
    '编辑器 onChange 应上抛父组件并派发 changeEditStatus(true)'
  );

  cleanup();
  cleanupDom();
});

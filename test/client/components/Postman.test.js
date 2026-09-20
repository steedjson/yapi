// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const path = require('path');
const Module = require('module');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const originalResolveFilename = Module._resolveFilename;
// Postman.js 里经 webpack 别名引用 client/...，jsdom-setup 只映射了 common/ 前缀，
// 这里补 client/ 前缀映射，必须在 require 生产代码之前安装
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// ---- 重型子组件打桩（必须先于 require Postman 写入 require.cache）----
function stubDefaultExport(absPath, Stub) {
  const stubModule = new Module(absPath, null);
  stubModule.filename = absPath;
  stubModule.loaded = true;
  stubModule.exports = { __esModule: true, default: Stub };
  require.cache[absPath] = stubModule;
}

stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/AceEditor/AceEditor.js'),
  React.forwardRef(function StubAceEditor(props) {
    return React.createElement(
      'div',
      {
        className: props.className,
        'data-data': String(props.data == null ? '' : props.data)
      },
      'STUB_ACE'
    );
  })
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/components/ModalPostman/index.js'),
  function StubModalPostman() {
    return React.createElement('div', null, 'STUB_MODAL_POSTMAN');
  }
);
stubDefaultExport(
  path.join(REPO_ROOT, 'client/containers/Project/Setting/ProjectEnv/index.js'),
  function StubProjectEnv() {
    return React.createElement('div', null, 'STUB_PROJECT_ENV');
  }
);

// ---- crossRequest 桩：保留 postmanLib 真实导出，仅替换 crossRequest ----
// Postman 在模块加载时解构 { crossRequest }，桩必须先于组件 require 落入 require.cache
const realPostmanLib = require(path.join(REPO_ROOT, 'common/postmanLib.js'));
const postmanLibPath = path.join(REPO_ROOT, 'common/postmanLib.js');
const crossRequestCalls = [];
let crossRequestDelay = 30;
let crossRequestResponder = () => ({
  res: {
    header: { 'content-type': 'application/json', 'x-stub': 'p6' },
    body: { echo: 'ok' },
    status: 200,
    statusText: 'OK'
  },
  runTime: 12
});
{
  const stubModule = new Module(postmanLibPath, null);
  stubModule.filename = postmanLibPath;
  stubModule.loaded = true;
  stubModule.exports = Object.assign({}, realPostmanLib, {
    crossRequest(options, preScript, afterScript, commonContext) {
      crossRequestCalls.push({ options, preScript, afterScript, commonContext });
      // 宏任务延迟 resolve：模拟真实跨端请求时序
      return new Promise(resolve => {
        setTimeout(() => resolve(crossRequestResponder(options)), crossRequestDelay);
      });
    }
  });
  require.cache[postmanLibPath] = stubModule;
}

const { default: Postman } = require('../../../client/components/Postman/Postman.js');

const ORIGINAL_AXIOS_POST = require('axios').post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  crossRequestCalls.length = 0;
  crossRequestDelay = 30;
  crossRequestResponder = () => ({
    res: {
      header: { 'content-type': 'application/json', 'x-stub': 'p6' },
      body: { echo: 'ok' },
      status: 200,
      statusText: 'OK'
    },
    runTime: 12
  });
  require('axios').post = ORIGINAL_AXIOS_POST;
  delete window.crossRequest;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 接口夹具：POST /api/pet/{id}，path/query/header/json body 齐备
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

const BASE_PROPS = {
  curUid: 9,
  interfaceId: 100,
  projectId: 12,
  save: () => {}
};

function findButton(utils, text) {
  // antd Button 会在两个汉字间自动插入空格，比较前去除空白
  return Array.from(utils.container.querySelectorAll('button')).find(
    b => b.textContent.replace(/\s/g, '') === text
  );
}

// click 与后续等待分属两个 act 作用域：与生产 discrete 事件同步提交语义一致
async function clickSend(utils) {
  await act(async () => {
    fireEvent.click(findButton(utils, '发送'));
  });
  await act(async () => {
    await sleep(200);
  });
}

// 1) 请求参数组装：req_params 路径替换 / enabled query / header 合并 / json body /
//    taskId=curUid / caseId=_id / 插件上下文（type、interfaceId、projectId）
test.serial('Postman 发送请求时按环境与参数正确组装 crossRequest 请求配置', async t => {
  window.crossRequest = function() {}; // cross-request 插件在位
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, { data: INTER_DATA, type: 'inter' }))
  );
  await act(async () => {});

  await clickSend(utils);

  t.is(crossRequestCalls.length, 1, '应恰好发送一次请求');
  const call = crossRequestCalls[0];
  const { options, commonContext, preScript } = call;

  t.is(options.url, 'http://localhost:3000/api/pet/42?q=hello', 'url 应拼接环境域名、path 参数与启用的 query');
  t.is(options.method, 'POST', 'method 应取接口定义');
  t.is(options.headers['Content-Type'], 'application/json', '请求头应来自接口定义');
  t.is(options.taskId, 9, 'taskId 应为 curUid');
  t.is(options.caseId, 100, 'caseId 应为接口 _id');
  t.true(typeof options.data === 'object', 'json body 应解析为对象');
  t.deepEqual(options.data, { name: 'zhang' }, 'json body 内容应与 req_body_other 一致');
  t.is(commonContext.uid, 9, '上下文应带 uid');
  t.is(commonContext.interfaceId, 100, '上下文应带 interfaceId');
  t.is(commonContext.projectId, 12, '上下文应带 projectId');
  t.is(preScript, 'console.log("pre")', '前置脚本应随请求透传');
  t.is(call.afterScript, 'console.log("after")', '后置脚本应随请求透传');

  utils.unmount();
});

// 2) 响应回填：状态码/响应头/响应体写入 state 并渲染，loading 复位
test.serial('Postman 响应回填 resStatusCode/响应头/响应体并复位 loading', async t => {
  window.crossRequest = function() {};
  let postmanHandle = null;
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data: INTER_DATA,
      type: 'inter',
      ref: r => {
        postmanHandle = r;
      }
    }))
  );
  await act(async () => {});

  await clickSend(utils);

  const state = postmanHandle.state;
  t.is(state.loading, false, '响应到达后 loading 应复位');
  t.is(state.resStatusCode, 200, '状态码应回填');
  t.is(state.resStatusText, 'OK', '状态文本应回填');
  t.deepEqual(state.test_res_header, { 'content-type': 'application/json', 'x-stub': 'p6' }, '响应头应回填');
  t.is(state.test_res_body, '{\n  "echo": "ok"\n}', '对象响应体应美化后回填');
  t.is(state.res_body_type, 'json', '对象响应应把 res_body_type 置为 json');
  t.is(state.test_valid_msg, '', '非 json-schema 接口校验信息应为空串');

  // 渲染面：状态行 success + 响应体经编辑器展示
  const html = utils.container.innerHTML;
  t.true(html.indexOf('res-code success') !== -1, '状态行应为 success 样式');
  t.true(html.indexOf('200') !== -1, '状态行应展示 200');

  utils.unmount();
});

// 3) saveCase 对接契约：保存/更新按钮文案随 type 变化，点击透传 props.save
//    （Run.js 以 save={() => setSaveCaseModalVisible(true)} 打开保存弹窗）
test.serial('Postman 保存按钮随 type 变化并透传 props.save', async t => {
  window.crossRequest = function() {};
  const saveCalls = [];
  const save = () => saveCalls.push('save');

  const interUtils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, { data: INTER_DATA, type: 'inter', save }))
  );
  await act(async () => {});
  const interSaveBtn = findButton(interUtils, '保存');
  t.truthy(interSaveBtn, 'type=inter 应展示「保存」按钮');
  t.falsy(findButton(interUtils, '更新'), 'type=inter 不应展示「更新」按钮');
  await act(async () => {
    fireEvent.click(interSaveBtn);
  });
  interUtils.unmount();

  const caseUtils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data: Object.assign({}, INTER_DATA, { _id: 900, casename: '用例一', case_env: 'prod' }),
      type: 'case',
      save
    }))
  );
  await act(async () => {});
  const caseSaveBtn = findButton(caseUtils, '更新');
  t.truthy(caseSaveBtn, 'type=case 应展示「更新」按钮');
  t.falsy(findButton(caseUtils, '保存'), 'type=case 不应展示「保存」按钮');
  await act(async () => {
    fireEvent.click(caseSaveBtn);
  });
  caseUtils.unmount();

  t.deepEqual(saveCalls, ['save', 'save'], '两次点击都应透传 props.save');

  cleanupDom();
});

// 4) 取消语义：同一事件批次内的连点（loading 尚未渲染）第二次点击等价取消，
//    只发一次请求，且迟到的首次响应被丢弃。迁移后 stateRef 同步镜像让该分支
//    在 React 18 批处理下真正可达（旧类组件读取未提交的 this.state 会双发请求）。
test.serial('Postman 同一批次内连点发送等价取消，只发一次请求并丢弃迟到响应', async t => {
  window.crossRequest = function() {};
  crossRequestDelay = 400; // 响应晚于取消到达
  let postmanHandle = null;
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data: INTER_DATA,
      type: 'inter',
      ref: r => {
        postmanHandle = r;
      }
    }))
  );
  await act(async () => {});

  const sendBtn = findButton(utils, '发送');
  await act(async () => {
    fireEvent.click(sendBtn); // 第一次点击：stateRef.loading 同步置 true
    fireEvent.click(sendBtn); // 第二次点击（loading 尚未渲染）：命中取消分支
  });
  t.is(postmanHandle.state.loading, false, '取消后 loading 应复位');
  t.is(crossRequestCalls.length, 1, '第二次点击应取消而非重复发送');

  await act(async () => {
    await sleep(600); // 迟到的首次响应
  });

  t.is(postmanHandle.state.resStatusCode, null, '迟到响应应被丢弃，状态码不回填');
  t.is(postmanHandle.state.test_res_body, null, '迟到响应不应回填响应体');

  utils.unmount();
});

// 5) ref.state 契约：Run.js / InterfaceCaseContent 经 ref.current.state 解构实时参数
test.serial('Postman ref.state 暴露保存用例所需的实时请求参数', async t => {
  window.crossRequest = function() {};
  const caseData = Object.assign({}, INTER_DATA, {
    _id: 900,
    casename: '用例一',
    case_env: 'prod'
  });
  let postmanHandle = null;
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data: caseData,
      type: 'case',
      ref: r => {
        postmanHandle = r;
      }
    }))
  );
  await act(async () => {});

  t.truthy(postmanHandle && postmanHandle.state, 'ref 应暴露 state');
  const {
    case_env,
    req_params,
    req_query,
    req_headers,
    req_body_type,
    req_body_form,
    req_body_other
  } = postmanHandle.state;
  t.is(case_env, 'prod', 'case_env 应来自接口数据');
  t.is(req_params.length, 1, 'req_params 应保留');
  t.is(req_query.length, 2, 'req_query 应保留');
  t.is(req_headers.length, 1, 'req_headers 应保留');
  t.is(req_body_type, 'json', 'req_body_type 应保留');
  t.is(req_body_form.length, 0, 'req_body_form 应保留');
  t.is(req_body_other, '{"name":"zhang"}', 'req_body_other 应保留');

  // 环境下拉切换后 ref.state 应读到最新 case_env，并合并新环境的 header
  await act(async () => {
    const domainSelect = utils.container.querySelector('.ant-select-single:not(.ant-select-disabled)');
    fireEvent.mouseDown(domainSelect.querySelector('.ant-select-selector'));
    await sleep(50);
  });
  const localOption = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
    o => o.textContent.indexOf('local') === 0
  );
  t.truthy(localOption, '环境下拉应展开并包含 local 选项');
  await act(async () => {
    fireEvent.click(localOption);
    await sleep(30);
  });
  t.is(postmanHandle.state.case_env, 'local', '切换后 state.case_env 应为最新选择');
  const mergedHeaderNames = postmanHandle.state.req_headers.map(h => h.name);
  t.true(
    mergedHeaderNames.indexOf('X-Env') !== -1,
    '切换环境后应合并 local 环境的 X-Env header'
  );
  const xEnvHeader = postmanHandle.state.req_headers.find(h => h.name === 'X-Env');
  t.true(xEnvHeader.abled === true, '环境注入的 header 应标记 abled: true（接口定义头不可改）');

  utils.unmount();
});

// ---------- cWRP 等价 effect（props.data 变化触发 initState/initEnvState）回归 ----------
// 对应 Postman.js「对应旧 UNSAFE_componentWillReceiveProps」useEffect 的四条路径：
// ① 同 _id 仅 env 变化（else-if 分支）；② 换 _id 且换 env、type=inter（重初始化，env 重算
// 仅由 initState 内部按新 case_env 执行一次）；③ type=case 换 _id 且换 env（env 分支以
// 「接收时刻的旧 case_env + 新 env」最后应用——钉死最终应用顺序等价）；④ 同 ① 的 type=case。
// 各用例不发送请求，经 rerender 驱动 props.data 变化，断言 ref.state 实时镜像。

const CONTENT_TYPE_HEADER = [{ name: 'Content-Type', value: 'application/json', required: '1' }];

/**
 * 挂载 Postman 并返回句柄与测试工具（refCallback 须在 rerender 时原样透传,
 * 否则 React 会先以 null 反调旧 ref 导致句柄丢失）
 * @param {any} data
 * @param {string} type
 */
async function renderPostman(data, type) {
  let postmanHandle = null;
  const refCallback = r => {
    postmanHandle = r;
  };
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data,
      type,
      ref: refCallback
    }))
  );
  await act(async () => {});
  return { utils, handle: () => postmanHandle, refCallback };
}

/**
 * 以新 data 重渲染并等待 effect 落定
 * @param {any} utils
 * @param {any} data
 * @param {string} type
 * @param {any} refCallback
 */
async function rerenderPostman(utils, data, type, refCallback) {
  await act(async () => {
    utils.rerender(
      React.createElement(Postman, Object.assign({}, BASE_PROPS, { data, type, ref: refCallback }))
    );
  });
}

// 6) type=inter，同 _id 仅 env 变化：只按当前 case_env 重算请求头，不重跑 initState
test.serial('cWRP 等价: type=inter 同 _id 仅 env 变化时只重算请求头, 不重跑 initState', async t => {
  const ENV_V2 = [
    { name: 'local', domain: 'http://localhost:3000', header: [{ name: 'X-Env-V2', value: 'local-v2' }] },
    { name: 'prod', domain: 'https://prod.example.com', header: [] }
  ];
  const { utils, handle, refCallback } = await renderPostman(INTER_DATA, 'inter');
  t.is(handle().state.case_env, 'local', '挂载后 case_env 应来自数据');

  // data2 去掉 title 作「未重初始化」标记：initState 若重跑，applyState({...data2}) 会把 title 抹掉
  const data2 = Object.assign({}, INTER_DATA, { env: ENV_V2 });
  delete data2.title;
  await rerenderPostman(utils, data2, 'inter', refCallback);

  t.is(handle().state.env, ENV_V2, 'env 应更新为新引用');
  t.is(handle().state.case_env, 'local', '新 env 仍含 local, case_env 应保持');
  t.is(handle().state.title, '接口一', '仅 env 变化不应重跑 initState（title 标记字段保留）');
  const names = handle().state.req_headers.map(h => h.name);
  t.true(names.indexOf('X-Env-V2') !== -1, '应按当前 case_env(local) 合并新 env 的 header');
  const xEnvV2 = handle().state.req_headers.find(h => h.name === 'X-Env-V2');
  t.true(xEnvV2.abled === true, 'env 注入的 header 应标记 abled: true');

  utils.unmount();
});

// 7) type=inter，换 _id 且换 env：重初始化整体重建，env 重算仅由 initState 内部按新 case_env 执行
test.serial('cWRP 等价: type=inter 换 _id 且换 env 时重初始化并仅按新 case_env 重算请求头', async t => {
  const ENV_V2 = [
    { name: 'local', domain: 'http://localhost:3000', header: [{ name: 'X-Only-Local-V2', value: '1' }] },
    { name: 'prod', domain: 'https://prod.example.com', header: [{ name: 'X-Only-Prod-V2', value: '1' }] }
  ];
  const { utils, handle, refCallback } = await renderPostman(INTER_DATA, 'inter');

  const data2 = Object.assign({}, INTER_DATA, {
    _id: 101,
    case_env: 'prod',
    env: ENV_V2,
    req_headers: CONTENT_TYPE_HEADER
  });
  await rerenderPostman(utils, data2, 'inter', refCallback);

  t.is(handle().state._id, 101, '应完成重初始化');
  t.is(handle().state.case_env, 'prod', 'case_env 应来自新数据');
  t.is(handle().state.env, ENV_V2, 'env 应来自新数据');
  const names = handle().state.req_headers.map(h => h.name);
  t.true(names.indexOf('X-Only-Prod-V2') !== -1, '应按新 case_env(prod) 与新 env 计算请求头');
  t.false(names.indexOf('X-Only-Local-V2') !== -1, '不应再按 local 环境补算（旧 cWRP 顺序等价：不额外补跑 initEnvState）');
  t.false(names.indexOf('X-Env') !== -1, '旧 env 合并产物不应残留（重初始化整体重建请求头）');
  const xProd = handle().state.req_headers.find(h => h.name === 'X-Only-Prod-V2');
  t.true(xProd.abled === true, 'env 注入的 header 应标记 abled: true');

  utils.unmount();
});

// 8) type=case，换 _id 且换 env：env 分支以「接收时刻的旧 case_env + 新 env」最后应用（bug-for-bug）
test.serial('cWRP 等价: type=case 换 _id 且换 env 时以旧 case_env 加新 env 最后重算请求头', async t => {
  const ENV_V1 = [
    { name: 'local', domain: 'http://localhost:3000', header: [{ name: 'X-From-Local-V1', value: '1' }] },
    { name: 'prod', domain: 'https://prod.example.com', header: [{ name: 'X-From-Prod-V1', value: '1' }] }
  ];
  const ENV_V2 = [
    { name: 'local', domain: 'http://localhost:3000', header: [{ name: 'X-From-Local-V2', value: '1' }] },
    { name: 'prod', domain: 'https://prod.example.com', header: [{ name: 'X-From-Prod-V2', value: '1' }] }
  ];
  const data1 = Object.assign({}, INTER_DATA, {
    _id: 900,
    casename: '用例一',
    case_env: 'prod',
    env: ENV_V1
  });
  const { utils, handle, refCallback } = await renderPostman(data1, 'case');
  t.is(handle().state.case_env, 'prod', '挂载后 case_env 应来自数据');

  const data2 = Object.assign({}, INTER_DATA, {
    _id: 901,
    casename: '用例一',
    case_env: 'local',
    env: ENV_V2,
    req_headers: CONTENT_TYPE_HEADER
  });
  await rerenderPostman(utils, data2, 'case', refCallback);

  t.is(handle().state.case_env, 'local', 'case_env 应被 initState 按新数据更新');
  const names = handle().state.req_headers.map(h => h.name);
  t.true(
    names.indexOf('X-From-Prod-V2') !== -1,
    '请求头应基于接收时刻的旧 case_env(prod) 与新 env(V2) 计算——旧 cWRP 的最后应用顺序'
  );
  t.false(
    names.indexOf('X-From-Local-V2') !== -1,
    '不应按新 case_env(local) 计算请求头（钉死最终应用顺序等价，该既有语义的修复需另行立项）'
  );
  const xProdV2 = handle().state.req_headers.find(h => h.name === 'X-From-Prod-V2');
  t.true(xProdV2.abled === true, 'env 注入的 header 应标记 abled: true');

  utils.unmount();
});

// 9) type=case，同 _id 仅 env 变化：按当前 case_env 重算请求头，case_env 与未重初始化标记保留
test.serial('cWRP 等价: type=case 同 _id 仅 env 变化时按当前 case_env 重算请求头', async t => {
  const ENV_V2 = [
    { name: 'local', domain: 'http://localhost:3000', header: [] },
    { name: 'prod', domain: 'https://prod.example.com', header: [{ name: 'X-Case-Env-Only', value: '1' }] }
  ];
  const data1 = Object.assign({}, INTER_DATA, {
    _id: 900,
    casename: '用例一',
    case_env: 'prod'
  });
  const { utils, handle, refCallback } = await renderPostman(data1, 'case');

  // data2 去掉 casename 作「未重初始化」标记; _id/interface_up_time 均保持不变
  const data2 = Object.assign({}, INTER_DATA, { _id: 900, env: ENV_V2 });
  delete data2.casename;
  await rerenderPostman(utils, data2, 'case', refCallback);

  t.is(handle().state.case_env, 'prod', '新 env 仍含 prod, case_env 应保持');
  t.is(handle().state.casename, '用例一', '仅 env 变化不应重跑 initState（casename 标记字段保留）');
  t.is(handle().state.env, ENV_V2, 'env 应更新为新引用');
  const names = handle().state.req_headers.map(h => h.name);
  t.true(names.indexOf('X-Case-Env-Only') !== -1, '应按当前 case_env(prod) 合并新 env 的 header');
  const xOnly = handle().state.req_headers.find(h => h.name === 'X-Case-Env-Only');
  t.true(xOnly.abled === true, 'env 注入的 header 应标记 abled: true');

  utils.unmount();
});

// ---------- csl-tester 补充：ref 契约端到端（子组件内编辑 → 上抛 → 父 state → ref.state 读回）----------
// 覆盖 render 子组件化移交说明建议的端到端断言：编辑动作发生在子组件内部（RequestParamsPanel
// 的受控输入与启用勾选、TestPanel 的脚本开关），经回调上抛写回父组件 state，再由 ref.state
// getter 读回——Run.js / InterfaceCaseContent 保存接口与用例时正是这样读取这些字段
// （Run.js 取 7 个字段，InterfaceCaseContent 另取 test_script / enable_script / test_res_*）。
// 同时补齐既有 9 条用例未经 ref 断言的 state 表面（test_script / enable_script）。
test.serial('子组件内编辑经上抛回调写入父 state 并可由 ref.state 读回', async t => {
  window.crossRequest = function() {};
  const caseData = Object.assign({}, INTER_DATA, {
    _id: 900,
    casename: '用例一',
    case_env: 'prod',
    test_script: 'assert.equal(status, 200)',
    enable_script: false
  });
  let postmanHandle = null;
  const utils = render(
    React.createElement(Postman, Object.assign({}, BASE_PROPS, {
      data: caseData,
      type: 'case',
      ref: r => {
        postmanHandle = r;
      }
    }))
  );
  await act(async () => {});

  t.is(postmanHandle.state.test_script, 'assert.equal(status, 200)', 'ref.state 应暴露 test_script');
  t.is(postmanHandle.state.enable_script, false, 'ref.state 应暴露 enable_script 初值');

  // ① RequestParamsPanel：受控输入改值 → changeParam('req_params', ...) → ref.state
  const paramInput = utils.container.querySelector('#req_params_0');
  await act(async () => {
    fireEvent.change(paramInput, { target: { value: '99' } });
    await sleep(20);
  });
  t.is(postmanHandle.state.req_params[0].value, '99', '子组件内改值应经 ref.state 读回');
  t.is(
    utils.container.querySelector('#req_params_0').value,
    '99',
    '写入 state 的值应回灌受控输入（往返一致）'
  );

  // ② RequestParamsPanel：query 启用勾选（第 2 行 required=0）→ changeParam(..., 'enable')
  const queryBoxes = utils.container.querySelectorAll('.params-enable input[type="checkbox"]');
  t.is(queryBoxes.length, 2, 'query 两行应各带一个启用勾选（required=1 行禁用，required=0 行可点）');
  const enableBefore = postmanHandle.state.req_query[1].enable;
  await act(async () => {
    fireEvent.click(queryBoxes[1]);
    await sleep(20);
  });
  t.is(
    postmanHandle.state.req_query[1].enable,
    !enableBefore,
    '子组件内勾选应经 ref.state 读回（enable 取反）'
  );

  // ③ TestPanel：切到 Test 页签后拨动脚本开关 → onEnableScriptChange → ref.state.enable_script
  const testTab = Array.from(utils.container.querySelectorAll('.ant-tabs-tab')).find(
    tab => tab.textContent.indexOf('Test') !== -1
  );
  t.truthy(testTab, 'type=case 应展示 Test 页签');
  await act(async () => {
    fireEvent.click(testTab);
    await sleep(30);
  });
  const switchEl = utils.container.querySelector('.ant-switch');
  t.truthy(switchEl, 'Test 面板应渲染脚本开关');
  t.false(switchEl.classList.contains('ant-switch-checked'), '开关初值应与 enable_script=false 一致');
  await act(async () => {
    fireEvent.click(switchEl);
    await sleep(20);
  });
  t.is(postmanHandle.state.enable_script, true, 'TestPanel 开关应经 ref.state 读回');
  t.true(
    utils.container.querySelector('.ant-switch').classList.contains('ant-switch-checked'),
    '写入 state 的开关值应回灌受控组件'
  );

  utils.unmount();
});

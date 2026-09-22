// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import {
  cleanupDom,
  renderWithProviders,
  flushEffects,
  stubDefaultExport
} from '../../helpers/containers';

const path = require('path');
const Module = require('module');

// Run.js 经 components/index 引入 Header（内部 require('client/plugin.js')），
// jsdom-setup 只映射了 common/ 前缀，这里补 client/ 与 exts/ 前缀的等价映射，
// 必须在 require 被测组件之前安装
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
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

// Postman 挂载即依赖 AceEditor/网络环境，打桩为回显 props 的静态组件：
// 经 useImperativeHandle 暴露与真实 Postman 同形的 state，供 saveCase/updateCase
// 经 ref 读取；save 回调经按钮触发，断言对象是容器自身的编排逻辑而非 Postman 内部
const StubPostman = React.forwardRef(function StubPostman(props, ref) {
  React.useImperativeHandle(ref, () => ({
    state: {
      case_env: 'local',
      req_params: [],
      req_query: [],
      req_headers: [],
      req_body_type: 'form',
      req_body_form: [],
      req_body_other: '',
      test_script: '',
      enable_script: false,
      test_res_body: '',
      test_res_header: ''
    }
  }));
  return React.createElement(
    'section',
    {
      className: 'stub-postman',
      'data-json': JSON.stringify(props.data),
      'data-id': String(props.id),
      'data-type': String(props.type),
      'data-interface-id': String(props.interfaceId),
      'data-project-id': String(props.projectId),
      'data-cur-uid': String(props.curUid),
      'data-save-tip': String(props.saveTip)
    },
    'STUB_POSTMAN',
    props.save
      ? React.createElement('button', { className: 'stub-save', onClick: props.save }, 'SAVE')
      : null
  );
});
stubDefaultExport(path.join(REPO_ROOT, 'client/components/Postman/Postman.js'), StubPostman);

const { default: Run } = require('../../../client/containers/Project/Interface/InterfaceList/Run/Run.js');
const {
  default: AddColModal
} = require('../../../client/containers/Project/Interface/InterfaceList/Run/AddColModal.js');
const {
  default: ImportInterface
} = require('../../../client/containers/Project/Interface/InterfaceCol/ImportInterface.js');
const {
  default: InterfaceCaseContent
} = require('../../../client/containers/Project/Interface/InterfaceCol/InterfaceCaseContent.js');

const axios = require('axios');
const { Provider } = require('react-redux');
const { StyleProvider } = require('@ant-design/cssinjs');
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// interfaceCol 切片已迁至 Zustand（批次3）：组件经 useInterfaceColStore 读写
const useInterfaceColStore = require('../../../client/store/interfaceColStore').default;

const INITIAL_INTERFACE_COL_STATE = {
  interfaceColList: [
    {
      _id: 0,
      name: '',
      uid: 0,
      project_id: 0,
      desc: '',
      add_time: 0,
      up_time: 0,
      caseList: [{}]
    }
  ],
  isShowCol: true,
  isRender: false,
  currColId: 0,
  currCaseId: 0,
  currCase: {},
  currCaseList: [],
  variableParamsList: [],
  envList: []
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  useInterfaceColStore.setState(INITIAL_INTERFACE_COL_STATE);
});

const COL_LIST = [
  {
    _id: 5,
    name: '集合一',
    caseList: [{ _id: 100, casename: '用例一' }]
  }
];

const CURR_INTERFACE = {
  _id: 100,
  title: '接口一',
  path: '/api/a',
  method: 'GET',
  project_id: 12
};

const CURR_PROJECT = {
  _id: 12,
  name: '演示项目',
  basepath: '/base',
  env: [{ name: 'local', domain: 'http://localhost' }],
  pre_script: 'p1',
  after_script: 'a1'
};

const ROUTE = {
  routePath: '/project/:id/interface/api/:actionId',
  initialPath: '/project/12/interface/api/100'
};

function stubColApis(getCalls, postCalls) {
  axios.get = url => {
    getCalls.push(url);
    if (url.indexOf('/api/col/list') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: COL_LIST } });
    }
    if (url.indexOf('/api/col/case?') === 0) {
      return Promise.resolve({
        data: { errcode: 0, data: { _id: 100, casename: '用例一', project_id: 12, interface_id: 88 } }
      });
    }
    return Promise.resolve({ data: { errcode: 0, data: [] } });
  };
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
}

function runSeed() {
  // interfaceCol 切片改经真实 Zustand store 播种（挂载链会用同名 stub 数据收敛覆盖）
  useInterfaceColStore.setState({
    ...INITIAL_INTERFACE_COL_STATE,
    interfaceColList: COL_LIST
  });
  return {
    user: { uid: 11 },
    inter: { curdata: CURR_INTERFACE, list: [], editStatus: false },
    project: { currProject: CURR_PROJECT }
  };
}

test.serial('Run 渲染 Postman 并透传合并项目环境后的接口数据', async t => {
  stubColApis([], []);
  const { container } = renderWithProviders(React.createElement(Run), {
    seedState: runSeed(),
    ...ROUTE
  });
  await flushEffects();

  const postman = container.querySelector('.stub-postman');
  t.truthy(postman, '应渲染 Postman 运行面板');
  t.is(postman.getAttribute('data-type'), 'inter', '类型应为接口运行 inter');
  t.is(postman.getAttribute('data-id'), '12', 'id 应为当前项目 _id');
  t.is(postman.getAttribute('data-interface-id'), '100', 'interfaceId 应为当前接口 _id');
  t.is(postman.getAttribute('data-project-id'), '12', 'projectId 应为接口所属项目');
  t.is(postman.getAttribute('data-cur-uid'), '11', 'curUid 应取自 store');
  const data = JSON.parse(postman.getAttribute('data-json'));
  t.is(data.path, '/base/api/a', 'path 应拼接项目 basepath 前缀');
  t.deepEqual(data.env, CURR_PROJECT.env, 'env 应取自当前项目');
  t.is(data.pre_script, 'p1', 'pre_script 应取自当前项目');
  t.is(data.after_script, 'a1', 'after_script 应取自当前项目');
});

test.serial('Run 点击保存打开 AddColModal，确认后提交用例并关闭弹窗', async t => {
  const postCalls = [];
  stubColApis([], postCalls);
  const { container } = renderWithProviders(React.createElement(Run), {
    seedState: runSeed(),
    ...ROUTE
  });
  await flushEffects();

  fireEvent.click(container.querySelector('.stub-save'));
  let modal = document.body.querySelector('.add-col-modal');
  t.truthy(modal, '点击保存后应弹出添加到集合弹窗');
  t.is(
    modal.textContent.indexOf('集合一') > -1,
    true,
    '弹窗应展示 store 中的集合列表'
  );

  fireEvent.click(modal.querySelector('.ant-modal-footer .ant-btn-primary'));
  await flushEffects();

  t.is(postCalls.length, 1, '确认后应提交一次保存用例请求');
  t.is(postCalls[0].url, '/api/col/add_case');
  t.deepEqual(
    postCalls[0].body,
    {
      interface_id: 100,
      casename: '接口一',
      col_id: 5,
      project_id: '12',
      case_env: 'local',
      req_params: [],
      req_query: [],
      req_headers: [],
      req_body_type: 'form',
      req_body_form: [],
      req_body_other: ''
    },
    '应提交 Postman 当前 state、默认选中集合与路由项目 id'
  );
  // 关闭动画在 jsdom 中不会结束，弹窗 DOM 会滞留；以成功提示作为保存成功后
  // 走到关闭分支（setSaveCaseModalVisible(false) 前置的 message.success）的依据
  const message = document.body.querySelector('.ant-message');
  t.truthy(message, '保存成功后应弹出全局成功提示');
  t.is(message.textContent, '添加成功', '提示文案应为添加成功');
});

test.serial('AddColModal 支持选择集合并以输入的用例名回调 onOk', async t => {
  const onOkCalls = [];
  useInterfaceColStore.setState({
    ...INITIAL_INTERFACE_COL_STATE,
    interfaceColList: [{ _id: 5, name: '集合一' }, { _id: 6, name: '集合二' }]
  });
  renderWithProviders(
    React.createElement(AddColModal, {
      visible: true,
      caseName: '初始用例名',
      onOk: (colId, caseName) => onOkCalls.push([colId, caseName]),
      onCancel: () => {}
    }),
    {
      seedState: {},
      ...ROUTE
    }
  );

  const modal = document.body.querySelector('.add-col-modal');
  t.truthy(modal, 'visible=true 应渲染弹窗');
  const items = Array.from(modal.querySelectorAll('.col-item'));
  t.is(items.length, 2, '应渲染两个集合项');
  t.falsy(modal.querySelector('.col-item.selected'), '初始未选择集合（id=0）');

  fireEvent.change(modal.querySelector('input[placeholder="请输入接口用例名称"]'), {
    target: { value: '改过的用例名' }
  });
  fireEvent.click(items[1]);
  t.truthy(
    modal.querySelectorAll('.col-item')[1].classList.contains('selected'),
    '点击后应选中集合二'
  );

  fireEvent.click(modal.querySelector('.ant-modal-footer .ant-btn-primary'));
  t.deepEqual(onOkCalls, [[6, '改过的用例名']], 'onOk 应携带选中集合 id 与输入的用例名');
});

test.serial('AddColModal 父级 props 变化时默认选中首集合并回填用例名', async t => {
  const onOkCalls = [];
  const props = {
    visible: false,
    caseName: '旧用例名',
    onOk: (colId, caseName) => onOkCalls.push([colId, caseName]),
    onCancel: () => {}
  };
  useInterfaceColStore.setState({
    ...INITIAL_INTERFACE_COL_STATE,
    interfaceColList: [{ _id: 5, name: '集合一' }, { _id: 6, name: '集合二' }]
  });
  const utils = renderWithProviders(React.createElement(AddColModal, props), {
    seedState: {},
    ...ROUTE
  });
  t.falsy(document.body.querySelector('.add-col-modal'), 'visible=false 不渲染弹窗内容');

  // 模拟父组件重渲染打开弹窗（旧实现中任意 props 变化经 cWRP 回填列表首项与 caseName）。
  // rerender 须复刻 renderWithProviders 的包裹结构（StyleProvider(hashPriority=high) >
  // Provider > MemoryRouter > Routes > Route），组件类型与位置完全一致才会原位复用实例
  // （props 变化而非重挂载）
  utils.rerender(
    React.createElement(
      StyleProvider,
      { hashPriority: 'high' },
      React.createElement(
        Provider,
        { store: utils.store },
        React.createElement(
          MemoryRouter,
          {
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
            initialEntries: [ROUTE.initialPath]
          },
          React.createElement(
            Routes,
            null,
            React.createElement(
              Route,
              { path: ROUTE.routePath, element: React.createElement(AddColModal, { ...props, visible: true }) }
            )
          )
        )
      )
    )
  );

  const modal = document.body.querySelector('.add-col-modal');
  t.truthy(modal, 'visible=true 后应渲染弹窗内容');
  t.truthy(
    modal.querySelectorAll('.col-item')[0].classList.contains('selected'),
    '默认选中首个集合'
  );
  const input = modal.querySelector('input[placeholder="请输入接口用例名称"]');
  t.is(input.value, '旧用例名', '用例名输入框应回填 props.caseName');

  fireEvent.click(modal.querySelector('.ant-modal-footer .ant-btn-primary'));
  t.deepEqual(onOkCalls, [[5, '旧用例名']], '未交互时 onOk 应携带默认集合与回填的用例名');
});

test.serial('ImportInterface 渲染扁平分类列表与项目下拉，跳过带 projectname 的项目', async t => {
  const selectInterfaceCalls = [];
  stubColApis([], []);
  const { container } = renderWithProviders(
    React.createElement(ImportInterface, {
      currProjectId: '12',
      selectInterface: (ids, projectId) => selectInterfaceCalls.push([ids, projectId])
    }),
    {
      seedState: {
        project: {
          projectList: [
            { _id: 1, name: '项目一' },
            { _id: 2, projectname: '跳过', name: '项目二' }
          ]
        },
        inter: {
          list: [
            { _id: 1, name: '分类A', list: [{ _id: 11, path: '/api/a', method: 'GET', status: 'done' }] },
            { _id: 2, name: '分类B', list: [{ _id: 12, path: '/api/b', method: 'POST', status: 'undone' }] }
          ]
        }
      }
    }
  );

  const rows = Array.from(container.querySelectorAll('.ant-table-tbody tr[data-row-key]'));
  t.deepEqual(
    rows.map(row => row.getAttribute('data-row-key')),
    ['category_1', 'category_2'],
    '应按扁平顺序渲染两个分类行'
  );
  t.is(rows[0].textContent.indexOf('分类A') > -1, true, '分类行应展示分类名');

  // 选中值 '12' 在 options 中无匹配项时，闭合态回显原始值（与旧实现一致）
  const selection = container.querySelector('.select-project .ant-select-selection-item');
  t.truthy(selection, '应渲染项目下拉选中项');
  t.is(selection.textContent, '12', '闭合态应显示当前项目 id 原始值');

  // 展开下拉验证过滤：带 projectname 的项目不出现在选项中
  fireEvent.mouseDown(container.querySelector('.select-project .ant-select-selector'));
  const optionTexts = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map(
    o => o.textContent
  );
  t.deepEqual(optionTexts, ['项目一'], '带 projectname 的项目应被过滤，仅渲染可选项');
});

test.serial('ImportInterface 全选/取消全选经 selectInterface 回调过滤后的接口 id', async t => {
  const selectInterfaceCalls = [];
  stubColApis([], []);
  const { container } = renderWithProviders(
    React.createElement(ImportInterface, {
      currProjectId: '12',
      selectInterface: (ids, projectId) => selectInterfaceCalls.push([ids, projectId])
    }),
    {
      seedState: {
        project: { projectList: [{ _id: 1, name: '项目一' }] },
        inter: {
          list: [
            { _id: 1, name: '分类A', list: [{ _id: 11, path: '/api/a', method: 'GET', status: 'done' }] },
            { _id: 2, name: '分类B', list: [{ _id: 12, path: '/api/b', method: 'POST', status: 'undone' }] }
          ]
        }
      }
    }
  );

  const selectAll = container.querySelector('input[aria-label="Select all"]');
  t.truthy(selectAll, '应渲染全选复选框');

  fireEvent.click(selectAll);
  t.deepEqual(
    selectInterfaceCalls[0],
    [[11, 12], '12'],
    '全选应回调全部接口 id（过滤分类键）与当前项目'
  );

  fireEvent.click(selectAll);
  t.deepEqual(selectInterfaceCalls[1], [[], '12'], '取消全选应回调空数组与当前项目');
});

test.serial('InterfaceCaseContent 挂载拉取用例数据并渲染用例标题与 Postman', async t => {
  const getCalls = [];
  stubColApis(getCalls, []);
  useInterfaceColStore.setState({
    ...INITIAL_INTERFACE_COL_STATE,
    interfaceColList: COL_LIST,
    currColId: 5,
    currCaseId: 100,
    currCase: { _id: 100, casename: '用例一', project_id: 12, interface_id: 88 }
  });
  const { container } = renderWithProviders(React.createElement(InterfaceCaseContent), {
    seedState: {
      user: { uid: 11 },
      project: {
        currProject: { _id: 12, basepath: '/base', pre_script: 'p1', after_script: 'a1' },
        projectEnv: { env: [{ name: 'local', domain: 'http://localhost' }] }
      }
    },
    routePath: '/project/:id/interface/case/:actionId',
    initialPath: '/project/12/interface/case/100'
  });
  await flushEffects();

  t.truthy(
    getCalls.some(url => url.indexOf('/api/col/list?project_id=12') === 0),
    '挂载应拉取项目集合列表'
  );
  t.truthy(
    getCalls.some(url => url === '/api/col/case?caseid=100'),
    '挂载应按路由 case id 拉取用例数据'
  );
  t.truthy(
    getCalls.some(url => url.indexOf('/api/project/get_env') === 0),
    '挂载应拉取当前用例项目的环境变量'
  );

  const postman = container.querySelector('.stub-postman');
  t.truthy(postman, '应渲染 Postman 用例运行面板');
  t.is(postman.getAttribute('data-type'), 'case', '类型应为用例 case');
  t.is(postman.getAttribute('data-cur-uid'), '11', 'curUid 应取自 store');
  const data = JSON.parse(postman.getAttribute('data-json'));
  t.is(data.casename, '用例一', '用例数据应透传给 Postman');
  t.deepEqual(data.env, [{ name: 'local', domain: 'http://localhost' }], 'env 应取自 projectEnv');
  t.is(data.pre_script, 'p1', 'pre_script 应取自当前项目');

  const link = container.querySelector('.inter-link a');
  t.is(link.getAttribute('href'), '/project/12/interface/api/88', '对应接口链接应指向关联接口');
  const input = container.querySelector('.edit-case-name input');
  t.is(input.value, '用例一', '挂载完成后用例名输入框应回填当前用例名');
});

test.serial('InterfaceCaseContent 更新用例提交 Postman state，用例名未变时不重拉集合列表', async t => {
  const getCalls = [];
  const postCalls = [];
  stubColApis(getCalls, postCalls);
  useInterfaceColStore.setState({
    ...INITIAL_INTERFACE_COL_STATE,
    interfaceColList: COL_LIST,
    currColId: 5,
    currCaseId: 100,
    currCase: { _id: 100, casename: '用例一', project_id: 12, interface_id: 88 }
  });
  const { container } = renderWithProviders(React.createElement(InterfaceCaseContent), {
    seedState: {
      user: { uid: 11 },
      project: {
        currProject: { _id: 12, basepath: '/base', pre_script: 'p1', after_script: 'a1' },
        projectEnv: { env: [] }
      }
    },
    routePath: '/project/:id/interface/case/:actionId',
    initialPath: '/project/12/interface/case/100'
  });
  await flushEffects();
  const listCallsAfterMount = getCalls.filter(url => url.indexOf('/api/col/list') === 0).length;
  const caseCallsAfterMount = getCalls.filter(url => url.indexOf('/api/col/case?') === 0).length;

  fireEvent.click(container.querySelector('.stub-save'));
  await flushEffects();

  t.is(postCalls.length, 1, '保存应提交一次更新用例请求');
  t.is(postCalls[0].url, '/api/col/up_case');
  t.deepEqual(
    postCalls[0].body,
    {
      id: 100,
      casename: '用例一',
      case_env: 'local',
      req_params: [],
      req_query: [],
      req_headers: [],
      req_body_type: 'form',
      req_body_form: [],
      req_body_other: '',
      test_script: '',
      enable_script: false,
      test_res_body: '',
      test_res_header: ''
    },
    '应提交 Postman 当前 state 与当前用例 id'
  );
  t.is(
    getCalls.filter(url => url.indexOf('/api/col/list') === 0).length,
    listCallsAfterMount,
    '用例名未变化时不应重拉集合列表'
  );
  t.is(
    getCalls.filter(url => url.indexOf('/api/col/case?') === 0).length,
    caseCallsAfterMount + 1,
    '保存成功后应重拉当前用例数据'
  );
});

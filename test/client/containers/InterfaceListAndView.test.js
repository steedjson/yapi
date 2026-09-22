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

// View.js 经裸路径引入 client/components/AceEditor、client/utils/sanitize 等，
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

// AceEditor / SchemaTable 挂载即依赖 AceEditor 与网络环境，打桩为回显 props 的
// 静态组件，仅隔离子组件渲染细节，被测断言对象仍是容器自身的渲染编排
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
  path.join(REPO_ROOT, 'client/components/SchemaTable/SchemaTable.js'),
  function StubSchemaTable(props) {
    return React.createElement(
      'div',
      { className: 'stub-schema-table' },
      'STUB_SCHEMA:' + JSON.stringify(props.dataSource)
    );
  }
);

const {
  default: InterfaceList
} = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceList.js');
const {
  default: View
} = require('../../../client/containers/Project/Interface/InterfaceList/View.js');

const axios = require('axios');
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  resetUserProjectStores();
  useGroupStore.setState({
    groupList: [],
    currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
    field: { name: '', enable: false },
    member: [],
    role: '',
    groupRequestId: 0
  });
});

const CURR_PROJECT = {
  _id: 12,
  name: '演示项目',
  basepath: '/base',
  cat: [{ _id: 5, name: '分类五', desc: '分类五描述' }],
  tag: [{ name: '核心' }],
  env: []
};

const MENU_TREE = [
  { _id: 5, name: '分类五', list: [{ _id: 100, title: '接口一', path: '/api/a' }], children: [] }
];

// project/user 切片已迁 Zustand（批次4）：改经 projectStore/userStore 播种
const {
  seedUserStore,
  seedProjectStore,
  resetUserProjectStores
} = require('../../helpers/userProjectStores');

const LIST_SEED = {
  inter: {
    curdata: {},
    list: MENU_TREE,
    editStatus: false,
    totalTableList: [
      {
        _id: 100,
        title: '接口一',
        path: '/a',
        method: 'GET',
        project_id: 12,
        catid: 5,
        status: 'done',
        tag: ['核心']
      },
      {
        _id: 101,
        title: '接口二',
        path: '/b',
        method: 'POST',
        project_id: 12,
        catid: 5,
        status: 'undone',
        tag: []
      }
    ],
    totalCount: 2,
    catTableList: [
      {
        _id: 100,
        title: '接口一',
        path: '/a',
        method: 'GET',
        project_id: 12,
        status: 'done',
        tag: ['核心']
      }
    ],
    count: 1
  },
};

const CURDATA = {
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
  req_headers: [
    { name: 'Content-Type', value: 'application/json', required: '1', example: '', desc: '' }
  ],
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

const VIEW_SEED = {
  inter: { curdata: CURDATA, list: MENU_TREE, editStatus: false }
};

// 渲染前播种 project/user store（与旧 redux 种子等价）
function seedUserProjectStores() {
  seedUserStore({ uid: 9 });
  seedProjectStore({ currProject: CURR_PROJECT });
}

// group 切片已迁至 Zustand（批次3）：View 经 useGroupStore 读取 field
const useGroupStore = require('../../../client/store/groupStore').default;
const INITIAL_GROUP_STATE = {
  groupList: [],
  currGroup: { group_name: '', group_desc: '', custom_field1: { name: '', enable: false } },
  field: { name: '', enable: false },
  member: [],
  role: '',
  groupRequestId: 0
};

function seedGroupStore() {
  useGroupStore.setState({
    ...INITIAL_GROUP_STATE,
    field: { enable: true, name: '业务线' }
  });
}

test.serial('InterfaceList 挂载拉取全部接口列表并渲染表格', async t => {
  const getCalls = [];
  axios.get = async url => {
    getCalls.push(url);
    return { data: { errcode: 0, data: { count: 2, list: [] } } };
  };

  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(InterfaceList), {
    seedState: LIST_SEED,
    routePath: '/project/:id/interface/api',
    initialPath: '/project/12/interface/api'
  });
  await flushEffects();

  // 挂载时按路由（无 actionId）拉取全量接口列表
  const fetchListAction = utils.dispatched.find(
    action => action.type === 'yapi/interface/FETCH_INTERFACE_LIST'
  );
  t.truthy(fetchListAction, '应派发 FETCH_INTERFACE_LIST action');
  t.true(getCalls.some(url => url.indexOf('/api/interface/list') === 0), '应请求接口列表接口');
  t.true(getCalls.every(url => url.indexOf('/api/interface/list_cat') !== 0), '不应请求分类列表');

  // 表格标题与两行接口数据
  const html = utils.container.innerHTML;
  t.true(html.indexOf('全部接口共 (2) 个') !== -1, '标题应展示全部接口计数');
  t.true(html.indexOf('/project/12/interface/api/100') !== -1, '应渲染接口一详情链接');
  t.true(html.indexOf('接口二') !== -1, '应渲染第二行接口');
});

test.serial('InterfaceList 分类路由按 catid 拉取分类接口并回显分类名', async t => {
  const getCalls = [];
  axios.get = async (url, config) => {
    getCalls.push({ url, config });
    return { data: { errcode: 0, data: { count: 1, list: [] } } };
  };

  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(InterfaceList), {
    seedState: LIST_SEED,
    routePath: '/project/:id/interface/api/:actionId',
    initialPath: '/project/12/interface/api/cat_5'
  });
  await flushEffects();

  const fetchCatListAction = utils.dispatched.find(
    action => action.type === 'yapi/interface/FETCH_INTERFACE_CAT_LIST'
  );
  t.truthy(fetchCatListAction, '应派发 FETCH_INTERFACE_CAT_LIST action');
  const catCall = getCalls.find(call => call.url.indexOf('/api/interface/list_cat') === 0);
  t.truthy(catCall, '应请求分类下接口列表');
  t.is(String(catCall.config.params.catid), '5', '请求应携带 catid=5');
  t.is(String(catCall.config.params.page), '1', '首次请求页码应为 1');

  // 分类名取自 currProject.cat 中匹配 catid 的分类
  t.true(
    utils.container.innerHTML.indexOf('分类五共 (1) 个') !== -1,
    '标题应展示分类名与计数'
  );
});

test.serial('InterfaceList 点击添加接口按钮打开弹窗', async t => {
  axios.get = async () => ({ data: { errcode: 0, data: { count: 0, list: [] } } });

  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(InterfaceList), {
    seedState: LIST_SEED,
    routePath: '/project/:id/interface/api',
    initialPath: '/project/12/interface/api'
  });
  await flushEffects();

  t.true(utils.container.innerHTML.indexOf('添加接口') !== -1, '应存在添加接口按钮');
  // 弹窗未打开时不应渲染 Modal 标题
  t.is(utils.baseElement.querySelector('.ant-modal-title'), null);

  const addBtn = utils.container.querySelector('.ant-btn-primary');
  t.truthy(addBtn, '应找到添加接口按钮');
  await fireEvent.click(addBtn);

  const modalTitle = utils.baseElement.querySelector('.ant-modal-title');
  t.truthy(modalTitle, '点击后应弹出 Modal');
  t.is(modalTitle.textContent, '添加接口');
});

test.serial('View 渲染接口详情完整信息', async t => {
  seedGroupStore();
  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(View), {
    seedState: VIEW_SEED,
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects();

  const html = utils.container.innerHTML;
  t.true(html.indexOf('基本信息') !== -1, '应渲染基本信息标题');
  t.true(html.indexOf('接口一') !== -1, '应渲染接口名称');
  t.true(html.indexOf('已完成') !== -1, '应渲染接口状态');
  t.true(html.indexOf('GET') !== -1, '应渲染请求方式');
  t.true(html.indexOf('/base/api/a') !== -1, '应拼接 basepath 渲染接口路径');
  t.true(html.indexOf('Content-Type') !== -1, '应渲染 Headers 表格');
  t.true(html.indexOf('请求参数') !== -1, '应渲染请求参数区块');
  t.true(html.indexOf('业务线') !== -1, '应渲染自定义字段');
  t.true(
    html.indexOf('data-data="{&quot;a&quot;:1}"') !== -1,
    '返回数据应传入 AceEditor（json 文本）'
  );
});

test.serial('View 无 title 时挂载后展示暂无数据兜底', async t => {
  seedGroupStore();
  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(View), {
    seedState: { ...VIEW_SEED, inter: { ...VIEW_SEED.inter, curdata: {} } },
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects();

  const html = utils.container.innerHTML;
  t.true(html.indexOf('暂无数据') !== -1, '应渲染 ErrMsg noData 兜底');
  t.true(html.indexOf('基本信息') === -1, '不应渲染详情内容');
});

test.serial('View 无请求参数时隐藏请求参数区块', async t => {
  const emptyReqData = { ...CURDATA };
  delete emptyReqData.req_headers;
  delete emptyReqData.req_params;
  delete emptyReqData.req_query;
  delete emptyReqData.req_body_form;
  delete emptyReqData.desc;
  delete emptyReqData.custom_field_value;

  seedUserProjectStores();
  const utils = renderWithProviders(React.createElement(View), {
    seedState: { ...VIEW_SEED, inter: { ...VIEW_SEED.inter, curdata: emptyReqData } },
    initialPath: '/project/12/interface/api/100'
  });
  await flushEffects();

  const html = utils.container.innerHTML;
  const headings = Array.from(utils.container.querySelectorAll('.interface-title'));
  const reqHeading = headings.find(node => node.textContent === '请求参数');
  t.truthy(reqHeading, '应存在请求参数标题');
  t.is(reqHeading.style.display, 'none', '无请求数据时请求参数标题应隐藏');
  t.true(html.indexOf('Headers：') === -1, '不应渲染 Headers 表格');
  t.true(html.indexOf('Query：') === -1, '不应渲染 Query 表格');
  // 注意：隐藏的 Body 表格列头文案仍存在于 innerHTML，须按 h2 标题精确断言
  t.is(
    headings.find(node => node.textContent === '备注'),
    undefined,
    '无描述时不应渲染备注区块'
  );
});

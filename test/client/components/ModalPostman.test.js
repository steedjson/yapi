// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: ModalPostman } = require('../../../client/components/ModalPostman/index.js');
// interfaceCol 切片已迁至 Zustand（批次3）：VariablesSelect 经 useInterfaceColStore 读取
const useInterfaceColStore = require('../../../client/store/interfaceColStore').default;

// VariablesSelect(envType='case')挂载即请求用例变量数据,
// 每个用例都必须先打桩(axios 为 CJS 单例,生产代码调用时才读取 .get,替换属性即可生效)
const originalAxiosGet = axios.get;

// 测试集合用例数据:VariablesSelect 拉取后按 index 排序,仅保留位于
// props.id 之前(不含当前用例)的用例作为变量树数据源
const CURR_CASE_ID = 421;
const CASE_RECORDS = [
  { _id: 420, index: 0, casename: '登录用例', params: { username: 'admin' }, body: { token: 'abc' } },
  { _id: 421, index: 1, casename: '下单用例', params: {}, body: {} }
];

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
  useInterfaceColStore.setState(INITIAL_INTERFACE_COL_STATE);
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 在 act 中等待异步副作用(axios promise → redux-promise fulfilled 二次派发 → setState)完成
async function flushEffects(ms) {
  await act(async () => {
    await sleep(ms == null ? 15 : ms);
  });
}

function makeStore(seedState) {
  return applyMiddleware(promiseMiddleware)(createStore)(function(state) {
    return state === undefined ? seedState : state;
  }, seedState);
}

// VariablesSelect 经 useInterfaceColStore 读取 currColId 并发起请求,
// redux store 仅作 Provider 占位（剩余切片不再被本组件消费）
function renderModalPostman(props) {
  useInterfaceColStore.setState({ ...INITIAL_INTERFACE_COL_STATE, currColId: CURR_CASE_ID });
  const okValues = [];
  const cancelCalls = [];
  const utils = render(
    <Provider store={makeStore({})}>
      <ModalPostman
        visible={true}
        handleOk={val => {
          okValues.push(val);
        }}
        handleCancel={() => {
          cancelCalls.push(true);
        }}
        inputValue=""
        envType="case"
        id={CURR_CASE_ID}
        {...props}
      />
    </Provider>
  );
  // 弹窗经 antd Modal 传送到 document.body,查询须基于 document
  const doc = utils.container.ownerDocument;
  return Object.assign({ okValues, cancelCalls, doc }, utils);
}

function getExpressionItem(doc) {
  return doc.querySelector('.expression-item');
}

function getModalFooterButtons(doc) {
  return Array.from(doc.querySelectorAll('.ant-modal-footer button'));
}

// 点击指定标题的折叠面板头,切换 activeKey
function openCollapsePanel(doc, panelTitle) {
  const header = Array.from(doc.querySelectorAll('.mock-title')).find(
    el => el.textContent.indexOf(panelTitle) > -1
  );
  if (!header) {
    throw new Error('找不到折叠面板标题: ' + panelTitle);
  }
  fireEvent.click(header.closest('.ant-collapse-header'));
}

test.serial('visible=true 渲染弹窗、标题与 常量/mock数据/变量 三个折叠面板', async t => {
  const getUrls = [];
  axios.get = url => {
    getUrls.push(url);
    return Promise.resolve({ data: { errcode: 0, data: CASE_RECORDS } });
  };
  const { doc, container } = renderModalPostman();
  await flushEffects();

  t.truthy(doc.querySelector('.modal-postman .ant-modal'), 'visible=true 应渲染弹窗');
  // 标题节点为 <p><icon/> 高级参数设置</p>,图标后存在空白
  t.is(
    doc.querySelector('.ant-modal-title').textContent.trim(),
    '高级参数设置',
    '弹窗标题应为高级参数设置'
  );

  // "变量"标题含 &nbsp;,统一去除空白后比较
  const panelTitles = Array.from(doc.querySelectorAll('.mock-title')).map(el =>
    el.textContent.replace(/\s/g, '')
  );
  t.deepEqual(
    panelTitles,
    ['常量', 'mock数据', '变量'],
    'envType=case 应渲染 常量/mock数据/变量 三个折叠面板, 实际 DOM: ' + container.innerHTML
  );

  // 默认展开常量面板,渲染基础参数值输入框
  t.truthy(doc.querySelector('input[placeholder="基础参数值"]'), '常量面板应渲染输入框');
  t.is(getExpressionItem(doc).textContent, '{{  }}', '初始表达式应为空模板');

  // Collapse 非激活面板内容默认懒挂载:展开"变量"面板后 VariablesSelect 才挂载,
  // 此时按 currColId 拉取用例变量数据并渲染变量树
  openCollapsePanel(doc, '变量');
  await flushEffects();
  t.truthy(
    getUrls[0] === '/api/col/case_list_by_var_params?col_id=' + CURR_CASE_ID,
    '展开变量面板应按当前集合 id 请求用例变量数据'
  );
  await flushEffects();
  t.truthy(doc.body.textContent.indexOf('登录用例') > -1, '变量树应渲染当前用例之前的用例名');
});

test.serial('常量面板输入文本后,表达式输出区同步展示 {{ 常量文本 }}', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: CASE_RECORDS } });
  const { doc } = renderModalPostman();
  await flushEffects();

  const input = doc.querySelector('input[placeholder="基础参数值"]');
  fireEvent.change(input, { target: { value: 'hello' } });

  t.is(getExpressionItem(doc).textContent, '{{ hello }}', '表达式应同步常量输入');
  await flushEffects();
});

test.serial('点击插入按钮,handleOk 收到表达式模板字符串', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: CASE_RECORDS } });
  const { doc, okValues } = renderModalPostman();
  await flushEffects();

  const input = doc.querySelector('input[placeholder="基础参数值"]');
  fireEvent.change(input, { target: { value: 'hello' } });

  // antd Button 对两个中文字符的文案自动插入空格("插 入"),比较时先去除空白
  const okBtn = getModalFooterButtons(doc).find(
    btn => btn.textContent.replace(/\s/g, '') === '插入'
  );
  t.truthy(okBtn, '底部应渲染"插入"确认按钮');
  fireEvent.click(okBtn);

  t.deepEqual(okValues, ['{{ hello }}'], 'handleOk 应收到完整表达式模板');
  await flushEffects();
});

test.serial('点击取消按钮,handleCancel 被调用', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: CASE_RECORDS } });
  const { doc, cancelCalls } = renderModalPostman();
  await flushEffects();

  const cancelBtn = getModalFooterButtons(doc)[0];
  t.truthy(cancelBtn, '底部应渲染取消按钮');
  fireEvent.click(cancelBtn);

  t.is(cancelCalls.length, 1, '点击取消应调用一次 handleCancel');
  await flushEffects();
});

test.serial('mock面板支持搜索过滤并选中 @string,表达式随之更新', async t => {
  axios.get = () => Promise.resolve({ data: { errcode: 0, data: CASE_RECORDS } });
  const { doc } = renderModalPostman();
  await flushEffects();

  // 切换到 mock数据 面板
  openCollapsePanel(doc, 'mock数据');
  const searchInput = doc.querySelector('.mock-search input');
  t.truthy(searchInput, 'mock面板应渲染搜索输入框');

  // 搜索过滤:仅剩包含 str 的 @string
  fireEvent.change(searchInput, { target: { value: 'str' } });
  const rows = Array.from(doc.querySelectorAll('.modal-postman-form-mock .row'));
  t.deepEqual(
    rows.map(row => row.textContent),
    ['@string'],
    '搜索 str 应仅剩 @string 一项, 实际: ' + JSON.stringify(rows.map(r => r.textContent))
  );

  // 选中 @string,表达式更新为 {{ @string }}
  fireEvent.click(rows[0]);
  t.is(getExpressionItem(doc).textContent, '{{ @string }}', '选中 mock 项后表达式应更新');
  await flushEffects();
});

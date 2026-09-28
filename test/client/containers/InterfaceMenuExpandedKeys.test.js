// InterfaceMenu expandedKeys 用户收起意图记忆回归（csl-tester 补充）。
//
// 背景：修复前渲染期 defaultExpandedKeys 每次都把当前选中目标（接口/分类）的
// activePath 并回 state.expands，用户对选中目标所在分类的收起会被静默还原。
// 修复以三个 ref 协调：userCollapsedRef（用户收起的分类 key，渲染期 union 后统一
// 剔除）、lastExpandsRef（最近一次下发给 Tree 的展开集，onExpand 以其为基准求
// 差集）、prevTargetRef（路由目标变化时清空收起记录）。本文件钉住四条不变量：
//   a) 选中接口所在分类可被用户收起，且同目标下任意重渲染不再被 union 还原；
//   b) 收起后的重新展开从收起记录删除，展开态跨重渲染保持；再次收起仍生效；
//   c) 路由目标变化清空收起记忆：新目标祖先链自动展开；同目标（分类分支）下
//      收起仍可经渲染期过滤保持；
//   d) 搜索分支同步 lastExpandsRef：搜索态下的收起意图在清空搜索后生效，且不
//      误伤当前活跃目标的祖先链（基准过期时 onExpand 会把未展开项错记为收起）。
//
// 组件挂载依赖真实 interfaceStore：挂载 effect 会 initInterface() 清空切片，
// 分类树经本文件打桩的 /api/interface/get_cat_tree 回填；接口详情（curdata）
// 生产上由父容器 fetchInterfaceData 写入，本文件在挂载后按此时序 setState 回填。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, renderWithProviders, flushEffects, waitFor } from '../../helpers/containers';

const axios = require('axios');

const { default: InterfaceMenu } = require('../../../client/containers/Project/Interface/InterfaceList/InterfaceMenu.js');
// 与生产组件共享同一模块实例（babel CJS 转译后命中同一 require 缓存）
const useInterfaceStore = require('../../../client/store/interfaceStore').default;
const { resetInterfaceStore } = require('../../helpers/interfaceStores');
const { resetUserProjectStores } = require('../../helpers/userProjectStores');

const originalAxiosGet = axios.get;

const TREE = [
  {
    _id: 1,
    name: '分类A',
    list: [{ _id: 61, title: '接口一', catid: 1, method: 'GET', path: '/api/a' }]
  },
  {
    _id: 2,
    name: '分类B',
    list: [{ _id: 62, title: '接口二', catid: 2, method: 'POST', path: '/api/b' }]
  }
];

const INTER_61 = { _id: 61, catid: 1, title: '接口一', method: 'GET', path: '/api/a' };

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  resetInterfaceStore();
  resetUserProjectStores();
});

// 分类树菜单接口打桩（挂载 effect 的 fetchInterfaceListMenu 消费）
function stubCatTree() {
  axios.get = (/** @type {any} */ url) => {
    if (String(url).indexOf('/api/interface/get_cat_tree') === 0) {
      return Promise.resolve({ data: { errcode: 0, data: TREE } });
    }
    return Promise.resolve({ data: { errcode: 0, data: {} } });
  };
}

// 以指定路由目标（actionId：接口 id 或 'cat_x'）渲染菜单，路由形参满足 useParams().id。
// 目标切换经 Harness 内部 state 中继（生产上由父容器随路由重渲染下发新 router prop）：
// RTL 的 utils.rerender 会在根节点替换整棵树、绕过 MemoryRouter 上下文，故不能用。
// state 用对象承载（每次 setTarget 产生新引用），同值 setTarget 亦可强制重渲染，
// 用于钉「同目标下重渲染不还原收起」。
function renderMenu(actionId) {
  const control = { setTarget: null };
  function RouterHarness() {
    const [target, setTarget] = React.useState({ v: actionId });
    control.setTarget = next => setTarget({ v: next });
    return <InterfaceMenu projectId={11} router={{ params: { actionId: target.v } }} />;
  }
  const utils = renderWithProviders(<RouterHarness />, {
    routePath: '/project/:id/interface/api/*',
    initialPath: '/project/11/interface/api/' + actionId
  });
  utils.setTarget = next => {
    act(() => {
      control.setTarget(next);
    });
  };
  return utils;
}

// 挂载并等分类树就绪；interPatch 用于按生产时序回填接口详情（父容器职责）
async function mountMenu(actionId, interPatch) {
  stubCatTree();
  const utils = renderMenu(actionId);
  await waitFor(() => rowByText(utils.container, '分类A'), '挂载后分类树应渲染');
  if (interPatch) {
    await act(async () => {
      useInterfaceStore.setState({ curdata: interPatch });
    });
    await flushEffects();
  }
  return utils;
}

function rowByText(container, text) {
  return Array.from(container.querySelectorAll('.ant-tree-treenode')).find(
    row => row.textContent.indexOf(text) !== -1
  );
}

function switcherOf(row) {
  return row.querySelector('.ant-tree-switcher:not(.ant-tree-switcher-noop)');
}

// 节点展开形态：absent=行不在 DOM；open/close=可展开节点的 switcher 形态
function switcherState(container, text) {
  const row = rowByText(container, text);
  if (!row) return 'absent';
  const sw = switcherOf(row);
  if (!sw) return 'leaf';
  if (sw.className.indexOf('ant-tree-switcher_open') !== -1) return 'open';
  if (sw.className.indexOf('ant-tree-switcher_close') !== -1) return 'close';
  return 'unknown';
}

function clickSwitcher(container, text) {
  const row = rowByText(container, text);
  fireEvent.click(switcherOf(row));
}

// ① 核心回归：选中接口所在分类可被收起，且同目标下重渲染不再被 activePath union 还原
test.serial('选中接口所在分类收起后保持收起，重渲染不被 activePath union 还原', async t => {
  const utils = await mountMenu('61', INTER_61);

  // 初始自动展开：目标接口的祖先链（分类A）展开，未选中的分类B收起
  t.is(switcherState(utils.container, '分类A'), 'open', '目标接口祖先链分类A应自动展开');
  t.is(switcherState(utils.container, '分类B'), 'close', '未选中分类B应保持收起');
  t.truthy(rowByText(utils.container, '接口一'), '展开后应渲染目标接口行');

  // 用户收起分类A
  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'close',
    '点击 switcher 后分类A应收起'
  );
  await waitFor(() => !rowByText(utils.container, '接口一'), '收起后接口一子行应移出 DOM');

  // 关键断言：同目标下强制重渲染，渲染期 union activePath 不得还原收起
  utils.setTarget('61');
  await flushEffects();
  t.is(
    switcherState(utils.container, '分类A'),
    'close',
    '重渲染后分类A应保持收起（userCollapsedRef 剔除生效）'
  );
  t.falsy(rowByText(utils.container, '接口一'), '重渲染后接口一不应重新出现');
});

// ② 重展开差集：再次展开从收起记录删除，展开态跨重渲染保持；再次收起仍生效
test.serial('收起后重新展开跨重渲染保持，且再次收起仍生效', async t => {
  const utils = await mountMenu('61', INTER_61);

  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'close',
    '分类A应先被用户收起'
  );

  // 再次展开：onExpand 差集应把分类A从收起记录删除
  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'open',
    '再次点击后分类A应展开'
  );
  await waitFor(() => Boolean(rowByText(utils.container, '接口一')), '展开后接口一应重新渲染');

  utils.setTarget('61');
  await flushEffects();
  t.is(
    switcherState(utils.container, '分类A'),
    'open',
    '重展开后重渲染应保持展开（收起记录已删除，不再被剔除）'
  );

  // 再次收起：幂等记忆，仍能收起并保持
  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'close',
    '再次收起分类A应生效'
  );
  utils.setTarget('61');
  await flushEffects();
  t.is(switcherState(utils.container, '分类A'), 'close', '再次收起后重渲染应保持收起');
});

// ③ 路由目标变化清空收起记忆：新目标祖先链自动展开；分类分支下同目标收起仍保持
test.serial('路由目标变化清空收起记忆并自动展开新目标祖先链', async t => {
  const utils = await mountMenu('61', INTER_61);

  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'close',
    '前置：分类A在接口目标下被用户收起'
  );

  // 目标切换为分类 cat_1：收起记录应清空，祖先链（自身）自动展开
  utils.setTarget('cat_1');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'open',
    '目标切换后应清空收起记忆并自动展开新目标'
  );

  // 新目标下再次收起，同目标重渲染应保持收起（分类分支的渲染期过滤）
  clickSwitcher(utils.container, '分类A');
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'close',
    '分类目标下用户收起应生效'
  );
  utils.setTarget('cat_1');
  await flushEffects();
  t.is(
    switcherState(utils.container, '分类A'),
    'close',
    '分类分支渲染期 union 后应剔除收起记录，同目标重渲染保持收起'
  );
});

// ④ 搜索分支同步 lastExpandsRef：搜索态收起意图在清空搜索后生效，且不误伤活跃目标祖先链
test.serial('搜索态收起意图在清空搜索后生效且不误伤活跃目标祖先链', async t => {
  const utils = await mountMenu('61', INTER_61);
  const filterInput = utils.container.querySelector('input[placeholder="搜索接口"]');
  t.truthy(filterInput, '应渲染搜索接口输入框');

  // 进入搜索态：仅保留命中的分类B，且搜索结果全展开（lastExpandsRef 同步为 res.arr）
  await act(async () => {
    fireEvent.change(filterInput, { target: { value: '接口二' } });
  });
  await waitFor(
    () => switcherState(utils.container, '分类B') === 'open',
    '搜索态下命中分类B应展开'
  );
  t.falsy(rowByText(utils.container, '分类A'), '搜索态下未命中分类A应被过滤出树');

  // 搜索态下用户收起分类B（onExpand 以搜索分支同步的展开集为基准，只记录 cat_2）
  clickSwitcher(utils.container, '分类B');
  await flushEffects();

  // 清空搜索回到普通模式：分类B的收起意图生效；活跃目标祖先链分类A不被误收起
  await act(async () => {
    fireEvent.change(filterInput, { target: { value: '' } });
  });
  await waitFor(
    () => switcherState(utils.container, '分类A') === 'open',
    '清空搜索后活跃目标祖先链分类A应展开（不得因 onExpand 基准过期被错记收起）'
  );
  t.is(
    switcherState(utils.container, '分类B'),
    'close',
    '清空搜索后分类B应保持搜索态下用户收起的意图'
  );
});

// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock, FakeWebSocket } = require('./setup');

const WIKI_PATH = '../../exts/yapi-plugin-wiki/wikiPage';

const WIKI_DATA = {
  desc: '<p>wiki正文</p>',
  markdown: 'wiki正文',
  username: 'carol',
  uid: 7,
  up_time: 1600000000
};

// project 切片已迁 Zustand（批次4）：currProject 改经 projectStore 播种
const { seedProjectStore, resetUserProjectStores } = require('../helpers/userProjectStores');

test.serial.afterEach.always(() => {
  resetUserProjectStores();
});

function renderWikiPage() {
  seedProjectStore({ currProject: { _id: 12, role: 'admin', switch_notice: true } });
  return renderWithProviders(React.createElement(require(WIKI_PATH).default), {
    routePath: '/project/:id/wiki',
    initialPath: '/project/12/wiki'
  });
}

/**
 * 装配到协同 ws 连接建立并发出 'start' 为止，返回可直推服务端帧的容器与桩。
 * 服务端 wikiConflict 授权语义（406/407 矩阵）见 wikiEditorLockOrphan.test.js；
 * 本文件只钉客户端对拒绝帧的分支消费。
 */
async function openConflictSocket() {
  FakeWebSocket.reset();
  axiosMock.setRoutes([
    { match: '/api/plugin/wiki_desc/get', respond: () => ({ errcode: 0, data: WIKI_DATA }) }
  ]);
  const { container } = renderWikiPage();
  await flushEffects();
  const ws = FakeWebSocket.created[0];
  ws.simulateOpen();
  return { container, ws };
}

test.serial('拒绝帧 errno=406+data=null：进入 DENIED 横幅，不按冲突对象读 data.uid', async t => {
  const { container, ws } = await openConflictSocket();
  t.deepEqual(ws.sent, ['start']);

  // data 为 null：若误落冲突分支读 result.data.uid，将在此同步抛 TypeError
  ws.onmessage({ data: JSON.stringify({ errno: 406, data: null, errmsg: '没有权限' }) });
  await flushEffects(30);

  t.regex(container.textContent, /没有权限编辑该wiki/);
  t.false(/正在编辑该wiki/.test(container.textContent), 'DENIED 不是 busy 冲突态');
  t.false(/bob/.test(container.textContent), 'editUid/editName 已清空，不残留持锁人');

  cleanup();
  cleanupDom();
});

test.serial('busy 帧 errno=406+data=持锁人对象：仍按冲突横幅显示持锁人', async t => {
  const { container, ws } = await openConflictSocket();

  ws.onmessage({
    data: JSON.stringify({ errno: 406, data: { uid: 42, username: 'bob' }, errmsg: '没有权限' })
  });
  await flushEffects(30);

  t.regex(container.textContent, /正在编辑该wiki/);
  t.regex(container.textContent, /bob/);
  t.truthy(container.querySelector('a[href$="/user/profile/42"]'), '持锁人链接指向其 uid');
  t.false(/没有权限编辑该wiki/.test(container.textContent), '带持锁人数据的 406 不是 DENIED 态');

  cleanup();
  cleanupDom();
});

test.serial('未知帧 errno≠0/406 且 data=null：整体忽略，不崩溃也不改状态', async t => {
  const { container, ws } = await openConflictSocket();

  // 旧实现的兜底 else 会读 result.data.uid，data=null 时同步抛 TypeError；
  // 收紧后无匹配分支 → 忽略（若回退为裸 else，此处即红）
  ws.onmessage({ data: JSON.stringify({ errno: 500, data: null, errmsg: '内部错误' }) });
  await flushEffects(30);

  t.false(/没有权限编辑该wiki/.test(container.textContent), '不误入 DENIED');
  t.false(/正在编辑该wiki/.test(container.textContent), '不误入 busy 冲突态');
  t.truthy(/wiki正文/.test(container.textContent), '只读视图保持原状');

  cleanup();
  cleanupDom();
});
test.serial('WikiPage 空 data editor 帧进入首次创建编辑态', async t => {
  const { container, ws } = await openConflictSocket();
  ws.onmessage({ data: JSON.stringify({ errno: 0, data: null }) });
  await flushEffects(30);
  t.true(container.textContent.includes('更新'));
  t.false(container.textContent.includes('没有权限编辑该wiki'));
  cleanup();
  cleanupDom();
});

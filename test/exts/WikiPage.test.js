// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
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

function seedState() {
  return {
    project: { currProject: { _id: 12, role: 'admin', switch_notice: true } }
  };
}

function renderWikiPage() {
  return renderWithProviders(React.createElement(require(WIKI_PATH).default), {
    seedState: seedState(),
    routePath: '/project/:id/wiki',
    initialPath: '/project/12/wiki'
  });
}

function findButton(container, text) {
  return Array.from(container.querySelectorAll('button')).find(
    b => b.textContent.replace(/\s/g, '') === text
  );
}

test.serial('wiki WebSocket 降级路径：连接未建立时点击编辑仍可进入编辑器', async t => {
  FakeWebSocket.reset();
  axiosMock.setRoutes([
    { match: '/api/plugin/wiki_desc/get', respond: () => ({ errcode: 0, data: WIKI_DATA }) }
  ]);
  const { container } = renderWikiPage();
  await flushEffects();

  // 数据回填进只读视图
  t.regex(container.textContent, /wiki正文/);
  t.regex(container.textContent, /carol/);

  // 协同 ws 已构造但 onopen 未触发 → 组件侧连接未注册
  t.is(FakeWebSocket.created.length, 1);
  const ws = FakeWebSocket.created[0];
  t.regex(ws.url, /\/api\/ws_plugin\/wiki_desc\/solve_conflict\?id=12$/);
  t.deepEqual(ws.sent, []);

  // 点击编辑：走「websocket 启动不成功依旧可以编辑」降级路径
  fireEvent.click(findButton(container, '编辑'));
  await flushEffects(30);

  // 编辑器显出（更新/取消按钮在位），且未向 ws 发送 'editor'
  t.truthy(findButton(container, '更新'));
  t.truthy(findButton(container, '取消'));
  t.deepEqual(ws.sent, []);

  cleanup();
  cleanupDom();
});

test.serial('wiki 编辑提交路径：errno=0 推送切入编辑态，取消后发送 end（无 callback 的 end 发送路径）', async t => {
  FakeWebSocket.reset();
  axiosMock.setRoutes([
    { match: '/api/plugin/wiki_desc/get', respond: () => ({ errcode: 0, data: WIKI_DATA }) }
  ]);
  const { container } = renderWikiPage();
  await flushEffects();

  const ws = FakeWebSocket.created[0];
  // 连接建立（readyState → 1）
  ws.simulateOpen();
  t.deepEqual(ws.sent, ['start']);

  // 服务端推送 errno=0：更新内容并切入编辑态（status='CLOSE'）
  ws.onmessage({ data: JSON.stringify({ errno: 0, data: { desc: '<p>新版正文</p>', username: 'dave', uid: 8, up_time: 1600001000 } }) });
  await flushEffects(30);
  t.truthy(findButton(container, '更新'));

  // 点击取消：endWebSocket 在 status='CLOSE' 下发送 'end'；F 批已为
  // handleWebsocketAccidentClose 补 callback 存在性守卫（旧实现在此处抛 TypeError
  // 并被外层 try/catch 静默吞掉），对外行为不变——'end' 仍发出、连接不关闭
  fireEvent.click(findButton(container, '取消'));
  await flushEffects(30);

  // 取消后回到只读视图，'end' 已发出，连接未被 close（仅 unmount 时关闭）
  t.truthy(findButton(container, '编辑'));
  t.deepEqual(ws.sent, ['start', 'end']);
  t.false(ws.closed);

  cleanup();
  cleanupDom();
});

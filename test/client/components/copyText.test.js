// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { copyText } = require('../../../client/common.js');

// AVA 默认并发执行同一文件内的用例，而本文件读写 navigator/document 全局，必须串行。
test.serial.afterEach.always(() => {
  cleanupDom();
});

function stubClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true
  });
}

function stubExecCommand(impl) {
  Object.defineProperty(document, 'execCommand', {
    value: impl,
    configurable: true,
    writable: true
  });
}

test.serial('a) clipboard.writeText 可用时直接写入, 不触碰 execCommand 降级分支', async t => {
  const written = [];
  let execCalls = 0;
  stubClipboard({
    writeText(text) {
      written.push(text);
      return Promise.resolve();
    }
  });
  stubExecCommand(() => {
    execCalls++;
    return true;
  });

  await copyText('hello-yapi');

  t.deepEqual(written, ['hello-yapi'], 'writeText 应被调用一次且收到原始文本');
  t.is(execCalls, 0, 'Clipboard API 成功时不应降级到 execCommand');
});

test.serial('b) writeText reject 时降级 execCommand, 并原样返回其布尔结果', async t => {
  stubClipboard({
    writeText() {
      return Promise.reject(new Error('permission denied'));
    }
  });

  const seen = [];
  let execCalls = 0;
  const execResult = [true, false];
  stubExecCommand(() => {
    const textarea = document.querySelector('textarea');
    seen.push(textarea ? textarea.value : null);
    return execResult[execCalls++];
  });

  t.true(await copyText('fallback-ok'), 'execCommand 返回 true 时应解析为 true');
  t.false(await copyText('fallback-fail'), 'execCommand 返回 false 时应解析为 false');

  t.is(execCalls, 2, '两次 writeText 失败都应触发降级');
  t.deepEqual(seen, ['fallback-ok', 'fallback-fail'], '降级写入的文本应与入参一致');
});

test.serial('c) 无 navigator.clipboard 时走 fallback: 建 textarea + execCommand + 清理 DOM', async t => {
  t.is(navigator.clipboard, undefined, '前置隔离：上一用例注入的 clipboard stub 应已被清理');

  const bodyChildrenBefore = document.body.childNodes.length;
  let execCalls = 0;
  let textareaDuringCall = null;

  stubExecCommand(() => {
    execCalls++;
    textareaDuringCall = document.querySelector('textarea');
    return true;
  });

  t.true(await copyText('no-clipboard-api'));

  t.is(execCalls, 1, '应调用 execCommand 一次');
  t.truthy(textareaDuringCall, 'execCommand 执行时应已存在临时 textarea');
  t.is(textareaDuringCall.value, 'no-clipboard-api', '临时 textarea 的 value 应为待复制文本');
  t.is(textareaDuringCall.getAttribute('readonly'), '', '临时 textarea 应为 readonly');
  t.is(document.body.childNodes.length, bodyChildrenBefore, 'body 中不得残留临时节点');
  t.is(document.querySelector('textarea'), null, '临时 textarea 已被 removeChild');
});

test.serial('d) execCommand 抛错时返回 false 且不向外抛出, 并仍清理 DOM', async t => {
  t.is(navigator.clipboard, undefined, '前置隔离：clipboard stub 应已被清理');

  const bodyChildrenBefore = document.body.childNodes.length;
  stubExecCommand(() => {
    throw new Error('execCommand is not allowed');
  });

  const result = await copyText('boom');

  t.false(result, 'execCommand 抛错应被吞掉并返回 false');
  t.is(document.querySelector('textarea'), null, '抛错路径同样不得残留 textarea');
  t.is(document.body.childNodes.length, bodyChildrenBefore, '抛错路径同样不得残留节点');
});

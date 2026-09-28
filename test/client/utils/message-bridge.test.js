// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { cleanupDom } from '../../helpers/jsdom-setup';

// message App 上下文批：桥接模块回归测试。
// 覆盖四个边界：① 未注册回退静态 message（与旧行为等价）；
// ② 注册/注销时序守卫（旧实例 effect 清理不得误清新实例）；
// ③ 7 方法同签名透传（args 与返回值，含 open 的 config 形态与 destroy(key)）；
// ④ MessageBridgeRegistrar 生命周期：注册→路由实例、卸载→回退静态，
//    并固化 <AntdApp component={false}> 不向容器注入包裹 DOM 的契约。
const {
  message,
  registerAppMessage,
  unregisterAppMessage,
  MessageBridgeRegistrar
} = require('../../../client/utils/message-bridge.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const flushEffects = async () => {
  await act(async () => {
    await sleep(0);
  });
};

// 与 JsonSchemaEditor.test.js 的打桩先例一致：对 antd.message 做可写属性打桩。
// 桥的回退路径在调用时惰性读取 antd.message[name]，属性打桩在桥路径下依然生效。
function stubStaticMethod(methodName) {
  const antd = require('antd');
  const original = antd.message[methodName];
  const calls = [];
  antd.message[methodName] = (...args) => {
    calls.push(args);
    return 'static-stub-result';
  };
  return {
    calls,
    restore() {
      antd.message[methodName] = original;
    }
  };
}

test.serial.afterEach(() => {
  cleanup();
  cleanupDom();
});

test.serial('未注册实例时回退 antd 静态 message（与旧行为等价）', t => {
  const stub = stubStaticMethod('success');
  try {
    const returned = message.success('fallback-toast');
    t.deepEqual(stub.calls, [['fallback-toast']], '未注册时应转发到静态 message.success');
    t.is(returned, 'static-stub-result', '回退路径返回值应透传');
  } finally {
    stub.restore();
  }
});

test.serial('注册/注销时序守卫:旧实例的注销不得误清新实例', t => {
  const callsA = [];
  const callsB = [];
  const instanceA = { success: (...args) => callsA.push(args) };
  const instanceB = { success: (...args) => callsB.push(args) };

  registerAppMessage(instanceA);
  registerAppMessage(instanceB);
  message.success('routed');
  t.deepEqual(callsB, [['routed']], '后注册实例应生效');
  t.deepEqual(callsA, [], '先注册实例不应再被调用');

  // 模拟 React 卸载时序:新实例 B 的 effect 已注册,旧实例 A 的 effect 清理后才执行
  unregisterAppMessage(instanceA);
  message.success('still-b');
  t.deepEqual(callsB, [['routed'], ['still-b']], '旧实例注销后路由不得清空新实例');

  unregisterAppMessage(instanceB);
  const stub = stubStaticMethod('success');
  try {
    message.success('back-to-static');
    t.deepEqual(stub.calls, [['back-to-static']], '全部注销后应回退静态 message');
  } finally {
    stub.restore();
  }
});

test.serial('7 方法签名与返回值透传', t => {
  const recorded = {};
  const sentinel = { sentinel: true };
  const fakeInstance = {};
  ['success', 'error', 'warning', 'info', 'open', 'loading', 'destroy'].forEach(name => {
    fakeInstance[name] = (...args) => {
      recorded[name] = args;
      return sentinel;
    };
  });
  registerAppMessage(fakeInstance);
  try {
    t.deepEqual(
      Object.keys(message).sort(),
      ['destroy', 'error', 'info', 'loading', 'open', 'success', 'warning'],
      '桥应与 antd 静态 message 同形(7 方法)'
    );
    const payload = { content: 'open-config' };
    const noop = () => {};
    t.is(message.success('ok', 2, noop), sentinel, 'success 返回值应透传');
    t.is(message.error({ content: 'err' }), sentinel, 'error 的 config 形态应透传');
    t.is(message.warning('warn'), sentinel, 'warning 返回值应透传');
    t.is(message.info('info'), sentinel, 'info 返回值应透传');
    t.is(message.open(payload), sentinel, 'open 的 config 形态应透传');
    t.is(message.loading('loading'), sentinel, 'loading 返回值应透传');
    t.is(message.destroy('antd-message-key'), sentinel, 'destroy(key) 应透传');

    t.is(recorded.success.length, 3, 'success 三参形态(jointContent/duration/onClose)');
    t.is(recorded.success[0], 'ok');
    t.is(recorded.success[1], 2);
    t.is(recorded.success[2], noop);
    t.deepEqual(recorded.error, [{ content: 'err' }]);
    t.deepEqual(recorded.warning, ['warn'], 'warning 单参形态');
    t.is(recorded.open[0], payload, 'open 的 config 实参应保持同一引用');
    t.deepEqual(recorded.loading, ['loading']);
    t.deepEqual(recorded.destroy, ['antd-message-key']);
  } finally {
    unregisterAppMessage(fakeInstance);
  }
});

test.serial('实例缺少对应方法时按方法粒度回退静态 message', t => {
  const callsPartial = [];
  const partialInstance = { success: (...args) => callsPartial.push(args) };
  registerAppMessage(partialInstance);
  const stub = stubStaticMethod('open');
  try {
    message.success('from-partial');
    t.deepEqual(callsPartial, [['from-partial']], '实例已有的方法应路由到实例');
    const config = { content: 'static-open' };
    message.open(config);
    t.deepEqual(stub.calls, [[config]], '实例缺失的方法应按方法粒度回退静态');
  } finally {
    stub.restore();
    unregisterAppMessage(partialInstance);
  }
});

test.serial('MessageBridgeRegistrar:零包裹 DOM、实例路由、卸载回退静态', async t => {
  const stub = stubStaticMethod('success');
  try {
    // component=false 契约:被测子树容器不得出现 AntdApp 注入的包裹节点
    const first = render(
      <AntdApp component={false}>
        <MessageBridgeRegistrar />
        <div data-testid="probe" />
      </AntdApp>
    );
    t.is(first.container.childElementCount, 1, '容器内应只有业务子节点本身');
    t.is(
      first.container.firstElementChild.getAttribute('data-testid'),
      'probe',
      '业务子节点应是容器的直接子节点(无包裹 div)'
    );
    t.is(document.body.querySelector('.ant-app'), null, 'component=false 不得渲染 .ant-app 包裹节点');

    await flushEffects();
    await act(async () => {
      message.success('instance-toast');
    });
    await flushEffects();
    t.deepEqual(stub.calls, [], '注册后不得再走静态 message');
    const holder = document.body.querySelector('.ant-message');
    t.truthy(holder, '实例路径下 document.body 应出现 .ant-message 容器');
    t.is(holder.textContent, 'instance-toast', '实例路径 toast 文案应渲染');

    // 卸载注册器(effect 清理注销)后回退静态
    first.unmount();
    await flushEffects();
    await act(async () => {
      message.success('static-again');
    });
    t.deepEqual(stub.calls, [['static-again']], '卸载注册器后应回退静态 message');
  } finally {
    stub.restore();
  }
});

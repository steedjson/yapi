// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

// finishStudy() 的 payload 是 axios.get('/api/user/up_study')，测试中必须拦截，
// 否则会发起真实网络请求。axios 为 CJS 单例（无 __esModule），
// 生产代码在调用时才读取 .get，因此替换属性即可生效。
const axios = require('axios');
const originalAxiosGet = axios.get;
const axiosGetCalls = [];

// user 切片已迁 Zustand（批次4）：点击行为改断言 userStore 状态变化，
// 不再经 redux dispatch（组件测试无需 redux Provider）
const { default: useUserStore } = require('../../../client/store/userStore');
const { resetUserProjectStores } = require('../../helpers/userProjectStores');

const { default: GuideBtns } = require('../../../client/components/GuideBtns/GuideBtns.js');

test.serial.before(() => {
  axios.get = function(url) {
    axiosGetCalls.push(url);
    return Promise.resolve({ data: {} });
  };
});

test.serial.after.always(() => {
  axios.get = originalAxiosGet;
});

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axiosGetCalls.length = 0;
  resetUserProjectStores();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms || 0));
}

function renderGuideBtns(isLast) {
  return render(<GuideBtns isLast={isLast} />);
}

test.serial('isLast 为假时点「下一步」只推进 studyTip', t => {
  resetUserProjectStores();
  const { unmount } = renderGuideBtns(false);

  t.truthy(screen.getByRole('button', { name: '下一步' }), '非末步按钮文案应为「下一步」');
  t.is(screen.queryByRole('button', { name: '完 成' }), null);

  fireEvent.click(screen.getByRole('button', { name: '下一步' }));

  const state = useUserStore.getState();
  t.is(state.studyTip, 1, '非末步点击「下一步」studyTip 应 +1');
  t.false(state.study, '非末步不得完成引导（study 仍为 false）');
  t.is(
    axiosGetCalls.length,
    0,
    '非末步不得发起 up_study 请求（证明确实未触网）, 实际: ' + JSON.stringify(axiosGetCalls)
  );
  unmount();
});

test.serial('isLast 为真时点「完 成」先推进 studyTip 并触发 finishStudy', async t => {
  resetUserProjectStores();
  const { unmount } = renderGuideBtns(true);

  t.truthy(screen.getByRole('button', { name: '完 成' }), '末步按钮文案应为「完 成」');
  t.is(screen.queryByRole('button', { name: '下一步' }), null);

  fireEvent.click(screen.getByRole('button', { name: '完 成' }));
  // finishStudy 为异步动作：等 promise 链落地后再断言 store 状态
  await sleep(5);
  const state = useUserStore.getState();
  t.true(state.study, '末步完成后 study 应置 true');
  t.is(state.studyTip, 0, '完成后 studyTip 应归零');
  t.deepEqual(axiosGetCalls, ['/api/user/up_study'], 'finishStudy 应上报 up_study');
  unmount();
});

test.serial('点「退出指引」只触发 finishStudy', async t => {
  resetUserProjectStores();
  const { unmount } = renderGuideBtns(false);

  fireEvent.click(screen.getByRole('button', { name: '退出指引' }));
  await sleep(5);
  t.deepEqual(axiosGetCalls, ['/api/user/up_study']);
  t.true(useUserStore.getState().study, '退出指引应完成引导');

  // 再次点击应继续触发，验证按钮未被禁用
  fireEvent.click(screen.getByRole('button', { name: '退出指引' }));
  await sleep(5);
  t.deepEqual(axiosGetCalls, ['/api/user/up_study', '/api/user/up_study']);
  unmount();
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { cleanupDom } from '../../helpers/jsdom-setup';

// finishStudy() 的 payload 是 axios.get('/api/user/up_study')，测试中必须拦截，
// 否则会发起真实网络请求。axios 为 CJS 单例（无 __esModule），
// 生产代码在调用时才读取 .get，因此替换属性即可生效。
const axios = require('axios');
const originalAxiosGet = axios.get;
const axiosGetCalls = [];

// 动作类型常量取自 client/reducer/modules/user.js，按线上契约硬编码断言
const CHANGE_STUDY_TIP = 'yapi/user/CHANGE_STUDY_TIP';
const FINISH_STUDY = 'yapi/user/FINISH_STUDY';

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
});

// reducer 只记录动作类型序列，用于断言点击产生的 dispatch 契约
function createRecordingStore() {
  return createStore(function(state, action) {
    if (state === undefined) {
      return [];
    }
    return state.concat(action.type);
  });
}

function renderGuideBtns(isLast) {
  const store = createRecordingStore();
  const utils = render(
    <Provider store={store}>
      <GuideBtns isLast={isLast} />
    </Provider>
  );
  return Object.assign({ store }, utils);
}

test.serial('isLast 为假时点「下一步」只派发 changeStudyTip', t => {
  const { store } = renderGuideBtns(false);

  t.truthy(screen.getByRole('button', { name: '下一步' }), '非末步按钮文案应为「下一步」');
  t.is(screen.queryByRole('button', { name: '完 成' }), null);

  fireEvent.click(screen.getByRole('button', { name: '下一步' }));

  // 负向断言放在精确序列断言之前，保证它本身也是首道防线而非被前序断言遮蔽的死代码
  t.false(
    store.getState().includes(FINISH_STUDY),
    '非末步点击「下一步」不得派发 FINISH_STUDY, 实际动作序列: ' + JSON.stringify(store.getState())
  );
  t.is(
    axiosGetCalls.length,
    0,
    '非末步不得发起 up_study 请求（证明确实未触网）, 实际: ' + JSON.stringify(axiosGetCalls)
  );
  t.deepEqual(store.getState(), [CHANGE_STUDY_TIP], '非末步动作序列应恰好为 changeStudyTip');
});

test.serial('isLast 为真时点「完 成」依次派发 changeStudyTip 与 finishStudy', t => {
  const { store } = renderGuideBtns(true);

  t.truthy(screen.getByRole('button', { name: '完 成' }), '末步按钮文案应为「完 成」');
  t.is(screen.queryByRole('button', { name: '下一步' }), null);

  fireEvent.click(screen.getByRole('button', { name: '完 成' }));

  t.deepEqual(store.getState(), [CHANGE_STUDY_TIP, FINISH_STUDY], '末步应追加 finishStudy 且顺序在前者之后');
  t.deepEqual(axiosGetCalls, ['/api/user/up_study'], 'finishStudy 应上报 up_study');
});

test.serial('点「退出指引」只派发 finishStudy', t => {
  const { store } = renderGuideBtns(false);

  fireEvent.click(screen.getByRole('button', { name: '退出指引' }));

  t.deepEqual(store.getState(), [FINISH_STUDY], '退出指引不应派发 changeStudyTip');
  t.deepEqual(axiosGetCalls, ['/api/user/up_study']);

  // 再次点击应继续派发，验证按钮未被禁用
  fireEvent.click(screen.getByRole('button', { name: '退出指引' }));
  t.deepEqual(store.getState(), [FINISH_STUDY, FINISH_STUDY]);
});

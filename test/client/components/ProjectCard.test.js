// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import promiseMiddleware from 'redux-promise';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: ProjectCard } = require('../../../client/components/ProjectCard/ProjectCard.js');
// user 切片已迁 Zustand（批次4）：uid 改经 useUserStore 播种；
// project.currPage stale 订阅已随迁移移除。follow 模块仍未迁移，Provider 保留。
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');

// addFollow/delFollow 的 payload 是 axios 请求，测试必须拦截（axios 为 CJS 单例，
// 生产代码调用时才读取 .post，替换属性即可生效）
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  // userStore 为模块级单例,复位避免用例间串场
  resetUserProjectStores();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 组件仍经 useDispatch 派发 follow 动作(follow 模块未迁移),
// store 与生产保持一致挂 redux-promise 中间件(组件依赖其 fulfilled 二次派发)。
// 记录通道有两条:入口 dispatch 包装记录原始 action;reducer 记录中间件二次派发的
// fulfilled action(redux-promise 不会让原始 promise payload action 到达 reducer)
function makeStore() {
  const dispatched = [];
  const record = action => {
    if (action && action.type && action.type.indexOf('@@') !== 0) {
      dispatched.push(action);
    }
  };
  const store = applyMiddleware(promiseMiddleware)(createStore)(function(state, action) {
    record(action);
    return state === undefined ? {} : state;
  }, {});
  const originalDispatch = store.dispatch;
  store.dispatch = action => {
    record(action);
    return originalDispatch(action);
  };
  return { store, dispatched };
}

function renderCard(projectData, options) {
  const opts = options || {};
  const { store, dispatched } = makeStore();
  seedUserStore({ uid: 11 });
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  const utils = render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={['/group']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <LocationProbe />
        <ProjectCard
          projectData={projectData}
          callbackResult={opts.callbackResult}
          isShow={opts.isShow}
        />
      </MemoryRouter>
    </Provider>
  );
  return Object.assign({ dispatched, getLocation: () => locationRef }, utils);
}

test.serial('渲染项目名称与项目图标, 点击卡片跳转项目页', t => {
  const { container, getLocation } = renderCard({
    _id: 101,
    name: '电商中台',
    icon: 'code-o',
    color: 'blue',
    follow: false
  });

  const title = container.querySelector('.ui-title');
  t.truthy(title, '应渲染标题, 实际 DOM: ' + container.innerHTML);
  t.is(title.textContent, '电商中台');
  t.is(title.getAttribute('title'), '电商中台');
  t.truthy(container.querySelector('.ui-logo svg'), '应渲染项目图标 svg');
  t.is(
    container.querySelector('.ui-logo').style.backgroundColor,
    'rgb(35, 149, 241)',
    'blue 主题色应映射为 #2395f1'
  );

  fireEvent.click(title);
  t.is(getLocation().pathname, '/project/101', '点击卡片应跳转 /project/:id');
});

test.serial('关注列表数据(projectid+projectname)兜底渲染与跳转', t => {
  const { container, getLocation } = renderCard({ projectid: 202, projectname: '仅关注数据' });

  const title = container.querySelector('.ui-title');
  t.is(title.textContent, '仅关注数据', '无 name 时应回落 projectname');

  fireEvent.click(container.querySelector('.m-card'));
  t.is(getLocation().pathname, '/project/202', '优先使用 projectid 跳转');
});

test.serial('未关注项目点击星标防抖触发 addFollow 并回调刷新', async t => {
  const postCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  let refreshCount = 0;
  const { container, dispatched } = renderCard(
    { _id: 101, name: '电商中台', follow: false },
    {
      callbackResult: () => {
        refreshCount++;
      }
    }
  );

  const star = container.querySelector('.card-btns');
  t.truthy(star, '应渲染星标操作区, 实际 DOM: ' + container.innerHTML);
  t.truthy(star.querySelector('.anticon-star'), '未关注渲染星形图标');
  t.truthy(star.querySelector('.anticon-star:not(.active)'), '未关注星标不带 active 类');

  fireEvent.click(star);
  // 400ms 防抖窗口内的重复点击只应生效一次
  fireEvent.click(star);
  await sleep(550);

  const addActions = dispatched.filter(a => a.type === 'yapi/follow/ADD_FOLLOW');
  // redux-promise: 原始 action(promise payload) + fulfilled action 各一条
  t.is(addActions.length, 2, '应派发原始与 fulfilled 两次 ADD_FOLLOW');
  t.is(addActions[1].payload.data.errcode, 0, 'fulfilled action 应携带成功响应');
  const addPosts = postCalls.filter(c => c.url === '/api/follow/add');
  t.is(addPosts.length, 1, '应只发起一次关注请求');
  t.deepEqual(
    addPosts[0].body,
    {
      uid: 11,
      projectid: 101,
      projectname: '电商中台',
      icon: 'code-o',
      color: '#2395f1'
    },
    '关注参数应取自项目数据与当前 uid(缺省 icon/color 用默认值)'
  );
  t.is(refreshCount, 1, 'errcode=0 后应回调 callbackResult 刷新列表');
});

test.serial('已关注项目点击星标防抖触发 delFollow', async t => {
  const postCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  let refreshCount = 0;
  const { container, dispatched } = renderCard(
    { _id: 101, name: '电商中台', follow: true },
    {
      callbackResult: () => {
        refreshCount++;
      }
    }
  );

  t.truthy(container.querySelector('.card-btns .icon.active'), '已关注星标带 active 类');

  fireEvent.click(container.querySelector('.card-btns'));
  await sleep(550);

  const delActions = dispatched.filter(a => a.type === 'yapi/follow/DEL_FOLLOW');
  // redux-promise: 原始 action(promise payload) + fulfilled action 各一条
  t.is(delActions.length, 2, '已关注项目点击应派发原始与 fulfilled 两次 DEL_FOLLOW');
  t.is(delActions[1].payload.data.errcode, 0);
  const delPosts = postCalls.filter(c => c.url === '/api/follow/del');
  t.is(delPosts.length, 1);
  t.deepEqual(delPosts[0].body, { projectid: 101 }, '取关参数应为项目 id');
  t.is(refreshCount, 1);
});

test.serial('isShow 控制复制项目按钮的渲染', t => {
  const withCopy = renderCard({ _id: 101, name: 'A', follow: false }, { isShow: true });
  t.truthy(withCopy.container.querySelector('.copy-btns'), 'isShow=true 应渲染复制按钮');
  withCopy.unmount();

  const withoutCopy = renderCard({ _id: 101, name: 'A', follow: false }, { isShow: false });
  t.is(withoutCopy.container.querySelector('.copy-btns'), null, 'isShow=false 不渲染复制按钮');
});

test.serial('纯渲染不派发任何 action', t => {
  const { dispatched } = renderCard({ _id: 303, name: '缺省图标', follow: false });

  t.is(dispatched.length, 0, '仅展示卡片不应派发 redux action');
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cleanupDom } from '../../helpers/jsdom-setup';

const axios = require('axios');
const { default: ProjectCard } = require('../../../client/components/ProjectCard/ProjectCard.js');
// follow 动作已迁 Zustand（收尾批）：断言从 redux dispatched 改为 followStore 状态
// 与 HTTP 请求计数；uid 经 useUserStore 播种（批次4）。
const { seedUserStore, resetUserProjectStores } = require('../../helpers/userProjectStores');
const { default: useFollowStore } = require('../../../client/store/followStore');

// addFollow/delFollow 成功后会内聚重拉关注列表（GET /api/follow/list），测试必须
// 同时拦截 axios.get/post（axios 为 CJS 单例，生产代码调用时才读取属性，替换即可生效）
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
  // userStore/followStore 均为模块级单例,复位避免用例间串场
  resetUserProjectStores();
  useFollowStore.setState({ data: [], loading: false, _uid: null });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderCard(projectData, options) {
  const opts = options || {};
  seedUserStore({ uid: 11 });
  let locationRef = null;
  function LocationProbe() {
    locationRef = useLocation();
    return null;
  }
  // Redux 已退役（收尾批）：组件树不再需要 Provider，仅保留路由上下文
  const utils = render(
    <MemoryRouter initialEntries={['/group']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LocationProbe />
      <ProjectCard
        projectData={projectData}
        callbackResult={opts.callbackResult}
        isShow={opts.isShow}
      />
    </MemoryRouter>
  );
  return Object.assign({ getLocation: () => locationRef }, utils);
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
  const getCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  axios.get = (url, config) => {
    getCalls.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  let refreshCount = 0;
  const { container } = renderCard({ _id: 101, name: '电商中台', follow: false }, {
    callbackResult: () => {
      refreshCount++;
    }
  });

  const star = container.querySelector('.card-btns');
  t.truthy(star, '应渲染星标操作区, 实际 DOM: ' + container.innerHTML);
  t.truthy(star.querySelector('.anticon-star'), '未关注渲染星形图标');
  t.truthy(star.querySelector('.anticon-star:not(.active)'), '未关注星标不带 active 类');

  fireEvent.click(star);
  // 400ms 防抖窗口内的重复点击只应生效一次
  fireEvent.click(star);
  await sleep(550);

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
  // 写后重拉内聚：addFollow 成功后 store 内部以 param.uid 重拉关注列表（替代旧
  // callbackResult 驱动的 redux 列表刷新；原 dispatched 断言随之迁移为请求计数）
  const listGets = getCalls.filter(c => c.url === '/api/follow/list');
  t.is(listGets.length, 1, 'addFollow 成功后应内聚重拉一次关注列表');
  t.deepEqual(listGets[0].params, { uid: 11 }, '重拉列表应携带当前 uid');
  t.deepEqual(useFollowStore.getState().data, [], '重拉响应应写入 followStore.data');
  t.is(useFollowStore.getState().loading, false, '请求收敛后 loading 应复位');
  t.is(refreshCount, 1, 'errcode=0 后应回调 callbackResult 刷新星标态');
});

test.serial('已关注项目点击星标防抖触发 delFollow', async t => {
  const postCalls = [];
  const getCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  axios.get = (url, config) => {
    getCalls.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  let refreshCount = 0;
  const { container } = renderCard({ _id: 101, name: '电商中台', follow: true }, {
    callbackResult: () => {
      refreshCount++;
    }
  });

  t.truthy(container.querySelector('.card-btns .icon.active'), '已关注星标带 active 类');

  fireEvent.click(container.querySelector('.card-btns'));
  await sleep(550);

  const delPosts = postCalls.filter(c => c.url === '/api/follow/del');
  t.is(delPosts.length, 1, '已关注项目点击应发起一次取关请求');
  t.deepEqual(delPosts[0].body, { projectid: 101 }, '取关参数应为项目 id');
  // followStore 未拉过列表时 _uid 为 null：delFollow 成功后跳过重拉（pattern 文档 §8 无害边界）
  t.is(getCalls.filter(c => c.url === '/api/follow/list').length, 0, '无列表上下文时不应触发重拉');
  t.is(refreshCount, 1, 'errcode=0 后应回调 callbackResult');
  t.is(useFollowStore.getState().loading, false, '请求收敛后 loading 应复位');
});

test.serial('addFollow 业务错误(errcode 非 0)不回调 callbackResult 且不重拉列表', async t => {
  const postCalls = [];
  const getCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 400, errmsg: '无权限操作' } });
  };
  axios.get = (url, config) => {
    getCalls.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  let refreshCount = 0;
  const { container } = renderCard({ _id: 101, name: '电商中台', follow: false }, {
    callbackResult: () => {
      refreshCount++;
    }
  });

  const star = container.querySelector('.card-btns');
  t.truthy(star, '应渲染星标操作区, 实际 DOM: ' + container.innerHTML);

  fireEvent.click(star);
  await sleep(550);

  t.is(postCalls.filter(c => c.url === '/api/follow/add').length, 1, '应发起一次关注请求');
  // 旧链路等价性：messageMiddleware 对业务错误 toast + throw → .then 跳过、cb 不执行；
  // 新链路 followStore 不抛错，由 ProjectCard 的 errcode === 0 门挡住 cb。两者对外
  // 可观察行为一致：callbackResult 不被调用（tester 收尾批补充的负例护栏）。
  t.is(refreshCount, 0, 'errcode 非 0 不应回调 callbackResult');
  t.is(
    getCalls.filter(c => c.url === '/api/follow/list').length,
    0,
    'errcode 非 0 时 followStore 不应内聚重拉关注列表'
  );
});

test.serial('delFollow 业务错误(errcode 非 0)不回调 callbackResult 且不重拉列表', async t => {
  const postCalls = [];
  const getCalls = [];
  axios.post = (url, body) => {
    postCalls.push({ url, body });
    return Promise.resolve({ data: { errcode: 400, errmsg: '无权限操作' } });
  };
  axios.get = (url, config) => {
    getCalls.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  let refreshCount = 0;
  const { container } = renderCard({ _id: 101, name: '电商中台', follow: true }, {
    callbackResult: () => {
      refreshCount++;
    }
  });

  fireEvent.click(container.querySelector('.card-btns'));
  await sleep(550);

  t.is(postCalls.filter(c => c.url === '/api/follow/del').length, 1, '应发起一次取关请求');
  // del 与 add 是两条独立 useMemo 回调，各自带 errcode === 0 门，负例需分别钉住
  t.is(refreshCount, 0, 'errcode 非 0 不应回调 callbackResult');
  t.is(
    getCalls.filter(c => c.url === '/api/follow/list').length,
    0,
    'errcode 非 0 时 followStore 不应内聚重拉关注列表'
  );
});

test.serial('isShow 控制复制项目按钮的渲染', t => {
  const withCopy = renderCard({ _id: 101, name: 'A', follow: false }, { isShow: true });
  t.truthy(withCopy.container.querySelector('.copy-btns'), 'isShow=true 应渲染复制按钮');
  withCopy.unmount();

  const withoutCopy = renderCard({ _id: 101, name: 'A', follow: false }, { isShow: false });
  t.is(withoutCopy.container.querySelector('.copy-btns'), null, 'isShow=false 不渲染复制按钮');
});

test.serial('纯渲染不发起任何 HTTP 请求', t => {
  const posts = [];
  const gets = [];
  axios.post = (url, body) => {
    posts.push({ url, body });
    return Promise.resolve({ data: { errcode: 0 } });
  };
  axios.get = (url, config) => {
    gets.push({ url, params: config && config.params });
    return Promise.resolve({ data: { errcode: 0, data: { list: [] } } });
  };
  renderCard({ _id: 303, name: '缺省图标', follow: false });

  t.is(posts.length + gets.length, 0, '仅展示卡片不应产生任何请求（原「不派发 redux action」断言随机制消失改断言副作用）');
});

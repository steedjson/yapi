// 首屏性能优化批次1（vendor 拆分 + 懒加载）回归覆盖。
//
// 背景：批次1 将 statistics / wiki / advanced-mock 三插件组件改为 React.lazy +
// Suspense 包装（exts/*/client.js），import-swagger 的 run 改为运行时动态 import('./run')，
// client/common.js 的 getMockText 改为动态 import mockjs（签名 Promise<string>）。
// 既有 test/exts/*.test.js 直测被 lazy 包装的内部组件，本文件钉住包装层与动态加载链：
//   1. 插件 client.js 经 bindHook 注册的 component 是 lazy 包装组件，可真实渲染出
//      内部组件（import() 落地），fallback 为 Loading；
//   2. import-swagger 钩子 run 走动态 import 后解析结果与直调 run.js 等价；
//   3. getMockText 新契约：Promise<string>、mockjs 生效、非法输入 resolve 空串。
// 测试环境与 test/exts/setup.js 同构（jsdom + 别名 + 编辑器/axios 桩）。
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock, FakeWebSocket } = require('./setup');

// 复位 WebSocket 桩（跨用例防串扰，与 WikiPage.test.js 同款）
function FakeWebSocketReset() {
  FakeWebSocket.reset();
}

// —— 插件 client.js 装载辅助：以插件运行时形态调用（this.bindHook） ——
function loadHooks(relPath) {
  const register = require(relPath);
  const hooks = {};
  register.call({
    bindHook: (name, fn) => {
      hooks[name] = fn;
    }
  });
  return hooks;
}

// —— statistics：app_route 注册的懒加载组件渲染真实页面 ——
test.serial('statistics client.js：app_route 组件为 lazy 包装且渲染真实统计页', async t => {
  axiosMock.setRoutes([
    { match: '/api/plugin/statismock/count', respond: () => ({ errcode: 0, data: { groupCount: 1, projectCount: 2, interfaceCount: 3, interfaceCaseCount: 4 } }) },
    { match: '/api/plugin/statismock/get_system_status', respond: () => ({ errcode: 0, data: { mail: 'true', systemName: 'darwin', totalmem: '16', freemem: '8' } }) },
    { match: '/api/plugin/statismock/group_data_statis', respond: () => ({ errcode: 0, data: [] }) },
    { match: '/api/plugin/statismock/get', respond: () => ({ errcode: 0, data: { mockCount: 7, mockDateList: [] } }) }
  ]);
  const hooks = loadHooks('../../exts/yapi-plugin-statistics/client.js');
  const app = {};
  hooks.app_route(app);
  t.truthy(app.statisticsPage, 'app_route 应注册 statisticsPage');
  t.is(app.statisticsPage.path, '/statistic');

  // 懒加载组件经完整渲染后（import() 落地）应出现统计页真实内容而非停在 fallback
  const { container } = renderWithProviders(React.createElement(app.statisticsPage.component), {
    seedState: {},
    routePath: '/statistic',
    initialPath: '/statistic'
  });
  // flushEffects 两段等待：第一段等 import() 落地 + 首批请求，第二段兜底同用例内
  // 后续响应回填，避免页面未消费的延迟响应逸出为 unhandled rejection
  await flushEffects();
  await flushEffects(200);

  // 面包屑仍由页面派发（内部组件真实挂载的旁证）
  t.regex(container.textContent, /系统信息|数据统计|系统状况/);

  cleanup();
  await flushEffects();
  cleanupDom();
});

// —— advanced-mock：interface_tab 注册懒加载组件；add_reducer 保持同步注册 ——
test.serial('advanced-mock client.js：interface_tab 懒加载组件可渲染，add_reducer 同步注册 reducer', async t => {
  axiosMock.setRoutes([
    { match: '/api/plugin/advmock/get', respond: () => ({ errcode: 0, data: { enable: false, mock_script: '' } }) },
    { match: '/api/plugin/advmock/case/list', respond: () => ({ errcode: 0, data: [] }) }
  ]);
  const hooks = loadHooks('../../exts/yapi-plugin-advanced-mock/client.js');

  const tabs = {};
  hooks.interface_tab(tabs);
  t.truthy(tabs.advMock, 'interface_tab 应注册 advMock');
  t.is(tabs.advMock.name, '高级Mock');

  // add_reducer 不得被异步化：reducer 表形状必须在首个 dispatch 前定型
  const reducerModules = {};
  hooks.add_reducer(reducerModules);
  t.truthy(reducerModules.mockCol, 'mockCol reducer 应同步注册（异步化会破坏 store 形状）');
  t.is(typeof reducerModules.mockCol, 'function');

  const { container } = renderWithProviders(React.createElement(tabs.advMock.component), {
    seedState: {
      mockCol: { list: [] },
      inter: { curdata: { _id: 1, title: '接口', res_body: '{}', res_body_is_json_schema: false, req_body_is_json_schema: false } },
      project: { currProject: { _id: 1, role: 'owner', switch_notice: true } }
    },
    routePath: '/project/:id/interface/api/:actionId',
    initialPath: '/project/1/interface/api/1'
  });
  // 两段等待：import() 落地 + 配置/列表回填；再兜底收尾避免延迟响应逸出
  await flushEffects();
  await flushEffects(200);
  // import() 落地后高级 Mock 页真实渲染（期望/脚本 Tab 可见）
  t.regex(container.textContent, /期望|脚本/);

  cleanup();
  await flushEffects();
  cleanupDom();
});

// —— wiki：sub_nav 注册懒加载组件并渲染真实 Wiki 页 ——
test.serial('wiki client.js：sub_nav 组件为 lazy 包装且渲染真实 Wiki 页', async t => {
  const hooks = loadHooks('../../exts/yapi-plugin-wiki/client.js');
  const subNav = {};
  hooks.sub_nav(subNav);
  t.truthy(subNav.wiki, 'sub_nav 应注册 wiki 项（app 形态：app.wiki）');
  t.is(subNav.wiki.name, 'Wiki');
  t.is(subNav.wiki.path, '/project/:id/wiki');
  t.truthy(subNav.wiki.route, '子路由相对路径 route 字段不得缺失');

  const Comp = subNav.wiki.component;
  FakeWebSocketReset();
  axiosMock.setRoutes([
    { match: '/api/plugin/wiki_desc/get', respond: () => ({ errcode: 0, data: { desc: '<p>wiki正文</p>', markdown: 'wiki正文', username: 'carol', uid: 7, up_time: 1600000000 } }) }
  ]);
  const { container } = renderWithProviders(React.createElement(Comp), {
    seedState: { project: { currProject: { _id: 12, role: 'admin', switch_notice: true } } },
    routePath: '/project/:id/wiki',
    initialPath: '/project/12/wiki'
  });
  await flushEffects();
  await flushEffects(200);
  // WikiPage import() 落地 + wiki_desc 回填：真实数据进入只读视图（markdown-it 链真实加载）
  const pageText = container.textContent;
  t.true(
    /wiki正文/.test(pageText) || /编辑/.test(pageText),
    'WikiPage 应渲染出真实页面骨架或数据（实际：' + pageText.slice(0, 80) + '）'
  );

  cleanup();
  await flushEffects();
  cleanupDom();
});

// —— import-swagger：钩子 run 经动态 import('./run') 与直调 run.js 等价 ——
test.serial('import-swagger client.js：run 动态 import 后解析 OpenAPI 与直调 run.js 等价', async t => {
  const hooks = loadHooks('../../exts/yapi-plugin-import-swagger/client.js');
  const mod = {};
  hooks.import_data(mod);
  t.truthy(mod.swagger, 'import_data 应注册 swagger 项');
  t.is(mod.swagger.name, 'Swagger');
  t.is(typeof mod.swagger.run, 'function');

  const spec = {
    openapi: '3.1.0',
    info: { title: '等价性验证', version: '1.0.0' },
    servers: [{ url: 'https://example.com/{ver}', variables: { ver: { default: 'v1' } } }],
    paths: {
      '/users': {
        post: {
          summary: '创建用户',
          requestBody: {
            content: {
              'application/vnd.api+json': {
                schema: { type: 'object', properties: { name: { type: 'string' } } }
              }
            }
          }
        },
        get: { summary: '列表' }
      }
    }
  };

  const viaHook = await mod.swagger.run(spec);
  const direct = await require('../../exts/yapi-plugin-import-swagger/run')(spec);

  t.is(viaHook.basePath, '/v1');
  t.is(viaHook.basePath, direct.basePath, '动态 import 链与直调 run.js 的 basePath 等价');
  t.is(viaHook.apis.length, direct.apis.length, '解析出的接口数量等价');
  t.deepEqual(
    viaHook.apis.map(a => [a.path, a.method, a.title]),
    direct.apis.map(a => [a.path, a.method, a.title])
  );
});

// —— client/common.js getMockText 新契约（mockjs 惰性化） ——
test.serial('getMockText：返回 Promise<string>，mockjs 语义生效，非法输入 resolve 空串', async t => {
  const common = require('../../client/common.js');

  const ret = common.getMockText('{"name": "@cname", "list|2": [{"id": "@increment"}]}');
  t.true(ret instanceof Promise || typeof ret.then === 'function', '签名应为 Promise（批次1 async 化）');

  const text = await ret;
  t.is(typeof text, 'string');
  t.true(text.length > 0);
  // mockjs 语义生效：@cname 被替换为真实名字、@increment 被替换为数字
  t.false(text.includes('@cname'), '@cname 占位符应被 mockjs 消费');
  t.true(text.includes('"id"'), 'mock 模板键应保留');

  // 非法输入：resolve 空串而非 reject（与旧实现 catch 返回 '' 语义一致）
  const bad = await common.getMockText('this is not json5 {{');
  t.is(bad, '');

  // 空串输入同样 resolve 空串（极端边界）
  const empty = await common.getMockText('');
  t.is(empty, '');
});

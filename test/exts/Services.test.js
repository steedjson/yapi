// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { renderWithProviders, flushEffects, cleanupDom } from '../helpers/containers';

const { axiosMock } = require('./setup');

const SERVICES_PATH = '../../exts/yapi-plugin-gen-services/Services/Services';

// project 切片已迁 Zustand（批次4）：token 改经 projectStore 播种/收敛
const { seedProjectStore, resetUserProjectStores } = require('../helpers/userProjectStores');

function seedState(token) {
  seedProjectStore({ token: token || '' });
  return {
    user: {},
    inter: {},
    mockCol: {}
  };
}

test.serial.afterEach.always(() => {
  resetUserProjectStores();
});

test.serial('Services 挂载：按 projectId 拉取项目 token', async t => {
  axiosMock.setRoutes([
    { match: '/api/project/token', respond: () => ({ errcode: 0, data: 'token-abc' }) }
  ]);
  renderWithProviders(React.createElement(require(SERVICES_PATH).default, { projectId: '36' }), {
    seedState: seedState(''),
    routePath: '/project/:id/services',
    initialPath: '/project/36/services'
  });
  await flushEffects(80);

  const getCalls = axiosMock.filter('/api/project/token');
  t.is(getCalls.length, 1);
  // stub 记录 axios.get 的 params 为独立字段(适配器拼 URL 前拦截)
  t.is(getCalls[0].params.project_id, '36');

  cleanup();
  cleanupDom();
});

test.serial('Services 模板渲染：token 回填后出现在两段配置中，安装说明齐全', async t => {
  axiosMock.setRoutes([
    { match: '/api/project/token', respond: () => ({ errcode: 0, data: 'token-abc' }) }
  ]);
  const { container } = renderWithProviders(
    React.createElement(require(SERVICES_PATH).default, { projectId: '36' }),
    {
      seedState: seedState('token-abc'),
      routePath: '/project/:id/services',
      initialPath: '/project/36/services'
    }
  );
  await flushEffects(80);

  const text = container.textContent;
  // token 渲染进两段配置(3.2.0 以上/以下)
  t.is(text.split('token=token-abc').length - 1, 2);
  // 安装/生成说明齐全
  for (const fragment of ['sm2tsservice -D', 'touch json2service.json', 'sm2tsservice --clear']) {
    t.true(text.includes(fragment), '缺少说明: ' + fragment);
  }
  // pid 与 type 契约
  t.true(text.includes('pid=36'));
  t.true(text.includes('"type": "yapi"'));

  cleanup();
  cleanupDom();
});

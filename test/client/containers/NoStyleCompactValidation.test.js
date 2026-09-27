// noStyle 嵌套校验链回归（antd 弃用 API 清扫批 · csl-tester 交付）。
//
// 背景：T1 迁移将 ProjectEnvContent 域名字段、AddInterfaceForm 路径字段由
// Input addonBefore/addonAfter 组合改为 Space.Compact + 内层 noStyle Form.Item
// 承载 name/rules。本文件钉住迁移不得改变的三条不变量：
//   a) 字段注册正常：initialValue / 受控值可达（等价于 form.getFieldValue 能取到；
//      两组件 Form 实例均为组件内部 Form.useForm()，故经 DOM 受控值与提交 payload 外显验证）；
//   b) rules 仍生效：空值/空白值提交被 validateFields 拒绝，且错误文案与迁移前逐字一致；
//   c) 提交 payload 形状不变：protocol/method 仍由外层并入（ProjectEnvContent.env.domain
//      带 protocol 前缀；AddInterfaceForm 顶层带 method）。
// 模式一致性静态比对：BasicSettingPanel path 字段为本仓同模式先例
// （外层 Form.Item 只做布局 + Space.Compact + 内层 noStyle Form.Item(name, rules)）。
//
// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom, REPO_ROOT } from '../../helpers/containers';

const path = require('path');
const Module = require('module');

// ProjectEnvContent 引用 client/constants/variable.js，jsdom-setup 只映射 common/
// 前缀，这里补 client/ 前缀映射，必须在 require 生产代码之前安装
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && request.indexOf('client/') === 0) {
    return originalResolveFilename.call(this, path.join(REPO_ROOT, request), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  default: ProjectEnvContent
} = require('../../../client/containers/Project/Setting/ProjectEnv/ProjectEnvContent.js');
const {
  default: AddInterfaceForm
} = require('../../../client/containers/Project/Interface/InterfaceList/AddInterfaceForm.js');
const { handleApiPath } = require('../../../client/common.js');

// ProjectEnvContent.handleOk 既有实现为 form.validateFields().then(...)（无 catch），
// 校验失败时在 Node 环境产生 unhandledRejection（浏览器端仅为控制台噪音，属迁移前
// 既有行为，与本批迁移无关，未经本批触碰）。ava worker 顶层（base.js）以
// currently-unhandled 全局监听该事件并将文件判失败，无法按用例豁免，故本文件在
// worker 内接管该事件：仅吞掉「表单校验拒绝」这一类预期拒绝（rc-field-form 的
// { errorFields } 形状），其余重新抛出保持默认严格语义。仅影响本测试文件进程。
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', reason => {
  if (reason && Array.isArray(reason.errorFields)) {
    return;
  }
  throw reason;
});

// ProjectEnvContent/AddInterfaceForm 的 validator 为 antd3 时代 callback 风格签名
// (rule, value, callback)，async-validator 运行时会输出
// 「Warning: `callback` is deprecated. Please return a promise instead.」。
// 该提示与本批 7 类 antd 弃用 API 清扫无关，亦非本批引入（validator 为既有业务代码，
// 测试侧禁改），此前无用例触达故未在日志出现。为保持全量日志 deprecated 计数门禁
// 纯净，此处仅对这一条消息静音，其余 console.error 原样透传（口径参照
// ErrorBoundary.test.js 的 console 噪音处理惯例）。
const originalConsoleError = console.error;
console.error = function(...args) {
  if (typeof args[0] === 'string' && args[0].indexOf('`callback` is deprecated') !== -1) {
    return;
  }
  return originalConsoleError.apply(this, args);
};

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 错误文案经 useFrameState(raf 批处理) + useDebounce(0~10ms) + CSSMotion 挂载，
// jsdom 下通常需 2 帧以上，轮询至多 1s 直到目标文案出现（不降低断言标准，只放宽时序）。
async function waitForError(container, text) {
  for (let i = 0; i < 50; i++) {
    if (errorTexts(container).includes(text)) {
      return true;
    }
    await act(async () => {
      await sleep(20);
    });
  }
  return errorTexts(container).includes(text);
}

function inputByPlaceholder(container, placeholder) {
  return Array.from(container.querySelectorAll('input')).filter(i => i.placeholder === placeholder)[0];
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).filter(
    b => (b.textContent || '').replace(/\s/g, '') === text
  )[0];
}

function errorTexts(container) {
  return Array.from(container.querySelectorAll('.ant-form-item-explain-error')).map(e => e.textContent);
}

// ① ProjectEnvContent 域名字段：noStyle 嵌套下字段注册正常（initialValue 可达）
test.serial('ProjectEnvContent 域名字段注册：initialValue 按 projectMsg.domain 去协议头回填', t => {
  let utils;
  act(() => {
    utils = render(
      <ProjectEnvContent
        projectMsg={{ _id: 'env11', name: '测试环境', domain: 'http://foo.example.com' }}
        onSubmit={() => {}}
        handleEnvInput={() => {}}
      />
    );
  });
  const domainInput = inputByPlaceholder(utils.container, '请输入环境域名');
  t.truthy(domainInput, '域名字段应注册并渲染');
  t.is(domainInput.value, 'foo.example.com', 'initialValue 应取 projectMsg.domain 协议头之后的部分');
  const nameInput = inputByPlaceholder(utils.container, '请输入环境名称');
  t.truthy(nameInput, '环境名称字段应注册并渲染');
  t.is(nameInput.value, '测试环境', '同表单其它字段注册不受迁移影响');
});

// ② ProjectEnvContent 域名字段：空值提交被 validateFields 拒绝（rules 仍生效）
test.serial('ProjectEnvContent 域名空值提交被拒绝，错误文案与迁移前逐字一致', async t => {
  const submitted = [];
  let utils;
  await act(async () => {
    utils = render(
      <ProjectEnvContent
        projectMsg={{ _id: 'env11', name: '测试环境', domain: '' }}
        onSubmit={v => submitted.push(v)}
        handleEnvInput={() => {}}
      />
    );
    await sleep(10);
  });
  await act(async () => {
    fireEvent.click(buttonByText(utils.container, '保存'));
    await sleep(30);
  });
  t.deepEqual(submitted, [], '空域名不应触发 onSubmit');
  const errorShown = await waitForError(utils.container, '请输入环境域名!');
  t.true(
    errorShown,
    '应渲染迁移前同文案「请输入环境域名!」，实际: ' + JSON.stringify(errorTexts(utils.container))
  );
});

// ③ ProjectEnvContent 域名字段：空白值提交被拒绝（whitespace validator 仍生效）
test.serial('ProjectEnvContent 域名空白值提交被拒绝并提示不允许空格', async t => {
  const submitted = [];
  let utils;
  await act(async () => {
    utils = render(
      <ProjectEnvContent
        projectMsg={{ _id: 'env11', name: '测试环境', domain: '' }}
        onSubmit={v => submitted.push(v)}
        handleEnvInput={() => {}}
      />
    );
    await sleep(10);
  });
  const domainInput = inputByPlaceholder(utils.container, '请输入环境域名');
  await act(async () => {
    fireEvent.change(domainInput, { target: { value: '   ' } });
    await sleep(10);
  });
  await act(async () => {
    fireEvent.click(buttonByText(utils.container, '保存'));
    await sleep(30);
  });
  t.deepEqual(submitted, [], '纯空白域名不应触发 onSubmit');
  const errorShown = await waitForError(utils.container, '环境域名不允许出现空格!');
  t.true(
    errorShown,
    '应渲染迁移前同文案「环境域名不允许出现空格!」，实际: ' + JSON.stringify(errorTexts(utils.container))
  );
});

// ④ ProjectEnvContent 域名字段：合法值端到端通过，payload 形状与迁移前一致
test.serial('ProjectEnvContent 合法域名提交通过并把 protocol 并入 payload', async t => {
  const submitted = [];
  let utils;
  await act(async () => {
    utils = render(
      <ProjectEnvContent
        projectMsg={{ _id: 'env11', name: '测试环境', domain: 'http://foo.example.com' }}
        onSubmit={v => submitted.push(v)}
        handleEnvInput={() => {}}
      />
    );
    await sleep(10);
  });
  await act(async () => {
    fireEvent.click(buttonByText(utils.container, '保存'));
    await sleep(30);
  });
  t.is(submitted.length, 1, '合法域名应通过校验并触发 onSubmit');
  t.is(submitted[0].env.domain, 'http://foo.example.com', 'protocol 应与域名字段值拼接');
  t.is(submitted[0].env.name, '测试环境');
  t.is(submitted[0].env._id, 'env11');
});

// ⑤ AddInterfaceForm 路径字段：noStyle 嵌套下注册正常，handlePath onBlur 接线不变，
//    提交 payload 含 path 且 method 仍由外层并入
test.serial('AddInterfaceForm 路径字段注册：受控值进入提交 payload 且 onBlur 自动补斜杠', async t => {
  const submitted = [];
  const catdata = [{ _id: 222, name: '分类A' }];
  let utils;
  await act(async () => {
    utils = render(
      <AddInterfaceForm catdata={catdata} onSubmit={v => submitted.push(v)} onCancel={() => {}} />
    );
    await sleep(10);
  });
  const titleInput = inputByPlaceholder(utils.container, '接口名称');
  const pathInput = inputByPlaceholder(utils.container, '/path');
  t.truthy(titleInput, '名称字段应注册并渲染');
  t.truthy(pathInput, '路径字段应注册并渲染');
  t.is(
    utils.container.querySelector('.ant-space-compact input[placeholder="/path"]') !== null,
    true,
    '路径输入应处于 Space.Compact 组合内'
  );
  await act(async () => {
    fireEvent.change(titleInput, { target: { value: '测试接口' } });
    fireEvent.change(pathInput, { target: { value: 'api/pet' } });
    await sleep(10);
  });
  await act(async () => {
    fireEvent.blur(pathInput);
    await sleep(10);
  });
  t.is(pathInput.value, handleApiPath('api/pet'), 'onBlur 应触发 handlePath 自动补斜杠接线');
  const submitBtn = buttonByText(utils.container, '提交');
  t.truthy(submitBtn);
  t.false(submitBtn.disabled, 'title/path 就绪后提交按钮应解锁');
  await act(async () => {
    fireEvent.click(submitBtn);
    await sleep(30);
  });
  t.is(submitted.length, 1, '合法值应通过校验并提交');
  t.is(submitted[0].path, handleApiPath('api/pet'), '注册字段值应进入提交 payload');
  t.is(submitted[0].method, 'GET', 'method 仍应由外层并入 payload（形状不变）');
  t.is(submitted[0].title, '测试接口');
  t.is(String(submitted[0].catid), '222');
});

// ⑥ AddInterfaceForm 路径字段：空值提交被 validateFields 拒绝（rules 仍生效）。
//    提交按钮在 path 为空时被既有防呆禁用，故经 fireEvent.submit 直接触发表单校验链。
test.serial('AddInterfaceForm 空 path 提交被 validateFields 拒绝，错误文案与迁移前逐字一致', async t => {
  const submitted = [];
  let utils;
  await act(async () => {
    utils = render(
      <AddInterfaceForm
        catdata={[{ _id: 222, name: '分类A' }]}
        onSubmit={v => submitted.push(v)}
        onCancel={() => {}}
      />
    );
    await sleep(10);
  });
  const submitBtn = buttonByText(utils.container, '提交');
  t.true(submitBtn.disabled, 'path 为空时提交按钮应保持既有防呆禁用');
  await act(async () => {
    fireEvent.submit(utils.container.querySelector('form'));
    await sleep(30);
  });
  t.deepEqual(submitted, [], '空 path 不应触发 onSubmit');
  const errorShown = await waitForError(utils.container, '请输入接口路径!');
  t.true(
    errorShown,
    '应渲染迁移前同文案「请输入接口路径!」，实际: ' + JSON.stringify(errorTexts(utils.container))
  );
});

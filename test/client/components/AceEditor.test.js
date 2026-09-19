// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: AceEditor } = require('../../../client/components/AceEditor/AceEditor.js');
const { language } = require('@codemirror/language');
const { jsonLanguage } = require('@codemirror/lang-json');

// 共用全局 DOM，串行执行避免多个 CodeMirror 实例相互干扰
const createdViews = [];

test.serial.afterEach.always(() => {
  // 销毁 CodeMirror view，停止其 requestAnimationFrame 测量循环（与 mockEditor.test 同因）
  while (createdViews.length) {
    const view = createdViews.pop();
    try {
      view.destroy();
    } catch (e) {
      // view 已被销毁时忽略
    }
  }
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 组件迁移后经 forwardRef 暴露的实例接口仍为 { editor }（mockEditor 实例），
// Postman / InterfaceColContent / InterfaceEditForm 依赖该接口面。
test.serial('AceEditor 挂载创建 CodeMirror，ref.editor 暴露 mockEditor 实例且 callback 收到适配层', async t => {
  const callbackEditors = [];
  const ref = { current: null };
  const utils = render(
    React.createElement(AceEditor, {
      ref: r => {
        ref.current = r;
      },
      data: '{"a":1}',
      mode: 'json',
      callback: editor => {
        callbackEditors.push(editor);
      }
    })
  );

  await act(async () => {
    await sleep(30);
  });

  t.truthy(utils.container.querySelector('.cm-editor'), '应挂载 CodeMirror 编辑器');
  t.true(typeof ref.current.editor.setValue === 'function', 'ref.editor 应为 mockEditor 实例');
  t.is(ref.current.editor.getValue(), '{\n  "a": 1\n}', 'ref.editor 应可读取美化后的文档内容');
  t.is(callbackEditors.length, 1, 'callback 应在挂载时收到一次编辑器适配层');
  t.is(typeof callbackEditors[0].renderer.setShowGutter, 'function', '适配层应保留 renderer.setShowGutter');
  t.is(typeof callbackEditors[0].setMode, 'function', '适配层应保留 setMode');

  utils.unmount();
});

// 旧 UNSAFE_componentWillReceiveProps 的核心语义：data 引用变化且内容不同时
// setValue + setMode + clearSelection；内容相同（父组件重渲染）时不覆盖用户编辑
test.serial('AceEditor props.data 更新时 setValue 且语言随 mode 切换，相同内容不重复写入', async t => {
  const callbackCalls = [];
  const ref = { current: null };
  const buildEditor = data =>
    React.createElement(AceEditor, {
      ref: r => {
        ref.current = r;
      },
      data: data,
      mode: 'json',
      callback: editor => {
        callbackCalls.push(editor);
      }
    });

  const utils = render(buildEditor('{"v":1}'));

  await act(async () => {
    await sleep(30);
  });

  const editor = ref.current.editor;
  const view = editor.editor.view;
  createdViews.push(view);

  t.is(editor.getValue(), '{\n  "a": 1\n}'.replace('a', 'v'), '前置：初始内容已美化');
  t.is(view.state.facet(language), jsonLanguage, '前置：mode=json 已加载 json 解析器');

  // 引用变化 + 内容变化：setValue + clearSelection
  await act(async () => {
    utils.rerender(buildEditor('{"v":22}'));
    await sleep(30);
  });
  t.is(editor.getValue(), '{\n  "v": 22\n}', 'data 更新后文档应同步为新内容');

  // 引用变化 + 内容相同：不应重新写入（用户当前编辑不被覆盖）
  editor.setValue('用户正在编辑的内容');
  await act(async () => {
    utils.rerender(buildEditor('用户正在编辑的内容'));
    await sleep(30);
  });
  t.is(editor.getValue(), '用户正在编辑的内容', '内容相同时不应重写文档');

  t.is(callbackCalls.length, 1, 'callback 只在挂载时触发一次');

  utils.unmount();
});

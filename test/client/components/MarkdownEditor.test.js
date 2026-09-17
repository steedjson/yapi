// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';
import MarkdownEditor from '../../../client/components/MarkdownEditor/index.js';

// 共用全局 DOM 与 ref 状态，串行执行避免相互干扰
test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function renderEditor(props) {
  const ref = React.createRef();
  const utils = render(<MarkdownEditor ref={ref} {...props} />);
  return Object.assign({ ref }, utils);
}

// 真实可交互的编辑区输入框（@uiw/react-md-editor 渲染出的 textarea）
const TEXTAREA_SELECTOR = 'textarea.w-md-editor-text-input';

function getTextarea(container) {
  return container.querySelector(TEXTAREA_SELECTOR);
}

test.serial('a) ref.getValue()/getMarkdown() 返回初始 markdown 源, 且组件真实挂载', t => {
  const markdown = '# 标题\n\n正文段落';
  const { ref, container } = renderEditor({ value: markdown });

  t.true(container.querySelector('.markdown-editor-wrapper') !== null, '根容器 class 应为 markdown-editor-wrapper');
  t.true(container.querySelector('.w-md-editor') !== null, 'MDEditor 应已实际渲染出编辑器 DOM');
  t.is(ref.current.getValue(), markdown);
  t.is(ref.current.getMarkdown(), markdown, 'getMarkdown 应与 getValue 返回同一 markdown 源');
});

test.serial('b) getHtml() 渲染 markdown 语法, 且保留原始 HTML (html:true)', t => {
  const heading = renderEditor({ value: '# 标题' });
  const headingHtml = heading.ref.current.getHtml();
  t.true(headingHtml.includes('<h1>'), '标题应渲染为 <h1>, 实际为: ' + headingHtml);

  const bold = renderEditor({ value: '**粗体**' });
  const boldHtml = bold.ref.current.getHtml();
  t.true(boldHtml.includes('<strong>'), '粗体应渲染为 <strong>, 实际为: ' + boldHtml);
  t.true(boldHtml.includes('粗体'), '粗体文本应保留');

  const rawHtml = renderEditor({ value: '<b>x</b>' });
  const rawHtmlResult = rawHtml.ref.current.getHtml();
  t.true(
    rawHtmlResult.includes('<b>x</b>'),
    '内嵌原始 HTML 应被透传保留 (html:true), 实际为: ' + rawHtmlResult
  );
});

test.serial('c) 初始 value 为空/未传时不抛错, 且 getValue 与 getHtml 结果可预期', t => {
  const emptyString = renderEditor({ value: '' });
  t.is(emptyString.ref.current.getValue(), '');
  t.is(emptyString.ref.current.getMarkdown(), '');
  t.is(emptyString.ref.current.getHtml(), '', '空 markdown 源渲染结果应为空串');

  const noValue = renderEditor({});
  t.is(noValue.ref.current.getValue(), '', '未传 value 时应退化为空串');
  t.is(noValue.ref.current.getMarkdown(), '');
  t.is(noValue.ref.current.getHtml(), '', '未传 value 时 getHtml 不应抛错');
});

test.serial('d) 编辑区输入触发 onChange, 且收到新的 markdown 值 (精确比对调用参数)', t => {
  const calls = [];
  const onChange = value => calls.push(value);
  const { ref, container } = renderEditor({ value: '# 原标题', onChange });

  const textarea = getTextarea(container);
  t.truthy(textarea, '前置: MDEditor 应渲染出真实可交互的 textarea');
  t.deepEqual(calls, [], '前置: 挂载时不应主动触发 onChange');

  fireEvent.change(textarea, { target: { value: '## 新标题\n\n正文' } });

  t.deepEqual(
    calls,
    ['## 新标题\n\n正文'],
    '编辑区变化后 onChange 应被调用一次, 且参数恰为新 markdown 值, 实际为: ' + JSON.stringify(calls)
  );
  t.is(ref.current.getValue(), '## 新标题\n\n正文', 'ref.getValue() 应同步到新 markdown 值');
  t.is(textarea.value, '## 新标题\n\n正文', '受控 textarea 应回显新 markdown 值');

  // 清空编辑区时仍须回调一次空串（不能因为值为空而跳过回调）
  fireEvent.change(textarea, { target: { value: '' } });

  t.deepEqual(calls, ['## 新标题\n\n正文', ''], '清空内容时 onChange 应收到空串而非被跳过');
  t.is(ref.current.getValue(), '', 'ref.getValue() 应同步为空串');
});

test.serial('e) onChange 为可选 prop: 不传时仍可正常渲染与编辑', t => {
  const { ref, container } = renderEditor({ value: '旧内容' });

  const textarea = getTextarea(container);
  t.truthy(textarea, '未传 onChange 时仍应渲染出编辑区');
  t.true(container.querySelector('.w-md-editor') !== null, '未传 onChange 时 MDEditor 仍应挂载');

  fireEvent.change(textarea, { target: { value: '新内容' } });

  t.is(ref.current.getValue(), '新内容', '未传 onChange 时组件内部状态仍应更新');
  t.is(textarea.value, '新内容', '未传 onChange 时受控 textarea 仍应回显新值');
});

test.serial('f) className/height/preview 三个 props 的可观测契约', t => {
  // 默认形态: 无额外 class, height=500, preview='edit'（只渲染编辑区）
  const def = renderEditor({ value: '# 标题' });

  t.is(
    def.container.querySelector('.markdown-editor-wrapper').className,
    'markdown-editor-wrapper',
    '未传 className 时 wrapper 不应附加额外 class'
  );
  t.is(
    def.container.querySelector('.w-md-editor').style.height,
    '500px',
    '默认 height 应为 500（渲染为 500px）'
  );
  t.true(def.container.querySelector('.w-md-editor-area') !== null, "默认 preview='edit' 应渲染编辑区");
  t.is(
    def.container.querySelector('.w-md-editor-preview'),
    null,
    "默认 preview='edit' 不应渲染预览区"
  );

  // 自定义形态: className 合并进 wrapper, height 生效, preview='live' 同时渲染编辑区与预览区
  const live = renderEditor({
    value: '# 标题',
    className: 'extra-class',
    height: 321,
    preview: 'live'
  });

  t.is(
    live.container.querySelector('.markdown-editor-wrapper').className,
    'markdown-editor-wrapper extra-class',
    'className 应合并进 wrapper class 而不覆盖基础 class'
  );
  t.is(
    live.container.querySelector('.w-md-editor').style.height,
    '321px',
    'height=321 应渲染为 321px'
  );
  t.true(live.container.querySelector('.w-md-editor-area') !== null, "preview='live' 应渲染编辑区");
  const livePreview = live.container.querySelector('.w-md-editor-preview');
  t.truthy(livePreview, "preview='live' 应渲染预览区");
  t.true(
    livePreview.innerHTML.includes('<h1'),
    "preview='live' 的预览区应真实渲染 markdown 内容, 实际为: " + livePreview.innerHTML.slice(0, 200)
  );

  // preview='preview' 只渲染预览区, 隐藏编辑区
  const previewOnly = renderEditor({ value: '# 标题', preview: 'preview' });

  t.is(
    previewOnly.container.querySelector('.w-md-editor-area'),
    null,
    "preview='preview' 应隐藏编辑区"
  );
  t.truthy(
    previewOnly.container.querySelector('.w-md-editor-preview'),
    "preview='preview' 应渲染预览区"
  );
});

test.serial('g) getHtml() 受 linkify:true 守护: 裸 URL 渲染为 <a> 链接', t => {
  const { ref } = renderEditor({ value: '访问 https://example.com 查看' });
  const html = ref.current.getHtml();

  t.true(
    html.includes('<a href="https://example.com">'),
    'linkify:true 时裸 URL 应渲染为 <a href="https://example.com">, 实际为: ' + html
  );
  t.true(
    html.includes('>https://example.com</a>'),
    'URL 文本本身应作为链接文本被包裹, 实际为: ' + html
  );
});

test.serial('h) getHtml() 受 breaks:true 守护: 单换行渲染为 <br>', t => {
  const { ref } = renderEditor({ value: '第一行\n第二行' });
  const html = ref.current.getHtml();

  t.true(html.includes('<br>'), 'breaks:true 时单换行应渲染为 <br>, 实际为: ' + html);
  t.true(
    /第一行<br>\s*第二行/.test(html),
    '换行应落在两行文本之间而非别处, 实际为: ' + html
  );
});

/*
 * 契约钉死（有意设计, 不是缺陷）：value 只作初始值。
 *
 * 实现用 useState(initialValue) + useRef(initialValue) 承载内容，父组件在实例存活期间
 * 后续传入的新 value 不会回灌到编辑器内部；换内容由调用方的重挂载策略完成——
 * client/containers/Project/Interface/InterfaceList/InterfaceContent.js:173-174 使用
 * `<C key={this.actionId} ... />`，其注释原文为「路由切换时强制重建当前 Tab，
 * 避免复用上一个接口的表单和编辑器状态」。因此切换接口靠 key 变化重挂载，而非 prop 同步。
 *
 * 若未来需要改成 prop 同步，必须同时修改调用方（去掉或调整 key 重挂载策略）与本用例，
 * 两者是同一条契约的两端，不能只改一边。
 */
test.serial('i) 契约: value 仅作初始值, 父组件后续更新的 value 不同步进已挂载实例', t => {
  const changes = [];
  const onChange = value => changes.push(value);
  const { ref, container, rerender } = renderEditor({ value: '初始内容', onChange });

  t.is(ref.current.getValue(), '初始内容', '前置: 挂载时按 value 初始化');
  t.is(getTextarea(container).value, '初始内容', '前置: textarea 回显初始 value');
  t.deepEqual(changes, [], '前置: 挂载时不应触发 onChange');

  rerender(<MarkdownEditor ref={ref} value="外部新内容" onChange={onChange} />);

  t.is(ref.current.getValue(), '初始内容', 'value prop 变更后 ref.getValue() 应仍为初始内容');
  t.is(ref.current.getMarkdown(), '初始内容', 'getMarkdown() 同样应保持初始内容');
  t.is(getTextarea(container).value, '初始内容', 'value prop 变更后受控 textarea 仍应回显初始内容');
  t.false(
    ref.current.getHtml().includes('外部新内容'),
    '新传入的 value 不应进入渲染结果, 实际为: ' + ref.current.getHtml()
  );
  t.true(
    ref.current.getHtml().includes('初始内容'),
    '渲染结果应仍是初始内容, 实际为: ' + ref.current.getHtml()
  );
  // 与同 value 全新挂载的实例对比：渲染结果完全等同，说明被忽略的 prop 未进入渲染输入
  const pristine = renderEditor({ value: '初始内容' });
  t.is(
    ref.current.getHtml(),
    pristine.ref.current.getHtml(),
    'getHtml() 应与同 value 全新挂载的实例完全一致'
  );

  // 被忽略的 prop 不应污染内部状态：编辑器仍由自身 state 驱动，用户输入照常生效
  fireEvent.change(getTextarea(container), { target: { value: '用户继续输入' } });

  t.deepEqual(changes, ['用户继续输入'], '被忽略的 value 不应改写内部状态, 用户输入应正常回调');
  t.is(ref.current.getValue(), '用户继续输入', 'ref.getValue() 应跟随用户输入');
  t.is(getTextarea(container).value, '用户继续输入', 'textarea 应回显用户输入');
});

test.serial('j) 调用方以 key 重挂载换内容: 新 key 的实例按新 value 初始化', t => {
  // 等价于 InterfaceContent.js:173-174 的 <C key={this.actionId} ... />：
  // 切换接口时 actionId 变化 => key 变化 => 旧实例卸载、新实例挂载，内容由新 value 初始化。
  const refA = React.createRef();
  const refB = React.createRef();

  function TabContent({ actionId }) {
    if (actionId === 1) {
      return <MarkdownEditor key={1} ref={refA} value="接口 A 的内容" />;
    }
    return <MarkdownEditor key={2} ref={refB} value="接口 B 的内容" />;
  }

  const { container, rerender } = render(<TabContent actionId={1} />);

  t.is(refA.current.getValue(), '接口 A 的内容', '前置: 第一个 key 的实例按自己的 value 初始化');
  t.is(getTextarea(container).value, '接口 A 的内容', '前置: textarea 回显接口 A 的内容');
  t.is(refB.current, null, '前置: 第二个 key 的实例尚未挂载');

  // 在接口 A 的编辑器里留下未保存的编辑内容
  fireEvent.change(getTextarea(container), { target: { value: '接口 A 未保存的编辑内容' } });

  t.is(getTextarea(container).value, '接口 A 未保存的编辑内容', '前置: 接口 A 内已产生编辑态');

  rerender(<TabContent actionId={2} />);

  t.is(refA.current, null, 'key 变化后旧实例应已卸载');
  t.is(refB.current.getValue(), '接口 B 的内容', '新 key 的实例应按新 value 初始化');
  t.is(refB.current.getMarkdown(), '接口 B 的内容');
  t.is(getTextarea(container).value, '接口 B 的内容', 'textarea 应回显接口 B 的内容');
  t.not(
    getTextarea(container).value,
    '接口 A 未保存的编辑内容',
    '重挂载后不应复用上一个接口的编辑状态'
  );
  t.false(
    refB.current.getHtml().includes('接口 A'),
    '渲染结果不应残留上一个接口的内容, 实际为: ' + refB.current.getHtml()
  );
});

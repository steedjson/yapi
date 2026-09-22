// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import { cleanupDom } from '../../helpers/jsdom-setup';

const mockEditor = require('../../../client/components/AceEditor/mockEditor.js');

// 适配层内部可观测状态：语言/只读/可编辑均由 CodeMirror facet 承载
const { language } = require('@codemirror/language');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { jsonLanguage } = require('@codemirror/lang-json');
const { javascriptLanguage } = require('@codemirror/lang-javascript');
const { xmlLanguage } = require('@codemirror/lang-xml');

// 共用全局 DOM，串行执行避免多个 CodeMirror 实例相互干扰
const created = [];

test.serial.afterEach.always(() => {
  // 销毁 CodeMirror view，停止其 requestAnimationFrame 测量循环，避免用例间残留
  while (created.length) {
    const instance = created.pop();
    try {
      instance.editor.view.destroy();
    } catch (e) {
      // view 已被销毁时忽略
    }
  }
  cleanupDom();
});

function createContainer() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function createEditor(options) {
  const container = createContainer();
  const instance = mockEditor(Object.assign({ container: container }, options));
  created.push(instance);
  return { container: container, editor: instance };
}

// 模拟浏览器 paste 事件：CodeMirror 在 contentDOM 上注册了 paste handler，
// 可编辑态会真正执行插入，只读态（state.readOnly 为 true）直接返回而不改文档。
// 用于观测「只读态下不存在通过 DOM 用户输入直接改文档的路径」。
function pasteText(view, text) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  view.contentDOM.dispatchEvent(event);
}

const BEAUTIFIED = '{\n  "b": 1,\n  "a": 2\n}';

test.serial('a) setValue(JSON 字符串) 后 getValue 为 2 空格美化结果, curData.format 为 true', t => {
  const { editor } = createEditor();

  editor.setValue('{"b":1,"a":2}');

  t.is(editor.getValue(), BEAUTIFIED, 'getValue 应为 2 空格缩进的美化 JSON');
  t.is(editor.curData.format, true, '合法 JSON 应把 curData.format 置为 true');
  t.deepEqual(editor.curData.jsonData, { b: 1, a: 2 }, 'jsonData 应为解析后的对象');
  // 独立事实：getValue() 的文本须能被 JSON.parse 还原出同一对象（不依赖 curData.text）
  t.deepEqual(JSON.parse(editor.getValue()), { b: 1, a: 2 }, 'getValue() 应为可独立解析的合法 JSON');

  t.is(editor.editor.getValue(), BEAUTIFIED, 'editor adapter 的 getValue 应反映同一份文档');
});

test.serial('b) curData.mockData() 对 {"name":"@name"} 返回含 name 键的 mock 对象', t => {
  const { editor } = createEditor();

  editor.setValue('{"name":"@name"}');

  t.is(editor.curData.format, true);
  t.is(typeof editor.curData.mockData, 'function', 'mockData 应以函数形式暴露以实现惰性 mock');

  const mocked = editor.curData.mockData();

  t.is(typeof mocked, 'object', 'mockData() 应返回对象');
  t.true(Object.prototype.hasOwnProperty.call(mocked, 'name'), 'mock 结果应保留 name 键');
  t.is(typeof mocked.name, 'string');
  t.true(mocked.name.length > 0, 'mock 结果不应为空串');
  t.not(mocked.name, '@name', '@name 模板应被真正 mock, 而非原样返回');
});

// 守护点：mockEditor.js 中 `curData.mockData = () => Mock.mock(MockExtra(obj, {}))`。
// 仅校验「有 name 键 / 是字符串 / 非空 / ≠ '@name'」时，把 mockData 换成返回固定 stub
// 对象（如 () => ({ name: 'stub' })）仍能通过；这里用判别性模板钉住真实 mock 产出。
test.serial('b2) curData.mockData() 每次真实执行 mockjs (判别性模板, 非固定 stub)', t => {
  const { editor } = createEditor();

  editor.setValue('{"num":"@natural(1000000, 9999999)","id":"@guid"}');

  t.is(editor.curData.format, true, '前置: 模板应为合法 JSON');
  t.deepEqual(
    editor.curData.jsonData,
    { num: '@natural(1000000, 9999999)', id: '@guid' },
    '前置: jsonData 应为解析后的模板对象'
  );

  const first = editor.curData.mockData();

  t.is(typeof first.num, 'number', '@natural 应产出数字, 实际类型: ' + typeof first.num);
  t.true(Number.isInteger(first.num), 'num 应为整数, 实际: ' + first.num);
  t.true(
    first.num >= 1000000 && first.num <= 9999999,
    'num 应落在模板声明区间 [1000000, 9999999] 内, 实际: ' + first.num
  );
  t.true(/^\d{7}$/.test(String(first.num)), 'num 应为 7 位数字, 实际: ' + first.num);
  t.not(String(first.num), '@natural(1000000, 9999999)', '模板应被真正 mock, 而非原样返回');

  t.is(typeof first.id, 'string', 'id 应为字符串, 实际类型: ' + typeof first.id);
  t.true(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(first.id),
    'id 应符合 GUID 形态, 实际: ' + first.id
  );
  t.not(first.id, '@guid', '@guid 模板应被真正 mock, 而非原样返回');

  // 同一模板连续两次调用必须产出不同结果：返回固定 stub 对象必然在此失败
  const second = editor.curData.mockData();

  t.not(
    second.id,
    first.id,
    '两次 mockData() 的 @guid 不应相同（证明每次都真实执行 mock, 而不是返回固定 stub）'
  );
  t.not(
    JSON.stringify(second),
    JSON.stringify(first),
    '两次 mockData() 的产出不应完全相同（固定 stub 会返回同一份内容）'
  );
  t.true(second.num >= 1000000 && second.num <= 9999999, '第二次调用同样应落在区间内');

  // mock 不应消耗模板：jsonData 仍应保持不变并可再次 mock
  t.deepEqual(
    editor.curData.jsonData,
    { num: '@natural(1000000, 9999999)', id: '@guid' },
    'mockData() 不应修改 curData.jsonData 模板'
  );
});

test.serial('c) 非法 JSON 时 curData.format 为真实解析错误信息且不抛错', t => {
  const { editor } = createEditor();

  t.notThrows(() => editor.setValue('{bad'), '非法 JSON 不应抛出异常');

  const firstError = editor.curData.format;

  t.is(typeof firstError, 'string', 'format 应为错误信息字符串');
  t.not(firstError, true, 'format 不应被置为 true');
  t.true(
    firstError.includes('invalid end of input'),
    '错误信息应来自真实 JSON5 解析失败, 实际为: ' + firstError
  );
  t.true(/1:5$/.test(firstError), '错误信息应带出真实出错位置 1:5, 实际为: ' + firstError);
  t.is(editor.getValue(), '{bad', '非法 JSON 应原样保留在文档中');

  // 换一个非法输入：错误信息必须随输入变化（排除 format 被写成常量/笼统文案）
  editor.setValue('[1,');

  const secondError = editor.curData.format;

  t.is(typeof secondError, 'string', 'format 应为错误信息字符串');
  t.true(/1:4$/.test(secondError), '第二个用例应带出位置 1:4, 实际为: ' + secondError);
  t.not(
    secondError,
    firstError,
    '不同非法输入应产生不同错误信息（证明 format 来自真实解析错误而非常量）'
  );

  // 再换一个错误类别：关键字/字符级错误
  editor.setValue('{"a": }');

  const thirdError = editor.curData.format;

  t.true(
    thirdError.includes("invalid character '}'"),
    '语法字符类错误应原样带出解析器关键字, 实际为: ' + thirdError
  );
  t.true(/1:7$/.test(thirdError), '第三个用例应带出位置 1:7, 实际为: ' + thirdError);
  t.is(editor.getValue(), '{"a": }', '非法 JSON 应原样保留在文档中');
});

test.serial('d) insertCode 插入的文本出现在 getValue() 中且不破坏原有内容', t => {
  const { editor } = createEditor();

  editor.setValue('{"a":1}');
  const before = editor.getValue();
  const snippet = '/* injected */';

  editor.insertCode(snippet);

  const after = editor.getValue();
  t.true(after.includes(snippet), '插入的代码应出现在 getValue() 中');
  t.is(after.length, before.length + snippet.length, '文档长度应恰好增加插入文本长度');
  t.is(after.replace(snippet, ''), before, '除插入文本外的原有内容应保持不变');
});

// 守护点：mockEditor.js 中 insertCode 的插入位置
//   const pos = view.state.selection.main.head;
//   view.dispatch({ changes: { from: pos, insert: code }, selection: { anchor: pos } });
// 生产调用面（Postman.js:312、InterfaceColContent.js:525）依赖「插入到光标处」语义，
// 改成「追加到文档末尾」必须让本用例失败（仅断言「内容出现 + 长度增加」无法发现）。
test.serial('d2) insertCode 严格插入到光标处 (逐字位置校验, 而非仅内容出现)', t => {
  const { editor } = createEditor();
  const view = editor.editor.view;

  editor.setValue('{"a":1}');

  const doc = editor.getValue();
  const snippet = '/* injected */';
  const pos = 4;

  t.is(doc, '{\n  "a": 1\n}', '前置: 单行 JSON 应被美化为多行文本');
  t.is(view.state.doc.sliceString(0, pos), '{\n  ', '前置: 待插入位置 N=4 处的原文前缀应确定');
  t.true(pos > 0 && pos < doc.length, '前置: 插入位置必须落在文档中间, 才能与「追加到末尾」区分');

  view.dispatch({ selection: { anchor: pos } });
  t.is(editor.editor.getCursorIndex(), pos, '前置: 光标已移到文档中间');

  editor.insertCode(snippet);

  t.is(view.state.doc.length, doc.length + snippet.length, '文档长度应恰好增加插入文本长度');
  t.is(
    editor.getValue(),
    doc.slice(0, pos) + snippet + doc.slice(pos),
    '全文应精确等于「前 N 字符 + 插入文本 + 后段」'
  );
  t.is(view.state.doc.sliceString(0, pos), doc.slice(0, pos), '插入点之前的前缀应逐字不变');
  t.is(
    view.state.doc.sliceString(pos, pos + snippet.length),
    snippet,
    '插入点起的区间应逐字等于插入文本（插入位置必须是光标处, 而非文档末尾）'
  );
  t.is(view.state.doc.sliceString(pos + snippet.length), doc.slice(pos), '插入点之后的后缀应逐字不变');
  t.is(editor.editor.getCursorIndex(), pos, '插入后光标应停在插入文本之前 (selection.anchor = pos)');

  // 多行文档 + 另一处光标位置：排除「插到行首/行尾/文档末尾」等等价实现
  const MULTI = '{\n  "alpha": 1,\n  "beta": 2\n}';
  const snippet2 = '@@@';
  const pos2 = 20;

  editor.setValue('{"alpha":1,"beta":2}');

  t.is(editor.getValue(), MULTI, '前置: 多行文档内容应确定');
  t.is(MULTI.slice(0, pos2), '{\n  "alpha": 1,\n  "b', '前置: N=20 处的原文前缀应确定');
  t.is(MULTI[pos2 - 1], 'b', '前置: 插入点前一个字符不是换行, 排除「插到行尾」');
  t.is(MULTI[pos2], 'e', '前置: 插入点后一个字符不是换行, 排除「插到行首」');
  t.true(pos2 < MULTI.length, '前置: 插入位置不在文档末尾');

  view.dispatch({ selection: { anchor: pos2 } });
  t.is(editor.editor.getCursorIndex(), pos2, '前置: 光标已移到多行文档中间');

  editor.insertCode(snippet2);

  t.is(editor.getValue(), MULTI.slice(0, pos2) + snippet2 + MULTI.slice(pos2), '多行文档同样应精确插入到光标处');
  t.is(view.state.doc.sliceString(pos2, pos2 + snippet2.length), snippet2, '多行文档插入点处应为插入文本');
  t.is(view.state.doc.sliceString(pos2 + snippet2.length), MULTI.slice(pos2), '多行文档插入点之后应逐字不变');
});

test.serial('e) editor.setMode 真实切换 CodeMirror 语言解析器 (json/javascript/xml/text)', t => {
  const { editor } = createEditor();
  const view = editor.editor.view;

  editor.setValue('{"a":1}');
  const before = editor.getValue();

  t.is(
    view.state.facet(language),
    javascriptLanguage,
    '前置: 默认模式应加载 javascript 语言解析器'
  );

  editor.editor.setMode('json');
  t.is(view.state.facet(language), jsonLanguage, "setMode('json') 应把 language facet 换成 jsonLanguage");

  editor.editor.setMode('xml');
  t.is(view.state.facet(language), xmlLanguage, "setMode('xml') 应把 language facet 换成 xmlLanguage");

  editor.editor.setMode('text');
  t.is(view.state.facet(language), null, "setMode('text') 应卸载语言解析器");

  editor.editor.setMode('javascript');
  t.is(
    view.state.facet(language),
    javascriptLanguage,
    "setMode('javascript') 应把 language facet 换回 javascriptLanguage"
  );

  // 兼容旧 ace 调用方传入的 'ace/mode/xxx' 形式
  editor.editor.setMode('ace/mode/json');
  t.is(
    view.state.facet(language),
    jsonLanguage,
    "setMode('ace/mode/json') 应剥离 ace 前缀后加载 jsonLanguage"
  );

  // 未识别模式退化为 javascript（AceEditor 的 getMode 已兜底为 text，此处覆盖适配层默认分支）
  editor.editor.setMode('unknown-mode');
  t.is(
    view.state.facet(language),
    javascriptLanguage,
    '未识别模式应退化为 javascript 语言解析器'
  );

  t.is(editor.getValue(), before, 'setMode 不应改变文档内容');
});

test.serial('f) container 支持传入 DOM 元素并真实施加到该元素上', t => {
  const container = createContainer();

  t.is(container.classList.contains('yapi-editor'), false, '前置：容器尚未被标记');

  const editor = mockEditor({ container: container, data: '{"a":1}' });
  created.push(editor);

  t.true(container.classList.contains('yapi-editor'), '应在传入的容器上添加 yapi-editor class');
  t.true(container.querySelector('.cm-editor') !== null, 'CodeMirror 应挂载到传入容器内部');
  t.is(editor.getValue(), '{\n  "a": 1\n}', 'data 选项应作为初始内容并被美化');
  t.is(editor.options.container, container, 'options.container 应保留传入的 DOM 元素');
});

test.serial('g) editor.setReadOnly 真实切换只读态 (facet 与 DOM 双向观测)', t => {
  const { editor } = createEditor();

  editor.setValue('{"a":1}');
  const view = editor.editor.view;

  t.is(view.state.facet(EditorState.readOnly), false, '前置: 默认可编辑');
  t.is(view.state.facet(EditorView.editable), true, '前置: editable 应为 true');
  t.is(
    view.contentDOM.getAttribute('contenteditable'),
    'true',
    '前置: DOM 应为 contenteditable=true'
  );

  editor.editor.setReadOnly(true);

  t.is(view.state.facet(EditorState.readOnly), true, 'setReadOnly(true) 应把 readOnly facet 置为 true');
  t.is(view.state.facet(EditorView.editable), false, 'setReadOnly(true) 应把 editable facet 置为 false');
  t.is(
    view.contentDOM.getAttribute('contenteditable'),
    'false',
    'setReadOnly(true) 应反映到 DOM contenteditable=false'
  );

  editor.editor.setReadOnly(false);

  t.is(view.state.facet(EditorState.readOnly), false, 'setReadOnly(false) 应恢复可编辑');
  t.is(view.state.facet(EditorView.editable), true, 'setReadOnly(false) 应恢复 editable');
  t.is(
    view.contentDOM.getAttribute('contenteditable'),
    'true',
    'setReadOnly(false) 应反映到 DOM contenteditable=true'
  );
});

// 守护点：mockEditor.js 构造期的只读初始化
//   readOnlyConf.of([EditorState.readOnly.of(options.readOnly === true),
//                     EditorView.editable.of(options.readOnly !== true)])
// 生产调用面：InterfaceList/View.js:126,133,148 与 Postman.js:986,1013 均以 readOnly={true}
// 构造只读预览编辑器；构造期忽略 options.readOnly（恒可编辑）必须让本用例失败。
test.serial('g2) 构造期 readOnly:true 初始即只读, 未传时初始可编辑 (facet + DOM 双观测)', t => {
  const { editor: readOnlyEditor } = createEditor({ data: '{"a":1}', readOnly: true });
  const roView = readOnlyEditor.editor.view;

  t.is(readOnlyEditor.options.readOnly, true, '前置: options.readOnly 应为 true');

  t.is(
    roView.state.facet(EditorState.readOnly),
    true,
    '构造期 readOnly:true 应使 EditorState.readOnly facet 初始即为 true'
  );
  t.is(
    roView.state.facet(EditorView.editable),
    false,
    '构造期 readOnly:true 应使 EditorView.editable facet 初始即为 false'
  );
  t.is(
    roView.contentDOM.getAttribute('contenteditable'),
    'false',
    '构造期 readOnly:true 应使 contentDOM 的 contenteditable 初始即为 false'
  );
  t.is(
    roView.contentDOM.getAttribute('aria-readonly'),
    'true',
    '构造期 readOnly:true 应在 contentDOM 上标注 aria-readonly'
  );

  // 只读不等于不可用：读取与程序化写入仍应完整可用
  t.is(readOnlyEditor.editor.getValue(), '{\n  "a": 1\n}', '只读态下 editor.getValue() 仍应返回真实文档');
  t.is(readOnlyEditor.getValue(), '{\n  "a": 1\n}', '只读态下 getValue() 仍应返回真实文档');
  t.is(readOnlyEditor.curData.text, '{\n  "a": 1\n}', '只读态下 curData.text 仍应同步');
  t.is(readOnlyEditor.curData.format, true, '只读态下 curData.format 仍应为 true');
  t.deepEqual(readOnlyEditor.curData.jsonData, { a: 1 }, '只读态下 curData.jsonData 仍应为解析结果');
  t.is(typeof readOnlyEditor.curData.mockData, 'function', '只读态下 curData.mockData 仍应为函数');
  t.deepEqual(readOnlyEditor.curData.mockData(), { a: 1 }, '只读态下 mockData() 仍应产出 mock 数据');

  readOnlyEditor.setValue('{"b":2}');

  t.is(readOnlyEditor.getValue(), '{\n  "b": 2\n}', '只读态下程序化 setValue 仍应生效（只读只约束用户输入）');
  t.is(readOnlyEditor.curData.format, true, '只读态下程序化写入后 curData 仍应被同步');

  // 只读态下不存在通过 DOM 用户输入直接改文档的路径
  pasteText(roView, 'PASTED');

  t.is(
    roView.state.doc.toString(),
    '{\n  "b": 2\n}',
    '只读态下 DOM paste 事件不应改变文档（可编辑态无此限制）'
  );

  // 对照组：未传 readOnly 时初始即可编辑, 且同一条 DOM 输入路径确实能改文档,
  // 以此证明上面的「文档不变」不是空转断言。
  const { editor: editableEditor } = createEditor({ data: '{"a":1}' });
  const edView = editableEditor.editor.view;

  t.is(editableEditor.options.readOnly, false, '前置: 未传 readOnly 时应归一化为 false');
  t.is(edView.state.facet(EditorState.readOnly), false, '未传 readOnly 时初始 EditorState.readOnly 应为 false');
  t.is(edView.state.facet(EditorView.editable), true, '未传 readOnly 时初始 EditorView.editable 应为 true');
  t.is(
    edView.contentDOM.getAttribute('contenteditable'),
    'true',
    '未传 readOnly 时 contentDOM 的 contenteditable 应为 true'
  );
  t.not(
    edView.contentDOM.getAttribute('aria-readonly'),
    'true',
    '未传 readOnly 时不应标注 aria-readonly=true'
  );

  pasteText(edView, 'PASTED');

  t.is(
    edView.state.doc.toString(),
    'PASTED{\n  "a": 1\n}',
    '对照组: 可编辑态下同一 paste 路径应真实改变文档（证明只读断言非空转）'
  );
});

test.serial('h) editor.getCursorIndex 返回文档内真实光标位置', t => {
  const { editor } = createEditor();

  editor.setValue('{"a":1}');
  const view = editor.editor.view;
  const docLength = view.state.doc.length;

  const initial = editor.editor.getCursorIndex();

  t.is(typeof initial, 'number', 'getCursorIndex 应返回数字');
  t.true(initial >= 0 && initial <= docLength, '初始光标位置应在文档范围内');

  view.dispatch({ selection: { anchor: 4 } });
  t.is(editor.editor.getCursorIndex(), 4, '光标移到第 4 个字符后 getCursorIndex 应随之变化');

  view.dispatch({ selection: { anchor: docLength } });
  t.is(editor.editor.getCursorIndex(), docLength, '光标移到文档末尾时应返回文档长度');

  const end = editor.editor.getCursorIndex();
  t.true(end >= 0 && end <= view.state.doc.length, '光标位置应始终落在文档范围内');
});

test.serial('i) editor.renderer.setShowGutter 真实切换行号槽 DOM', t => {
  const { container, editor } = createEditor();

  editor.setValue('{"a":1}');

  t.truthy(container.querySelector('.cm-gutters'), '前置: 默认应渲染行号槽');

  editor.editor.renderer.setShowGutter(false);
  t.is(container.querySelector('.cm-gutters'), null, 'setShowGutter(false) 应移除行号槽 DOM');

  editor.editor.renderer.setShowGutter(true);
  t.truthy(container.querySelector('.cm-gutters'), 'setShowGutter(true) 应恢复行号槽 DOM');
});

// 守护点：mockEditor.js 中 options.onChange.call(mockEditor, mockEditor.curData)。
// 该回调是生产主链路——AceEditor.js 把 props.onChange 透传给本模块，上层
// （接口编辑表单）据此回写 req_body_json 等字段；改动此处必须让本用例失败。
test.serial('j) options.onChange 契约: 编辑后以 curData 对象回调, 且 this 指向 mockEditor', t => {
  const calls = [];
  const onChange = function(dataArg) {
    calls.push({ self: this, arg: dataArg });
  };
  // data 为空 => 挂载期文档未变化, 回调次数可与后续每次编辑一一对应
  const { editor } = createEditor({ onChange });

  t.deepEqual(calls, [], '前置: 空文档挂载不应触发 onChange');

  editor.setValue('{"b":1,"a":2}');

  t.is(calls.length, 1, '编辑文档后 onChange 应被调用一次, 实际次数: ' + calls.length);

  const first = calls[0];
  const argType = first.arg === null ? 'null' : typeof first.arg;

  t.true(
    first.arg !== null && typeof first.arg === 'object',
    'onChange 首参应为 curData 对象本身, 不能是字符串; 实际类型: ' + argType
  );
  t.is(
    first.arg,
    editor.curData,
    'onChange 首参应与 editor.curData 为同一引用 (证明调用语义是 call(mockEditor, mockEditor.curData))'
  );
  t.is(first.self, editor, 'onChange 的 this 应绑定到 mockEditor 实例');
  t.is(first.arg.text, BEAUTIFIED, '回调时 curData.text 应已是本次编辑后的最新文档内容');
  t.is(first.arg.text, editor.getValue(), 'curData.text 应与 getValue() 一致');
  t.is(first.arg.format, true, '合法 JSON 时回调中 curData.format 应为 true');
  t.deepEqual(first.arg.jsonData, { b: 1, a: 2 }, '回调中 jsonData 应为解析后的对象');

  // 第二次编辑：同一对象引用被复用，text 必须跟随文档更新
  editor.setValue('{"c":3}');

  t.is(calls.length, 2, '再次编辑应再回调一次');
  const second = calls[1];
  t.is(second.arg, editor.curData, '每次回调都应传同一个 curData 对象引用');
  t.is(second.arg.text, '{\n  "c": 3\n}', '第二次回调中 curData.text 应更新为新文档内容');
  t.not(second.arg.text, BEAUTIFIED, 'curData.text 应随文档变化, 不能停留在上一次内容');
  t.deepEqual(second.arg.jsonData, { c: 3 });

  // 非法 JSON：回调仍须发生，且 format 为真实错误信息
  editor.setValue('{bad');

  t.is(calls.length, 3, '编辑为非法 JSON 时 onChange 仍应回调');
  t.is(calls[2].arg, editor.curData);
  t.is(calls[2].arg.text, '{bad', '非法 JSON 应原样进入 curData.text');
  t.not(calls[2].arg.format, true, '非法 JSON 时回调中 format 不应为 true');
  t.is(typeof calls[2].arg.format, 'string', '非法 JSON 时 format 应为错误信息字符串');
});

test.serial('k) onChange 为可选 prop: 不传时编辑流程仍完整走通', t => {
  const { editor } = createEditor({ data: '{"a":1}' });
  const view = editor.editor.view;

  t.is(editor.curData.format, true, '前置: 初始内容为合法 JSON');

  // 未传 onChange 时若 updateListener 直接调用 options.onChange 会在此抛出 TypeError,
  // 因此本用例不依赖 notThrows, 而是继续断言编辑结果确实落到了文档与 curData 上。
  editor.setValue('{"b":2}');

  t.is(view.state.doc.toString(), '{\n  "b": 2\n}', '未传 onChange 时文档仍应更新');
  t.is(editor.getValue(), '{\n  "b": 2\n}', '未传 onChange 时 getValue() 仍应反映新内容');
  t.is(editor.curData.format, true, '未传 onChange 时 curData 仍应被同步');
  t.deepEqual(editor.curData.jsonData, { b: 2 });
  t.is(typeof editor.curData.mockData, 'function', '未传 onChange 时 mockData 仍应为函数');

  // 非法输入同样不应因缺少 onChange 而中断
  editor.setValue('[1,');

  t.is(editor.getValue(), '[1,', '未传 onChange 时非法 JSON 应原样保留');
  t.is(typeof editor.curData.format, 'string', '未传 onChange 时 format 仍应为错误信息');
  t.not(editor.curData.format, true, '未传 onChange 时非法 JSON 不应被置为 format=true');
});

// 守护点：mockEditor.js 中 editorAdapter.clearSelection 的折叠语义。
test.serial('l) editor.clearSelection 把非空选区折叠到原 head, 且不改动文档', t => {
  const { editor } = createEditor();

  editor.setValue('{"a":1}');

  const view = editor.editor.view;
  const before = editor.getValue();

  view.dispatch({ selection: { anchor: 2, head: 5 } });

  t.is(view.state.selection.main.empty, false, '前置: 已造出非空选区');
  t.is(view.state.selection.main.from, 2, '前置: 选区起点为 2');
  t.is(view.state.selection.main.to, 5, '前置: 选区终点为 5');

  editor.editor.clearSelection();

  t.is(view.state.selection.main.empty, true, 'clearSelection 后选区应被折叠为空选区');
  t.is(view.state.selection.main.anchor, 5, '折叠位置应为原 head (而非重置到 0)');
  t.is(view.state.selection.main.head, 5, '折叠后 head 应保持原 head');
  t.is(editor.editor.getCursorIndex(), 5, 'getCursorIndex 应返回折叠后的位置');
  t.is(editor.getValue(), before, 'clearSelection 不应改变文档内容');

  // 反向选区（head 在锚点之前）同样折叠到 head 一侧
  view.dispatch({ selection: { anchor: 5, head: 2 } });

  t.is(view.state.selection.main.empty, false, '前置: 已造出反向非空选区');
  t.is(view.state.selection.main.head, 2);

  editor.editor.clearSelection();

  t.is(view.state.selection.main.empty, true, '反向选区调用后也应被折叠');
  t.is(view.state.selection.main.head, 2, '反向选区应折叠到 head 一侧');
  t.is(editor.editor.getCursorIndex(), 2, 'getCursorIndex 应返回折叠后的位置');

  // 已折叠时重复调用：不改变光标与文档（早退分支不应破坏既有状态）
  editor.editor.clearSelection();

  t.is(editor.editor.getCursorIndex(), 2, '重复调用 clearSelection 不应移动光标');
  t.is(editor.getValue(), before, '重复调用 clearSelection 不应改变文档');
});

// ---------- F9 全屏与 wordList 补全（TECH_DEBT 登记的覆盖空白） ----------

const { startCompletion } = require('@codemirror/autocomplete');

function pressF9(view) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'F9', code: 'F9', bubbles: true, cancelable: true })
  );
}

test.serial('F9 全屏：声明 fullScreen 的编辑器按键切换 body/挂载节点 fullScreen 类', t => {
  const { container, editor } = createEditor({ fullScreen: true });

  pressF9(editor.editor.view);
  t.true(document.body.classList.contains('fullScreen'), '首次 F9 进入全屏');
  t.true(container.classList.contains('fullScreen'), '挂载节点同步 fullScreen 类');

  pressF9(editor.editor.view);
  t.false(document.body.classList.contains('fullScreen'), '再次 F9 退出全屏');
  t.false(container.classList.contains('fullScreen'), '挂载节点同步移除 fullScreen 类');
});

test.serial('F9 全屏：未声明 fullScreen 的编辑器按键不生效', t => {
  const { container, editor } = createEditor();

  pressF9(editor.editor.view);

  t.false(document.body.classList.contains('fullScreen'), '默认编辑器不响应 F9');
  t.false(container.classList.contains('fullScreen'));
});

test.serial('wordList 选项：@ 触发补全列出注入的 mock 字段（name 作 detail）', async t => {
  const { editor } = createEditor({ wordList: { name: 'WORDLIST_NAME', mock: '@mockFieldX' } });

  editor.setValue('@');
  const view = editor.editor.view;
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  startCompletion(view);
  await new Promise(resolve => setTimeout(resolve, 50));

  const tooltip = document.querySelector('.cm-tooltip-autocomplete');
  t.truthy(tooltip, '应弹出补全面板');
  t.regex(tooltip.textContent, /@mockFieldX/, '注入的 mock 值（含 @ 前缀，与内置词表约定一致）应出现在补全列表');
  t.regex(tooltip.textContent, /WORDLIST_NAME/, 'name 作为 detail 展示');
});

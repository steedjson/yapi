// @ts-check
const { EditorState, Compartment } = require('@codemirror/state');
const { EditorView, keymap, lineNumbers, drawSelection } = require('@codemirror/view');
const { defaultKeymap, history, historyKeymap } = require('@codemirror/commands');
const {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} = require('@codemirror/autocomplete');
const {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle
} = require('@codemirror/language');
const { javascript } = require('@codemirror/lang-javascript');
const { json } = require('@codemirror/lang-json');
const { xml } = require('@codemirror/lang-xml');
const { html } = require('@codemirror/lang-html');
var Mock = require('mockjs');
var json5 = require('json5');
const MockExtra = require('common/mock-extra.js');

var wordList = [
  { name: '字符串', mock: '@string' },
  { name: '自然数', mock: '@natural' },
  { name: '浮点数', mock: '@float' },
  { name: '字符', mock: '@character' },
  { name: '布尔', mock: '@boolean' },
  { name: 'url', mock: '@url' },
  { name: '域名', mock: '@domain' },
  { name: 'ip地址', mock: '@ip' },
  { name: 'id', mock: '@id' },
  { name: 'guid', mock: '@guid' },
  { name: '当前时间', mock: '@now' },
  { name: '时间戳', mock: '@timestamp' },
  { name: '日期', mock: '@date' },
  { name: '时间', mock: '@time' },
  { name: '日期时间', mock: '@datetime' },
  { name: '图片连接', mock: '@image' },
  { name: '图片data', mock: '@imageData' },
  { name: '颜色', mock: '@color' },
  { name: '颜色hex', mock: '@hex' },
  { name: '颜色rgba', mock: '@rgba' },
  { name: '颜色rgb', mock: '@rgb' },
  { name: '颜色hsl', mock: '@hsl' },
  { name: '整数', mock: '@integer' },
  { name: 'email', mock: '@email' },
  { name: '大段文本', mock: '@paragraph' },
  { name: '句子', mock: '@sentence' },
  { name: '单词', mock: '@word' },
  { name: '大段中文文本', mock: '@cparagraph' },
  { name: '中文标题', mock: '@ctitle' },
  { name: '标题', mock: '@title' },
  { name: '姓名', mock: '@name' },
  { name: '中文姓名', mock: '@cname' },
  { name: '中文姓', mock: '@cfirst' },
  { name: '中文名', mock: '@clast' },
  { name: '英文姓', mock: '@first' },
  { name: '英文名', mock: '@last' },
  { name: '中文句子', mock: '@csentence' },
  { name: '中文词组', mock: '@cword' },
  { name: '地址', mock: '@region' },
  { name: '省份', mock: '@province' },
  { name: '城市', mock: '@city' },
  { name: '地区', mock: '@county' },
  { name: '转换为大写', mock: '@upper' },
  { name: '转换为小写', mock: '@lower' },
  { name: '挑选（枚举）', mock: '@pick' },
  { name: '打乱数组', mock: '@shuffle' },
  { name: '协议', mock: '@protocol' }
];

// 语言通过 Compartment 动态切换，替代原 ace getSession().setMode。
const languageConf = new Compartment();
// 行号槽通过 Compartment 开关，替代原 ace renderer.setShowGutter。
const gutterConf = new Compartment();
// 只读态通过 Compartment 切换（EditorState.readOnly 是 facet，动态切换须经 Compartment）。
const readOnlyConf = new Compartment();

/**
 * @param {string} mode
 */
function normalizeMode(mode) {
  if (!mode) {
    return 'javascript';
  }
  return String(mode).replace(/^ace\/mode\//, '');
}

/**
 * @param {string} mode
 */
function getLanguageExt(mode) {
  switch (normalizeMode(mode)) {
    case 'json':
      return json();
    case 'xml':
      return xml();
    case 'html':
      return html();
    case 'text':
      return [];
    case 'javascript':
    default:
      return javascript();
  }
}

// 对齐原 ace/theme/xcode 的浅色视觉。
const xcodeTheme = EditorView.theme({
  '&': { backgroundColor: '#f5f5f5', color: '#000000', height: '100%' },
  '.cm-gutters': { backgroundColor: '#f5f5f5', color: '#aaaaaa', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#000000' },
  '&.cm-focused': { outline: 'none' }
});

// 输入 @ 触发的 mock 字段补全，等价原 ace rhymeCompleter(identifierRegexps: [/@/])。
/**
 * @param {any} context
 */
function mockCompletionSource(context) {
  const word = context.matchBefore(/@[\w-]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }
  return {
    from: word.from,
    options: wordList.map(function(ea) {
      return { label: ea.mock, detail: ea.name, apply: ea.mock, type: 'keyword' };
    }),
    validFor: /^@[\w-]*$/
  };
}

/**
 * @param {any} options
 */
function run(options) {
  /** @type {any} */
  var mockEditor;
  /**
   * @param {any} json
   */
  function handleJson(json) {
    var curData = mockEditor.curData;
    try {
      curData.text = json;
      var obj = json5.parse(json);
      curData.format = true;
      curData.jsonData = obj;
      curData.mockData = () => Mock.mock(MockExtra(obj, {})); //为防止时时 mock 导致页面卡死的问题，改成函数式需要用到再计算
    } catch (e) {
      curData.format = /** @type {any} */ (e).message;
    }
  }
  options = options || {};
  var container, data;
  container = options.container || 'mock-editor';
  if (
    options.wordList &&
    typeof options.wordList === 'object' &&
    options.wordList.name &&
    options.wordList.mock
  ) {
    wordList.push(options.wordList);
  }
  data = options.data || '';
  options.readOnly = options.readOnly || false;
  options.fullScreen = options.fullScreen || false;

  const mountNode = typeof container === 'string' ? document.getElementById(container) : container;
  mountNode.classList.add('yapi-editor');

  // F9 全屏：仅在创建时声明 fullScreen 的编辑器上生效（等价原 editor._fullscreen_yapi 门控）。
  const fullscreenKey = {
    key: 'F9',
    run: (/** @type {any} */ view) => {
      const fullScreen = document.body.classList.toggle('fullScreen');
      mountNode.classList.toggle('fullScreen', fullScreen);
      view.requestMeasure();
      return true;
    }
  };

  /** @type {any} */
  let view;
  const updateListener = EditorView.updateListener.of(update => {
    if (update.docChanged) {
      handleJson(view.state.doc.toString());
      if (typeof options.onChange === 'function') {
        options.onChange.call(mockEditor, mockEditor.curData);
      }
    }
  });

  view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        gutterConf.of(lineNumbers()),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [mockCompletionSource] }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...(options.fullScreen ? [fullscreenKey] : [])
        ]),
        languageConf.of(getLanguageExt('javascript')),
        syntaxHighlighting(defaultHighlightStyle),
        xcodeTheme,
        readOnlyConf.of([
          EditorState.readOnly.of(options.readOnly === true),
          EditorView.editable.of(options.readOnly !== true)
        ]),
        updateListener
      ]
    }),
    parent: mountNode
  });

  // 适配层：向旧消费方暴露 ace 实例曾经提供的最小 API 面
  // （setMode / setReadOnly / clearSelection / getValue / getCursorIndex / renderer.setShowGutter）。
  const editorAdapter = {
    view: view,
    getValue: () => view.state.doc.toString(),
    setMode: (/** @type {string} */ mode) => {
      view.dispatch({ effects: languageConf.reconfigure(getLanguageExt(mode)) });
    },
    setReadOnly: (/** @type {boolean} */ readOnly) => {
      view.dispatch({
        effects: readOnlyConf.reconfigure([
          EditorState.readOnly.of(readOnly === true),
          EditorView.editable.of(readOnly !== true)
        ])
      });
    },
    clearSelection: () => {
      const main = view.state.selection.main;
      if (!main.empty) {
        view.dispatch({ selection: { anchor: main.head } });
      }
    },
    // 等价原 editor.session.doc.positionToIndex(editor.selection.getCursor())
    getCursorIndex: () => view.state.selection.main.head,
    renderer: {
      setShowGutter: (/** @type {boolean} */ show) => {
        view.dispatch({ effects: gutterConf.reconfigure(show ? lineNumbers() : []) });
      }
    }
  };

  mockEditor = {
    curData: {},
    getValue: () => mockEditor.curData.text,
    setValue: function(/** @type {any} */ data) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: handleData(data) }
      });
    },
    editor: editorAdapter,
    options: options,
    insertCode: (/** @type {string} */ code) => {
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: code }, selection: { anchor: pos } });
    }
  };

  /**
   * @param {string} json
   */
  function formatJson(json) {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch (err) {
      return json;
    }
  }

  /**
   * @param {any} data
   */
  function handleData(data) {
    data = data || '';
    if (typeof data === 'string') {
      return formatJson(data);
    } else if (typeof data === 'object') {
      return JSON.stringify(data, null, '  ');
    } else {
      return '' + data;
    }
  }

  mockEditor.setValue(handleData(data));
  handleJson(editorAdapter.getValue());

  editorAdapter.clearSelection();

  return mockEditor;
}

/**
 * mockEditor({
      container: 'req_body_json', //dom的id
      data: that.state.req_body_json, //初始化数据
      onChange: function (d) {
        that.setState({
          req_body_json: d.text
        })
      }
    })
 */
module.exports = run;

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import mockEditor from './mockEditor';
import PropTypes from 'prop-types';
import './AceEditor.scss';

// mode 直接以字符串传给 CodeMirror 6 引擎（javascript/json/text/xml/html）
const ModeMap = {
  javascript: 'javascript',
  json: 'json',
  text: 'text',
  xml: 'xml',
  html: 'html'
};

const defaultStyle = { width: '100%', height: '200px' };

function getMode(mode) {
  return ModeMap[mode] || ModeMap.text;
}

// 旧类组件经 Hooks 现代化，渲染结构与行为保持一致：
// - componentDidMount 改为挂载期 useEffect（创建 mockEditor、设置 mode、回调 callback）；
// - UNSAFE_componentWillReceiveProps 改为 data 变化 useEffect（引用变化才触发，
//   等价旧实现的 nextProps.data !== this.props.data 判断；挂载期跳过，等价旧实现
//   仅在更新期执行）；内部保留 getValue() !== data 的值比较，避免用父组件传入的
//   相同内容覆盖用户当前编辑；
// - 实例字段 this.editor / this.editorElement 改为 ref；实例字段 editor 经
//   forwardRef + useImperativeHandle 原样保留（Postman / InterfaceColContent /
//   InterfaceEditForm 经 ref.editor 访问 mockEditor 实例的 insertCode / curData /
//   editor 适配层，命令式接口面不变）；
// - onChange 与旧实现一致在挂载时被 mockEditor 捕获，后续更换 prop 不生效。
const AceEditor = forwardRef((props, ref) => {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  // 标记是否已跳过首次 useEffect 执行：旧 cWRP 在挂载期不会运行
  const mountedRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editorRef.current;
      }
    }),
    []
  );

  // 对应旧 componentDidMount
  useEffect(() => {
    editorRef.current = mockEditor({
      container: containerRef.current,
      data: props.data,
      onChange: props.onChange,
      readOnly: props.readOnly,
      fullScreen: props.fullScreen
    });
    let mode = props.mode || 'javascript';
    editorRef.current.editor.setMode(getMode(mode));
    if (typeof props.callback === 'function') {
      props.callback(editorRef.current.editor);
    }
    return () => {
      // 卸载后不再暴露失效实例（旧类组件无对应清理；既有调用方仅在编辑器
      // 存续期间的事件回调中访问 ref，不受影响）
      editorRef.current = null;
    };
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps（仅 nextProps.data 变化分支）
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    if (editor.getValue() !== props.data) {
      editor.setValue(props.data);
      let mode = props.mode || 'javascript';
      editor.editor.setMode(getMode(mode));
      editor.editor.clearSelection();
    }
  }, [props.data]);

  return (
    <div
      className={props.className}
      style={props.className ? undefined : props.style || defaultStyle}
      ref={containerRef}
    />
  );
});

AceEditor.displayName = 'AceEditor';

AceEditor.propTypes = {
  data: PropTypes.any,
  onChange: PropTypes.func,
  className: PropTypes.string,
  mode: PropTypes.string, //enum[json, text, javascript], default is javascript
  readOnly: PropTypes.bool,
  callback: PropTypes.func,
  style: PropTypes.object,
  fullScreen: PropTypes.bool,
  insertCode: PropTypes.func
};

export default AceEditor;

// @ts-check
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import MDEditor from '@uiw/react-md-editor';
import MarkdownIt from 'markdown-it';
import '@uiw/react-md-editor/markdown-editor.css';
import './index.scss';

// markdown 源 -> HTML 渲染器：html 透传以兼容历史 desc 中的内嵌标签
const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

/**
 * 通用 Markdown 编辑器（替代历史 vendored 富文本编辑器）。
 *
 * props:
 *  - value: markdown 源字符串（初始值）
 *  - onChange(value): 内容变化回调
 *  - height: 编辑区高度（像素），默认 500
 *  - preview: 预览模式，默认 'edit'（与原 wysiwyg 单栏编辑一致）
 *
 * ref API（兼容原富文本编辑器实例用法）:
 *  - getHtml(): markdown-it 渲染的 HTML（保存时写入 desc）
 *  - getValue() / getMarkdown(): 当前 markdown 源（保存时写入 markdown 字段）
 */
const MarkdownEditor = forwardRef((props, ref) => {
  const {
    value: initialValue = '',
    onChange,
    height = 500,
    preview = 'edit',
    className,
    ...rest
  } = props;
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(initialValue);

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    getMarkdown: () => valueRef.current,
    getHtml: () => mdParser.render(valueRef.current || '')
  }));

  /**
   * @param {string} val
   */
  const handleChange = val => {
    valueRef.current = val || '';
    setValue(val || '');
    if (typeof onChange === 'function') {
      onChange(val || '');
    }
  };

  return (
    <div
      className={'markdown-editor-wrapper' + (className ? ' ' + className : '')}
      data-color-mode="light"
    >
      <MDEditor value={value} onChange={handleChange} height={height} preview={preview} {...rest} />
    </div>
  );
});

MarkdownEditor.displayName = 'MarkdownEditor';

MarkdownEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  height: PropTypes.number,
  preview: PropTypes.oneOf(['live', 'edit', 'preview']),
  className: PropTypes.string
};

export default MarkdownEditor;

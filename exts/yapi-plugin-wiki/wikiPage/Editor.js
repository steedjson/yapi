// @ts-check
import React, { useRef } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import { Button, Checkbox } from 'antd';
import MarkdownEditor from 'client/components/MarkdownEditor';
import 'client/components/MarkdownEditor/contents.scss';

/**
 * Wiki 编辑器包装。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧实例属性 this.editor（MarkdownEditor ref）改为 useRef 持有。
 * @param {any} props
 */
const WikiEditor = props => {
  /** @type {any} */
  const editorRef = useRef(null);

  const onUpload = () => {
    let desc = editorRef.current.getHtml();
    let markdown = editorRef.current.getMarkdown();
    props.onUpload(desc, markdown);
  };

  const { isConflict, onCancel, notice, onEmailNotice, desc } = props;
  return (
    <div>
      <div
        className="wiki-editor"
        style={{ display: !isConflict ? 'block' : 'none' }}
      >
        <MarkdownEditor
          ref={(/** @type {any} */ el) => (editorRef.current = el)}
          value={desc}
          height={500}
        />
      </div>
      <div className="wiki-title wiki-up">
        <Button
          icon={<UploadOutlined />}
          type="primary"
          className="upload-btn"
          disabled={isConflict}
          onClick={onUpload}
        >
          更新
        </Button>
        <Button onClick={onCancel} className="upload-btn">
          取消
        </Button>
        <Checkbox checked={notice} onChange={onEmailNotice}>
          通知相关人员
        </Checkbox>
      </div>
    </div>
  );
};

WikiEditor.propTypes = {
  isConflict: PropTypes.bool,
  onUpload: PropTypes.func,
  onCancel: PropTypes.func,
  notice: PropTypes.bool,
  onEmailNotice: PropTypes.func,
  desc: PropTypes.string
};

export default WikiEditor;

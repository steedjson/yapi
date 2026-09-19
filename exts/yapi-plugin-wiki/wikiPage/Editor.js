// @ts-check
import React, { Component } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import { Button, Checkbox } from 'antd';
import MarkdownEditor from 'client/components/MarkdownEditor';
import 'client/components/MarkdownEditor/contents.scss';

class WikiEditor extends Component {
  static propTypes = {
    isConflict: PropTypes.bool,
    onUpload: PropTypes.func,
    onCancel: PropTypes.func,
    notice: PropTypes.bool,
    onEmailNotice: PropTypes.func,
    desc: PropTypes.string
  };

  onUpload = () => {
    let desc = this.editor.getHtml();
    let markdown = this.editor.getMarkdown();
    this.props.onUpload(desc, markdown);
  };

  render() {
    const { isConflict, onCancel, notice, onEmailNotice, desc } = this.props;
    return (
      <div>
        <div
          className="wiki-editor"
          style={{ display: !isConflict ? 'block' : 'none' }}
        >
          <MarkdownEditor
            ref={(/** @type {any} */ el) => (this.editor = el)}
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
            onClick={this.onUpload}
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
  }
}

export default WikiEditor;

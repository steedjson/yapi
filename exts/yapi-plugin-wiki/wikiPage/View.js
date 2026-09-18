import React from 'react';
import { EditOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import { Button } from 'antd';
import { Link } from 'react-router-dom';
import sanitizeHtml from 'client/utils/sanitize.js';
import 'client/components/MarkdownEditor/contents.scss';

const WikiView = props => {
  const { editorEable, onEditor, uid, username, editorTime, desc } = props;
  return (
    <div className="wiki-view-content">
      <div className="wiki-title">
        <Button icon={<EditOutlined />} onClick={onEditor} disabled={!editorEable}>
          编辑
        </Button>
        {username && (
          <div className="wiki-user">
            由{' '}
            <Link className="user-name" to={`/user/profile/${uid || 11}`}>
              {username}
            </Link>{' '}
            修改于 {editorTime}
          </div>
        )}
      </div>
      <div
        className="markdown-contents"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(desc) }}
      />
    </div>
  );
};

WikiView.propTypes = {
  editorEable: PropTypes.bool,
  onEditor: PropTypes.func,
  uid: PropTypes.number,
  username: PropTypes.string,
  editorTime: PropTypes.string,
  desc: PropTypes.string
};

export default WikiView;

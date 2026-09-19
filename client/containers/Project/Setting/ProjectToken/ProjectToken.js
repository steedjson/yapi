// @ts-check
import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import './ProjectToken.scss';
import { getToken, updateToken as updateTokenAction } from '../../../../reducer/modules/project';
import { useDispatch, useSelector } from 'react-redux';
import { Tooltip, message, Modal } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { copyText } from '../../../../common.js';
const confirm = Modal.confirm;

/**
 * 项目 token 配置。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch；
 * - 旧 componentDidMount 拉取 token 改为挂载期 useEffect；
 * - 旧与 redux action 同名的实例方法 updateToken（刷新确认弹窗）更名为
 *   handleUpdateToken，避免与导入的 action 混淆，行为不变。
 */
/**
 * @param {any} props
 */
const ProjectToken = props => {
  const { projectId, curProjectRole } = props;
  const dispatch = useDispatch();
  const token = useSelector(state => state.project.token);

  useEffect(() => {
    dispatch(getToken(projectId));
  }, []);

  const copyToken = () => {
    copyText(token);
    message.success('已经成功复制到剪切板');
  };

  const handleUpdateToken = () => {
    confirm({
      title: '重新生成key',
      content: '重新生成之后，之前的key将无法使用，确认重新生成吗？',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        await dispatch(updateTokenAction(projectId));
        message.success('更新成功');
      },
      onCancel() {}
    });
  };

  return (
    <div className="project-token">
      <h2 className="token-title">工具标识</h2>
      <div className="message">
        每个项目都有唯一的标识token，用户可以使用这个token值来请求项目 openapi.
      </div>
      <div className="token">
        <span>
          token: <span className="token-message">{token}</span>
        </span>
        <Tooltip title="复制">
          <CopyOutlined className="token-btn" onClick={copyToken} />
        </Tooltip>
        {curProjectRole === 'admin' || curProjectRole === 'owner' ? (
          <Tooltip title="刷新">
            <ReloadOutlined className="token-btn" onClick={handleUpdateToken} />
          </Tooltip>
        ) : null}
      </div>
      <div className="blockquote">
        为确保项目内数据的安全性和私密性，请勿轻易将该token暴露给项目组外用户。
      </div>
      <br />
      <h2  className="token-title">open接口：</h2>
      <p><a target="_blank" rel="noopener noreferrer"   href="https://hellosean1025.github.io/yapi/openapi.html">详细接口文档</a></p>
      <div>
        <ul className="open-api">
          <li>/api/open/run_auto_test [运行自动化测试]</li>
          <li>/api/open/import_data [导入数据]</li>
          <li>/api/interface/add [新增接口]</li>
          <li>/api/interface/save [保存接口]</li>
          <li>/api/interface/up [更新接口]</li>
          <li>/api/interface/get [获取接口]</li>
          <li>/api/interface/list [获取接口列表]</li>
          <li>/api/interface/list_menu [获取接口菜单]</li>
          <li>/api/interface/add_cat [新增接口分类]</li>
          <li>/api/interface/getCatMenu [获取所有分类]</li>
        </ul>
      </div>
    </div>
  );
};

ProjectToken.propTypes = {
  projectId: PropTypes.number,
  curProjectRole: PropTypes.string
};

export default ProjectToken;

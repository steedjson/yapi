// @ts-check
import './ProjectCard.scss';
import React, { useMemo, useRef } from 'react';
import { Card, Tooltip, Modal, Alert, Input, message } from 'antd';
import { CopyOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { getV4Icon } from '../../constants/v4IconMap';
import { useDispatch, useSelector } from 'react-redux';
import { delFollow, addFollow } from '../../reducer/modules/follow';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { debounce } from '../../common';
import constants from '../../constants/variable.js';
import { produce } from 'immer';
import { getProject, checkProjectName, copyProjectMsg } from '../../reducer/modules/project';
import { trim } from '../../common.js';
const confirm = Modal.confirm;

/**
 * @param {any} props
 */
export default function ProjectCard(props) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const uid = useSelector(state => state.user.uid);
  // currPage 与旧 @connect 映射保持一致(历史遗留仅声明未消费),保留订阅避免行为差异
  useSelector(state => state.project.currPage);
  const { projectData, inFollowPage, isShow, callbackResult } = props;

  // 用 ref 始终指向最新 props,防抖回调经 useMemo 只创建一次,避免闭包读到陈旧值
  const latestRef = useRef({});
  latestRef.current = { projectData, uid, callbackResult, dispatch };

  // 复制项目
  /**
   * @param {string} projectName
   */
  async function copy(projectName) {
    const id = latestRef.current.projectData._id;

    let projectDataRes = await dispatch(getProject(id));
    let data = projectDataRes.payload.data.data;
    let newData = produce(data, draftData => {
      draftData.preName = draftData.name;
      draftData.name = projectName;
    });

    await dispatch(copyProjectMsg(newData));
    message.success('项目复制成功');
    latestRef.current.callbackResult();
  }

  // 复制项目的二次确认
  function showConfirm() {
    confirm({
      title: '确认复制 ' + projectData.name + ' 项目吗？',
      okText: '确认',
      cancelText: '取消',
      content: (
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '25px' }}>
          <Alert
            message={`该操作将会复制 ${projectData.name} 下的所有接口集合，但不包括测试集合中的接口`}
            type="info"
          />
          <div style={{ marginTop: '16px' }}>
            <p>
              <b>项目名称:</b>
            </p>
            <Input id="project_name" placeholder="项目名称" />
          </div>
        </div>
      ),
      async onOk() {
        const projectName = trim(
          (/** @type {any} */ (document.getElementById('project_name'))).value
        );

        // 查询项目名称是否重复
        const group_id = projectData.group_id;
        await dispatch(checkProjectName(projectName, group_id));
        copy(projectName);
      },
      iconType: 'copy',
      onCancel() {}
    });
  }

  const del = useMemo(
    () =>
      debounce(() => {
        const { projectData: data, dispatch: d, callbackResult: cb } = latestRef.current;
        const id = data.projectid || data._id;
        d(delFollow(id)).then((/** @type {any} */ res) => {
          if (res.payload.data.errcode === 0) {
            cb();
            // message.success('已取消关注！');  // 星号已做出反馈 无需重复提醒用户
          }
        });
      }, 400),
    []
  );

  const add = useMemo(
    () =>
      debounce(() => {
        const { projectData: data, uid: currentUid, dispatch: d, callbackResult: cb } =
          latestRef.current;
        const param = {
          uid: currentUid,
          projectid: data._id,
          projectname: data.name,
          icon: data.icon || constants.PROJECT_ICON[0],
          color: data.color || constants.PROJECT_COLOR.blue
        };
        d(addFollow(param)).then((/** @type {any} */ res) => {
          if (res.payload.data.errcode === 0) {
            cb();
            // message.success('已添加关注！');  // 星号已做出反馈 无需重复提醒用户
          }
        });
      }, 400),
    []
  );

  return (
    <div className="card-container">
      <Card
        hoverable
        variant="outlined"
        className="m-card"
        onClick={() => navigate('/project/' + (projectData.projectid || projectData._id))}
      >
        <div className="project-card-content">
          <div
            className="ui-logo"
            style={{
              backgroundColor:
                (/** @type {Record<string, string>} */ (constants.PROJECT_COLOR))[
                  projectData.color
                ] || constants.PROJECT_COLOR.blue
            }}
          >
            {React.createElement(getV4Icon(projectData.icon || 'star-o'))}
          </div>
          <h4 className="ui-title" title={projectData.name || projectData.projectname}>
            {projectData.name || projectData.projectname}
          </h4>
        </div>
      </Card>
      <div className="card-btns" onClick={projectData.follow || inFollowPage ? del : add}>
        <Tooltip placement="rightTop" title={projectData.follow || inFollowPage ? '取消关注' : '添加关注'}>
          {projectData.follow || inFollowPage ? (
            <StarFilled className="icon active" />
          ) : (
            <StarOutlined className="icon" />
          )}
        </Tooltip>
      </div>
      {isShow && (
        <div className="copy-btns" onClick={showConfirm}>
          <Tooltip placement="rightTop" title="复制项目">
            <CopyOutlined className="icon" />
          </Tooltip>
        </div>
      )}
    </div>
  );
}

ProjectCard.propTypes = {
  projectData: PropTypes.object,
  inFollowPage: PropTypes.bool,
  callbackResult: PropTypes.func,
  isShow: PropTypes.bool
};

// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Row, Col, Button, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { fetchProjectList } from '../../../reducer/modules/project';
import ProjectCard from '../../../components/ProjectCard/ProjectCard.js';
import ErrMsg from '../../../components/ErrMsg/ErrMsg.js';
// group 切片已迁至 Zustand（批次3），user/project 模块仍未迁移
import useGroupStore from '../../../store/groupStore';
import { setBreadcrumb } from '../../../reducer/modules/user';

import './ProjectList.scss';

/**
 * 分组项目列表。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（userInfo/tableLoading 历史遗留仅声明
 *   未消费，保留订阅避免行为差异；addProject/delProject 注入未被组件体调用，随迁移移除）；
 * - 旧 componentDidMount 改为挂载期 useEffect；
 * - 旧 UNSAFE_componentWillReceiveProps 改为每次渲染后运行的 useEffect + prev ref 比较
 *   （挂载期跳过，等价旧 cWRP 不随挂载触发的语义）；
 * - receiveRes 经 latestRef 镜像读取最新分组/页码，等价旧实现的实时 this.props。
 */
const ProjectList = () => {
  const dispatch = useDispatch();
  const projectList = useSelector((/** @type {any} */ state) => state.project.projectList);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector((/** @type {any} */ state) => state.project.userInfo);
  useSelector((/** @type {any} */ state) => state.project.tableLoading);
  const currGroup = useGroupStore((/** @type {any} */ state) => state.currGroup);
  const currPage = useSelector((/** @type {any} */ state) => state.project.currPage);

  const [state, setState] = useState(
    /** @type {any} */ ({
      projectData: [],
      loadError: false
    })
  );
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 镜像最新 redux 值：异步回调中的读取等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { currGroup, currPage };

  // 对应旧 componentDidMount：分组就绪时拉取项目列表
  useEffect(() => {
    if (latestRef.current.currGroup._id) {
      dispatch(fetchProjectList(latestRef.current.currGroup._id, latestRef.current.currPage)).catch(() => {
        patchState({ loadError: true });
      });
    }
  }, []);

  // 获取 ProjectCard 组件的关注事件回调，收到后更新数据
  const receiveRes = () => {
    dispatch(fetchProjectList(latestRef.current.currGroup._id, latestRef.current.currPage));
  };

  // 对应旧 UNSAFE_componentWillReceiveProps：映射 props 变化时同步面包屑 / 重新拉取 / 同步列表
  const prevPropsRef = useRef(null);
  useEffect(() => {
    const prev = prevPropsRef.current;
    if (prev === null) {
      // 挂载期跳过（旧 cWRP 不随挂载触发）
      prevPropsRef.current = { currGroup, currPage, projectList };
      return;
    }
    prevPropsRef.current = { currGroup, currPage, projectList };

    dispatch(setBreadcrumb([{ name: '' + (currGroup.group_name || '') }]));

    // 切换分组（旧实现此处页码读取的是 this.props.currPage，保持一致读取 prev 快照）
    if (prev.currGroup !== currGroup && currGroup._id) {
      dispatch(fetchProjectList(currGroup._id, prev.currPage)).catch(() => {
        patchState({ loadError: true });
      });
    }

    // 切换项目列表
    if (prev.projectList !== projectList) {
      patchState({
        projectData: projectList.map((/** @type {any} */ item, /** @type {any} */ index) => {
          item.key = index;
          return item;
        })
      });
    }
  });

  if (state.loadError) return <ErrMsg type="projectError" />;
  let projectData = /** @type {any} */ (state.projectData);
  let noFollow = [];
  let followProject = [];
  for (var i in projectData) {
    if (projectData[i].follow) {
      followProject.push(projectData[i]);
    } else {
      noFollow.push(projectData[i]);
    }
  }
  followProject = followProject.sort((/** @type {any} */ a, /** @type {any} */ b) => {
    return b.up_time - a.up_time;
  });
  noFollow = noFollow.sort((/** @type {any} */ a, /** @type {any} */ b) => {
    return b.up_time - a.up_time;
  });
  projectData = [...followProject, ...noFollow];

  const isShow = /(admin)|(owner)|(dev)/.test(currGroup.role);

  const Follow = () => {
    return followProject.length ? (
      <div style={{ marginBottom: '15px' }}>
        <h3 className="owner-type">我的关注</h3>
        <Row gutter={16}>
          {followProject.map((/** @type {any} */ item, /** @type {any} */ index) => {
            return (
              <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                <ProjectCard projectData={item} callbackResult={receiveRes} />
              </Col>
            );
          })}
        </Row>
      </div>
    ) : null;
  };
  const NoFollow = () => {
    return noFollow.length ? (
      <div style={{ borderBottom: '1px solid #eee', marginBottom: '15px' }}>
        <h3 className="owner-type">我的项目</h3>
        <Row gutter={16}>
          {noFollow.map((/** @type {any} */ item, /** @type {any} */ index) => {
            return (
              <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                <ProjectCard projectData={item} callbackResult={receiveRes} isShow={isShow} />
              </Col>
            );
          })}
        </Row>
      </div>
    ) : null;
  };

  const OwnerSpace = () => {
    return projectData.length ? (
      <div>
        <NoFollow />
        <Follow />
      </div>
    ) : (
      <ErrMsg type="noProject" />
    );
  };

  return (
    <div style={{ paddingTop: '24px' }} className="m-panel card-panel card-panel-s project-list">
      <Row className="project-list-header">
        <Col span={16} style={{ textAlign: 'left' }}>
          {currGroup.group_name} 分组共 ({projectData.length}) 个项目
        </Col>
        <Col span={8}>
          {isShow ? (
            <Link to="/add-project">
              <Button type="primary">添加项目</Button>
            </Link>
          ) : (
            <Tooltip title="您没有权限,请联系该分组组长或管理员">
              <Button type="primary" disabled>
                添加项目
              </Button>
            </Tooltip>
          )}
        </Col>
      </Row>
      {currGroup.type === 'private' ? (
        <OwnerSpace />
      ) : (
        <Row gutter={16}>
          {projectData.length ? (
            projectData.map((/** @type {any} */ item, /** @type {any} */ index) => {
              return (
                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                  <ProjectCard projectData={item} callbackResult={receiveRes} isShow={isShow} />
                </Col>
              );
            })
          ) : (
            <Col span={24}>
              <ErrMsg type="noProject" />
            </Col>
          )}
        </Row>
      )}
    </div>
  );
};

export default ProjectList;

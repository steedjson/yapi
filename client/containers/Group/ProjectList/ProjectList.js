// @ts-check
import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
// common/types/global.d.ts 的 antd 声明未包含 Tooltip，且 common/ 不在本次可修改范围内
// @ts-ignore
import { Row, Col, Button, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import {
  addProject,
  fetchProjectList,
  delProject
} from '../../../reducer/modules/project';
import ProjectCard from '../../../components/ProjectCard/ProjectCard.js';
import ErrMsg from '../../../components/ErrMsg/ErrMsg.js';
// core-decorators 无类型声明，按 any 处理
// @ts-ignore
import { autobind } from 'core-decorators';
import { setBreadcrumb } from '../../../reducer/modules/user';

import './ProjectList.scss';

@connect(
  (/** @type {any} */ state) => {
    return {
      projectList: state.project.projectList,
      userInfo: state.project.userInfo,
      tableLoading: state.project.tableLoading,
      currGroup: state.group.currGroup,
      currPage: state.project.currPage
    };
  },
  {
    fetchProjectList,
    addProject,
    delProject,
    setBreadcrumb
  }
)
class ProjectList extends Component {
  constructor(/** @type {any} */ props) {
    super(props);
    this.state = {
      visible: false,
      protocol: 'http://',
      projectData: []
    };
  }
  static propTypes = {
    form: PropTypes.object,
    fetchProjectList: PropTypes.func,
    addProject: PropTypes.func,
    delProject: PropTypes.func,
    projectList: PropTypes.array,
    userInfo: PropTypes.object,
    tableLoading: PropTypes.bool,
    currGroup: PropTypes.object,
    setBreadcrumb: PropTypes.func,
    currPage: PropTypes.number,
    studyTip: PropTypes.number,
    study: PropTypes.bool
  };

  // 修改线上域名的协议类型 (http/https)
  /**
   * @param {any} value
   */
  @autobind
  protocolChange(value) {
    this.setState({
      protocol: value
    });
  }

  // 获取 ProjectCard 组件的关注事件回调，收到后更新数据

  /**
   * @returns {void}
   */
  receiveRes = () => {
    this.props.fetchProjectList(this.props.currGroup._id, this.props.currPage);
  };

  /**
   * @param {any} nextProps
   */
  UNSAFE_componentWillReceiveProps(nextProps) {
    this.props.setBreadcrumb([{ name: '' + (nextProps.currGroup.group_name || '') }]);

    // 切换分组
    if (this.props.currGroup !== nextProps.currGroup && nextProps.currGroup._id) {
      this.props.fetchProjectList(nextProps.currGroup._id, this.props.currPage);
    }

    // 切换项目列表
    if (this.props.projectList !== nextProps.projectList) {
      // console.log(nextProps.projectList);
      const data = nextProps.projectList.map((/** @type {any} */ item, /** @type {any} */ index) => {
        item.key = index;
        return item;
      });
      this.setState({
        projectData: data
      });
    }
  }

  /**
   * @returns {any}
   */
  render() {
    let projectData = /** @type {any} */ (this.state.projectData);
    let noFollow = [];
    let followProject = [];
    for (var i in projectData) {
      if (projectData[i].follow) {
        followProject.push(projectData[i]);
      } else {
        noFollow.push(projectData[i]);
      }
    }
    followProject = followProject.sort((a, b) => {
      return b.up_time - a.up_time;
    });
    noFollow = noFollow.sort((a, b) => {
      return b.up_time - a.up_time;
    });
    projectData = [...followProject, ...noFollow];

    const isShow = /(admin)|(owner)|(dev)/.test(this.props.currGroup.role);

    const Follow = () => {
      return followProject.length ? (
        <div style={{ marginBottom: '15px' }}>
          <h3 className="owner-type">我的关注</h3>
          <Row gutter={16}>
            {followProject.map((item, index) => {
              return (
                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                  <ProjectCard projectData={item} callbackResult={this.receiveRes} />
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
            {noFollow.map((item, index) => {
              return (
                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                  <ProjectCard projectData={item} callbackResult={this.receiveRes} isShow={isShow} />
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
            {this.props.currGroup.group_name} 分组共 ({projectData.length}) 个项目
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
        {this.props.currGroup.type === 'private' ? (
          <OwnerSpace />
        ) : (
          <Row gutter={16}>
            {projectData.length ? (
              projectData.map((/** @type {any} */ item, /** @type {any} */ index) => {
                return (
                  <Col xs={24} sm={12} md={8} lg={6} xl={4} key={index}>
                    <ProjectCard
                      projectData={item}
                      callbackResult={this.receiveRes}
                      isShow={isShow}
                    />
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
  }
}

export default ProjectList;

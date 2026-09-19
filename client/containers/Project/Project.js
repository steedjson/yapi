// @ts-check
import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Route, Routes, Navigate, matchPath } from 'react-router-dom';
import withRouter from '../../withRouter';
import { Subnav } from '../../components/index';
import { fetchGroupMsg } from '../../reducer/modules/group';
import { setBreadcrumb } from '../../reducer/modules/user';
import { getProject } from '../../reducer/modules/project';
import Interface from './Interface/Interface.js';
import Activity from './Activity/Activity.js';
import Setting from './Setting/Setting.js';
import Loading from '../../components/Loading/Loading';
import ErrMsg from '../../components/ErrMsg/ErrMsg.js';
import ProjectMember from './Setting/ProjectMember/ProjectMember.js';
import ProjectData from './Setting/ProjectData/ProjectData.js';
const plugin = require('client/plugin.js');
@connect(
  (/** @type {any} */ state) => {
    return {
      curProject: state.project.currProject,
      currGroup: state.group.currGroup
    };
  },
  {
    getProject,
    fetchGroupMsg,
    setBreadcrumb
  }
)
export default class Project extends Component {
  static propTypes = {
    match: PropTypes.object,
    curProject: PropTypes.object,
    getProject: PropTypes.func,
    location: PropTypes.object,
    fetchGroupMsg: PropTypes.func,
    setBreadcrumb: PropTypes.func,
    currGroup: PropTypes.object
  };

  /**
   * @param {any} props
   */
  constructor(props) {
    super(props);
    this.state = { loadError: false };
  }

  async UNSAFE_componentWillMount() {
    try {
      const project = await this.props.getProject(this.props.match.params.id);
      const projectData = project && project.payload && project.payload.data.data;
      if (!projectData) throw new Error('project not found');
      await this.props.fetchGroupMsg(projectData.group_id);
      this.props.setBreadcrumb([
        { name: projectData.name }
      ]);
    } catch (e) {
      console.error(e);
      this.setState({ loadError: true });
    }
  }

  /**
   * @param {any} nextProps
   */
  async UNSAFE_componentWillReceiveProps(nextProps) {
    const currProjectId = this.props.match.params.id;
    const nextProjectId = nextProps.match.params.id;
    if (currProjectId !== nextProjectId) {
      try {
        const project = await this.props.getProject(nextProjectId);
        const projectData = project && project.payload && project.payload.data.data;
        if (!projectData) throw new Error('project not found');
        await this.props.fetchGroupMsg(projectData.group_id);
        this.setState({ loadError: false });
        this.props.setBreadcrumb([{ name: projectData.name }]);
      } catch (e) {
        console.error(e);
        this.setState({ loadError: true });
      }
    }
  }

  render() {
    if (this.state.loadError) return <ErrMsg type="projectError" />;
    const { match, location } = this.props;
    // path: 绝对路径，用于子导航高亮的 matchPath 与 URL 拼接；
    // route: v6 嵌套路由相对路径（相对 /project/:id 前缀），接口页需 /* 消费更深路径
    let routers = /** @type {any} */ ({
      interface: {
        name: '接口',
        path: '/project/:id/interface/:action',
        route: 'interface/*',
        component: Interface
      },
      activity: { name: '动态', path: '/project/:id/activity', route: 'activity', component: Activity },
      data: { name: '数据管理', path: '/project/:id/data', route: 'data', component: ProjectData },
      members: { name: '成员管理', path: '/project/:id/members', route: 'members', component: ProjectMember },
      setting: { name: '设置', path: '/project/:id/setting', route: 'setting', component: Setting }
    });

    plugin.emitHook('sub_nav', routers);

    let key, defaultName;
    for (key in routers) {
      if (
        // v6 matchPath 参数为 (pattern, pathname)；end: false 保持 v5 前缀匹配语义
        matchPath(
          {
            path: routers[key].path,
            end: false
          },
          location.pathname
        ) !== null
      ) {
        defaultName = routers[key].name;
        break;
      }
    }

    // let subnavData = [{
    //   name: routers.interface.name,
    //   path: `/project/${match.params.id}/interface/api`
    // }, {
    //   name: routers.activity.name,
    //   path: `/project/${match.params.id}/activity`
    // }, {
    //   name: routers.data.name,
    //   path: `/project/${match.params.id}/data`
    // }, {
    //   name: routers.members.name,
    //   path: `/project/${match.params.id}/members`
    // }, {
    //   name: routers.setting.name,
    //   path: `/project/${match.params.id}/setting`
    // }];

    /** @type {any[]} */
    let subnavData = [];
    Object.keys(routers).forEach((/** @type {any} */ key) => {
      let item = routers[key];
      let value = {};
      if (key === 'interface') {
        value = {
          name: item.name,
          path: `/project/${match.params.id}/interface/api`
        };
      } else {
        value = {
          name: item.name,
          path: item.path.replace(/:id/gi, match.params.id)
        };
      }
      subnavData.push(value);
    });

    if (this.props.currGroup && this.props.currGroup.type === 'private') {
      subnavData = subnavData.filter((/** @type {any} */ item) => {
        return item.name != '成员管理';
      });
    }

    if (this.props.curProject == null || Object.keys(this.props.curProject).length === 0) {
      return <Loading visible />;
    }

    return (
      <div>
        <Subnav default={defaultName} data={subnavData} />
        <Routes>
          <Route index element={<Navigate to={`/project/${match.params.id}/interface/api`} />} />
          {Object.keys(routers).map((/** @type {any} */ key) => {
            let item = routers[key];
            // v6 element 不注入路由 props，经兼容 HOC 包装（内部按组件缓存）
            const Wrapped = withRouter(item.component);

            return key === 'members' ? (
              this.props.currGroup.type !== 'private' ? (
                <Route {...{ key: key, path: item.route }} element={<Wrapped />} />
              ) : null
            ) : (
              <Route {...{ key: key, path: item.route }} element={<Wrapped />} />
            );
          })}
          {/* 兜底：未知子路径明确提示不存在，避免静默空白 */}
          <Route
            path="*"
            element={<ErrMsg title="页面不存在" desc="请检查网址是否正确，可从上方导航进入有效页面" />}
          />
        </Routes>
      </div>
    );
  }
}

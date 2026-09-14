import React, { PureComponent as Component } from 'react';
import { Tabs } from 'antd';
import PropTypes from 'prop-types';
import ProjectMessage from './ProjectMessage/ProjectMessage.js';
import ProjectEnv from './ProjectEnv/index.js';
import ProjectRequest from './ProjectRequest/ProjectRequest';
import ProjectToken from './ProjectToken/ProjectToken';
import ProjectMock from './ProjectMock/index.js';
import { connect } from 'react-redux';
const plugin = require('client/plugin.js');

const routers = {}

import './Setting.scss';

@connect(state => {
  return {
    curProjectRole: state.project.currProject.role
  };
})
class Setting extends Component {
  static propTypes = {
    match: PropTypes.object,
    curProjectRole: PropTypes.string
  };
  render() {
    const id = this.props.match.params.id;
    plugin.emitHook('sub_setting_nav', routers);
    const items = [
      {
        label: '项目配置',
        key: '1',
        children: <ProjectMessage projectId={+id} />
      },
      {
        label: '环境配置',
        key: '2',
        children: <ProjectEnv projectId={+id} />
      },
      {
        label: '请求配置',
        key: '3',
        children: <ProjectRequest projectId={+id} />
      }
    ];
    if (this.props.curProjectRole !== 'guest') {
      items.push({
        label: 'token配置',
        key: '4',
        children: <ProjectToken projectId={+id} curProjectRole={this.props.curProjectRole} />
      });
    }
    items.push({
      label: '全局mock脚本',
      key: '5',
      children: <ProjectMock projectId={+id} />
    });
    Object.keys(routers).forEach(key => {
      const C = routers[key].component;
      items.push({
        label: routers[key].name,
        key: routers[key].name,
        children: <C projectId={+id} />
      });
    });
    return (
      <div className="g-row">
        <Tabs type="card" className="has-affix-footer tabs-large" items={items} />
      </div>
    );
  }
}

export default Setting;

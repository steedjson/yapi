import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { Tabs, Layout } from 'antd';
import { Routes, Route, matchPath } from 'react-router-dom';
import { connect } from 'react-redux';
const { Content, Sider } = Layout;

import './interface.scss';

import InterfaceMenu from './InterfaceList/InterfaceMenu.js';
import InterfaceList from './InterfaceList/InterfaceList.js';
import InterfaceContent from './InterfaceList/InterfaceContent.js';

import InterfaceColMenu from './InterfaceCol/InterfaceColMenu.js';
import InterfaceColContent from './InterfaceCol/InterfaceColContent.js';
import InterfaceCaseContent from './InterfaceCol/InterfaceCaseContent.js';
import { getProject } from '../../../reducer/modules/project';
import { setColData } from '../../../reducer/modules/interfaceCol.js';
import withRouter from '../../../withRouter';
// v6 matchPath：end 默认 true，等价于 v5 的 exact: true
const contentRouter = {
  path: '/project/:id/interface/:action/:actionId'
};

const InterfaceRoute = props => {
  let C;
  if (props.match.params.action === 'api') {
    if (!props.match.params.actionId) {
      C = InterfaceList;
    } else if (!isNaN(props.match.params.actionId)) {
      C = InterfaceContent;
    } else if (props.match.params.actionId.indexOf('cat_') === 0) {
      C = InterfaceList;
    }
  } else if (props.match.params.action === 'col') {
    C = InterfaceColContent;
  } else if (props.match.params.action === 'case') {
    C = InterfaceCaseContent;
  } else {
    const params = props.match.params;
    props.history.replace('/project/' + params.id + '/interface/api');
    return null;
  }
  return <C {...props} />;
};

InterfaceRoute.propTypes = {
  match: PropTypes.object,
  history: PropTypes.object
};

// v6 <Route element> 不注入路由 props，经兼容 HOC 包装（内部按组件缓存）
const InterfaceRouteWithRouter = withRouter(InterfaceRoute);

@connect(
  state => {
    return {
      isShowCol: state.interfaceCol.isShowCol
    };
  },
  {
    setColData,
    getProject
  }
)
class Interface extends Component {
  static propTypes = {
    match: PropTypes.object,
    history: PropTypes.object,
    location: PropTypes.object,
    isShowCol: PropTypes.bool,
    getProject: PropTypes.func,
    setColData: PropTypes.func
    // fetchInterfaceColList: PropTypes.func
  };

  constructor(props) {
    super(props);
    // this.state = {
    //   curkey: this.props.match.params.action === 'api' ? 'api' : 'colOrCase'
    // }
  }

  onChange = action => {
    let params = this.props.match.params;
    if (action === 'colOrCase') {
      action = this.props.isShowCol ? 'col' : 'case';
    }
    this.props.history.push('/project/' + params.id + '/interface/' + action);
  };
  async UNSAFE_componentWillMount() {
    this.props.setColData({
      isShowCol: true
    });
    // await this.props.fetchInterfaceColList(this.props.match.params.id)
  }
  render() {
    // v6：本组件经 /project/:id 路由的 interface/* 分支挂载，match.params 被 * 吞并、
    // 不再含 action（v5 为 /project/:id/interface/:action 形态），改由 location
    // 前缀匹配得出当前 tab；end:false 保持 v5 非精确匹配语义
    const actionMatch = matchPath(
      {
        path: '/project/:id/interface/:action',
        end: false
      },
      this.props.location.pathname
    );
    const action = actionMatch && actionMatch.params.action;
    // const activeKey = this.state.curkey;
    const activeKey = action === 'api' ? 'api' : 'colOrCase';

    return (
      <Layout style={{ minHeight: 'calc(100vh - 156px)', marginLeft: '24px', marginTop: '24px' }}>
        <Sider style={{ height: '100%' }} width={300}>
          <div className="left-menu">
            <Tabs
              type="card"
              className="tabs-large"
              activeKey={activeKey}
              onChange={this.onChange}
              items={[
                { label: '接口列表', key: 'api' },
                { label: '测试集合', key: 'colOrCase' }
              ]}
            />
            {activeKey === 'api' ? (
              <InterfaceMenu
                router={matchPath(contentRouter, this.props.location.pathname)}
                projectId={this.props.match.params.id}
              />
            ) : (
              <InterfaceColMenu
                router={matchPath(contentRouter, this.props.location.pathname)}
                projectId={this.props.match.params.id}
              />
            )}
          </div>
        </Sider>
        <Layout>
          <Content
            style={{
              height: '100%',
              margin: '0 24px 0 16px',
              overflow: 'initial',
              backgroundColor: 'var(--sk-bg-component)'
            }}
          >
            <div className="right-content">
              {/* v6 嵌套路由相对路径（相对 /project/:id/interface 前缀），替代原 Switch + exact */}
              <Routes>
                <Route path=":action" element={<InterfaceRouteWithRouter />} />
                <Route path=":action/:actionId" element={<InterfaceRouteWithRouter />} />
              </Routes>
            </div>
          </Content>
        </Layout>
      </Layout>
    );
  }
}

export default Interface;

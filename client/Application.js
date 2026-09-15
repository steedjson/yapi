import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
// v6：unstable_HistoryRouter 接管自定义 history 实例（供 BlockPrompt 拦截导航用）
import { Route, Routes, unstable_HistoryRouter as HistoryRouter } from 'react-router-dom';
import { Home, Group, Project, Follows, AddProject, Login } from './containers/index';
import { Alert } from 'antd';
import User from './containers/User/User.js';
import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Loading from './components/Loading/Loading';
import { checkLoginState } from './reducer/modules/user';
import { requireAuthentication } from './components/AuthenticatedComponent';
import Notify from './components/Notify/Notify';
import withRouter from './withRouter';
import history from './history';

const plugin = require('client/plugin.js');

const LOADING_STATUS = 0;

const alertContent = () => {
  const ua = window.navigator.userAgent,
    isChrome = ua.indexOf('Chrome') && window.chrome;
  if (!isChrome) {
    return (
      <Alert
        style={{ zIndex: 99 }}
        message={'YApi 的接口测试等功能仅支持 Chrome 浏览器，请使用 Chrome 浏览器获得完整功能。'}
        banner
        closable
      />
    );
  }
};

let AppRoute = {
  home: {
    path: '/',
    component: Home
  },
  group: {
    // v6 默认精确匹配，分组页有嵌套路由（/group/:groupId），需以 /* 结尾
    path: '/group/*',
    component: Group
  },
  project: {
    // v6 默认精确匹配，项目页有嵌套路由（接口/动态/设置等），需以 /* 结尾
    path: '/project/:id/*',
    component: Project
  },
  user: {
    // v6 默认精确匹配，用户页有嵌套路由（/user/list、/user/profile/:uid），需以 /* 结尾
    path: '/user/*',
    component: User
  },
  follow: {
    path: '/follow',
    component: Follows
  },
  addProject: {
    path: '/add-project',
    component: AddProject
  },
  login: {
    path: '/login',
    component: Login
  }
};
// 增加路由钩子
plugin.emitHook('app_route', AppRoute);

// v6 <Route> 不再向组件注入路由 props：
// requireAuthentication 依赖 history.push 做登录跳转，需经兼容 HOC 注入；
// 包装结果按组件缓存，保证组件身份稳定避免重挂载。
const authedCache = new Map();
const authed = Component => {
  if (!authedCache.has(Component)) {
    authedCache.set(Component, withRouter(requireAuthentication(Component)));
  }
  return authedCache.get(Component);
};

const AppHeader = withRouter(props => {
  const isLoginPage = props.location && props.location.pathname === '/login';
  if (isLoginPage) return null;
  return props.loginState !== 1 ? <Header /> : null;
});

@connect(
  state => {
    return {
      loginState: state.user.loginState,
      curUserRole: state.user.role
    };
  },
  {
    checkLoginState
  }
)
export default class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      login: LOADING_STATUS
    };
  }

  static propTypes = {
    checkLoginState: PropTypes.func,
    loginState: PropTypes.number,
    curUserRole: PropTypes.string
  };

  componentDidMount() {
    this.props.checkLoginState();
  }

  route = status => {
    let r;
    if (status === LOADING_STATUS) {
      return <Loading visible />;
    } else {
      r = (
        <HistoryRouter history={history}>
          <div className="g-main">
            <div className="router-main">
              {this.props.curUserRole === 'admin' && <Notify />}
              {alertContent()}
              <AppHeader loginState={this.props.loginState} />
              <div className="router-container">
                {/* v6：Route 必须是 Routes 直接子元素，v5 时代顶层裸 Route 独立匹配语义由
                    Routes 的最佳匹配承担（各路径前缀互不重叠，行为等价） */}
                <Routes>
                  {Object.keys(AppRoute).map(key => {
                    let item = AppRoute[key];
                    if (key === 'login' || key === 'home') {
                      return <Route key={key} path={item.path} element={<item.component />} />;
                    }
                    const Authed = authed(item.component);
                    return <Route key={key} path={item.path} element={<Authed />} />;
                  })}
                </Routes>
              </div>
            </div>
            <Footer />
          </div>
        </HistoryRouter>
      );
    }
    return r;
  };

  render() {
    return this.route(this.props.loginState);
  }
}

// @ts-check
import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
// v6：unstable_HistoryRouter 接管自定义 history 实例（供 BlockPrompt 拦截导航用）
import { Route, Routes, unstable_HistoryRouter as HistoryRouter } from 'react-router-dom';
import Home from './containers/Home/Home.js';
import Login from './containers/Login/LoginContainer.js';
import { Alert } from 'antd';
import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Loading from './components/Loading/Loading';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { checkLoginState } from './reducer/modules/user';
import { requireAuthentication } from './components/AuthenticatedComponent';
import Notify from './components/Notify/Notify';
import withRouter from './withRouter';
import history from './history';

const plugin = require('client/plugin.js');

// Route 的类型经 react-router-dom 自带 d.ts 产生 JSX key 属性误报(TS2322:
// Property 'key' does not exist on type 'RouteProps'),而 eslint react/jsx-key
// 又不认可展开写法的 key(参照 Project.js 的 {...{key}} 形态)。
// 经 any 中转后以常规 key 属性书写,类型检查与 lint 两者兼顾,运行时无差异。
const RouteAny = /** @type {any} */ (Route);

const LOADING_STATUS = 0;

/**
 * 路由级代码分割：React.lazy + Suspense 的轻量封装，加载期展示全局 Loading。
 * loader 内必须带 webpackChunkName 注释以命名异步 chunk（project/group/user 等），
 * 使 static/prd/ 下产出独立分包，缩小首屏主包体积。
 * 外层 ErrorBoundary 兜住分包加载失败（线上发版后旧 chunk 404 / 网络中断）与
 * 路由渲染异常：就地展示友好刷新卡片，而不是整树卸载白屏。
 * @param {() => Promise<any>} loader 动态 import 加载器
 * @param {string} chunkName webpack 异步 chunk 名
 */
const createAsyncComponent = (loader, chunkName) => {
  const LazyComponent = React.lazy(loader);
  const AsyncComponent = (/** @type {any} */ props) => (
    <ErrorBoundary>
      <React.Suspense fallback={<Loading visible />}>
        <LazyComponent {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
  AsyncComponent.displayName = `Async(${chunkName})`;
  return AsyncComponent;
};

const Group = createAsyncComponent(
  () => import(/* webpackChunkName: "group" */ './containers/Group/Group.js'),
  'Group'
);
const Project = createAsyncComponent(
  () => import(/* webpackChunkName: "project" */ './containers/Project/Project.js'),
  'Project'
);
const User = createAsyncComponent(
  () => import(/* webpackChunkName: "user" */ './containers/User/User.js'),
  'User'
);
const Follows = createAsyncComponent(
  () => import(/* webpackChunkName: "follows" */ './containers/Follows/Follows.js'),
  'Follows'
);
const AddProject = createAsyncComponent(
  () => import(/* webpackChunkName: "add-project" */ './containers/AddProject/AddProject.js'),
  'AddProject'
);

const alertContent = () => {
  const ua = window.navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && !/Edg|OPR/.test(ua) && window.chrome;
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

/** @type {Record<string, {path: string, component: any}>} 路由表,经 app_route 钩子暴露给插件扩展 */
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
/** @param {any} Component 需要登录态的路由组件 */
const authed = Component => {
  if (!authedCache.has(Component)) {
    authedCache.set(Component, withRouter(requireAuthentication(Component)));
  }
  return authedCache.get(Component);
};

const AppHeader = withRouter((/** @type {any} */ props) => {
  const isLoginPage = props.location && props.location.pathname === '/login';
  if (isLoginPage) return null;
  return props.loginState !== 1 ? <Header /> : null;
});

@connect(
  (/** @type {any} */ state) => {
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
  constructor(/** @type {any} */ props) {
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

  /**
   * 按登录态渲染应用骨架
   * @param {number} status 登录状态(0 加载中/1 已登录)
   */
  route = status => {
    let r;
    if (status === LOADING_STATUS) {
      return <Loading visible />;
    } else {
      r = (
        <HistoryRouter history={/** @type {any} */ (history)}>
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
                      return <RouteAny key={key} path={item.path} element={<item.component />} />;
                    }
                    const Authed = authed(item.component);
                    return <RouteAny key={key} path={item.path} element={<Authed />} />;
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

// react-router v6 兼容层：v6 移除了 withRouter，
// 用 hooks 构造等价的 history/location/match props 注入既有类组件，
// 使 @withRouter 组件零改动迁移。
// 注：v6 无 match.path/isExact 概念，本仓库仅 User.js 使用过 match.path，
// 已改为嵌套路由写法，故此处不再提供。
import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

function wrapComponent(Component) {
  const WithRouter = props => {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();
    const match = {
      params,
      pathname: location.pathname,
      url: location.pathname
    };
    const history = {
      push: (to, state) => navigate(to, { state }),
      replace: (to, state) => navigate(to, { replace: true, state }),
      go: n => navigate(n),
      goBack: () => navigate(-1),
      goForward: () => navigate(1),
      location
    };
    return <Component {...props} match={match} location={location} history={history} />;
  };
  WithRouter.displayName = `withRouter(${Component.displayName || Component.name || 'Component'})`;
  return WithRouter;
}

const cache = new Map();

// 按组件缓存包装结果，保证组件身份稳定，避免每次渲染生成新类型导致子树重挂载
export default function withRouter(Component) {
  if (!cache.has(Component)) {
    cache.set(Component, wrapComponent(Component));
  }
  return cache.get(Component);
}

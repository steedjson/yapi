// @ts-check
import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import { changeMenuItem } from '../reducer/modules/menu';

const LOGIN_PATH = '/login';
const DEFAULT_REDIRECT = '/group';

// 登录后回跳地址的白名单式校验：仅接受站内绝对路径，
// 拒绝绝对 URL、协议相对写法（'//' 与 '/\'）以及回到登录页自身，防止开放重定向。
// 认证守卫（写入 from）与登录页（读取 from）共用同一判定，保持两端语义一致。
/**
 * @param {string | { pathname?: string, search?: string, hash?: string } | null | undefined} from
 * @param {string} [fallback]
 */
export function resolveSafeRedirect(from, fallback = DEFAULT_REDIRECT) {
  let target = '';
  if (typeof from === 'string') {
    target = from;
  } else if (from && typeof from.pathname === 'string') {
    target = `${from.pathname}${from.search || ''}${from.hash || ''}`;
  }
  if (
    target &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.startsWith('/\\') &&
    target !== LOGIN_PATH
  ) {
    return target;
  }
  return fallback;
}

/**
 * @param {any} Component
 */
export function requireAuthentication(Component) {
  // 旧 @connect 类组件经 Hooks 现代化，渲染结构与行为保持一致：
  // - state.user.isLogin 改为 useSelector 订阅，changeMenuItem 改为 useDispatch 派发；
  // - 旧 componentDidMount 改为挂载期 useEffect（未登录仅重置菜单高亮）；
  // - location/history 仍由 Application.js 的 withRouter 兼容层以 props 注入，
  //   本组件自身保持无路由上下文依赖，与旧实现一致。
  /**
   * @param {any} props
   */
  const AuthenticatedComponent = props => {
    const dispatch = useDispatch();
    const isAuthenticated = useSelector(state => state.user.isLogin);

    useEffect(() => {
      // 未登录仅重置菜单高亮；页面跳转统一由 render 中的 <Navigate> 声明式完成，
      // 不再叠加命令式 history.replace，避免双重导航
      if (!isAuthenticated) {
        dispatch(changeMenuItem('/'));
      }
    }, []);

    if (!isAuthenticated) {
      // 携带当前站内位置作为 from，登录成功后回跳，恢复深链接
      const { location } = props;
      const from =
        location && location.pathname && location.pathname !== LOGIN_PATH
          ? {
              pathname: location.pathname,
              search: location.search,
              hash: location.hash
            }
          : null;
      return <Navigate to={LOGIN_PATH} replace state={from ? { from } : undefined} />;
    }
    return <Component {...props} />;
  };
  AuthenticatedComponent.propTypes = {
    location: PropTypes.object,
    history: PropTypes.object
  };
  AuthenticatedComponent.displayName = `AuthenticatedComponent(${Component.displayName ||
    Component.name ||
    'Component'})`;
  return AuthenticatedComponent;
}

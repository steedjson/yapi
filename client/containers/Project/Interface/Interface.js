// @ts-check
import React, { useEffect } from 'react';
import { Tabs, Layout } from 'antd';
import { Routes, Route, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
// interfaceCol 切片已迁至 Zustand（批次3）
import useInterfaceColStore from '../../../store/interfaceColStore';
const { Content, Sider } = Layout;

import './interface.scss';

import InterfaceMenu from './InterfaceList/InterfaceMenu.js';
import InterfaceList from './InterfaceList/InterfaceList.js';
import InterfaceContent from './InterfaceList/InterfaceContent.js';

import InterfaceColMenu from './InterfaceCol/InterfaceColMenu.js';
import InterfaceColContent from './InterfaceCol/InterfaceColContent.js';
import InterfaceCaseContent from './InterfaceCol/InterfaceCaseContent.js';
// v6 matchPath：end 默认 true，等价于 v5 的 exact: true
const contentRouter = {
  path: '/project/:id/interface/:action/:actionId'
};

/**
 * 接口路由分发器。旧实现经 withRouter 兼容层注入 match/history 后透传给
 * 子路由组件；P5 批次全部子路由组件已迁移为 hooks，向下传递的等价
 * match/history/location 结构予以保留以兼容既有签名。
 */
const InterfaceRoute = () => {
  const params = /** @type {any} */ (useParams());
  const location = useLocation();
  const navigate = useNavigate();
  let C = /** @type {any} */ (null);
  if (params.action === 'api') {
    if (!params.actionId) {
      C = InterfaceList;
    } else if (!isNaN(params.actionId)) {
      C = InterfaceContent;
    } else if (params.actionId.indexOf('cat_') === 0) {
      C = InterfaceList;
    }
  } else if (params.action === 'col') {
    C = InterfaceColContent;
  } else if (params.action === 'case') {
    C = InterfaceCaseContent;
  } else {
    navigate('/project/' + params.id + '/interface/api', { replace: true });
    return null;
  }
  // 与旧 withRouter 注入的 match/history 结构逐字段一致
  const match = { params, pathname: location.pathname, url: location.pathname };
  const history = {
    push: (/** @type {any} */ to, /** @type {any} */ state) => navigate(to, { state }),
    replace: (/** @type {any} */ to, /** @type {any} */ state) => navigate(to, { replace: true, state }),
    go: (/** @type {any} */ n) => navigate(n),
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    location
  };
  return <C match={match} history={history} location={location} />;
};

/**
 * 接口主页面（左侧菜单 + 右侧路由内容）。原类组件经 Hooks 现代化迁移，
 * 渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（旧 getProject 映射仅声明未
 *   消费，随迁移移除）；
 * - 旧 UNSAFE_componentWillMount 的 setColData 初始化改为挂载期 useEffect；
 * - 旧 withRouter 注入的 match/history 改为 useParams/useNavigate/useLocation。
 */
const Interface = () => {
  const isShowCol = useInterfaceColStore(state => state.isShowCol);
  const setColData = useInterfaceColStore(state => state.setColData);
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    setColData({ isShowCol: true });
  }, []);

  /**
   * @param {any} action
   */
  const onChange = action => {
    if (action === 'colOrCase') {
      action = isShowCol ? 'col' : 'case';
    }
    navigate('/project/' + params.id + '/interface/' + action);
  };

  // v6：本组件经 /project/:id 路由的 interface/* 分支挂载，useParams 被 * 吞并、
  // 不再含 action（v5 为 /project/:id/interface/:action 形态），改由 location
  // 前缀匹配得出当前 tab；end:false 保持 v5 非精确匹配语义
  const actionMatch = matchPath(
    {
      path: '/project/:id/interface/:action',
      end: false
    },
    location.pathname
  );
  const action = actionMatch && actionMatch.params.action;
  const activeKey = action === 'api' ? 'api' : 'colOrCase';

  return (
    <Layout style={{ minHeight: 'calc(100vh - 156px)', marginLeft: '24px', marginTop: '24px' }}>
      <Sider style={{ height: '100%' }} width={300}>
        <div className="left-menu">
          <Tabs
            type="card"
            className="tabs-large"
            activeKey={activeKey}
            onChange={onChange}
            items={[
              { label: '接口列表', key: 'api' },
              { label: '测试集合', key: 'colOrCase' }
            ]}
          />
          {activeKey === 'api' ? (
            <InterfaceMenu
              router={matchPath(contentRouter, location.pathname)}
              projectId={params.id}
            />
          ) : (
            <InterfaceColMenu
              router={matchPath(contentRouter, location.pathname)}
              projectId={params.id}
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
              <Route path=":action" element={<InterfaceRoute />} />
              <Route path=":action/:actionId" element={<InterfaceRoute />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Interface;

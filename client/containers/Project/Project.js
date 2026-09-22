// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Route, Routes, Navigate, matchPath, useLocation, useParams } from 'react-router-dom';
import withRouter from '../../withRouter';
import { Subnav } from '../../components/index';
// group 切片已迁至 Zustand（批次3），user/project 模块仍未迁移
import useGroupStore from '../../store/groupStore';
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

/**
 * 项目页骨架（子导航 + 子路由分发）。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch；
 * - 旧 @connect 容器注入的 match/location 改为 useParams/useLocation
 *   （子路由组件经 withRouter 兼容层包装的注入逻辑保持不变，见 render）；
 * - 旧 async UNSAFE_componentWillMount 改为挂载期 useEffect；
 * - 旧 async UNSAFE_componentWillReceiveProps（项目 id 变化时重拉）改为 id 变化
 *   useEffect（prev ref 比较，挂载期跳过）。
 */
const Project = () => {
  const dispatch = useDispatch();
  const curProject = useSelector((/** @type {any} */ state) => state.project.currProject);
  const currGroup = useGroupStore((/** @type {any} */ state) => state.currGroup);
  const fetchGroupMsg = useGroupStore((/** @type {any} */ state) => state.fetchGroupMsg);
  const { id } = /** @type {any} */ (useParams());
  const location = useLocation();
  const [loadError, setLoadError] = useState(false);

  /**
   * 拉取项目与分组信息并设置面包屑（对应旧 UNSAFE_componentWillMount 与
   * UNSAFE_componentWillReceiveProps 项目 id 变化分支的共用逻辑）
   * @param {any} projectId
   */
  const loadProject = async projectId => {
    try {
      const project = await dispatch(getProject(projectId));
      const projectData = project && project.payload && project.payload.data.data;
      if (!projectData) throw new Error('project not found');
      await fetchGroupMsg(projectData.group_id);
      setLoadError(false);
      dispatch(setBreadcrumb([{ name: projectData.name }]));
    } catch (/** @type {any} */ e) {
      console.error(e);
      setLoadError(true);
    }
  };

  // 对应旧 async UNSAFE_componentWillMount
  useEffect(() => {
    loadProject(id);
  }, []);

  // 对应旧 async UNSAFE_componentWillReceiveProps：项目 id 变化时重拉
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current === id) return;
    prevIdRef.current = id;
    loadProject(id);
  }, [id]);

  if (loadError) return <ErrMsg type="projectError" />;
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
        path: `/project/${id}/interface/api`
      };
    } else {
      value = {
        name: item.name,
        path: item.path.replace(/:id/gi, id)
      };
    }
    subnavData.push(value);
  });

  if (currGroup && currGroup.type === 'private') {
    subnavData = subnavData.filter((/** @type {any} */ item) => {
      return item.name != '成员管理';
    });
  }

  if (curProject == null || Object.keys(curProject).length === 0) {
    return <Loading visible />;
  }

  return (
    <div>
      <Subnav default={defaultName} data={subnavData} />
      <Routes>
        <Route index element={<Navigate to={`/project/${id}/interface/api`} />} />
        {Object.keys(routers).map((/** @type {any} */ key) => {
          let item = routers[key];
          // v6 element 不注入路由 props，经兼容 HOC 包装（内部按组件缓存）
          const Wrapped = withRouter(item.component);

          return key === 'members' ? (
            currGroup.type !== 'private' ? (
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
};

export default Project;

// @ts-check
import React from 'react';
import { Tabs } from 'antd';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import ProjectMessage from './ProjectMessage/ProjectMessage.js';
import ProjectEnv from './ProjectEnv/index.js';
import ProjectRequest from './ProjectRequest/ProjectRequest';
import ProjectToken from './ProjectToken/ProjectToken';
import ProjectMock from './ProjectMock/index.js';
const plugin = require('client/plugin.js');

const routers = /** @type {any} */ ({});

import './Setting.scss';

/**
 * 项目设置页（Tabs 容器）。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect(state => ({ curProjectRole })) 改为 useSelector；
 * - 旧 withRouter 注入的 match.params.id 改为 useParams；
 * - emitHook('sub_setting_nav') 保持渲染期调用（与旧 render 内调用位置等价，
 *   插件注册的扩展 tab 在每次渲染时重新收集，与旧实现一致）。
 */
const Setting = () => {
  const curProjectRole = useSelector(state => state.project.currProject.role);
  const { id } = /** @type {any} */ (useParams());
  plugin.emitHook('sub_setting_nav', routers);
  /** @type {any[]} */
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
  if (curProjectRole !== 'guest') {
    items.push({
      label: 'token配置',
      key: '4',
      children: <ProjectToken projectId={+id} curProjectRole={curProjectRole} />
    });
  }
  items.push({
    label: '全局mock脚本',
    key: '5',
    children: <ProjectMock projectId={+id} />
  });
  Object.keys(routers).forEach((/** @type {any} */ key) => {
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
};

export default Setting;

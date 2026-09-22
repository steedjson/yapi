// @ts-check
import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
// project 切片已迁至 Zustand（批次4）：store 引用走相对路径（exts 下无 'client/*' 别名映射）
import useProjectStore from '../../../client/store/projectStore';

import './Services.scss';

/**
 * 生成 ts services 设置页。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 Zustand store 订阅（批次4）；
 * - 旧 componentDidMount 的 getToken 拉取改为挂载期 useEffect。
 * @param {any} props
 */
const Services = props => {
  const token = useProjectStore(state => state.token);
  const getToken = useProjectStore(state => state.getToken);

  // 对应旧 componentDidMount
  useEffect(() => {
    const id = props.projectId;
    getToken(id);
  }, []);

  const id = props.projectId;
  return (
    <div className="project-services">
      <section className="news-box m-panel">
        <div className="token">
          <h5>安装工具</h5>
          <pre>{`
  npm i sm2tsservice -D
  `}</pre>
          <h5>配置【3.2.0及以上版本】</h5>
          <pre>{`
  touch json2service.json
  `}</pre>
          <pre>{`
  {
    "url": "yapi-swagger.json",
    "remoteUrl": "${location.protocol}//${location.hostname}${location.port ? `:${location.port}` : ''}/api/open/plugin/export-full?type=json&pid=${id}&status=all&token=${token}",
    "type": "yapi",
    "swaggerParser": {}
  }
  `}</pre>
          <h5>配置【3.2.0以下版本】</h5>
          <pre>{`
  touch json2service.json
  `}</pre>
          <pre>{`
  {
    "url": "${location.protocol}//${location.hostname}${location.port ? `:${location.port}` : ''}/api/open/plugin/export-full?type=json&pid=${id}&status=all&token=${token}",
    "type": "yapi",
    "swaggerParser": {}
  }
  `}</pre>
          <h5>生成services代码</h5>
          <pre>{`
  (./node_modules/.bin/)sm2tsservice --clear
  `}</pre>
        </div>
        <a href="https://github.com/gogoyqj/sm2tsservice">更多说明 sm2tsservice</a>
      </section>
    </div>
  );
};

Services.propTypes = {
  projectId: PropTypes.string
};

export default Services;

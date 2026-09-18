// @ts-check
import React, { useEffect, useState } from 'react';
import GroupList from './GroupList/GroupList.js';
import ProjectList from './ProjectList/ProjectList.js';
import MemberList from './MemberList/MemberList.js';
import GroupLog from './GroupLog/GroupLog.js';
import GroupSetting from './GroupSetting/GroupSetting.js';
import PropTypes from 'prop-types';
// TS 7.0.2 对 react-redux 8 类型链解析不完整（connect 可解析、useSelector 报 TS2305），
// 与上方 antd 同样以 @ts-ignore 处理，运行时导出真实存在
// @ts-ignore
import { useSelector } from 'react-redux';
// common/types/global.d.ts 的 antd 声明未包含 Layout/Spin，且 common/ 不在本次可修改范围内
// @ts-ignore
import { Tabs, Layout, Spin } from 'antd';
import ErrMsg from '../../components/ErrMsg/ErrMsg.js';
const { Content, Sider } = Layout;
import './Group.scss';
import axios from 'axios';

/**
 * 分组页容器。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 的 state 映射改为 useSelector（含历史遗留的 curGroupId 订阅）；
 * - 旧 componentDidMount 改为挂载期 useEffect；
 * - 旧 @connect 注入的 fetchNewsData 仅存在于已注释代码中从未调用，随迁移移除；
 * - 旧 @withRouter 注入的 match/location/history 在本组件中从未使用，随迁移移除。
 */
const Group = () => {
  // 与旧 @connect 映射保持一致：curGroupId 为历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector((/** @type {any} */ state) => state.group.currGroup._id);
  const curUserRole = useSelector((/** @type {any} */ state) => state.user.role);
  const curUserRoleInGroup = useSelector(
    (/** @type {any} */ state) => state.group.currGroup.role || state.group.role
  );
  const currGroup = useSelector((/** @type {any} */ state) => state.group.currGroup);
  const [groupId, setGroupId] = useState(-1);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // get_mygroup 会在用户缺少个人分组时于服务端创建，返回前以 groupId 作渲染 gate
    // （加载中 Spin，失败 ErrMsg）。选中分组统一由 GroupList 按路由/列表同步：
    // 这里不再代为派发选中分组，避免本请求异步返回后覆盖 GroupList 已选中的分组（竞态）。
    (async () => {
      try {
        const r = await axios.get('/api/group/get_mygroup');
        const group = r.data.data;
        if (!group || !group._id) throw new Error('invalid group');
        setGroupId(group._id);
      } catch (e) {
        console.error(e);
        setLoadError(true);
      }
    })();
  }, []);

  if (loadError) return <ErrMsg type="groupError" />;
  if (groupId === -1) return <Spin />;
  const GroupContent = (
    <Layout
      style={{ minHeight: 'calc(100vh - 190px)', marginLeft: '24px', marginTop: '24px' }}
    >
      <Sider style={{ height: '100%' }} width={300}>
        <div className="logo" />
        <GroupList />
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
          <Tabs
            type="card"
            className="m-tab tabs-large"
            style={{ height: '100%' }}
            items={[
              {
                label: '项目列表',
                key: '1',
                children: <ProjectList />
              },
              ...(currGroup.type === 'public'
                ? [
                    {
                      label: '成员列表',
                      key: '2',
                      children: <MemberList />
                    }
                  ]
                : []),
              ...(['admin', 'owner', 'guest', 'dev'].indexOf(curUserRoleInGroup) > -1 ||
              curUserRole === 'admin'
                ? [
                    {
                      label: '分组动态',
                      key: '3',
                      children: <GroupLog />
                    }
                  ]
                : []),
              ...((curUserRole === 'admin' || curUserRoleInGroup === 'owner') &&
              currGroup.type !== 'private'
                ? [
                    {
                      label: '分组设置',
                      key: '4',
                      children: <GroupSetting />
                    }
                  ]
                : [])
            ]}
          />
        </Content>
      </Layout>
    </Layout>
  );
  return <div className="projectGround">{GroupContent}</div>;
};

Group.propTypes = {
  fetchNewsData: PropTypes.func,
  curGroupId: PropTypes.number,
  curUserRole: PropTypes.string,
  currGroup: PropTypes.object,
  curUserRoleInGroup: PropTypes.string
};

export default Group;

// @ts-check
import './index.scss';
import React from 'react';
import { useSelector } from 'react-redux';
import { Routes, Route } from 'react-router-dom';
import List from './List.js';
import PropTypes from 'prop-types';
import Profile from './Profile.js';
import withRouter from '../../withRouter';

// v6 element 不注入路由 props，经兼容 HOC 包装（内部按组件缓存）
const ProfileWithRouter = withRouter(Profile);

const User = () => {
  // 旧 @connect 映射的 curUid/userType/role 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.user.uid);
  useSelector(state => state.user.type);
  useSelector(state => state.user.role);
  return (
    <div>
      <div className="g-doc">
        <div className="user-box">
          {/* v6 嵌套路由相对路径写法（相对 /user 前缀），替代 v5 的 match.path 拼接 */}
          <Routes>
            <Route path="list" element={<List />} />
            <Route path="profile/:uid" element={<ProfileWithRouter />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

User.propTypes = {
  match: PropTypes.object
};

export default User;

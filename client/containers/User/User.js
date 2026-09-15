import './index.scss';
import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import { Routes, Route } from 'react-router-dom';
import List from './List.js';
import PropTypes from 'prop-types';
import Profile from './Profile.js';
import { Row } from 'antd';
import withRouter from '../../withRouter';

// v6 element 不注入路由 props，经兼容 HOC 包装（内部按组件缓存）
const ProfileWithRouter = withRouter(Profile);

@connect(
  state => {
    return {
      curUid: state.user.uid,
      userType: state.user.type,
      role: state.user.role
    };
  },
  {}
)
class User extends Component {
  static propTypes = {
    match: PropTypes.object,
    curUid: PropTypes.number,
    userType: PropTypes.string,
    role: PropTypes.string
  };

  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div>
        <div className="g-doc">
          <Row className="user-box">
            {/* v6 嵌套路由相对路径写法（相对 /user 前缀），替代 v5 的 match.path 拼接 */}
            <Routes>
              <Route path="list" element={<List />} />
              <Route path="profile/:uid" element={<ProfileWithRouter />} />
            </Routes>
          </Row>
        </div>
      </div>
    );
  }
}

export default User;

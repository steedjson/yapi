import React, { useEffect, useRef, useState } from 'react';
import './Follows.scss';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { Row, Col } from 'antd';
import { getFollowList } from '../../reducer/modules/follow';
import { setBreadcrumb } from '../../reducer/modules/user';
import ProjectCard from '../../components/ProjectCard/ProjectCard.js';
import ErrMsg from '../../components/ErrMsg/ErrMsg.js';

const Follows = () => {
  const dispatch = useDispatch();
  const uid = useSelector(state => state.user.uid);
  const [data, setData] = useState([]);

  // 用 ref 始终指向最新值，异步回调读取语义与旧类组件 this.props 一致
  const latestRef = useRef({});
  latestRef.current = { uid };

  function fetchList() {
    return dispatch(getFollowList(latestRef.current.uid)).then(res => {
      if (res.payload.data.errcode === 0) {
        setData(res.payload.data.data.list);
      }
    });
  }

  // 供 ProjectCard 回调：关注状态变化后重新拉取列表
  function receiveRes() {
    fetchList();
  }

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount
    dispatch(setBreadcrumb([{ name: '我的关注' }]));
    fetchList();
  }, []);

  let listData = data;
  listData = listData.sort((a, b) => {
    return b.up_time - a.up_time;
  });
  return (
    <div>
      <div className="g-row" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
        <Row gutter={16} className="follow-box pannel-without-tab">
          {listData.length ? (
            listData.map((item, index) => {
              return (
                <Col xs={6} md={4} xl={3} key={index}>
                  <ProjectCard projectData={item} inFollowPage={true} callbackResult={receiveRes} />
                </Col>
              );
            })
          ) : (
            <ErrMsg type="noFollow" />
          )}
        </Row>
      </div>
    </div>
  );
};

Follows.propTypes = {
  getFollowList: PropTypes.func,
  setBreadcrumb: PropTypes.func,
  uid: PropTypes.number
};

export default Follows;

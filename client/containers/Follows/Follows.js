// @ts-check
import React, { useEffect, useRef } from 'react';
import './Follows.scss';
import PropTypes from 'prop-types';
import { Row, Col } from 'antd';
// 关注列表（试点）与 user 切片（批次4）均已迁至 Zustand，本组件的 redux 依赖随迁移全部移除
import useFollowStore from '../../store/followStore';
import useUserStore from '../../store/userStore';
import ProjectCard from '../../components/ProjectCard/ProjectCard.js';
import ErrMsg from '../../components/ErrMsg/ErrMsg.js';

const Follows = () => {
  const uid = useUserStore(state => state.uid);
  const setBreadcrumb = useUserStore(state => state.setBreadcrumb);
  // zustand 经 JS 推断的 store 类型是有损的，显式收窄 data 以保住回调的上下文类型
  const data = /** @type {any[]} */ (useFollowStore(state => state.data));
  const getFollowList = useFollowStore(state => state.getFollowList);

  // 用 ref 始终指向最新值，异步回调读取语义与旧类组件 this.props 一致
  const latestRef = useRef({});
  latestRef.current = { uid };

  function fetchList() {
    return getFollowList(latestRef.current.uid);
  }

  // 供 ProjectCard 回调：关注状态变化后重新拉取列表
  function receiveRes() {
    fetchList();
  }

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount
    setBreadcrumb([{ name: '我的关注' }]);
    fetchList();
  }, []);

  // data 为 store 状态数组，排序前须拷贝，严禁原地 sort 变更 store
  let listData = data.slice();
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
  uid: PropTypes.number
};

export default Follows;

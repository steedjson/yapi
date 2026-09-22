// @ts-check
import React from 'react';
import TimeTree from '../../../components/TimeLine/TimeLine';
// group 切片已迁至 Zustand（批次3）
import useGroupStore from '../../../store/groupStore';
import PropTypes from 'prop-types';

const GroupLog = () => {
  const curGroupId = useGroupStore(state => state.currGroup._id);
  // 旧 @connect 映射的 uid 历史遗留仅声明未消费，随迁移移除
  return (
    <div className="g-row">
      <section className="news-box m-panel">
        <TimeTree type={'group'} typeid={curGroupId} />
      </section>
    </div>
  );
};

GroupLog.propTypes = {
  match: PropTypes.object
};

export default GroupLog;

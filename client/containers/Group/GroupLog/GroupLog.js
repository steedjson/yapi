import React from 'react';
import TimeTree from '../../../components/TimeLine/TimeLine';
import { useSelector } from 'react-redux';
import PropTypes from 'prop-types';

const GroupLog = () => {
  const curGroupId = useSelector(state => state.group.currGroup._id);
  // 旧 @connect 映射的 uid 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.user.uid + '');
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

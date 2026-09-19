// @ts-check
import './Activity.scss';
import React from 'react';
import TimeTree from '../../../components/TimeLine/TimeLine';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Button } from 'antd';

const Activity = () => {
  const params = /** @type {any} */ (useParams());
  const currProject = useSelector(state => state.project.currProject);
  // 旧 @connect 映射的 uid/curdata 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.user.uid + '');
  useSelector(state => state.inter.curdata);
  return (
    <div className="g-row">
      <section className="news-box m-panel">
        <div style={{ display: 'none' }} className="logHead">
          {/*<Breadcrumb />*/}
          <div className="projectDes">
            <p>高效、易用、可部署的API管理平台</p>
          </div>
          <div className="Mockurl">
            <span>Mock地址：</span>
            <p>
              {location.protocol +
                '//' +
                location.hostname +
                (location.port !== '' ? ':' + location.port : '') +
                `/mock/${currProject._id}${currProject.basepath}/yourPath`}
            </p>
            <Button type="primary">
              <a href={`/api/project/download?project_id=${params.id}`}>下载Mock数据</a>
            </Button>
          </div>
        </div>
        <TimeTree type={'project'} typeid={+params.id} />
      </section>
    </div>
  );
};

Activity.propTypes = {
  getMockUrl: PropTypes.func,
  match: PropTypes.object
};

export default Activity;

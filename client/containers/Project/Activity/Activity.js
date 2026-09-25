// @ts-check
import './Activity.scss';
import React from 'react';
import TimeTree from '../../../components/TimeLine/TimeLine';
// project/user 切片已迁至 Zustand（批次4）；interface 切片历史遗留订阅（仅声明未消费）
// 随批次5 迁移移除
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Button } from 'antd';
import useProjectStore from '../../../store/projectStore';

const Activity = () => {
  const params = /** @type {any} */ (useParams());
  const currProject = useProjectStore(state => state.currProject);
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
  match: PropTypes.object
};

export default Activity;

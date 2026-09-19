// @ts-check
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import { Menu } from 'antd';
import { fetchNewsData } from '../../../reducer/modules/news.js';

const logList = [
  {
    name: '用户'
  },
  {
    name: '分组'
  },
  {
    name: '接口'
  },
  {
    name: '项目'
  }
];

/**
 * @param {any} props
 */
const NewsList = props => {
  const uid = useSelector(state => state.user.uid + '');
  const dispatch = useDispatch();
  const [selectedKeys, setSelectedKeys] = useState(0);
  // 旧 @connect 映射的 newsData 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.news.newsData);

  /**
   * @param {any} e
   */
  function getLogData(e) {
    // page,size,logId
    setSelectedKeys(+e.key);
    props.setLoading(true);
    dispatch((/** @type {any} */ (fetchNewsData))(+uid, 0, 5)).then(function() {
      props.setLoading(false);
    });
  }

  return (
    <div className="logList">
      <h3>日志类型</h3>
      <Menu
        mode="inline"
        selectedKeys={[`${selectedKeys}`]}
        onClick={getLogData}
        items={logList.map((item, i) => ({
          key: `${i}`,
          className: 'log-item',
          label: item.name
        }))}
      />
    </div>
  );
};

NewsList.propTypes = {
  setLoading: PropTypes.func
};

export default NewsList;

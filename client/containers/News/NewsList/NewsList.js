// @ts-check
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Menu } from 'antd';
// news 切片已迁至 Zustand（批次2）、user 切片已迁至 Zustand（批次4），
// 本组件的 redux 依赖随迁移全部移除
import useNewsStore from '../../../store/newsStore';
import useUserStore from '../../../store/userStore';

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
  const uid = useUserStore(state => state.uid) + '';
  const fetchNewsData = useNewsStore(state => state.fetchNewsData);
  const [selectedKeys, setSelectedKeys] = useState(0);
  // 旧 @connect 映射的 newsData 历史遗留仅声明未消费，保留订阅避免行为差异
  useNewsStore(state => state.newsData);

  /**
   * @param {any} e
   */
  function getLogData(e) {
    // 历史疑点(TECH_DEBT.md P7b 登记): 实参 (+uid, 0, 5) 源自 fetchNewsData 旧签名
    // (uid, page, limit) 时代(commit 358459d9, 当时意为 page=0、limit=5); 签名演进为
    // (typeid, type, page, limit, selectValue) 后本调用点未随之迁移, 现按新签名解析为
    // type=0、page=5、limit=PAGE_LIMIT(10), 且菜单点击项 e.key 未参与请求。
    // 语义修复需产品裁决并回归 /api/log/list 行为, 超出范围, 保持现状仅登记说明。
    setSelectedKeys(+e.key);
    props.setLoading(true);
    fetchNewsData(+uid, 0, 5).then(function() {
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

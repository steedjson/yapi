// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Timeline, Spin } from 'antd';
import PropTypes from 'prop-types';
// news 切片已迁至 Zustand（批次2）
import useNewsStore from '../../../store/newsStore';
import { formatTime } from '../../../common.js';
import { timeago } from '../../../../common/utils';
// timeago(new Date().getTime() - 40);

const NewsTimeline = () => {
  const newsData = /** @type {any} */ (useNewsStore(state => state.newsData));
  const curpage = useNewsStore(state => state.curpage);
  const fetchNewsData = useNewsStore(state => state.fetchNewsData);
  const [bidden, setBidden] = useState('');
  const [loading, setLoading] = useState(false);

  // 用 ref 始终指向最新值，异步回调(getMore)读取语义与旧类组件 this.props 一致
  const latestRef = useRef({});
  latestRef.current = { newsData, curpage };

  function getMore() {
    setLoading(true);
    fetchNewsData(21, 'project', curpage, 8).then(function() {
      setLoading(false);
      const current = latestRef.current;
      if (current.newsData.total + 1 === current.curpage) {
        setBidden('logbidden');
      }
    });
  }

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount
    fetchNewsData(21, 'project', curpage, 8);
  }, []);

  let data = newsData ? newsData.list : [];
  if (data && data.length) {
    data = data.map(function(/** @type {any} */ item, /** @type {any} */ i) {
      return (
        <Timeline.Item key={i}>
          <span className="logoTimeago">{timeago(item.add_time)}</span>
          <span className="logusername">{item.username}</span>
          <span className="logtype">{item.type}</span>
          <span className="logtime">{formatTime(item.add_time)}</span>
          <span className="logcontent">{item.content}</span>
        </Timeline.Item>
      );
    });
  } else {
    data = '';
  }
  let pending = bidden ? (
    <a className={bidden}>以上为全部内容</a>
  ) : (
    <a className="loggetMore" onClick={getMore}>
      查看更多
    </a>
  );
  if (loading) {
    pending = <Spin />;
  }
  return (
    <section className="news-timeline">
      {data ? <Timeline pending={pending}>{data}</Timeline> : data}
    </section>
  );
};

NewsTimeline.propTypes = {
  newsData: PropTypes.object,
  fetchNewsData: PropTypes.func,

  setLoading: PropTypes.func,
  loading: PropTypes.bool,
  curpage: PropTypes.number
};

export default NewsTimeline;

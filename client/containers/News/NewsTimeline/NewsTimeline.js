// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Timeline, Spin } from 'antd';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { formatTime } from '../../../common.js';
import { fetchNewsData } from '../../../reducer/modules/news.js';
import { timeago } from '../../../../common/utils';
// timeago(new Date().getTime() - 40);

const NewsTimeline = () => {
  const dispatch = useDispatch();
  const newsData = useSelector(state => state.news.newsData);
  const curpage = useSelector(state => state.news.curpage);
  const [bidden, setBidden] = useState('');
  const [loading, setLoading] = useState(false);

  // 用 ref 始终指向最新值，异步回调(getMore)读取语义与旧类组件 this.props 一致
  const latestRef = useRef({});
  latestRef.current = { newsData, curpage };

  function getMore() {
    setLoading(true);
    dispatch((/** @type {any} */ (fetchNewsData))(21, 'project', curpage, 8)).then(function() {
      setLoading(false);
      const current = latestRef.current;
      if (current.newsData.total + 1 === current.curpage) {
        setBidden('logbidden');
      }
    });
  }

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount
    dispatch((/** @type {any} */ (fetchNewsData))(21, 'project', curpage, 8));
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

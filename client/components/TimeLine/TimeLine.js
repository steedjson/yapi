// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Timeline, Spin, Row, Col, Tag, Avatar, Button, Modal, AutoComplete } from 'antd';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import { formatTime } from '../../common.js';
import showDiffMsg from '../../../common/diff-view.js';
import sanitizeHtml from '../../utils/sanitize.js';
import variable from '../../constants/variable';
import { Link } from 'react-router-dom';
// news 切片已迁至 Zustand（批次2），interface 模块仍未迁移
import useNewsStore from '../../store/newsStore';
import { fetchInterfaceList } from '../../reducer/modules/interface.js';
import ErrMsg from '../ErrMsg/ErrMsg.js';
// jsondiffpatch 0.7 起移除 dist UMD 产物, 主入口为 CJS/ESM 双形态, webpack 直接打包 lib;
// formatters 亦从主入口移除, 改为子路径导出 jsondiffpatch/formatters/html
const jsondiffpatch = require('jsondiffpatch');
const formattersHtml = require('jsondiffpatch/formatters/html');
import 'jsondiffpatch/formatters/styles/annotated.css';
import 'jsondiffpatch/formatters/styles/html.css';
import './TimeLine.scss';
import { timeago } from '../../../common/utils.js';

// const Option = AutoComplete.Option;
const { Option, OptGroup } = AutoComplete;

/**
 * @param {any} props
 */
const AddDiffView = props => {
  const { title, content, className } = props;

  if (!content) {
    return null;
  }

  return (
    <div className={className}>
      <h3 className="title">{title}</h3>
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
    </div>
  );
};

AddDiffView.propTypes = {
  title: PropTypes.string,
  content: PropTypes.string,
  className: PropTypes.string
};

// timeago(new Date().getTime() - 40);

/**
 * @param {any} props
 */
export default function TimeTree(props) {
  const dispatch = useDispatch();
  // news 切片已迁至 Zustand（批次2）；user 切片已迁至 Zustand（批次4），
  // 原历史遗留的 user.uid 订阅（仅声明未消费）随迁移移除
  const newsData = /** @type {any} */ (useNewsStore(state => state.newsData));
  const curpage = useNewsStore(state => state.curpage);
  const fetchNewsData = useNewsStore(state => state.fetchNewsData);
  const fetchMoreNews = useNewsStore(state => state.fetchMoreNews);

  // 旧版 state.bidden 仅被写入从未被读取(死状态),迁移时一并移除
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [curDiffData, setCurDiffData] = useState(/** @type {any} */ ({}));
  const [apiList, setApiList] = useState(/** @type {any[]} */ ([]));
  // 非响应式的实例字段,改用 ref 承载
  const curSelectValueRef = useRef('');

  // 用 ref 始终指向最新 props/state,异步回调(getMore)中读取时不会拿到陈旧值
  const latestRef = useRef({});
  latestRef.current = { typeid: props.typeid, type: props.type, newsData, curpage, dispatch };

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount + UNSAFE_componentWillReceiveProps:
    // 首次挂载与 typeid 变化时都重新拉取动态数据
    const current = latestRef.current;
    fetchNewsData(current.typeid, current.type, 1, 10);
    if (current.type === 'project') {
      getApiList();
    }
  }, [props.typeid, props.type]);

  function getMore() {
    const current = latestRef.current;

    if (current.curpage <= current.newsData.total) {
      setLoading(true);
      fetchMoreNews(
        current.typeid,
        current.type,
        current.curpage + 1,
        10,
        curSelectValueRef.current
      ).then(function() {
        setLoading(false);
      });
    }
  }

  function handleCancel() {
    setVisible(false);
  }

  /**
   * @param {any} data
   */
  function openDiff(data) {
    setCurDiffData(data);
    setVisible(true);
  }

  async function getApiList() {
    let result = await latestRef.current.dispatch(
      fetchInterfaceList({
        project_id: latestRef.current.typeid,
        limit: 'all'
      })
    );
    setApiList(result.payload.data.data.list);
  }

  /**
   * @param {string} selectValue
   */
  function handleSelectApi(selectValue) {
    curSelectValueRef.current = selectValue;
    fetchNewsData(props.typeid, props.type, 1, 10, selectValue);
  }

  let data = newsData ? newsData.list : [];

  /** @type {Record<string, string>} */
  let logType = {
    project: '项目',
    group: '分组',
    interface: '接口',
    interface_col: '接口集',
    user: '用户',
    other: '其他'
  };

  const children = apiList.map((/** @type {any} */ item) => {
    let methodColor = (/** @type {Record<string, any>} */ (variable.METHOD_COLOR))[
      item.method ? item.method.toLowerCase() : 'get'
    ];
    return (
      <Option title={item.title} value={item._id + ''} path={item.path} key={item._id}>
        {item.title}{' '}
        <Tag
          style={{ color: methodColor ? methodColor.color : '#cfefdf', backgroundColor: methodColor ? methodColor.bac : '#00a854', border: 'unset' }}
        >
          {item.method}
        </Tag>
      </Option>
    );
  });

  children.unshift(
    <Option value="" key="all">
      选择全部
    </Option>
  );

  let timelineItems = [];
  if (data && data.length) {
    timelineItems = data.map((/** @type {any} */ item, /** @type {number} */ i) => {
      let interfaceDiff = false;
      if (item.data && typeof item.data === 'object') {
        interfaceDiff = true;
      }
      return {
        key: i,
        dot: (
          <Link to={`/user/profile/${item.uid}`}>
            <Avatar src={`/api/user/avatar?uid=${item.uid}`} />
          </Link>
        ),
        children: (
          <div>
            <div className="logMesHeade">
              <span className="logoTimeago">{timeago(item.add_time)}</span>
              <span className="logtype">{logType[item.type]}动态</span>
              <span className="logtime">{formatTime(item.add_time)}</span>
            </div>
            <span
              className="logcontent"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }}
            />
            <div style={{ padding: '10px 0 0 10px' }}>
              {interfaceDiff && <Button onClick={() => openDiff(item.data)}>改动详情</Button>}
            </div>
          </div>
        )
      };
    });
  }
  let pending =
    newsData.total <= curpage ? (
      <a className="logbidden">以上为全部内容</a>
    ) : (
      <a className="loggetMore" onClick={getMore}>
        查看更多
      </a>
    );
  if (loading) {
    pending = <Spin />;
  }
  let diffView = showDiffMsg(jsondiffpatch, formattersHtml, curDiffData);

  return (
    <section className="news-timeline">
      <Modal
        style={{ minWidth: '800px' }}
        title="Api 改动日志"
        open={visible}
        footer={null}
        onCancel={handleCancel}
      >
        <i>注： 绿色代表新增内容，红色代表删除内容</i>
        <div className="project-interface-change-content">
          {diffView.map((/** @type {any} */ item, /** @type {number} */ index) => {
            return (
              <AddDiffView
                className="item-content"
                title={item.title}
                key={index}
                content={item.content}
              />
            );
          })}
          {diffView.length === 0 && <ErrMsg type="noChange" />}
        </div>
      </Modal>
      {props.type === 'project' && (
        <Row className="news-search">
          <Col span="3">选择查询的 Api：</Col>
          <Col span="10">
            <AutoComplete
              onSelect={handleSelectApi}
              style={{ width: '100%' }}
              placeholder="Select Api"
              optionLabelProp="title"
              filterOption={(/** @type {any} */ inputValue, /** @type {any} */ options) => {
                if (options.props.value == '') return true;
                if (
                  options.props.path.indexOf(inputValue) !== -1 ||
                  options.props.title.indexOf(inputValue) !== -1
                ) {
                  return true;
                }
                return false;
              }}
            >
              {/* {children} */}
              <OptGroup label="other">
                <Option value="wiki" path="" title="wiki">
                  wiki
                </Option>
              </OptGroup>
              <OptGroup label="api">{children}</OptGroup>
            </AutoComplete>
          </Col>
        </Row>
      )}
      {timelineItems && timelineItems.length > 0 ? (
        <Timeline className="news-content" pending={pending} items={timelineItems} />
      ) : (
        <ErrMsg type="noData" />
      )}
    </section>
  );
}

TimeTree.propTypes = {
  typeid: PropTypes.number,
  type: PropTypes.string
};

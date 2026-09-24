// @ts-check
import './View.scss';
import React, { useEffect, useState } from 'react';
// group/project 切片已迁至 Zustand（批次3 / 批次4）；interface 切片已迁至 Zustand（批次5）
import useGroupStore from '../../../../store/groupStore';
import useProjectStore from '../../../../store/projectStore';
import useInterfaceStore from '../../../../store/interfaceStore';
import { FileOutlined, CopyOutlined } from '@ant-design/icons';
import { Table, Row, Col, Tooltip, message } from 'antd';
import { Link } from 'react-router-dom';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { formatTime, safeArray, copyText } from '../../../../common.js';
import ErrMsg from '../../../../components/ErrMsg/ErrMsg.js';
import variable from '../../../../constants/variable';
import constants from '../../../../constants/variable.js';
import SchemaTable from '../../../../components/SchemaTable/SchemaTable.js';
import sanitizeHtml from 'client/utils/sanitize.js';
import 'client/components/MarkdownEditor/contents.scss';

const HTTP_METHOD = constants.HTTP_METHOD;

/**
 * 接口详情预览 Tab。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 store 订阅（interface 切片批次5 迁 Zustand）；
 * - 旧 componentDidMount（curData 无 title 时把 init 置为 false，切换为
 *   ErrMsg 兜底展示）改为仅挂载期执行一次的 useEffect；
 * - 原实例渲染辅助方法改为组件内普通函数，行为不变。
 */
const View = () => {
  const curData = useInterfaceStore(state => state.curdata);
  const custom_field = useGroupStore(state => state.field);
  const currProject = useProjectStore(state => state.currProject);

  const [state, setState] = useState({
    init: true,
    enter: false
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 对应旧 componentDidMount：仅挂载期执行一次
  useEffect(() => {
    if (!curData.title && state.init) {
      patchState({ init: false });
    }
  }, []);

  /**
   * @param {any} req_body_type
   * @param {any} req_body_form
   */
  const req_body_form = (req_body_type, req_body_form) => {
    if (req_body_type === 'form') {
      /** @type {any[]} */
      const columns = [
        {
          title: '参数名称',
          dataIndex: 'name',
          key: 'name',
          width: 140
        },
        {
          title: '参数类型',
          dataIndex: 'type',
          key: 'type',
          width: 100,
          render: (/** @type {any} */ text) => {
            text = text || '';
            return text.toLowerCase() === 'text' ? (
              <span>
                <i className="query-icon text">T</i>文本
              </span>
            ) : (
              <span>
                <FileOutlined className="query-icon" />文件
              </span>
            );
          }
        },
        {
          title: '是否必须',
          dataIndex: 'required',
          key: 'required',
          width: 100
        },
        {
          title: '示例',
          dataIndex: 'example',
          key: 'example',
          width: 80,
          render(/** @type {any} */ _, /** @type {any} */ item) {
            return <p style={{ whiteSpace: 'pre-wrap' }}>{item.example}</p>;
          }
        },
        {
          title: '备注',
          dataIndex: 'value',
          key: 'value',
          render(/** @type {any} */ _, /** @type {any} */ item) {
            return <p style={{ whiteSpace: 'pre-wrap' }}>{item.value}</p>;
          }
        }
      ];

      /** @type {any[]} */
      const dataSource = [];
      if (req_body_form && req_body_form.length) {
        req_body_form.map((/** @type {any} */ item, /** @type {number} */ i) => {
          dataSource.push({
            key: i,
            name: item.name,
            value: item.desc,
            example: item.example,
            required: item.required == 0 ? '否' : '是',
            type: item.type
          });
        });
      }

      return (
        <div style={{ display: dataSource.length ? '' : 'none' }} className="colBody">
          <Table
            bordered
            size="small"
            pagination={false}
            columns={columns}
            dataSource={dataSource}
          />
        </div>
      );
    }
  };

  /**
   * @param {any} res_body_type
   * @param {any} res_body
   * @param {any} res_body_is_json_schema
   */
  const res_body = (res_body_type, res_body, res_body_is_json_schema) => {
    if (res_body_type === 'json') {
      if (res_body_is_json_schema) {
        return <SchemaTable dataSource={res_body} />;
      } else {
        return (
          <div className="colBody">
            {/* <div id="vres_body_json" style={{ minHeight: h * 16 + 100 }}></div> */}
            <AceEditor data={res_body} readOnly={true} style={{ minHeight: 600 }} />
          </div>
        );
      }
    } else if (res_body_type === 'raw') {
      return (
        <div className="colBody">
          <AceEditor data={res_body} readOnly={true} mode="text" style={{ minHeight: 300 }} />
        </div>
      );
    }
  };

  /**
   * @param {any} req_body_type
   * @param {any} req_body_other
   * @param {any} req_body_is_json_schema
   */
  const req_body = (req_body_type, req_body_other, req_body_is_json_schema) => {
    if (req_body_other) {
      if (req_body_is_json_schema && req_body_type === 'json') {
        return <SchemaTable dataSource={req_body_other} />;
      } else {
        return (
          <div className="colBody">
            <AceEditor
              data={req_body_other}
              readOnly={true}
              style={{ minHeight: 300 }}
              mode={req_body_type === 'json' ? 'javascript' : 'text'}
            />
          </div>
        );
      }
    }
  };

  /**
   * @param {any} query
   */
  const req_query = query => {
    /** @type {any[]} */
    const columns = [
      {
        title: '参数名称',
        dataIndex: 'name',
        width: 140,
        key: 'name'
      },
      {
        title: '是否必须',
        width: 100,
        dataIndex: 'required',
        key: 'required'
      },
      {
        title: '示例',
        dataIndex: 'example',
        key: 'example',
        width: 80,
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.example}</p>;
      }
    },
    {
      title: '备注',
      dataIndex: 'value',
      key: 'value',
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.value}</p>;
      }
    }
  ];

  /** @type {any[]} */
  const dataSource = [];
  if (query && query.length) {
    query.map((/** @type {any} */ item, /** @type {number} */ i) => {
        dataSource.push({
          key: i,
          name: item.name,
          value: item.desc,
          example: item.example,
          required: item.required == 0 ? '否' : '是'
        });
      });
    }

    return (
      <Table bordered size="small" pagination={false} columns={columns} dataSource={dataSource} />
    );
  };

  const enterItem = () => {
    patchState({
      enter: true
    });
  };

  const leaveItem = () => {
    patchState({
      enter: false
    });
  };

  /**
   * @param {any} url
   */
  const copyUrl = url => {
    copyText(url);
    message.success('已经成功复制到剪切板');
  };

  /**
   * @param {any} mock
   * @param {any} strice
   */
  const flagMsg = (mock, strice) => {
    if (mock && strice) {
      return <span>( 全局mock & 严格模式 )</span>;
    } else if (!mock && strice) {
      return <span>( 严格模式 )</span>;
    } else if (mock && !strice) {
      return <span>( 全局mock )</span>;
    } else {
      return;
    }
  };

  /** @type {any[]} */
  const dataSource = [];
  if (curData.req_headers && curData.req_headers.length) {
    curData.req_headers.map((/** @type {any} */ item, /** @type {number} */ i) => {
      dataSource.push({
        key: i,
        name: item.name,
        required: item.required == 0 ? '否' : '是',
        value: item.value,
        example: item.example,
        desc: item.desc
      });
    });
  }

  /** @type {any[]} */
  const req_dataSource = [];
  if (curData.req_params && curData.req_params.length) {
    curData.req_params.map((/** @type {any} */ item, /** @type {number} */ i) => {
      req_dataSource.push({
        key: i,
        name: item.name,
        desc: item.desc,
        example: item.example
      });
    });
  }
  /** @type {any[]} */
  const req_params_columns = [
    {
      title: '参数名称',
      dataIndex: 'name',
      key: 'name',
      width: 140
    },
    {
      title: '示例',
      dataIndex: 'example',
      key: 'example',
      width: 80,
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.example}</p>;
      }
    },
    {
      title: '备注',
      dataIndex: 'desc',
      key: 'desc',
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.desc}</p>;
      }
    }
  ];

  /** @type {any[]} */
  const columns = [
    {
      title: '参数名称',
      dataIndex: 'name',
      key: 'name',
      width: '200px'
    },
    {
      title: '参数值',
      dataIndex: 'value',
      key: 'value',
      width: '300px'
    },
    {
      title: '是否必须',
      dataIndex: 'required',
      key: 'required',
      width: '100px'
    },
    {
      title: '示例',
      dataIndex: 'example',
      key: 'example',
      width: '80px',
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.example}</p>;
      }
    },
    {
      title: '备注',
      dataIndex: 'desc',
      key: 'desc',
      render(/** @type {any} */ _, /** @type {any} */ item) {
        return <p style={{ whiteSpace: 'pre-wrap' }}>{item.desc}</p>;
      }
    }
  ];
  const status = {
    undone: '未完成',
    done: '已完成'
  };

  const bodyShow =
    curData.req_body_other ||
    (curData.req_body_type === 'form' && curData.req_body_form && curData.req_body_form.length);

  const requestShow =
    (dataSource && dataSource.length) ||
    (req_dataSource && req_dataSource.length) ||
    (curData.req_query && curData.req_query.length) ||
    bodyShow;

  let methodColor = (/** @type {Record<string, any>} */ (variable.METHOD_COLOR))[
    curData.method ? curData.method.toLowerCase() : 'get'
  ];

  // statusColor = statusColor[curData.status?curData.status.toLowerCase():"undone"];
  // const aceEditor = <div style={{ display: curData.req_body_other && (curData.req_body_type !== "form") ? "block" : "none" }} className="colBody">
  //   <AceEditor data={curData.req_body_other} readOnly={true} style={{ minHeight: 300 }} mode={curData.req_body_type === 'json' ? 'javascript' : 'text'} />
  // </div>
  if (!methodColor) {
    methodColor = 'get';
  }

  const { tag, up_time, title, uid, username } = curData;

  let res = (
    <div className="caseContainer">
      <h2 className="interface-title" style={{ marginTop: 0 }}>
        基本信息
      </h2>
      <div className="panel-view">
        <Row className="row">
          <Col span={4} className="colKey">
            接口名称：
          </Col>
          <Col span={8} className="colName">
            <span title={title}>{title}</span>
          </Col>
          <Col span={4} className="colKey">
            创&ensp;建&ensp;人：
          </Col>
          <Col span={8} className="colValue">
            <Link className="user-name" to={'/user/profile/' + uid}>
              <img src={'/api/user/avatar?uid=' + uid} className="user-img" />
              {username}
            </Link>
          </Col>
        </Row>
        <Row className="row">
          <Col span={4} className="colKey">
            状&emsp;&emsp;态：
          </Col>
          <Col span={8} className={'tag-status ' + curData.status}>
            {(/** @type {Record<string, any>} */ (status))[curData.status]}
          </Col>
          <Col span={4} className="colKey">
            更新时间：
          </Col>
          <Col span={8}>{formatTime(up_time)}</Col>
        </Row>
        {safeArray(tag) &&
          safeArray(tag).length > 0 && (
            <Row className="row remark">
              <Col span={4} className="colKey">
                Tag ：
              </Col>
              <Col span={18} className="colValue">
                {tag.join(' , ')}
              </Col>
            </Row>
          )}
        <Row className="row">
          <Col span={4} className="colKey">
            接口路径：
          </Col>
          <Col span={18} className="colValue" onMouseEnter={enterItem} onMouseLeave={leaveItem}>
            <span
              style={{ color: methodColor.color, backgroundColor: methodColor.bac }}
              className="colValue tag-method"
            >
              {curData.method}
            </span>
            <span className="colValue">
              {currProject.basepath}
              {curData.path}
            </span>
            <Tooltip title="复制路径">
              <CopyOutlined
                className="interface-url-icon"
                onClick={() => copyUrl(currProject.basepath + curData.path)}
                style={{ display: state.enter ? 'inline-block' : 'none' }}
              />
            </Tooltip>
          </Col>
        </Row>
        <Row className="row">
          <Col span={4} className="colKey">
            Mock地址：
          </Col>
          <Col span={18} className="colValue">
            {flagMsg(currProject.is_mock_open, currProject.strice)}
            <span
              className="href"
              onClick={() =>
                window.open(
                  location.protocol +
                    '//' +
                    location.hostname +
                    (location.port !== '' ? ':' + location.port : '') +
                    `/mock/${currProject._id}${currProject.basepath}${curData.path}`,
                  '_blank'
                )
              }
            >
              {location.protocol +
                '//' +
                location.hostname +
                (location.port !== '' ? ':' + location.port : '') +
                `/mock/${currProject._id}${currProject.basepath}${curData.path}`}
            </span>
          </Col>
        </Row>
        {curData.custom_field_value &&
          custom_field.enable && (
            <Row className="row remark">
              <Col span={4} className="colKey">
                {custom_field.name}：
              </Col>
              <Col span={18} className="colValue">
                {curData.custom_field_value}
              </Col>
            </Row>
          )}
      </div>
      {curData.desc && <h2 className="interface-title">备注</h2>}
      {curData.desc && (
        <div
          className="markdown-contents"
          style={{ margin: '0px', padding: '0px 20px', float: 'none' }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(curData.desc) }}
        />
      )}
      <h2 className="interface-title" style={{ display: requestShow ? '' : 'none' }}>
        请求参数
      </h2>
      {req_dataSource.length ? (
        <div className="colHeader">
          <h3 className="col-title">路径参数：</h3>
          <Table
            bordered
            size="small"
            pagination={false}
            columns={req_params_columns}
            dataSource={req_dataSource}
          />
        </div>
      ) : (
        ''
      )}
      {dataSource.length ? (
        <div className="colHeader">
          <h3 className="col-title">Headers：</h3>
          <Table
            bordered
            size="small"
            pagination={false}
            columns={columns}
            dataSource={dataSource}
          />
        </div>
      ) : (
        ''
      )}
      {curData.req_query && curData.req_query.length ? (
        <div className="colQuery">
          <h3 className="col-title">Query：</h3>
          {req_query(curData.req_query)}
        </div>
      ) : (
        ''
      )}

      <div
        style={{
          display:
            curData.method &&
            (/** @type {Record<string, any>} */ (HTTP_METHOD))[curData.method.toUpperCase()]
              .request_body
              ? ''
              : 'none'
        }}
      >
        <h3 style={{ display: bodyShow ? '' : 'none' }} className="col-title">
          Body:
        </h3>
        {curData.req_body_type === 'form'
          ? req_body_form(curData.req_body_type, curData.req_body_form)
          : req_body(curData.req_body_type, curData.req_body_other, curData.req_body_is_json_schema)}
      </div>

      <h2 className="interface-title">返回数据</h2>
      {res_body(curData.res_body_type, curData.res_body, curData.res_body_is_json_schema)}
    </div>
  );

  if (!curData.title) {
    if (state.init) {
      res = <div />;
    } else {
      res = <ErrMsg type="noData" />;
    }
  }
  return res;
};

export default View;

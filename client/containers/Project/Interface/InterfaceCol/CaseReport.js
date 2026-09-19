// @ts-check
import React from 'react';
import PropTypes from 'prop-types';
import { Row, Col, Tabs } from 'antd';
/**
 * @param {any} json
 */
function jsonFormat(json) {
  // console.log('json',json)
  if (json && typeof json === 'object') {
    return JSON.stringify(json, null, '   ');
  }
  return json;
}

/**
 * @param {any} props
 */
const CaseReport = function(props) {
  let params = jsonFormat(props.data);
  let headers = (/** @type {any} */ (jsonFormat))(props.headers, null, '   ');
  let res_header = (/** @type {any} */ (jsonFormat))(props.res_header, null, '   ');
  let res_body = jsonFormat(props.res_body);
  let httpCode = props.status;
  let validRes;
  if (props.validRes && Array.isArray(props.validRes)) {
    validRes = props.validRes.map((/** @type {any} */ item, /** @type {number} */ index) => {
      return <div key={index}>{item.message}</div>;
    });
  }

  const items = [
    {
      className: 'case-report-pane',
      label: 'Request',
      key: 'request',
      children: (
        <div>
          <Row className="case-report">
            <Col className="case-report-title" span="6">
              Url
            </Col>
            <Col span="18">{props.url}</Col>
          </Row>
          {props.query ? (
            <Row className="case-report">
              <Col className="case-report-title" span="6">
                Query
              </Col>
              <Col span="18">{props.query}</Col>
            </Row>
          ) : null}

          {props.headers ? (
            <Row className="case-report">
              <Col className="case-report-title" span="6">
                Headers
              </Col>
              <Col span="18">
                <pre>{headers}</pre>
              </Col>
            </Row>
          ) : null}

          {params ? (
            <Row className="case-report">
              <Col className="case-report-title" span="6">
                Body
              </Col>
              <Col span="18">
                <pre style={{ whiteSpace: 'pre-wrap' }}>{params}</pre>
              </Col>
            </Row>
          ) : null}
        </div>
      )
    },
    {
      className: 'case-report-pane',
      label: 'Response',
      key: 'response',
      children: (
        <div>
          <Row className="case-report">
            <Col className="case-report-title" span="6">
              HttpCode
            </Col>
            <Col span="18">
              <pre>{httpCode}</pre>
            </Col>
          </Row>
          {props.res_header ? (
            <Row className="case-report">
              <Col className="case-report-title" span="6">
                Headers
              </Col>
              <Col span="18">
                <pre>{res_header}</pre>
              </Col>
            </Row>
          ) : null}
          {props.res_body ? (
            <Row className="case-report">
              <Col className="case-report-title" span="6">
                Body
              </Col>
              <Col span="18">
                <pre>{res_body}</pre>
              </Col>
            </Row>
          ) : null}
        </div>
      )
    },
    {
      className: 'case-report-pane',
      label: '验证结果',
      key: 'valid',
      children: props.validRes ? (
        <Row className="case-report">
          <Col className="case-report-title" span="6">
            验证结果
          </Col>
          <Col span="18">
            <pre>
              {validRes}
            </pre>
          </Col>
        </Row>
      ) : null
    }
  ];

  return (
    <div className="report">
      <Tabs defaultActiveKey="request" items={items} />
    </div>
  );
};

CaseReport.propTypes = {
  url: PropTypes.string,
  data: PropTypes.any,
  headers: PropTypes.object,
  res_header: PropTypes.object,
  res_body: PropTypes.any,
  query: PropTypes.string,
  validRes: PropTypes.array,
  status: PropTypes.number
};

export default CaseReport;

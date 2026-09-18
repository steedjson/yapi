// 测试集合中的环境切换

import React from 'react';
import PropTypes from 'prop-types';
import { Select, Row, Col, Collapse, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
const Option = Select.Option;
import './index.scss';

// 纯受控展示组件
export default function CaseEnv(props) {
  const { envList, currProjectEnvChange, changeClose, collapseKey, envValue } = props;

  const callback = key => {
    changeClose && changeClose(key);
  };

  return (
    <Collapse
      style={{
        margin: 0,
        marginBottom: '16px'
      }}
      onChange={callback}
      activeKey={collapseKey}
      items={[
        {
          key: '1',
          label: (
            <span>
              {' '}
              选择测试用例环境
              <Tooltip title="默认使用测试用例选择的环境">
                {' '}
                <QuestionCircleOutlined />{' '}
              </Tooltip>
            </span>
          ),
          children: (
            <div className="case-env">
              {envList.length > 0 && (
                <div>
                  {envList.map(item => {
                    return (
                      <Row
                        key={item._id}
                        type="flex"
                        justify="space-around"
                        align="middle"
                        className="env-item"
                      >
                        <Col span={6} className="label">
                          <Tooltip title={item.name}>
                            <span className="label-name">{item.name}</span>
                          </Tooltip>
                        </Col>
                        <Col span={18}>
                          <Select
                            style={{
                              width: '100%'
                            }}
                            value={envValue[item._id] || ''}
                            defaultValue=""
                            onChange={val => currProjectEnvChange(val, item._id)}
                          >
                            <Option key="default" value="">
                              默认环境
                            </Option>

                            {item.env.map(key => {
                              return (
                                <Option value={key.name} key={key._id}>
                                  {key.name + ': ' + key.domain}
                                </Option>
                              );
                            })}
                          </Select>
                        </Col>
                      </Row>
                    );
                  })}
                </div>
              )}
            </div>
          )
        }
      ]}
    />
  );
}

CaseEnv.propTypes = {
  envList: PropTypes.array,
  currProjectEnvChange: PropTypes.func,
  changeClose: PropTypes.func,
  collapseKey: PropTypes.any,
  envValue: PropTypes.object
};

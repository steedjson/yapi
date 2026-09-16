import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './index.scss';
import { Row, Col, Input, Select, Button, AutoComplete, Tooltip, Form } from 'antd';

import { DeleteOutlined, QuestionCircleOutlined, SaveOutlined } from '@ant-design/icons';
const FormItem = Form.Item;
const Option = Select.Option;
import constants from 'client/constants/variable.js';

const initMap = {
  header: [
    {
      name: '',
      value: ''
    }
  ],
  cookie: [
    {
      name: '',
      value: ''
    }
  ],
  global: [
    {
      name: '',
      value: ''
    }
  ]
};

function initState(curdata) {
  let header = [
    {
      name: '',
      value: ''
    }
  ];
  let cookie = [
    {
      name: '',
      value: ''
    }
  ];

  let global = [
    {
      name: '',
      value: ''
    }
  ];

  const curheader = curdata.header;
  const curGlobal = curdata.global;

  if (curheader && curheader.length !== 0) {
    curheader.forEach(item => {
      if (item.name === 'Cookie') {
        let cookieStr = item.value;
        if (cookieStr) {
          cookieStr = cookieStr.split(';').forEach(c => {
            if (c) {
              c = c.split('=');
              cookie.unshift({
                name: c[0] ? c[0].trim() : '',
                value: c[1] ? c[1].trim() : ''
              });
            }
          });
        }
      } else {
        header.unshift(item);
      }
    });
  }

  if (curGlobal && curGlobal.length !== 0) {
    curGlobal.forEach(item => {
      global.unshift(item);
    });
  }
  return { header, cookie, global };
}

function ProjectEnvContent(props) {
  const [form] = Form.useForm();
  const [rows, setRows] = useState(initMap);
  // antd3 时代 protocol 是 addonBefore 内经表单装饰器绑定的字段;
  // antd4 下嵌套 Form.Item 会组合 name 路径,故改用本地 state,提交时并入 payload
  const [protocol, setProtocol] = useState(
    props.projectMsg.domain ? props.projectMsg.domain.split('//')[0] + '//' : 'http://'
  );
  const prevEnvNameRef = useRef(props.projectMsg.name);

  useEffect(() => {
    const curEnvName = prevEnvNameRef.current;
    const nextEnvName = props.projectMsg.name;
    if (curEnvName !== nextEnvName) {
      prevEnvNameRef.current = nextEnvName;
      handleInit(props.projectMsg);
    }
  }, [props.projectMsg.name]);

  const addHeader = (value, index, name) => {
    setRows(prev => {
      const nextHeader = prev[name][index + 1];
      if (nextHeader && typeof nextHeader === 'object') {
        return prev;
      }
      const data = { name: '', value: '' };
      return { ...prev, [name]: [].concat(prev[name], data) };
    });
  };

  const delHeader = (key, name) => {
    let curValue = form.getFieldValue(name);
    let newValue = curValue.filter((val, index) => {
      return index !== key;
    });
    form.setFieldsValue({ [name]: newValue });
    setRows(prev => ({ ...prev, [name]: newValue }));
  };

  function handleInit(data) {
    form.resetFields();
    let newValue = initState(data);
    setRows(newValue);
    // antd3 依赖字段 initialValue 的 pristine 回填语义,antd4 需显式写入
    form.setFieldsValue({
      env: {
        name: data.name === '新环境' ? '' : data.name || '',
        domain: data.domain ? data.domain.split('//')[1] : ''
      },
      header: newValue.header,
      cookie: newValue.cookie,
      global: newValue.global
    });
    setProtocol(data.domain ? data.domain.split('//')[0] + '//' : 'http://');
  }

  const handleOk = e => {
    e.preventDefault();
    form.validateFields().then(values => {
      let header = values.header.filter(val => {
        return val.name !== '';
      });
      let cookie = values.cookie.filter(val => {
        return val.name !== '';
      });
      let global = values.global.filter(val => {
        return val.name !== '';
      });
      if (cookie.length > 0) {
        header.push({
          name: 'Cookie',
          value: cookie.map(item => item.name + '=' + item.value).join(';')
        });
      }
      let assignValue = {};
      assignValue.env = Object.assign(
        { _id: props.projectMsg._id },
        {
          name: values.env.name,
          domain: protocol + values.env.domain,
          header: header,
          global
        }
      );
      props.onSubmit(assignValue);
    });
  };

  const headerTpl = (item, index) => {
    const headerLength = rows.header.length - 1;
    return (
      <Row gutter={8} key={index} style={{ marginBottom: 8, alignItems: 'center' }}>
        <Col span={10}>
          <FormItem
            name={['header', index, 'name']}
            initialValue={item.name || ''}
            validateTrigger={['onChange', 'onBlur']}
            style={{ marginBottom: 0 }}
          >
            <AutoComplete
              style={{ width: '100%' }}
              allowClear={true}
              options={constants.HTTP_REQUEST_HEADER.map(item => ({ value: item, label: item }))}
              placeholder="请输入header名称"
              onChange={() => addHeader(item, index, 'header')}
              filterOption={(inputValue, option) =>
                option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={['header', index, 'value']}
            initialValue={item.value || ''}
            validateTrigger={['onChange', 'onBlur']}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="请输入参数内容" style={{ width: '100%' }} />
          </FormItem>
        </Col>
        <Col span={2} className={index === headerLength ? ' env-last-row' : null} style={{ textAlign: 'center' }}>
          {/* 新增的项中，只有最后一项没有有删除按钮 */}
          <DeleteOutlined
            className="dynamic-delete-button delete"
            onClick={e => {
              e.stopPropagation();
              delHeader(index, 'header');
            }}
          />
        </Col>
      </Row>
    );
  };

  const commonTpl = (item, index, name) => {
    const length = rows[name].length - 1;
    return (
      <Row gutter={8} key={index} style={{ marginBottom: 8, alignItems: 'center' }}>
        <Col span={10}>
          <FormItem
            name={[name, index, 'name']}
            initialValue={item.name || ''}
            validateTrigger={['onChange', 'onBlur']}
            style={{ marginBottom: 0 }}
          >
            <Input
              placeholder={`请输入 ${name} Name`}
              style={{ width: '100%' }}
              onChange={() => addHeader(item, index, name)}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={[name, index, 'value']}
            initialValue={item.value || ''}
            validateTrigger={['onChange', 'onBlur']}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="请输入参数内容" style={{ width: '100%' }} />
          </FormItem>
        </Col>
        <Col span={2} className={index === length ? ' env-last-row' : null} style={{ textAlign: 'center' }}>
          {/* 新增的项中，只有最后一项没有有删除按钮 */}
          <DeleteOutlined
            className="dynamic-delete-button delete"
            onClick={e => {
              e.stopPropagation();
              delHeader(index, name);
            }}
          />
        </Col>
      </Row>
    );
  };

  return (
    <div className="project-env-content">
      <Form form={form} preserve={false}>
        <h3 className="env-label">环境名称</h3>
        <Row gutter={8}>
          <Col span={22}>
            <FormItem
              required={false}
              name={['env', 'name']}
              validateTrigger={['onChange', 'onBlur']}
              initialValue={props.projectMsg.name === '新环境' ? '' : props.projectMsg.name || ''}
              rules={[
                {
                  required: false,
                  whitespace: true,
                  validator(rule, value, callback) {
                    if (value) {
                      if (value.length === 0) {
                        callback('请输入环境名称');
                      } else if (!/\S/.test(value)) {
                        callback('请输入环境名称');
                      } else {
                        return callback();
                      }
                    } else {
                      callback('请输入环境名称');
                    }
                  }
                }
              ]}
            >
              <Input
                onChange={e => props.handleEnvInput(e.target.value)}
                placeholder="请输入环境名称"
                style={{ width: '100%' }}
              />
            </FormItem>
          </Col>
        </Row>
        <h3 className="env-label">环境域名</h3>
        <Row gutter={8}>
          <Col span={22}>
            <FormItem
              required={false}
              name={['env', 'domain']}
              validateTrigger={['onChange', 'onBlur']}
              initialValue={
                props.projectMsg.domain ? props.projectMsg.domain.split('//')[1] : ''
              }
              rules={[
                {
                  required: false,
                  whitespace: true,
                  validator(rule, value, callback) {
                    if (value) {
                      if (value.length === 0) {
                        callback('请输入环境域名!');
                      } else if (/\s/.test(value)) {
                        callback('环境域名不允许出现空格!');
                      } else {
                        return callback();
                      }
                    } else {
                      callback('请输入环境域名!');
                    }
                  }
                }
              ]}
            >
              <Input
                placeholder="请输入环境域名"
                style={{ width: '100%' }}
                addonBefore={
                  <Select value={protocol} onChange={v => setProtocol(v)}>
                    <Option value="http://">{'http://'}</Option>
                    <Option value="https://">{'https://'}</Option>
                  </Select>
                }
              />
            </FormItem>
          </Col>
        </Row>
        <h3 className="env-label">Header</h3>
        {rows.header.map((item, index) => {
          return headerTpl(item, index);
        })}

        <h3 className="env-label">Cookie</h3>
        {rows.cookie.map((item, index) => {
          return commonTpl(item, index, 'cookie');
        })}

        <h3 className="env-label">
          global
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://hellosean1025.github.io/yapi/documents/project.html#%E9%85%8D%E7%BD%AE%E7%8E%AF%E5%A2%83"
            style={{ marginLeft: 8 }}
          >
            <Tooltip title="点击查看文档">
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </Tooltip>
          </a>
        </h3>
        {rows.global.map((item, index) => {
          return commonTpl(item, index, 'global');
        })}
      </Form>
      <div className="btnwrap-changeproject">
        <Button
          className="m-btn btn-save"
          icon={<SaveOutlined />}
          type="primary"
          size="large"
          onClick={handleOk}
        >
          保 存
        </Button>
      </div>
    </div>
  );
}

ProjectEnvContent.propTypes = {
  projectMsg: PropTypes.object,
  onSubmit: PropTypes.func,
  handleEnvInput: PropTypes.func
};
export default ProjectEnvContent;

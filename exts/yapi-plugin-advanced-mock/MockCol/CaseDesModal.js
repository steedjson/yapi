import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Select,
  InputNumber,
  Switch,
  Col,
  message,
  Row,
  Input,
  Button,
  AutoComplete,
  Modal,
  Form
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
const Option = Select.Option;
const FormItem = Form.Item;
import { safeAssign } from 'client/common.js';
import AceEditor from 'client/components/AceEditor/AceEditor';
import constants from 'client/constants/variable.js';
import { httpCodes } from '../index.js';
import './CaseDesModal.scss';
import { connect } from 'react-redux';
import json5 from 'json5';

const formItemLayout = {
  labelCol: { span: 5 },
  wrapperCol: { span: 12 }
};
const formItemLayoutWithOutLabel = {
  wrapperCol: { span: 12, offset: 5 }
};

// 初始化输入数据
function preProcess(caseData) {
  try {
    caseData = JSON.parse(JSON.stringify(caseData));
  } catch (error) {
    console.log(error);
  }

  const initCaseData = {
    ip: '',
    ip_enable: false,
    name: '',
    code: '200',
    delay: 0,
    headers: [{ name: '', value: '' }],
    paramsArr: [{ name: '', value: '' }],
    params: {},
    res_body: '',
    paramsForm: 'form'
  };
  caseData.params = caseData.params || {};
  const paramsArr = Object.keys(caseData.params).length
    ? Object.keys(caseData.params)
        .map(key => {
          return { name: key, value: caseData.params[key] };
        })
        .filter(item => {
          if (typeof item.value === 'object') {
            caseData.paramsForm = 'json';
          }
          return typeof item.value !== 'object';
        })
    : [{ name: '', value: '' }];
  const headers =
    caseData.headers && caseData.headers.length ? caseData.headers : [{ name: '', value: '' }];
  caseData.code = '' + caseData.code;
  caseData.params = JSON.stringify(caseData.params, null, 2);

  caseData = safeAssign(initCaseData, { ...caseData, headers, paramsArr });

  return caseData;
}

function CaseDesForm(props) {
  const [form] = Form.useForm();
  const [state, setState] = useState(preProcess(props.caseData));
  // antd3 在渲染时读取 getFieldValue('ip_enable') 控制显隐与条件规则;
  // antd4 需通过 useWatch 订阅字段变化,初值回退到本地 state
  const ipEnable = Form.useWatch('ip_enable', form) ?? state.ip_enable;

  // 处理request_body编译器
  const handleRequestBody = d => {
    setState(prev => ({ ...prev, res_body: d.text }));
  };

  // 处理参数编译器
  const handleParams = d => {
    setState(prev => ({ ...prev, params: d.text }));
  };

  // 增加参数信息
  const addValues = key => {
    let values = form.getFieldValue(key);
    values = values.concat({ name: '', value: '' });
    setState(prev => ({ ...prev, [key]: values }));
  };

  // 删除参数信息
  const removeValues = (key, index) => {
    let values = form.getFieldValue(key);
    values = values.filter((val, index2) => index !== index2);
    form.setFieldsValue({ [key]: values });
    setState(prev => ({ ...prev, [key]: values }));
  };

  // 处理参数
  const getParamsKey = () => {
    let {
      req_query,
      req_body_form,
      req_body_type,
      method,
      req_body_other,
      req_body_is_json_schema,
      req_params
    } = props.currInterface;
    let keys = [];
    req_query &&
      Array.isArray(req_query) &&
      req_query.forEach(item => {
        keys.push(item.name);
      });
    req_params &&
      Array.isArray(req_params) &&
      req_params.forEach(item => {
        keys.push(item.name);
      });

    if (constants.HTTP_METHOD[method.toUpperCase()].request_body && req_body_type === 'form') {
      req_body_form &&
        Array.isArray(req_body_form) &&
        req_body_form.forEach(item => {
          keys.push(item.name);
        });
    } else if (
      constants.HTTP_METHOD[method.toUpperCase()].request_body &&
      req_body_type === 'json' &&
      req_body_other
    ) {
      let bodyObj;
      try {
        // 针对json-schema的处理
        if (req_body_is_json_schema) {
          bodyObj = json5.parse(props.caseData.req_body_other);
        } else {
          bodyObj = json5.parse(req_body_other);
        }

        keys = keys.concat(Object.keys(bodyObj));
      } catch (error) {
        console.log(error);
      }
    }
    return keys;
  };

  const endProcess = caseData => {
    const headers = [];
    const params = {};
    const { paramsForm } = state;
    caseData.headers &&
      Array.isArray(caseData.headers) &&
      caseData.headers.forEach(item => {
        if (item.name) {
          headers.push({
            name: item.name,
            value: item.value
          });
        }
      });
    caseData.paramsArr &&
      Array.isArray(caseData.paramsArr) &&
      caseData.paramsArr.forEach(item => {
        if (item.name) {
          params[item.name] = item.value;
        }
      });
    caseData.headers = headers;
    if (paramsForm === 'form') {
      caseData.params = params;
    } else {
      try {
        caseData.params = json5.parse(caseData.params);
      } catch (error) {
        console.log(error);
        message.error('请求参数 json 格式有误，请修改');
        return false;
      }
    }
    delete caseData.paramsArr;

    return caseData;
  };

  const handleOk = values => {
    values.res_body = state.res_body;
    values.params = state.params;
    props.onOk(endProcess(values));
  };

  const { isAdd, visible, onCancel } = props;
  const {
    name,
    code,
    headers,
    ip,
    ip_enable,
    params,
    paramsArr,
    paramsForm,
    res_body,
    delay
  } = state;

  const valuesTpl = (values, title) => {
    const dataSource = getParamsKey();
    const display = paramsForm === 'json' ? 'none' : '';
    return values.map((item, index) => (
      <div key={index} className="paramsArr" style={{ display }}>
        <FormItem
          {...(index === 0 ? formItemLayout : formItemLayoutWithOutLabel)}
          wrapperCol={index === 0 ? { span: 19 } : { span: 19, offset: 5 }}
          label={index ? '' : title}
        >
          <Row gutter={8}>
            <Col span={10}>
              <FormItem name={['paramsArr', index, 'name']} initialValue={item.name}>
                <AutoComplete
                  options={dataSource.map(item => ({ value: item, label: item }))}
                  placeholder="参数名称"
                  filterOption={(inputValue, option) =>
                    option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                />
              </FormItem>
            </Col>
            <Col span={10}>
              <FormItem name={['paramsArr', index, 'value']} initialValue={item.value}>
                <Input placeholder="参数值" />
              </FormItem>
            </Col>
            <Col span={4}>
              {values.length > 1 ? (
                <MinusCircleOutlined
                  className="dynamic-delete-button"
                  onClick={() => removeValues('paramsArr', index)}
                />
              ) : null}
            </Col>
          </Row>
        </FormItem>
      </div>
    ));
  };
  const headersTpl = (values, title) => {
    const dataSource = constants.HTTP_REQUEST_HEADER;
    return values.map((item, index) => (
      <div key={index} className="headers">
        <FormItem
          {...(index === 0 ? formItemLayout : formItemLayoutWithOutLabel)}
          wrapperCol={index === 0 ? { span: 19 } : { span: 19, offset: 5 }}
          label={index ? '' : title}
        >
          <Row gutter={8}>
            <Col span={10}>
              <FormItem name={['headers', index, 'name']} initialValue={item.name}>
                <AutoComplete
                  options={dataSource.map(item => ({ value: item, label: item }))}
                  placeholder="参数名称"
                  filterOption={(inputValue, option) =>
                    option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                />
              </FormItem>
            </Col>
            <Col span={10}>
              <FormItem name={['headers', index, 'value']} initialValue={item.value}>
                <Input placeholder="参数值" />
              </FormItem>
            </Col>
            <Col span={4}>
              {values.length > 1 ? (
                <MinusCircleOutlined
                  className="dynamic-delete-button"
                  onClick={() => removeValues('headers', index)}
                />
              ) : null}
            </Col>
          </Row>
        </FormItem>
      </div>
    ));
  };
  return (
    <Modal
      title={isAdd ? '添加期望' : '编辑期望'}
      open={visible}
      maskClosable={false}
      onOk={() => form.submit()}
      width={780}
      onCancel={() => onCancel()}
      afterClose={() => setState(prev => ({ ...prev, paramsForm: 'form' }))}
      className="case-des-modal"
    >
      <Form
        form={form}
        onFinish={handleOk}
        onFinishFailed={({ errorFields }) => {
          // 对齐原 validateFieldsAndScroll:校验失败滚动到首个出错字段
          if (errorFields && errorFields.length) {
            form.scrollToField(errorFields[0].name);
          }
        }}
        preserve={false}
      >
        <h2 className="sub-title" style={{ marginTop: 0 }}>
          基本信息
        </h2>
        <FormItem
          {...formItemLayout}
          label="期望名称"
          name="name"
          initialValue={name}
          rules={[{ required: true, message: '请输入期望名称！' }]}
        >
          <Input placeholder="请输入期望名称" />
        </FormItem>
        <FormItem {...formItemLayout} label="IP 过滤" className="ip-filter">
          <Col span={6} className="ip-switch">
            <FormItem
              name="ip_enable"
              initialValue={ip_enable}
              valuePropName="checked"
              rules={[{ type: 'boolean' }]}
            >
              <Switch />
            </FormItem>
          </Col>
          <Col span={18}>
            <div style={{ display: ipEnable ? '' : 'none' }} className="ip">
              <FormItem
                name="ip"
                initialValue={ipEnable ? ip : undefined}
                rules={
                  ipEnable
                    ? [
                        {
                          pattern: constants.IP_REGEXP,
                          message: '请填写正确的 IP 地址',
                          required: true
                        }
                      ]
                    : []
                }
              >
                <Input placeholder="请输入过滤的 IP 地址" />
              </FormItem>
            </div>
          </Col>
        </FormItem>
        <Row className="params-form" style={{ marginBottom: 8 }}>
          <Col {...{ span: 12, offset: 5 }}>
            <Switch
              size="small"
              checkedChildren="JSON"
              unCheckedChildren="JSON"
              checked={paramsForm === 'json'}
              onChange={bool => {
                setState(prev => ({ ...prev, paramsForm: bool ? 'json' : 'form' }));
              }}
            />
          </Col>
        </Row>
        {valuesTpl(paramsArr, '参数过滤')}
        <FormItem
          wrapperCol={{ span: 6, offset: 5 }}
          style={{ display: paramsForm === 'form' ? '' : 'none' }}
        >
          <Button
            size="default"
            type="primary"
            onClick={() => addValues('paramsArr')}
            style={{ width: '100%' }}
          >
            <PlusOutlined /> 添加参数
          </Button>
        </FormItem>
        <FormItem
          {...formItemLayout}
          wrapperCol={{ span: 17 }}
          label="参数过滤"
          style={{ display: paramsForm === 'form' ? 'none' : '' }}
        >
          <AceEditor className="pretty-editor" data={params} onChange={handleParams} />
          <FormItem
            name="params"
            rules={
              paramsForm === 'json'
                ? [
                    {
                      // 注意:antd3 时代此处引用的 this.jsonValidator 即不存在(未定义),
                      // 校验从未实际生效;为保持行为等价,维持 validator 为 undefined
                      validator: undefined,
                      message: '请输入正确的 JSON 字符串！'
                    }
                  ]
                : []
            }
          >
            <Input style={{ display: 'none' }} />
          </FormItem>
        </FormItem>
        <h2 className="sub-title">响应</h2>
        <FormItem {...formItemLayout} required label="HTTP Code" name="code" initialValue={code}>
          <Select showSearch>
            {httpCodes.map(code => (
              <Option key={'' + code} value={'' + code}>
                {'' + code}
              </Option>
            ))}
          </Select>
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="延时"
          name="delay"
          initialValue={delay}
          rules={[{ required: true, message: '请输入延时时间！', type: 'integer' }]}
        >
          <InputNumber placeholder="请输入延时时间" min={0} />
          <span>ms</span>
        </FormItem>
        {headersTpl(headers, 'HTTP 头')}
        <FormItem wrapperCol={{ span: 6, offset: 5 }}>
          <Button
            size="default"
            type="primary"
            onClick={() => addValues('headers')}
            style={{ width: '100%' }}
          >
            <PlusOutlined /> 添加 HTTP 头
          </Button>
        </FormItem>
        <FormItem {...formItemLayout} wrapperCol={{ span: 17 }} label="Body" required>
          <FormItem>
            <AceEditor
              className="pretty-editor"
              data={res_body}
              mode={props.currInterface.res_body_type === 'json' ? null : 'text'}
              onChange={handleRequestBody}
            />
          </FormItem>
        </FormItem>
      </Form>
    </Modal>
  );
}

CaseDesForm.propTypes = {
  caseData: PropTypes.object,
  currInterface: PropTypes.object,
  onOk: PropTypes.func,
  onCancel: PropTypes.func,
  isAdd: PropTypes.bool,
  visible: PropTypes.bool
};

const CaseDesModal = connect(state => {
  return {
    currInterface: state.inter.curdata
  };
})(CaseDesForm);
export default CaseDesModal;

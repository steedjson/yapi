import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Input, Select, Button, Form } from 'antd';

import constants from '../../../../constants/variable.js'
import { handleApiPath, nameLengthLimit } from '../../../../common.js'
const HTTP_METHOD = constants.HTTP_METHOD;
const HTTP_METHOD_KEYS = Object.keys(HTTP_METHOD);

const FormItem = Form.Item;
const Option = Select.Option;
function hasErrors(fieldsError) {
  return Object.keys(fieldsError).some(field => fieldsError[field]);
}


function AddInterfaceForm(props) {
  const [form] = Form.useForm();
  // antd3 时代 method 是 addonBefore 内经表单装饰器绑定的字段;
  // antd4 下嵌套 Form.Item 会组合 name 路径,故改用本地 state,提交时并入 values,
  // 字段名与提交 payload 结构保持不变
  const [method, setMethod] = useState('GET');

  const handleSubmit = values => {
    props.onSubmit(
      { ...values, method },
      () => {
        form.resetFields();
        setMethod('GET');
      }
    );
  }

  const handlePath = e => {
    let val = e.target.value
    form.setFieldsValue({
      path: handleApiPath(val)
    })
  }

  const prefixSelector = (
    <Select style={{ width: 75 }} value={method} onChange={setMethod}>
      {HTTP_METHOD_KEYS.map(item => {
        return <Option key={item} value={item}>{item}</Option>
      })}
    </Select>
  );
  const formItemLayout = {
    labelCol: {
      xs: { span: 24 },
      sm: { span: 6 }
    },
    wrapperCol: {
      xs: { span: 24 },
      sm: { span: 14 }
    }
  };


  return (

    <Form form={form} onFinish={handleSubmit}>
      <FormItem
        {...formItemLayout}
        label="接口分类"
        name="catid"
        initialValue={props.catid ? props.catid + '' : props.catdata[0]._id + ''}
      >
        <Select>
          {props.catdata.map(item => {
            return <Option key={item._id} value={item._id + ""}>{item.name}</Option>
          })}
        </Select>
      </FormItem>
      <FormItem
        {...formItemLayout}
        label="接口名称"
        name="title"
        rules={nameLengthLimit('接口')}
      >
        <Input placeholder="接口名称" />
      </FormItem>

      <FormItem
        {...formItemLayout}
        label="接口路径"
        name="path"
        rules={[{
          required: true, message: '请输入接口路径!'
        }]}
      >
        <Input onBlur={handlePath} addonBefore={prefixSelector} placeholder="/path" />
      </FormItem>
      <FormItem
        {...formItemLayout}
        label="注"
      >
        <span style={{ color: "#929292" }}>详细的接口数据可以在编辑页面中添加</span>
      </FormItem>
      <FormItem className="catModalfoot" wrapperCol={{ span: 24, offset: 8 }} >
        <Button onClick={props.onCancel} style={{ marginRight: "10px" }}  >取消</Button>
        <FormItem noStyle shouldUpdate={true}>
          {() => (
            <Button
              type="primary"
              htmlType="submit"
              disabled={hasErrors(form.getFieldsError())}
            >
              提交
            </Button>
          )}
        </FormItem>
      </FormItem>

    </Form>

  );
}

AddInterfaceForm.propTypes = {
  onSubmit: PropTypes.func,
  onCancel: PropTypes.func,
  catid: PropTypes.number,
  catdata: PropTypes.array
}

export default AddInterfaceForm

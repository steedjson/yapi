// @ts-check
import React, { useState } from 'react';
import { Button, Input, Form } from 'antd';
import { message } from '../../utils/message-bridge.js';

import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
// user 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useUserStore from '../../store/userStore';
import withRouter from '../../withRouter';

const formItemStyle = {
  marginBottom: '.16rem'
};

const changeHeight = {
  height: '.42rem'
};

/**
 * @param {any} props
 */
function Reg(props) {
  const [form] = Form.useForm();
  const [confirmDirty] = useState(false);
  const regActions = useUserStore(state => state.regActions);

  /**
   * @param {any} values
   */
  const handleSubmit = values => {
    regActions(values).then((/** @type {any} */ res) => {
      if (res && res.data.errcode == 0) {
        props.history.replace('/group');
        message.success('注册成功! ');
      }
    });
  };

  /** 校验失败时滚动到首个出错字段(对齐原 validateFieldsAndScroll 行为) */
  const handleFinishFailed = (/** @type {{ errorFields: any[] }} */ { errorFields }) => {
    if (errorFields && errorFields.length) {
      form.scrollToField(errorFields[0].name);
    }
  };

  /**
   * @param {any} rule
   * @param {any} value
   */
  const checkPassword = (rule, value) => {
    if (value && value !== form.getFieldValue('password')) {
      return Promise.reject(new Error('两次输入的密码不一致啊!'));
    }
    return Promise.resolve();
  };

  /**
   * @param {any} rule
   * @param {any} value
   */
  const checkConfirm = (rule, value) => {
    if (value && confirmDirty) {
      form.validateFields(['confirm']);
    }
    return Promise.resolve();
  };

  return (
    <Form form={form} onFinish={handleSubmit} onFinishFailed={handleFinishFailed}>
      {/* 用户名 */}
      <Form.Item
        style={formItemStyle}
        name="userName"
        rules={[{ required: true, message: '请输入用户名!' }]}
      >
        <Input
          style={changeHeight}
          prefix={<UserOutlined style={{ fontSize: 13 }} />}
          placeholder="Username"
        />
      </Form.Item>

      {/* Emaiil */}
      <Form.Item
        style={formItemStyle}
        name="email"
        rules={[
          {
            required: true,
            message: '请输入email!',
            pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,})+$/
          }
        ]}
      >
        <Input
          style={changeHeight}
          prefix={<MailOutlined style={{ fontSize: 13 }} />}
          placeholder="Email"
        />
      </Form.Item>

      {/* 密码 */}
      <Form.Item
        style={formItemStyle}
        name="password"
        rules={[
          {
            required: true,
            message: '请输入密码!'
          },
          {
            validator: checkConfirm
          }
        ]}
      >
        <Input
          style={changeHeight}
          prefix={<LockOutlined style={{ fontSize: 13 }} />}
          type="password"
          placeholder="Password"
        />
      </Form.Item>

      {/* 密码二次确认 */}
      <Form.Item
        style={formItemStyle}
        name="confirm"
        rules={[
          {
            required: true,
            message: '请再次输入密码密码!'
          },
          {
            validator: checkPassword
          }
        ]}
      >
        <Input
          style={changeHeight}
          prefix={<LockOutlined style={{ fontSize: 13 }} />}
          type="password"
          placeholder="Confirm Password"
        />
      </Form.Item>

      {/* 注册按钮 */}
      <Form.Item style={formItemStyle}>
        <Button
          style={changeHeight}
          type="primary"
          htmlType="submit"
          className="login-form-button"
        >
          注册
        </Button>
      </Form.Item>
    </Form>
  );
}

const RegForm = withRouter(Reg);

export default RegForm;

// @ts-check
import React, { useState } from 'react';
import { connect } from 'react-redux';
import { Button, Input, message, Radio, Form } from 'antd';

import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { loginActions, loginLdapActions } from '../../reducer/modules/user';
import withRouter from '../../withRouter';

import './Login.scss';

const formItemStyle = {
  marginBottom: '.16rem'
};

const changeHeight = {
  height: '.42rem'
};

/**
 * @param {any} props
 */
function Login(props) {
  const [loginType, setLoginType] = useState('ldap');

  /**
   * @param {any} values
   */
  const handleSubmit = values => {
    if (props.isLDAP && loginType === 'ldap') {
      props.loginLdapActions(values).then((/** @type {any} */ res) => {
        if (res.payload.data.errcode == 0) {
          props.history.replace('/group');
          message.success('登录成功! ');
        }
      });
    } else {
      props.loginActions(values).then((/** @type {any} */ res) => {
        if (res.payload.data.errcode == 0) {
          props.history.replace('/group');
          message.success('登录成功! ');
        }
      });
    }
  };

  /**
   * @param {React.SyntheticEvent} e
   */
  const handleFormLayoutChange = e => {
    setLoginType(e.target.value);
  };

  const { isLDAP } = props;

  const emailRule =
    loginType === 'ldap'
      ? {}
      : {
          required: true,
          message: '请输入正确的email!',
          pattern: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{1,})+$/
        };
  return (
    <Form onFinish={handleSubmit}>
      {/* 登录类型 (普通登录／LDAP登录) */}
      {isLDAP && (
        <Form.Item>
          <Radio.Group defaultValue="ldap" onChange={handleFormLayoutChange}>
            <Radio value="ldap">LDAP</Radio>
            <Radio value="normal">普通登录</Radio>
          </Radio.Group>
        </Form.Item>
      )}
      {/* 用户名 (Email) */}
      <Form.Item style={formItemStyle} name="email" rules={[emailRule]}>
        <Input
          style={changeHeight}
          prefix={<UserOutlined style={{ fontSize: 13 }} />}
          placeholder="Email"
        />
      </Form.Item>

      {/* 密码 */}
      <Form.Item
        style={formItemStyle}
        name="password"
        rules={[{ required: true, message: '请输入密码!' }]}
      >
        <Input
          style={changeHeight}
          prefix={<LockOutlined style={{ fontSize: 13 }} />}
          type="password"
          placeholder="Password"
        />
      </Form.Item>

      {/* 登录按钮 */}
      <Form.Item style={formItemStyle}>
        <Button
          style={changeHeight}
          type="primary"
          htmlType="submit"
          className="login-form-button"
        >
          登录
        </Button>
      </Form.Item>
    </Form>
  );
}

const LoginForm = connect(
  (/** @type {any} */ state) => {
    return {
      loginData: state.user,
      isLDAP: state.user.isLDAP
    };
  },
  {
    loginActions,
    loginLdapActions
  }
)(withRouter(Login));

export default LoginForm;

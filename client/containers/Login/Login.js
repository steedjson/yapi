// @ts-check
import React, { useState } from 'react';
import { Button, Input, message, Radio, Form } from 'antd';

import { UserOutlined, LockOutlined } from '@ant-design/icons';
// user 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useUserStore from '../../store/userStore';
import { resolveSafeRedirect } from '../../components/AuthenticatedComponent';
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
  const [submitting, setSubmitting] = useState(false);
  const isLDAP = useUserStore(state => state.isLDAP);
  const loginActions = useUserStore(state => state.loginActions);
  const loginLdapActions = useUserStore(state => state.loginLdapActions);

  /**
   * @param {any} values
   */
  const handleSubmit = values => {
    // 提交进行中直接忽略，防止重复点击/回车触发多次登录请求
    if (submitting) {
      return;
    }
    setSubmitting(true);
    const useLdap = isLDAP && loginType === 'ldap';
    const login = useLdap ? loginLdapActions : loginActions;
    login(values)
      .then((/** @type {any} */ res) => {
        const data = res && res.data;
        if (data && data.errcode == 0) {
          // 优先回到认证守卫记录的站内来源（深链接恢复），否则回落 /group
          const from = props.location && props.location.state && props.location.state.from;
          props.history.replace(resolveSafeRedirect(from));
          message.success('登录成功! ');
        } else {
          message.error((data && data.errmsg) || '登录失败, 请重试');
          setSubmitting(false);
        }
      })
      .catch(() => {
        message.error('登录请求失败, 请稍后重试');
        setSubmitting(false);
      });
  };

  /**
   * @param {React.SyntheticEvent} e
   */
  const handleFormLayoutChange = e => {
    setLoginType(e.target.value);
  };

  const emailRule =
    loginType === 'ldap'
      ? {}
      : {
          required: true,
          message: '请输入正确的email!',
          pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,})+$/
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
          loading={submitting}
        >
          登录
        </Button>
      </Form.Item>
    </Form>
  );
}

const LoginForm = withRouter(Login);

export default LoginForm;

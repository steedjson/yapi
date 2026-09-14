// @ts-check
import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Button, Input, message, Radio } from 'antd';
// Icon 迁移至 @ant-design/icons（v4 体系）；Form 暂用 @ant-design/compatible
// 提供的 v3 实现（官方过渡路径），数据流迁移（Form.Item name）在 S3 批次处理。
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Form as LegacyForm } from '@ant-design/compatible';
import { loginActions, loginLdapActions } from '../../reducer/modules/user';
import { withRouter } from 'react-router';
const FormItem = LegacyForm.Item;
const RadioGroup = Radio.Group;

import './Login.scss';

const formItemStyle = {
  marginBottom: '.16rem'
};

const changeHeight = {
  height: '.42rem'
};

@connect(
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
)
@withRouter
@LegacyForm.create()
class Login extends Component {
  constructor(/** @type {any} */ props) {
    super(props);
    this.state = {
      loginType: 'ldap'
    };
  }

  static propTypes = {
    form: PropTypes.object,
    history: PropTypes.object,
    loginActions: PropTypes.func,
    loginLdapActions: PropTypes.func,
    isLDAP: PropTypes.bool
  };

  /**
   * @param {React.SyntheticEvent} e
   */
  handleSubmit = e => {
    e.preventDefault();
    const form = this.props.form;
    form.validateFields((/** @type {any} */ err, /** @type {any} */ values) => {
      if (!err) {
        if (this.props.isLDAP && this.state.loginType === 'ldap') {
          this.props.loginLdapActions(values).then((/** @type {any} */ res) => {
            if (res.payload.data.errcode == 0) {
              this.props.history.replace('/group');
              message.success('登录成功! ');
            }
          });
        } else {
          this.props.loginActions(values).then((/** @type {any} */ res) => {
            if (res.payload.data.errcode == 0) {
              this.props.history.replace('/group');
              message.success('登录成功! ');
            }
          });
        }
      }
    });
  };

  componentDidMount() {
    //Qsso.attach('qsso-login','/api/user/login_by_token')
  }
  /**
   * @param {any} e
   */
  handleFormLayoutChange = e => {
    this.setState({ loginType: e.target.value });
  };

  render() {
    const { getFieldDecorator } = this.props.form;

    const { isLDAP } = this.props;

    const emailRule =
      this.state.loginType === 'ldap'
        ? {}
        : {
            required: true,
            message: '请输入正确的email!',
            pattern: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{1,})+$/
          };
    return (
      <LegacyForm onSubmit={this.handleSubmit}>
        {/* 登录类型 (普通登录／LDAP登录) */}
        {isLDAP && (
          <FormItem>
            <RadioGroup defaultValue="ldap" onChange={this.handleFormLayoutChange}>
              <Radio value="ldap">LDAP</Radio>
              <Radio value="normal">普通登录</Radio>
            </RadioGroup>
          </FormItem>
        )}
        {/* 用户名 (Email) */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('email', { rules: [emailRule] })(
            <Input
              style={changeHeight}
              prefix={<UserOutlined style={{ fontSize: 13 }} />}
              placeholder="Email"
            />
          )}
        </FormItem>

        {/* 密码 */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('password', {
            rules: [{ required: true, message: '请输入密码!' }]
          })(
            <Input
              style={changeHeight}
              prefix={<LockOutlined style={{ fontSize: 13 }} />}
              type="password"
              placeholder="Password"
            />
          )}
        </FormItem>

        {/* 登录按钮 */}
        <FormItem style={formItemStyle}>
          <Button
            style={changeHeight}
            type="primary"
            htmlType="submit"
            className="login-form-button"
          >
            登录
          </Button>
        </FormItem>

        {/* <div className="qsso-breakline">
          <span className="qsso-breakword">或</span>
        </div>
        <Button style={changeHeight} id="qsso-login" type="primary" className="login-form-button" size="large" ghost>QSSO登录</Button> */}
      </LegacyForm>
    );
  }
}
const LoginForm = Login;
export default LoginForm;

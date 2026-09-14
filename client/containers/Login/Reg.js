// @ts-check
import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Form, Button, Input, message } from 'antd';
// Icon 迁移至 @ant-design/icons（v4 体系）；Form 暂用 @ant-design/compatible
// 提供的 v3 实现（官方过渡路径），数据流迁移（Form.Item name）在 S3 批次处理。
import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { Form as LegacyForm } from '@ant-design/compatible';
import { regActions } from '../../reducer/modules/user';
import { withRouter } from 'react-router';
const FormItem = Form.Item;
const formItemStyle = {
  marginBottom: '.16rem'
};

const changeHeight = {
  height: '.42rem'
};

@connect(
  (/** @type {any} */ state) => {
    return {
      loginData: state.user
    };
  },
  {
    regActions
  }
)
@withRouter
@LegacyForm.create()
class Reg extends Component {
  constructor(/** @type {any} */ props) {
    super(props);
    this.state = {
      confirmDirty: false
    };
  }

  static propTypes = {
    form: PropTypes.object,
    history: PropTypes.object,
    regActions: PropTypes.func
  };

  /**
   * @param {React.SyntheticEvent} e
   */
  handleSubmit = e => {
    e.preventDefault();
    const form = this.props.form;
    form.validateFieldsAndScroll((/** @type {any} */ err, /** @type {any} */ values) => {
      if (!err) {
        this.props.regActions(values).then((/** @type {any} */ res) => {
          if (res.payload.data.errcode == 0) {
            this.props.history.replace('/group');
            message.success('注册成功! ');
          }
        });
      }
    });
  };

  /**
   * @param {any} rule
   * @param {any} value
   * @param {Function} callback
   */
  checkPassword = (rule, value, callback) => {
    const form = this.props.form;
    if (value && value !== form.getFieldValue('password')) {
      callback('两次输入的密码不一致啊!');
    } else {
      callback();
    }
  };

  /**
   * @param {any} rule
   * @param {any} value
   * @param {Function} callback
   */
  checkConfirm = (rule, value, callback) => {
    const form = this.props.form;
    if (value && this.state.confirmDirty) {
      form.validateFields(['confirm'], { force: true });
    }
    callback();
  };

  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <Form onSubmit={this.handleSubmit}>
        {/* 用户名 */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('userName', {
            rules: [{ required: true, message: '请输入用户名!' }]
          })(
            <Input
              style={changeHeight}
              prefix={<UserOutlined style={{ fontSize: 13 }} />}
              placeholder="Username"
            />
          )}
        </FormItem>

        {/* Emaiil */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('email', {
            rules: [
              {
                required: true,
                message: '请输入email!',
                pattern: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{1,})+$/
              }
            ]
          })(
            <Input
              style={changeHeight}
              prefix={<MailOutlined style={{ fontSize: 13 }} />}
              placeholder="Email"
            />
          )}
        </FormItem>

        {/* 密码 */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('password', {
            rules: [
              {
                required: true,
                message: '请输入密码!'
              },
              {
                validator: this.checkConfirm
              }
            ]
          })(
            <Input
              style={changeHeight}
              prefix={<LockOutlined style={{ fontSize: 13 }} />}
              type="password"
              placeholder="Password"
            />
          )}
        </FormItem>

        {/* 密码二次确认 */}
        <FormItem style={formItemStyle}>
          {getFieldDecorator('confirm', {
            rules: [
              {
                required: true,
                message: '请再次输入密码密码!'
              },
              {
                validator: this.checkPassword
              }
            ]
          })(
            <Input
              style={changeHeight}
              prefix={<LockOutlined style={{ fontSize: 13 }} />}
              type="password"
              placeholder="Confirm Password"
            />
          )}
        </FormItem>

        {/* 注册按钮 */}
        <FormItem style={formItemStyle}>
          <Button
            style={changeHeight}
            type="primary"
            htmlType="submit"
            className="login-form-button"
          >
            注册
          </Button>
        </FormItem>
      </Form>
    );
  }
}
const RegForm = Reg;
export default RegForm;

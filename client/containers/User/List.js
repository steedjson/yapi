import React, { PureComponent as Component } from 'react';
import { formatTime } from '../../common.js';
import { Link } from 'react-router-dom';
import { setBreadcrumb } from '../../reducer/modules/user';
//import PropTypes from 'prop-types'
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Table, Popconfirm, message, Input, Button, Modal, Select, Tag } from 'antd';
import axios from 'axios';

const Search = Input.Search;
const limit = 20;
const emailReg = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{1,})+$/;
@connect(
  state => {
    return {
      curUserRole: state.user.role,
      curUid: state.user.uid
    };
  },
  {
    setBreadcrumb
  }
)
class List extends Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      total: null,
      current: 1,
      keyword: '',
      addModalVisible: false,
      addForm: {
        username: '',
        email: '',
        password: '',
        role: 'member'
      },
      editModalVisible: false,
      editUid: null,
      editForm: {
        username: '',
        email: ''
      },
      resetModalVisible: false,
      resetUid: null,
      resetPassword: '',
      roleModalVisible: false,
      roleUid: null,
      roleValue: 'member'
    };
  }
  static propTypes = {
    setBreadcrumb: PropTypes.func,
    curUserRole: PropTypes.string,
    curUid: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
  };
  changePage = current => {
    this.setState(
      {
        current: current
      },
      this.getUserList
    );
  };

  getUserList = () => {
    axios
      .get('/api/user/list', {
        params: {
          page: this.state.current,
          limit: limit,
          keyword: this.state.keyword ? this.state.keyword : undefined
        }
      })
      .then(
        res => {
          let result = res.data;
          if (result.errcode === 0) {
            let list = result.data.list || [];
            let total = result.data.count;
            list.map((item, index) => {
              item.key = index;
              item.up_time = formatTime(item.up_time);
            });
            this.setState({
              data: list,
              total: total
            });
          } else {
            message.error(result.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  componentDidMount() {
    this.getUserList();
  }

  confirm = uid => {
    axios
      .post('/api/user/del', {
        id: uid
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success('已删除此用户');
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  async componentWillMount() {
    this.props.setBreadcrumb([{ name: '用户管理' }]);
  }

  handleSearch = value => {
    this.setState(
      {
        current: 1,
        keyword: value
      },
      this.getUserList
    );
  };

  openAddModal = () => {
    this.setState({
      addModalVisible: true,
      addForm: {
        username: '',
        email: '',
        password: '',
        role: 'member'
      }
    });
  };

  closeAddModal = () => {
    this.setState({
      addModalVisible: false
    });
  };

  setAddForm = (key, value) => {
    this.setState({
      addForm: { ...this.state.addForm, [key]: value }
    });
  };

  handleAddUser = () => {
    const { username, email, password, role } = this.state.addForm;
    if (!username.trim()) {
      return message.error('请输入用户名');
    }
    if (!email.trim()) {
      return message.error('请输入邮箱');
    }
    if (!emailReg.test(email)) {
      return message.error('请输入正确的邮箱格式');
    }
    if (!password || password.length < 6) {
      return message.error('密码长度不能少于6位');
    }
    axios
      .post('/api/user/add', {
        username: username,
        email: email,
        password: password,
        role: role
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success('用户创建成功');
            this.setState({
              addModalVisible: false
            });
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  openEditModal = item => {
    this.setState({
      editModalVisible: true,
      editUid: item._id,
      editForm: {
        username: item.username,
        email: item.email
      }
    });
  };

  closeEditModal = () => {
    this.setState({
      editModalVisible: false
    });
  };

  setEditForm = (key, value) => {
    this.setState({
      editForm: { ...this.state.editForm, [key]: value }
    });
  };

  handleEditUser = () => {
    const { username, email } = this.state.editForm;
    if (!username.trim()) {
      return message.error('请输入用户名');
    }
    if (!email.trim()) {
      return message.error('请输入邮箱');
    }
    if (!emailReg.test(email)) {
      return message.error('请输入正确的邮箱格式');
    }
    axios
      .post('/api/user/update', {
        uid: this.state.editUid,
        username: username,
        email: email
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success('用户资料已更新');
            this.setState({
              editModalVisible: false
            });
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  openResetModal = item => {
    this.setState({
      resetModalVisible: true,
      resetUid: item._id,
      resetPassword: ''
    });
  };

  closeResetModal = () => {
    this.setState({
      resetModalVisible: false
    });
  };

  handleResetPassword = () => {
    const password = this.state.resetPassword;
    if (!password || password.length < 6) {
      return message.error('密码长度不能少于6位');
    }
    axios
      .post('/api/user/reset_password', {
        uid: this.state.resetUid,
        password: password
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success('密码重置成功');
            this.setState({
              resetModalVisible: false
            });
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  openRoleModal = item => {
    this.setState({
      roleModalVisible: true,
      roleUid: item._id,
      roleValue: item.role === 'admin' ? 'admin' : 'member'
    });
  };

  closeRoleModal = () => {
    this.setState({
      roleModalVisible: false
    });
  };

  setRoleValue = value => {
    this.setState({
      roleValue: value
    });
  };

  handleRoleChange = () => {
    axios
      .post('/api/user/change_role', {
        uid: this.state.roleUid,
        role: this.state.roleValue
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success('角色已更新');
            this.setState({
              roleModalVisible: false
            });
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  handleChangeStatus = item => {
    axios
      .post('/api/user/change_status', {
        uid: item._id,
        disabled: !item.disabled
      })
      .then(
        res => {
          if (res.data.errcode === 0) {
            message.success(item.disabled ? '已启用该用户' : '已禁用该用户');
            this.getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        err => {
          message.error(err.message);
        }
      );
  };

  isSelf = item => {
    return this.props.curUid != null && String(item._id) === String(this.props.curUid);
  };

  render() {
    const role = this.props.curUserRole;
    let data = [];
    if (role === 'admin') {
      data = this.state.data;
    }
    let columns = [
      {
        title: '用户名',
        dataIndex: 'username',
        key: 'username',
        width: 180,
        render: (username, item) => {
          return <Link to={'/user/profile/' + item._id}>{item.username}</Link>;
        }
      },
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email'
      },
      {
        title: '用户角色',
        dataIndex: 'role',
        key: 'role',
        width: 100,
        render: role => {
          return role === 'admin' ? <Tag color='geekblue'>管理员</Tag> : <Tag>成员</Tag>;
        }
      },
      {
        title: '状态',
        dataIndex: 'disabled',
        key: 'disabled',
        width: 90,
        render: disabled => {
          return disabled ? <Tag color='red'>已禁用</Tag> : <Tag color='green'>启用</Tag>;
        }
      },
      {
        title: '更新日期',
        dataIndex: 'up_time',
        key: 'up_time',
        width: 160
      },
      {
        title: '功能',
        key: 'action',
        width: 300,
        render: item => {
          return (
            <span>
              <a onClick={() => this.openEditModal(item)}>编辑</a>
              <span className='ant-divider' />
              <a onClick={() => this.openResetModal(item)}>重置密码</a>
              {!this.isSelf(item) && (
                <span>
                  <span className='ant-divider' />
                  <a onClick={() => this.openRoleModal(item)}>角色</a>
                  <span className='ant-divider' />
                  <Popconfirm
                    title={item.disabled ? '确认启用该用户?' : '确认禁用该用户?'}
                    onConfirm={() => {
                      this.handleChangeStatus(item);
                    }}
                    okText='确定'
                    cancelText='取消'
                  >
                    <a href='#'>{item.disabled ? '启用' : '禁用'}</a>
                  </Popconfirm>
                </span>
              )}
              <span className='ant-divider' />
              <Popconfirm
                title='确认删除此用户?'
                onConfirm={() => {
                  this.confirm(item._id);
                }}
                okText='确定'
                cancelText='取消'
              >
                <a href='#'>删除</a>
              </Popconfirm>
            </span>
          );
        }
      }
    ];

    columns = columns.filter(item => {
      if (item.key === 'action' && role !== 'admin') {
        return false;
      }
      return true;
    });

    const pageConfig = {
      total: this.state.total,
      pageSize: limit,
      current: this.state.current,
      onChange: this.changePage
    };

    return (
      <section className='user-table'>
        <div className='user-search-wrapper'>
          <h2 style={{ marginBottom: '10px' }}>
            {this.state.keyword ? '过滤结果' : '用户总数'}：{this.state.total}位
          </h2>
          {role === 'admin' && (
            <Button
              type='primary'
              onClick={this.openAddModal}
              style={{ position: 'absolute', right: 260, top: 0 }}
            >
              添加用户
            </Button>
          )}
          <Search onSearch={this.handleSearch} placeholder='请输入用户名或邮箱' />
        </div>
        <Table
          bordered={true}
          rowKey={record => record._id}
          columns={columns}
          pagination={pageConfig}
          dataSource={data}
        />

        <Modal
          title='添加用户'
          visible={this.state.addModalVisible}
          onOk={this.handleAddUser}
          onCancel={this.closeAddModal}
          okText='确定'
          cancelText='取消'
        >
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>用户名</p>
            <Input
              value={this.state.addForm.username}
              onChange={e => this.setAddForm('username', e.target.value)}
              placeholder='请输入用户名'
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>Email</p>
            <Input
              value={this.state.addForm.email}
              onChange={e => this.setAddForm('email', e.target.value)}
              placeholder='请输入邮箱'
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>密码</p>
            <Input
              type='password'
              value={this.state.addForm.password}
              onChange={e => this.setAddForm('password', e.target.value)}
              placeholder='请输入密码，至少6位'
            />
          </div>
          <div>
            <p style={{ margin: '0 0 4px' }}>角色</p>
            <Select
              style={{ width: 120 }}
              value={this.state.addForm.role}
              onChange={value => this.setAddForm('role', value)}
            >
              <Select.Option value='member'>成员</Select.Option>
              <Select.Option value='admin'>管理员</Select.Option>
            </Select>
          </div>
        </Modal>

        <Modal
          title='编辑用户'
          visible={this.state.editModalVisible}
          onOk={this.handleEditUser}
          onCancel={this.closeEditModal}
          okText='确定'
          cancelText='取消'
        >
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>用户名</p>
            <Input
              value={this.state.editForm.username}
              onChange={e => this.setEditForm('username', e.target.value)}
              placeholder='请输入用户名'
            />
          </div>
          <div>
            <p style={{ margin: '0 0 4px' }}>Email</p>
            <Input
              value={this.state.editForm.email}
              onChange={e => this.setEditForm('email', e.target.value)}
              placeholder='请输入邮箱'
            />
          </div>
        </Modal>

        <Modal
          title='重置密码'
          visible={this.state.resetModalVisible}
          onOk={this.handleResetPassword}
          onCancel={this.closeResetModal}
          okText='确定'
          cancelText='取消'
        >
          <p style={{ margin: '0 0 8px' }}>请输入该用户的新密码，重置后原密码与旧登录态失效</p>
          <Input
            type='password'
            value={this.state.resetPassword}
            onChange={e => this.setState({ resetPassword: e.target.value })}
            placeholder='请输入新密码，至少6位'
          />
        </Modal>

        <Modal
          title='修改角色'
          visible={this.state.roleModalVisible}
          onOk={this.handleRoleChange}
          onCancel={this.closeRoleModal}
          okText='确定'
          cancelText='取消'
        >
          <p style={{ margin: '0 0 4px' }}>角色</p>
          <Select
            style={{ width: 120 }}
            value={this.state.roleValue}
            onChange={value => this.setRoleValue(value)}
          >
            <Select.Option value='member'>成员</Select.Option>
            <Select.Option value='admin'>管理员</Select.Option>
          </Select>
        </Modal>
      </section>
    );
  }
}

export default List;

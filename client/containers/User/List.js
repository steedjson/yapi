// @ts-check
import React, { useEffect, useState } from 'react';
import { formatTime } from '../../common.js';
import { Link } from 'react-router-dom';
import { setBreadcrumb } from '../../reducer/modules/user';
//import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import { Table, Popconfirm, message, Input, Button, Modal, Select, Tag, Divider, Space } from 'antd';
import axios from 'axios';

const Search = Input.Search;
const limit = 20;
const emailReg = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,})+$/;

const List = () => {
  const dispatch = useDispatch();
  const curUserRole = useSelector(state => state.user.role);
  const curUid = useSelector(state => state.user.uid);
  const [data, setData] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(null);
  const [current, setCurrent] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm, setAddFormState] = useState({
    username: '',
    email: '',
    password: '',
    role: 'member'
  });
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editUid, setEditUid] = useState(null);
  const [editForm, setEditFormState] = useState({
    username: '',
    email: ''
  });
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetUid, setResetUid] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [roleUid, setRoleUid] = useState(null);
  const [roleValue, setRoleValue] = useState('member');

  /**
   * @param {number} nextCurrent
   * @param {string} nextKeyword
   */
  function fetchUserList(nextCurrent, nextKeyword) {
    axios
      .get('/api/user/list', {
        params: {
          page: nextCurrent,
          limit: limit,
          keyword: nextKeyword ? nextKeyword : undefined
        }
      })
      .then(
        (/** @type {any} */ res) => {
          let result = res.data;
          if (result.errcode === 0) {
            let list = result.data.list || [];
            let totalCount = result.data.count;
            list.map((/** @type {any} */ item, /** @type {any} */ index) => {
              item.key = index;
              item.up_time = formatTime(item.up_time);
            });
            setData(list);
            setTotal(totalCount);
          } else {
            message.error(result.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  // 以当前已提交的 current/keyword 重新拉取列表
  function getUserList() {
    fetchUserList(current, keyword);
  }

  // 对应原 setState({ current }, this.getUserList)：显式携带新值，避免闭包读到旧值
  /**
   * @param {number} nextCurrent
   */
  function changePage(nextCurrent) {
    setCurrent(nextCurrent);
    fetchUserList(nextCurrent, keyword);
  }

  useEffect(() => {
    // 对应原 UNSAFE_componentWillMount + componentDidMount
    dispatch(setBreadcrumb([{ name: '用户管理' }]));
    getUserList();
  }, []);

  /**
   * @param {any} uid
   */
  function confirm(uid) {
    axios
      .post('/api/user/del', {
        id: uid
      })
      .then(
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success('已删除此用户');
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  // 对应原 setState({ current: 1, keyword: value }, this.getUserList)
  /**
   * @param {string} value
   */
  function handleSearch(value) {
    setCurrent(1);
    setKeyword(value);
    fetchUserList(1, value);
  }

  function openAddModal() {
    setAddModalVisible(true);
    setAddFormState({
      username: '',
      email: '',
      password: '',
      role: 'member'
    });
  }

  function closeAddModal() {
    setAddModalVisible(false);
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  function setAddForm(key, value) {
    setAddFormState({ ...addForm, [key]: value });
  }

  function handleAddUser() {
    const { username, email, password, role } = addForm;
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
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success('用户创建成功');
            setAddModalVisible(false);
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  /**
   * @param {any} item
   */
  function openEditModal(item) {
    setEditModalVisible(true);
    setEditUid(item._id);
    setEditFormState({
      username: item.username,
      email: item.email
    });
  }

  function closeEditModal() {
    setEditModalVisible(false);
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  function setEditForm(key, value) {
    setEditFormState({ ...editForm, [key]: value });
  }

  function handleEditUser() {
    const { username, email } = editForm;
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
        uid: editUid,
        username: username,
        email: email
      })
      .then(
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success('用户资料已更新');
            setEditModalVisible(false);
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  /**
   * @param {any} item
   */
  function openResetModal(item) {
    setResetModalVisible(true);
    setResetUid(item._id);
    setResetPassword('');
  }

  function closeResetModal() {
    setResetModalVisible(false);
  }

  function handleResetPassword() {
    const password = resetPassword;
    if (!password || password.length < 6) {
      return message.error('密码长度不能少于6位');
    }
    axios
      .post('/api/user/reset_password', {
        uid: resetUid,
        password: password
      })
      .then(
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success('密码重置成功');
            setResetModalVisible(false);
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  /**
   * @param {any} item
   */
  function openRoleModal(item) {
    setRoleModalVisible(true);
    setRoleUid(item._id);
    setRoleValue(item.role === 'admin' ? 'admin' : 'member');
  }

  function closeRoleModal() {
    setRoleModalVisible(false);
  }

  function handleRoleChange() {
    axios
      .post('/api/user/change_role', {
        uid: roleUid,
        role: roleValue
      })
      .then(
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success('角色已更新');
            setRoleModalVisible(false);
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  /**
   * @param {any} item
   */
  function handleChangeStatus(item) {
    axios
      .post('/api/user/change_status', {
        uid: item._id,
        disabled: !item.disabled
      })
      .then(
        (/** @type {any} */ res) => {
          if (res.data.errcode === 0) {
            message.success(item.disabled ? '已启用该用户' : '已禁用该用户');
            getUserList();
          } else {
            message.error(res.data.errmsg);
          }
        },
        (/** @type {any} */ err) => {
          message.error(err.message);
        }
      );
  }

  /**
   * @param {any} item
   */
  function isSelf(item) {
    return curUid != null && String(item._id) === String(curUid);
  }

  const role = curUserRole;
  /** @type {any[]} */
  let tableData = [];
  if (role === 'admin') {
    tableData = data;
  }
  let columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 180,
      render: (/** @type {any} */ username, /** @type {any} */ item) => {
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
      render: (/** @type {any} */ role) => {
        return role === 'admin' ? <Tag color='geekblue'>管理员</Tag> : <Tag>成员</Tag>;
      }
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      key: 'disabled',
      width: 90,
      render: (/** @type {any} */ disabled) => {
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
      render: (/** @type {any} */ item) => {
        return (
          <Space split={<Divider type="vertical" />} style={{ whiteSpace: 'nowrap' }}>
            <a onClick={() => openEditModal(item)}>编辑</a>
            <a onClick={() => openResetModal(item)}>重置密码</a>
            {!isSelf(item) && <a onClick={() => openRoleModal(item)}>角色</a>}
            {!isSelf(item) && (
              <Popconfirm
                title={item.disabled ? '确认启用该用户?' : '确认禁用该用户?'}
                onConfirm={() => {
                  handleChangeStatus(item);
                }}
                okText='确定'
                cancelText='取消'
              >
                <a href='#'>{item.disabled ? '启用' : '禁用'}</a>
              </Popconfirm>
            )}
            <Popconfirm
              title='确认删除此用户?'
              onConfirm={() => {
                confirm(item._id);
              }}
              okText='确定'
              cancelText='取消'
            >
              <a href='#'>删除</a>
            </Popconfirm>
          </Space>
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
    total: total,
    pageSize: limit,
    current: current,
    onChange: changePage
  };

  return (
    <section className='user-table'>
      <div className='user-search-wrapper'>
        <h2 className='user-count' style={{ marginBottom: '10px' }}>
          {keyword ? '过滤结果' : '用户总数'}：{total}位
        </h2>
        {role === 'admin' && (
          <Button
            type='primary'
            onClick={openAddModal}
            style={{ position: 'absolute', right: 260, top: 0 }}
          >
            添加用户
          </Button>
        )}
        <Search onSearch={handleSearch} placeholder='请输入用户名或邮箱' />
      </div>
      <Table
        bordered={true}
        rowKey={(/** @type {any} */ record) => record._id}
        columns={columns}
        pagination={pageConfig}
        dataSource={tableData}
      />

      <Modal
        title='添加用户'
        open={addModalVisible}
        onOk={handleAddUser}
        onCancel={closeAddModal}
        okText='确定'
        cancelText='取消'
      >
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px' }}>用户名</p>
          <Input
            value={addForm.username}
            onChange={(/** @type {any} */ e) => setAddForm('username', e.target.value)}
            placeholder='请输入用户名'
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px' }}>Email</p>
          <Input
            value={addForm.email}
            onChange={(/** @type {any} */ e) => setAddForm('email', e.target.value)}
            placeholder='请输入邮箱'
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px' }}>密码</p>
          <Input
            type='password'
            value={addForm.password}
            onChange={(/** @type {any} */ e) => setAddForm('password', e.target.value)}
            placeholder='请输入密码，至少6位'
          />
        </div>
        <div>
          <p style={{ margin: '0 0 4px' }}>角色</p>
          <Select
            style={{ width: 120 }}
            value={addForm.role}
            onChange={(/** @type {any} */ value) => setAddForm('role', value)}
          >
            <Select.Option value='member'>成员</Select.Option>
            <Select.Option value='admin'>管理员</Select.Option>
          </Select>
        </div>
      </Modal>

      <Modal
        title='编辑用户'
        open={editModalVisible}
        onOk={handleEditUser}
        onCancel={closeEditModal}
        okText='确定'
        cancelText='取消'
      >
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px' }}>用户名</p>
          <Input
            value={editForm.username}
            onChange={(/** @type {any} */ e) => setEditForm('username', e.target.value)}
            placeholder='请输入用户名'
          />
        </div>
        <div>
          <p style={{ margin: '0 0 4px' }}>Email</p>
          <Input
            value={editForm.email}
            onChange={(/** @type {any} */ e) => setEditForm('email', e.target.value)}
            placeholder='请输入邮箱'
          />
        </div>
      </Modal>

      <Modal
        title='重置密码'
        open={resetModalVisible}
        onOk={handleResetPassword}
        onCancel={closeResetModal}
        okText='确定'
        cancelText='取消'
      >
        <p style={{ margin: '0 0 8px' }}>请输入该用户的新密码，重置后原密码与旧登录态失效</p>
        <Input
          type='password'
          value={resetPassword}
          onChange={(/** @type {any} */ e) => setResetPassword(e.target.value)}
          placeholder='请输入新密码，至少6位'
        />
      </Modal>

      <Modal
        title='修改角色'
        open={roleModalVisible}
        onOk={handleRoleChange}
        onCancel={closeRoleModal}
        okText='确定'
        cancelText='取消'
      >
        <p style={{ margin: '0 0 4px' }}>角色</p>
        <Select
          style={{ width: 120 }}
          value={roleValue}
          onChange={(/** @type {any} */ value) => setRoleValue(value)}
        >
          <Select.Option value='member'>成员</Select.Option>
          <Select.Option value='admin'>管理员</Select.Option>
        </Select>
      </Modal>
    </section>
  );
};

List.propTypes = {
  setBreadcrumb: PropTypes.func,
  curUserRole: PropTypes.string,
  curUid: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

export default List;

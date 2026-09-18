import React, { useEffect, useRef, useState } from 'react';
import { DeleteOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { Table, Select, Button, Modal, Row, Col, message, Popconfirm, Space, Divider } from 'antd';
import { Link } from 'react-router-dom';
import './MemberList.scss';
import {
  fetchGroupMemberList,
  fetchGroupMsg,
  addMember,
  delMember,
  changeMemberRole
} from '../../../reducer/modules/group.js';
import ErrMsg from '../../../components/ErrMsg/ErrMsg.js';
import UsernameAutoComplete from '../../../components/UsernameAutoComplete/UsernameAutoComplete.js';
const Option = Select.Option;

function arrayAddKey(arr) {
  return arr.map((item, index) => {
    return {
      ...item,
      key: index
    };
  });
}

const MemberList = () => {
  const dispatch = useDispatch();
  const currGroup = useSelector(state => state.group.currGroup);
  // 旧 @connect 映射的 uid/role 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.user.uid);
  useSelector(state => state.group.role);
  const [userInfo, setUserInfo] = useState([]);
  const [role, setRole] = useState('');
  const [visible, setVisible] = useState(false);
  // dataSource 为历史遗留 state（初始化后从未读写），保留 hook 调用与旧实现一致
  useState([]);
  const [inputUids, setInputUids] = useState([]);
  const [inputRole, setInputRole] = useState('dev');

  // 记录已拉取过的分组 id：首次挂载与分组切换时重新拉取（对应旧 CDM + cWRP 行为）
  const fetchedGroupIdRef = useRef(null);

  function showAddMemberModal() {
    setVisible(true);
  }

  // 重新获取列表
  function reFetchList() {
    dispatch(fetchGroupMemberList(currGroup._id)).then(res => {
      setUserInfo(arrayAddKey(res.payload.data.data));
      setVisible(false);
    });
  }

  // 增 - 添加成员

  function handleOk() {
    dispatch(
      addMember({
        id: currGroup._id,
        member_uids: inputUids,
        role: inputRole
      })
    ).then(res => {
      if (!res.payload.data.errcode) {
        const { add_members, exist_members } = res.payload.data.data;
        const addLength = add_members.length;
        const existLength = exist_members.length;
        setInputRole('dev');
        setInputUids([]);
        message.success(`添加成功! 已成功添加 ${addLength} 人，其中 ${existLength} 人已存在`);
        reFetchList(); // 添加成功后重新获取分组成员列表
      }
    });
  }
  // 添加成员时 选择新增成员权限

  function changeNewMemberRole(value) {
    setInputRole(value);
  }

  // 删 - 删除分组成员

  function deleteConfirm(member_uid) {
    return () => {
      const id = currGroup._id;
      dispatch(delMember({ id, member_uid })).then(res => {
        if (!res.payload.data.errcode) {
          message.success(res.payload.data.errmsg);
          reFetchList(); // 添加成功后重新获取分组成员列表
        }
      });
    };
  }

  // 改 - 修改成员权限
  function changeUserRole(e) {
    const id = currGroup._id;
    const role = e.split('-')[0];
    const member_uid = e.split('-')[1];
    dispatch(changeMemberRole({ id, member_uid, role })).then(res => {
      if (!res.payload.data.errcode) {
        message.success(res.payload.data.errmsg);
        reFetchList(); // 添加成功后重新获取分组成员列表
      }
    });
  }

  // 关闭模态框

  function handleCancel() {
    setVisible(false);
  }

  useEffect(() => {
    const currGroupId = currGroup._id;
    if (fetchedGroupIdRef.current === null) {
      // 对应原 componentDidMount：先取分组信息（角色），再取成员列表
      fetchedGroupIdRef.current = currGroupId;
      dispatch(fetchGroupMsg(currGroupId)).then(res => {
        setRole(res.payload.data.data.role);
      });
      dispatch(fetchGroupMemberList(currGroupId)).then(res => {
        setUserInfo(arrayAddKey(res.payload.data.data));
      });
    } else if (fetchedGroupIdRef.current !== currGroupId) {
      // 对应原 UNSAFE_componentWillReceiveProps：分组切换时重拉（先成员列表，后分组信息）
      fetchedGroupIdRef.current = currGroupId;
      dispatch(fetchGroupMemberList(currGroupId)).then(res => {
        setUserInfo(arrayAddKey(res.payload.data.data));
      });
      dispatch(fetchGroupMsg(currGroupId)).then(res => {
        setRole(res.payload.data.data.role);
      });
    }
  });

  function onUserSelect(uids) {
    setInputUids(uids);
  }

  const columns = [
    {
      title: currGroup.group_name + ' 分组成员 (' + userInfo.length + ') 人',
      dataIndex: 'username',
      key: 'username',
      render: (text, record) => {
        return (
          <div className="m-user">
            <Link to={`/user/profile/${record.uid}`}>
              <img
                src={location.protocol + '//' + location.host + '/api/user/avatar?uid=' + record.uid}
                className="m-user-img"
              />
            </Link>
            <Link to={`/user/profile/${record.uid}`}>
              <p className="m-user-name">{text}</p>
            </Link>
          </div>
        );
      }
    },
    {
      title:
        role === 'owner' || role === 'admin' ? (
          <div className="btn-container">
            <Button className="btn" type="primary" onClick={showAddMemberModal}>
              添加成员
            </Button>
          </div>
        ) : (
          ''
        ),
      key: 'action',
      className: 'member-opration',
      render: (text, record) => {
        if (role === 'owner' || role === 'admin') {
          return (
            <Space split={<Divider type="vertical" />}>
              <Select
                value={record.role + '-' + record.uid}
                className="select"
                onChange={changeUserRole}
              >
                <Option value={'owner-' + record.uid}>组长</Option>
                <Option value={'dev-' + record.uid}>开发者</Option>
                <Option value={'guest-' + record.uid}>访客</Option>
              </Select>
              <Popconfirm
                placement="topRight"
                title="你确定要删除吗? "
                onConfirm={deleteConfirm(record.uid)}
                okText="确定"
                cancelText=""
              >
                <Button type="danger" icon={<DeleteOutlined />} className="btn-danger" />
                {/*  */}
              </Popconfirm>
            </Space>
          );
        } else {
          // 非管理员可以看到权限 但无法修改
          if (record.role === 'owner') {
            return '组长';
          } else if (record.role === 'dev') {
            return '开发者';
          } else if (record.role === 'guest') {
            return '访客';
          } else {
            return '';
          }
        }
      }
    }
  ];
  let userinfo = userInfo;
  let ownerinfo = [];
  let devinfo = [];
  let guestinfo = [];
  for (let i = 0; i < userinfo.length; i++) {
    if (userinfo[i].role === 'owner') {
      ownerinfo.push(userinfo[i]);
    }
    if (userinfo[i].role === 'dev') {
      devinfo.push(userinfo[i]);
    }
    if (userinfo[i].role === 'guest') {
      guestinfo.push(userinfo[i]);
    }
  }
  userinfo = [...ownerinfo, ...devinfo, ...guestinfo];
  return (
    <div className="m-panel">
      {visible ? (
        <Modal title="添加成员" open={visible} onOk={handleOk} onCancel={handleCancel}>
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label usernamelabel">用户名: </div>
            </Col>
            <Col span="15">
              <UsernameAutoComplete callbackState={onUserSelect} />
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label usernameauth">权限: </div>
            </Col>
            <Col span="15">
              <Select defaultValue="dev" className="select" onChange={changeNewMemberRole}>
                <Option value="owner">组长</Option>
                <Option value="dev">开发者</Option>
                <Option value="guest">访客</Option>
              </Select>
            </Col>
          </Row>
        </Modal>
      ) : (
        ''
      )}
      <Table
        columns={columns}
        dataSource={userinfo}
        pagination={false}
        locale={{ emptyText: <ErrMsg type="noMemberInGroup" /> }}
      />
    </div>
  );
};

MemberList.propTypes = {
  currGroup: PropTypes.object,
  uid: PropTypes.number,
  fetchGroupMemberList: PropTypes.func,
  fetchGroupMsg: PropTypes.func,
  addMember: PropTypes.func,
  delMember: PropTypes.func,
  changeMemberRole: PropTypes.func,
  role: PropTypes.string
};

export default MemberList;

// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  Table,
  Card,
  Badge,
  Select,
  Button,
  Modal,
  Row,
  Col,
  message,
  Popconfirm,
  Switch,
  Tooltip
} from 'antd';
import { useSelector, useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import { fetchGroupMsg } from '../../../../reducer/modules/group';
import ErrMsg from '../../../../components/ErrMsg/ErrMsg.js';
import { fetchGroupMemberList } from '../../../../reducer/modules/group.js';
import {
  fetchProjectList,
  getProjectMemberList,
  addMember,
  delMember,
  changeMemberRole,
  changeMemberEmailNotice
} from '../../../../reducer/modules/project.js';
import UsernameAutoComplete from '../../../../components/UsernameAutoComplete/UsernameAutoComplete.js';
import '../Setting.scss';

const Option = Select.Option;

/**
 * @param {any} arr
 */
const arrayAddKey = arr => {
  return arr.map((/** @type {any} */ item, /** @type {number} */ index) => {
    return {
      ...item,
      key: index
    };
  });
};

/**
 * 成员管理。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch，旧 withRouter 注入的
 *   match.params.id 改为 useParams；
 * - 类 state 整体迁移为单个 useState 对象，setState 局部合并语义经
 *   setState(prev => ({ ...prev, ...patch })) 等价保留（原 constructor 中的
 *   dataSource 仅初始化从未读写，属死状态，迁移后不再保留）；
 * - 旧 async UNSAFE_componentWillMount（拉取分组成员 / 分组信息 / 项目成员并回填）
 *   改为挂载期 useEffect，请求结果直接取自 await 恢复值，与旧实现一致。
 */
const ProjectMember = () => {
  const dispatch = useDispatch();
  const { id } = /** @type {any} */ (useParams());
  const projectMsg = useSelector(state => state.project.currProject);
  const uid = useSelector(state => state.user.uid);
  const projectList = useSelector(state => state.project.projectList);

  // 镜像最新 redux 值：事件回调里的读取等价于旧类组件的实时 this.props
  const projectMsgRef = useRef(projectMsg);
  projectMsgRef.current = projectMsg;

  const [state, setState] = useState(/** @type {any} */ ({
    groupMemberList: [],
    projectMemberList: [],
    groupName: '',
    role: '',
    visible: false,
    inputUids: [],
    inputRole: 'dev',
    modalVisible: false,
    selectProjectId: 0
  }));

  // 重新获取列表
  const reFetchList = () => {
    dispatch(getProjectMemberList(id)).then((/** @type {any} */ res) => {
      setState((/** @type {any} */ prevState) => ({
        ...prevState,
        projectMemberList: arrayAddKey(res.payload.data.data),
        visible: false,
        modalVisible: false
      }));
    });
  };

  // 旧 async UNSAFE_componentWillMount：按序拉取分组成员 / 分组信息 / 项目成员并回填
  useEffect(() => {
    (async () => {
      const groupMemberList = await dispatch(fetchGroupMemberList(projectMsg.group_id));
      const groupMsg = await dispatch(fetchGroupMsg(projectMsg.group_id));
      const projectMemberList = await dispatch(getProjectMemberList(id));
      setState((/** @type {any} */ prevState) => ({
        ...prevState,
        groupMemberList: groupMemberList.payload.data.data,
        groupName: groupMsg.payload.data.data.group_name,
        projectMemberList: arrayAddKey(projectMemberList.payload.data.data),
        role: projectMsg.role
      }));
    })();
  }, []);

  const showAddMemberModal = () => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      visible: true
    }));
  };

  const showImportMemberModal = async () => {
    await dispatch((/** @type {any} */ (fetchProjectList))(projectMsgRef.current.group_id));
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      modalVisible: true
    }));
  };

  const handleOk = () => {
    addMembers(state.inputUids);
  };

  // 增 - 添加成员
  /**
   * @param {any} memberUids
   */
  const addMembers = memberUids => {
    dispatch(
      addMember({
        id: id,
        member_uids: memberUids,
        role: state.inputRole
      })
    ).then((/** @type {any} */ res) => {
      if (!res.payload.data.errcode) {
        const { add_members, exist_members } = res.payload.data.data;
        const addLength = add_members.length;
        const existLength = exist_members.length;
        setState((/** @type {any} */ prevState) => ({
          ...prevState,
          inputRole: 'dev',
          inputUids: []
        }));
        message.success(`添加成功! 已成功添加 ${addLength} 人，其中 ${existLength} 人已存在`);
        reFetchList(); // 添加成功后重新获取分组成员列表
      }
    });
  };
  // 添加成员时 选择新增成员权限
  /**
   * @param {any} value
   */
  const changeNewMemberRole = value => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      inputRole: value
    }));
  };

  // 删 - 删除分组成员
  /**
   * @param {any} member_uid
   */
  const deleteConfirm = member_uid => {
    return () => {
      dispatch(delMember({ id, member_uid })).then((/** @type {any} */ res) => {
        if (!res.payload.data.errcode) {
          message.success(res.payload.data.errmsg);
          reFetchList(); // 添加成功后重新获取分组成员列表
        }
      });
    };
  };

  // 改 - 修改成员权限
  /**
   * @param {any} e
   */
  const changeUserRole = e => {
    const role = e.split('-')[0];
    const member_uid = e.split('-')[1];
    dispatch(changeMemberRole({ id, member_uid, role })).then((/** @type {any} */ res) => {
      if (!res.payload.data.errcode) {
        message.success(res.payload.data.errmsg);
        reFetchList(); // 添加成功后重新获取分组成员列表
      }
    });
  };

  // 修改用户是否接收消息通知
  /**
   * @param {any} notice
   * @param {any} member_uid
   */
  const changeEmailNotice = async (notice, member_uid) => {
    await dispatch(changeMemberEmailNotice({ id, member_uid, notice }));
    reFetchList(); // 添加成功后重新获取项目成员列表
  };

  // 关闭模态框
  const handleCancel = () => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      visible: false
    }));
  };
  // 关闭批量导入模态框
  const handleModalCancel = () => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      modalVisible: false
    }));
  };

  // 处理选择项目
  /**
   * @param {any} key
   */
  const handleChange = key => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      selectProjectId: key
    }));
  };

  // 确定批量导入模态框
  const handleModalOk = async () => {
    // 获取项目中的成员列表
    const menberList = await dispatch(getProjectMemberList(state.selectProjectId));
    const memberUidList = menberList.payload.data.data.map((/** @type {any} */ item) => {
      return item.uid;
    });
    addMembers(memberUidList);
  };

  /**
   * @param {any} uids
   */
  const onUserSelect = uids => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      inputUids: uids
    }));
  };

  const isEmailChangeEable = state.role === 'owner' || state.role === 'admin';
  /** @type {any[]} */
  const columns = [
    {
      title: projectMsg.name + ' 项目成员 (' + state.projectMemberList.length + ') 人',
      dataIndex: 'username',
      key: 'username',
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        return (
          <div className="m-user">
            <img src={'/api/user/avatar?uid=' + record.uid} className="m-user-img" />
            <p className="m-user-name">{text}</p>
            <Tooltip placement="top" title="消息通知">
              <span>
                <Switch
                  size="small"
                  checkedChildren="开"
                  unCheckedChildren="关"
                  checked={record.email_notice}
                  disabled={!(isEmailChangeEable || record.uid === uid)}
                  onChange={(/** @type {any} */ e) => changeEmailNotice(e, record.uid)}
                />
              </span>
            </Tooltip>
          </div>
        );
      }
    },
    {
      title:
        state.role === 'owner' || state.role === 'admin' ? (
          <div className="btn-container">
            <Button className="btn" type="primary" icon={<PlusOutlined />} onClick={showAddMemberModal}>
              添加成员
            </Button>
            <Button className="btn" icon={<PlusOutlined />} onClick={showImportMemberModal}>
              批量导入成员
            </Button>
          </div>
        ) : (
          ''
        ),
      key: 'action',
      className: 'member-opration',
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        if (state.role === 'owner' || state.role === 'admin') {
          return (
            <div>
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
              </Popconfirm>
            </div>
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
  // 获取当前分组下的所有项目名称
  const children = projectList.map((/** @type {any} */ item, /** @type {number} */ index) => (
    <Option key={index} value={'' + item._id}>
      {item.name}
    </Option>
  ));

  return (
    <div className="g-row">
      <div className="m-panel">
        {state.visible ? (
          <Modal
            title="添加成员"
            open={state.visible}
            onOk={handleOk}
            onCancel={handleCancel}
          >
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
                <div className="label usernamelabel">权限: </div>
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
        <Modal
          title="批量导入成员"
          open={state.modalVisible}
          onOk={handleModalOk}
          onCancel={handleModalCancel}
        >
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label usernamelabel">项目名: </div>
            </Col>
            <Col span="15">
              <Select
                showSearch
                style={{ width: 200 }}
                placeholder="请选择项目名称"
                optionFilterProp="children"
                onChange={handleChange}
              >
                {children}
              </Select>
            </Col>
          </Row>
        </Modal>

        <Table
          columns={columns}
          dataSource={state.projectMemberList}
          pagination={false}
          locale={{ emptyText: <ErrMsg type="noMemberInProject" /> }}
          className="setting-project-member"
        />
        <Card
          bordered={false}
          title={
            state.groupName + ' 分组成员 ' + '(' + state.groupMemberList.length + ') 人'
          }
          hoverable={true}
          className="setting-group"
        >
          {state.groupMemberList.length ? (
            state.groupMemberList.map((/** @type {any} */ item, /** @type {number} */ index) => {
              return (
                <div key={index} className="card-item">
                  <img
                    src={
                      location.protocol +
                      '//' +
                      location.host +
                      '/api/user/avatar?uid=' +
                      item.uid
                    }
                    className="item-img"
                  />
                  <p className="item-name">
                    {item.username}
                    {item.uid === uid ? (
                      <Badge
                        count={'我'}
                        style={{
                          backgroundColor: '#689bd0',
                          fontSize: '13px',
                          marginLeft: '8px',
                          borderRadius: '4px'
                        }}
                      />
                    ) : null}
                  </p>
                  {item.role === 'owner' ? <p className="item-role">组长</p> : null}
                  {item.role === 'dev' ? <p className="item-role">开发者</p> : null}
                  {item.role === 'guest' ? <p className="item-role">访客</p> : null}
                </div>
              );
            })
          ) : (
            <ErrMsg type="noMemberInGroup" />
          )}
        </Card>
      </div>
    </div>
  );
};

export default ProjectMember;

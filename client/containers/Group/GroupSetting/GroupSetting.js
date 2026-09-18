import React, { useEffect, useRef, useState } from 'react';
import { SaveOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import { QuestionCircleOutlined, ExclamationCircleOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { Input, Button, message, Card, Alert, Modal, Switch, Row, Col, Tooltip } from 'antd';
import { fetchNewsData } from '../../../reducer/modules/news.js';
import {
  changeGroupMsg,
  fetchGroupList,
  setCurrGroup,
  fetchGroupMsg,
  updateGroupList,
  deleteGroup as deleteGroupAction
} from '../../../reducer/modules/group.js';
const { TextArea } = Input;
import { trim } from '../../../common.js';
import './GroupSetting.scss';
const confirm = Modal.confirm;

/**
 * 分组设置面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch；
 * - 旧 UNSAFE_componentWillMount 的 initState 并入 useState 惰性初始化（首帧即回填表单）；
 * - 旧 UNSAFE_componentWillReceiveProps（切换分组时回填表单并收起危险操作）改为
 *   每次渲染后运行的 useEffect + prevGroupId ref 守卫；
 * - 异步动作 await 恢复后的 redux 读取经 ref 镜像最新 store 值，
 *   等价于旧类组件的实时 this.props 语义。
 */
const GroupSetting = () => {
  const dispatch = useDispatch();
  const groupList = useSelector(state => state.group.groupList);
  const currGroup = useSelector(state => state.group.currGroup);
  const curUserRole = useSelector(state => state.user.role);

  // 旧 UNSAFE_componentWillMount 的 initState：首帧即以当前分组回填表单
  const [currGroupName, setCurrGroupName] = useState(() => currGroup.group_name);
  const [currGroupDesc, setCurrGroupDesc] = useState(() => currGroup.group_desc);
  const [custom_field1_name, setCustomFieldName] = useState(() => currGroup.custom_field1.name);
  const [custom_field1_enable, setCustomFieldEnable] = useState(
    () => currGroup.custom_field1.enable
  );
  const [showDangerOptions, setShowDangerOptions] = useState(false);
  const [custom_field1_rule, setCustomFieldRule] = useState(false);

  // 镜像最新 redux 值：异步动作恢复后的读取等价于旧类组件的实时 this.props
  const groupListRef = useRef(groupList);
  const currGroupRef = useRef(currGroup);
  groupListRef.current = groupList;
  currGroupRef.current = currGroup;

  // 切换分组时，更新分组信息并关闭删除分组操作（对应旧 UNSAFE_componentWillReceiveProps）
  const prevGroupIdRef = useRef(currGroup._id);
  useEffect(() => {
    if (prevGroupIdRef.current !== currGroup._id) {
      prevGroupIdRef.current = currGroup._id;
      setCurrGroupName(currGroup.group_name);
      setCurrGroupDesc(currGroup.group_desc);
      setCustomFieldName(currGroup.custom_field1.name);
      setCustomFieldEnable(currGroup.custom_field1.enable);
      setShowDangerOptions(false);
    }
  });

  // 修改分组名称
  const changeName = e => {
    setCurrGroupName(e.target.value);
  };
  // 修改分组描述
  const changeDesc = e => {
    setCurrGroupDesc(e.target.value);
  };

  // 修改自定义字段名称
  const changeCustomName = e => {
    const custom_field1_rule_next = custom_field1_enable ? !e.target.value : false;
    setCustomFieldName(e.target.value);
    setCustomFieldRule(custom_field1_rule_next);
  };

  // 修改开启状态
  const changeCustomEnable = e => {
    const custom_field1_rule_next = e ? !custom_field1_name : false;
    setCustomFieldEnable(e);
    setCustomFieldRule(custom_field1_rule_next);
  };

  // 点击“查看危险操作”按钮
  const toggleDangerOptions = () => {
    setShowDangerOptions(!showDangerOptions);
  };

  // 编辑分组信息
  const editGroup = async () => {
    const id = currGroup._id;
    if (custom_field1_rule) {
      return;
    }
    const res = await dispatch(
      changeGroupMsg({
        group_name: currGroupName,
        group_desc: currGroupDesc,
        custom_field1: {
          name: custom_field1_name,
          enable: custom_field1_enable
        },
        id: currGroup._id
      })
    );

    if (!res.payload.data.errcode) {
      message.success('修改成功！');
      // 旧实现向 fetchGroupList 传入 this.props.groupList，action creator 从未消费该参数，随迁移移除
      await dispatch(fetchGroupList());
      dispatch(updateGroupList(groupListRef.current));
      const nextGroup = groupListRef.current.find(group => {
        return +group._id === +id;
      });
      dispatch(setCurrGroup(nextGroup));
      dispatch(fetchGroupMsg(currGroupRef.current._id));
      dispatch(fetchNewsData(currGroupRef.current._id, 'group', 1, 10));
    }
  };

  // 删除分组
  const deleteGroup = async () => {
    const res = await dispatch(deleteGroupAction({ id: currGroupRef.current._id }));
    if (!res.payload.data.errcode) {
      message.success('删除成功');
      await dispatch(fetchGroupList());
      const nextGroup = groupListRef.current[0] || { group_name: '', group_desc: '' };
      // 旧实现此处 setState 写入从未声明的 state.groupList（仅触发一次额外渲染，无 DOM 影响），随迁移移除
      dispatch(setCurrGroup(nextGroup));
    }
  };

  // 删除分组的二次确认
  const showConfirm = () => {
    confirm({
      title: '确认删除 ' + currGroupRef.current.group_name + ' 分组吗？',
      content: (
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '25px' }}>
          <Alert
            message="警告：此操作非常危险,会删除该分组下面所有项目和接口，并且无法恢复!"
            type="warning"
          />
          <div style={{ marginTop: '16px' }}>
            <p>
              <b>请输入分组名称确认此操作:</b>
            </p>
            <Input id="group_name" />
          </div>
        </div>
      ),
      onOk() {
        const groupName = trim(document.getElementById('group_name').value);
        if (currGroupRef.current.group_name !== groupName) {
          message.error('分组名称有误');
          return new Promise((resolve, reject) => {
            reject('error');
          });
        } else {
          deleteGroup();
        }
      },
      iconType: 'delete',
      onCancel() {}
    });
  };

  return (
    <div className="m-panel card-panel card-panel-s panel-group">
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={4} className="label">
          分组名：
        </Col>
        <Col span={20}>
          <Input
            size="large"
            placeholder="请输入分组名称"
            value={currGroupName}
            onChange={changeName}
          />
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={4} className="label">
          简介：
        </Col>
        <Col span={20}>
          <TextArea
            size="large"
            rows={3}
            placeholder="请输入分组描述"
            value={currGroupDesc}
            onChange={changeDesc}
          />
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={4} className="label">
          接口自定义字段&nbsp;
          <Tooltip title={'可以在接口中添加 额外字段 数据'}>
            <QuestionCircleOutlined style={{ width: '10px' }} />
          </Tooltip> ：
        </Col>
        <Col span={12} style={{ position: 'relative' }}>
          <Input
            placeholder="请输入自定义字段名称"
            style={{ borderColor: custom_field1_rule ? '#f5222d' : '' }}
            value={custom_field1_name}
            onChange={changeCustomName}
          />
          <div
            className="custom-field-rule"
            style={{ display: custom_field1_rule ? 'block' : 'none' }}
          >
            自定义字段名称不能为空
          </div>
        </Col>
        <Col span={2} className="label">
          开启：
        </Col>
        <Col span={6}>
          <Switch
            checked={custom_field1_enable}
            checkedChildren="开"
            unCheckedChildren="关"
            onChange={changeCustomEnable}
          />
        </Col>
      </Row>
      <Row type="flex" justify="center" className="row save">
        <Col span={4} className="save-button">
          <Button className="m-btn btn-save" icon={<SaveOutlined />} type="primary" onClick={editGroup}>
            保 存
          </Button>
        </Col>
      </Row>
      {/* 只有超级管理员能删除分组 */}
      {curUserRole === 'admin' ? (
        <Row type="flex" justify="center" className="danger-container">
          <Col span={24} className="title">
            <h2 className="content">
              <ExclamationCircleOutlined /> 危险操作
            </h2>
            <Button onClick={toggleDangerOptions}>
              查 看{React.createElement(showDangerOptions ? UpOutlined : DownOutlined)}
            </Button>
          </Col>
          {showDangerOptions ? (
            <Card hoverable={true} className="card-danger" style={{ width: '100%' }}>
              <div className="card-danger-content">
                <h3>删除分组</h3>
                <p>分组一旦删除，将无法恢复数据，请慎重操作！</p>
                <p>只有超级管理员有权限删除分组。</p>
              </div>
              <Button type="danger" ghost className="card-danger-btn" onClick={showConfirm}>
                删除
              </Button>
            </Card>
          ) : null}
        </Row>
      ) : null}
    </div>
  );
};

GroupSetting.propTypes = {
  currGroup: PropTypes.object,
  curUserRole: PropTypes.string,
  changeGroupMsg: PropTypes.func,
  fetchGroupList: PropTypes.func,
  setCurrGroup: PropTypes.func,
  fetchGroupMsg: PropTypes.func,
  fetchNewsData: PropTypes.func,
  updateGroupList: PropTypes.func,
  deleteGroup: PropTypes.func,
  groupList: PropTypes.array
};

export default GroupSetting;

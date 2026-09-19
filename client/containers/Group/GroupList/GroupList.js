// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { Modal, Input, message, Spin, Row, Menu, Col, Popover, Tooltip } from 'antd';
import { FolderAddOutlined, FolderOpenOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
const { TextArea } = Input;
const Search = Input.Search;
import UsernameAutoComplete from '../../../components/UsernameAutoComplete/UsernameAutoComplete.js';
import GuideBtns from '../../../components/GuideBtns/GuideBtns.js';
import { fetchNewsData } from '../../../reducer/modules/news.js';
import {
  parseRouteGroupId,
  resolveTargetGroup,
  findGroupById,
  buildGroupPath,
  filterGroups
} from './groupSelect.js';
import {
  fetchGroupList,
  setCurrGroup,
  fetchGroupMsg
} from '../../../reducer/modules/group.js';

import './GroupList.scss';

const tip = (
  <div className="title-container">
    <h3 className="title">欢迎使用 YApi ~</h3>
    <p>
      这里的 <b>“个人空间”</b>{' '}
      是你自己才能看到的分组，你拥有这个分组的全部权限，可以在这个分组里探索 YApi 的功能。
    </p>
  </div>
);

/**
 * 左侧分组菜单。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect/@withRouter/@autobind 改为 useSelector/useDispatch/useNavigate/useParams
 *   与普通函数/箭头属性；
 * - 旧 UNSAFE_componentWillMount 改为挂载期 useEffect（保留竞态修复语义）；
 * - 旧 UNSAFE_componentWillReceiveProps 改为每次渲染后运行的 useEffect + prev ref 比较；
 * - 异步动作 await 恢复后的 redux 读取经 ref 镜像最新 store 值，
 *   等价于旧类组件的实时 this.props 语义。
 */
const GroupList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const groupList = useSelector(state => state.group.groupList);
  const currGroup = useSelector(state => state.group.currGroup);
  // 旧 @connect 映射的 curUserRole/curUserRoleInGroup 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.user.role);
  useSelector(state => state.group.currGroup.role || state.group.role);
  const studyTip = useSelector(state => state.user.studyTip);
  const study = useSelector(state => state.user.study);

  const [addGroupModalVisible, setAddGroupModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  // 历史遗留 state：仅在已不可达的旧 editGroup 方法中读取（该方法无任何 UI 触发点，随迁移移除），
  // 保留裸 useState 调用与旧实现的 state 形态一致
  useState('');
  useState('');
  const [owner_uids, setOwnerUids] = useState(/** @type {any[]} */ ([]));
  // 本地展示列表（搜索过滤 / 初始化与 redux 列表刷新时同步），对应旧 this.state.groupList
  const [localGroupList, setLocalGroupList] = useState(/** @type {any[]} */ ([]));

  // 镜像最新 redux 值 / 路由参数：异步动作恢复后的读取等价于旧类组件的实时 this.props
  const groupListRef = useRef(groupList);
  const currGroupRef = useRef(currGroup);
  const paramsRef = useRef(params);
  groupListRef.current = groupList;
  currGroupRef.current = currGroup;
  paramsRef.current = params;

  /**
   * 按路由参数同步选中分组：命中则保持 URL 不动；
   * 无参数/参数非法/指向不存在的分组时回退首个分组并 replace 归一化 URL；
   * 列表为空时仅展示加载态，不产生 /group/undefined 这类无效 URL。
   */
  /**
   * @param {any} nextGroupList
   * @param {any} nextParams
   */
  function syncGroupSelection(nextGroupList, nextParams) {
    const list = Array.isArray(nextGroupList) ? nextGroupList : [];
    setLocalGroupList(list);
    const routeId = parseRouteGroupId(nextParams);
    const target = resolveTargetGroup(list, routeId);
    if (!target || target._id === undefined || target._id === null) {
      return null;
    }
    dispatch(setCurrGroup(target));
    if (routeId !== Number(target._id)) {
      navigate(buildGroupPath(target._id), { replace: true });
    }
    return target;
  }

  useEffect(() => {
    // 竞态修复：await 恢复时 redux 列表可能仍是本次 dispatch 前渲染传入的旧列表，
    // 初始化必须使用 fetchGroupList 返回的 action payload（redux-promise 以最新响应 resolve）。
    (async () => {
      const res = await dispatch(fetchGroupList());
      const list =
        res && res.payload && res.payload.data ? res.payload.data.data : groupListRef.current;
      syncGroupSelection(list, paramsRef.current);
    })();
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：redux 列表或路由参数变化时同步本地列表/选中分组
  const prevGroupListRef = useRef(groupList);
  const prevRouteIdRef = useRef(parseRouteGroupId(params));
  useEffect(() => {
    const routeId = parseRouteGroupId(params);
    const prevGroupList = prevGroupListRef.current;
    const prevRouteId = prevRouteIdRef.current;
    prevGroupListRef.current = groupList;
    prevRouteIdRef.current = routeId;
    if (prevGroupList !== groupList) {
      // GroupSetting 组件设置的分组信息，通过redux同步到左侧分组菜单中
      setLocalGroupList(groupList);
      // 列表刷新后（如当前分组被删除），路由不再指向有效分组时重新归一化选中
      if (!findGroupById(groupList, routeId)) {
        syncGroupSelection(groupList, params);
      }
    } else if (routeId !== prevRouteId) {
      // 路由参数变化（前进/后退、直接改 URL）时同步选中分组
      syncGroupSelection(groupList, params);
    }
  });

  const showModal = () => {
    setAddGroupModalVisible(true);
  };
  const hideModal = () => {
    // 旧实现同时重置从未声明的 state.group_name（仅触发额外渲染，无 DOM 影响），随迁移移除
    setNewGroupName('');
    setOwnerUids([]);
    setAddGroupModalVisible(false);
  };
  const addGroup = async () => {
    const group_name = newGroupName;
    const group_desc = newGroupDesc;
    const res = await axios.post('/api/group/add', { group_name, group_desc, owner_uids });
    if (!res.data.errcode) {
      // 旧实现同时 setState 从未声明的 state.group_name（仅触发额外渲染，无 DOM 影响），随迁移移除
      setNewGroupName('');
      setOwnerUids([]);
      setAddGroupModalVisible(false);
      await dispatch(fetchGroupList());
      setLocalGroupList(groupListRef.current);
      dispatch(fetchGroupMsg(currGroupRef.current._id));
      dispatch((/** @type {any} */ (fetchNewsData))(currGroupRef.current._id, 'group', 1, 10));
    } else {
      message.error(res.data.errmsg);
    }
  };
  // 注：旧类组件的 editGroup 方法在本组件渲染树中从未被引用（编辑功能由 GroupSetting 承担），
  // 属不可达死代码，随迁移移除；其依赖的遗留 state 以上方裸 useState 保留。
  /**
   * @param {any} e
   */
  const inputNewGroupName = e => {
    setNewGroupName(e.target.value);
  };
  /**
   * @param {any} e
   */
  const inputNewGroupDesc = e => {
    setNewGroupDesc(e.target.value);
  };

  /**
   * @param {any} e
   */
  const selectGroup = e => {
    const groupId = e.key;
    const nextGroup = findGroupById(groupListRef.current, groupId);
    // 严格匹配失败时不更新选中态，避免把 undefined 写进 URL 与 redux
    if (!nextGroup) {
      return;
    }
    // 点击当前分组直接返回，不重复请求
    if (Number(nextGroup._id) === Number(currGroupRef.current._id)) {
      return;
    }
    // 只推送 URL（保留历史，后退可恢复上一个分组），
    // 选中统一由路由变化生命周期 syncGroupSelection 派发，避免点击+路由双重请求；
    // 动态数据由 TimeTree 监听 typeid 变化自行重拉，此处不再直发新闻请求
    navigate(buildGroupPath(nextGroup._id));
  };

  /**
   * @param {any} uids
   */
  const onUserSelect = uids => {
    setOwnerUids(uids);
  };

  /**
   * @param {any} e
   * @param {any} value
   */
  const searchGroup = (e, value) => {
    const v = value !== undefined ? value : e.target.value;
    setLocalGroupList(filterGroups(groupListRef.current, v));
  };

  return (
    <div className="m-group">
      {!study ? <div className="study-mask" /> : null}
      <div className="group-bar">
        <div className="curr-group">
          <div className="curr-group-name">
            <span className="name">{currGroup.group_name}</span>
            <Tooltip title="添加分组">
              <a className="editSet">
                <FolderAddOutlined className="btn" onClick={showModal} />
              </a>
            </Tooltip>

          </div>
          <div className="curr-group-desc">简介: {currGroup.group_desc}</div>
        </div>

        <div className="group-operate">
          <div className="search">
            <Search
              placeholder="搜索分类"
              onChange={searchGroup}
              onSearch={(/** @type {any} */ v) => searchGroup(null, v)}
            />
          </div>
        </div>
        {localGroupList.length === 0 && <Spin style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'center'
        }} />}
        <Menu
          className="group-list"
          mode="inline"
          onClick={selectGroup}
          selectedKeys={[`${currGroup._id}`]}
          items={localGroupList.map(group => {
            if (group.type === 'private') {
              return {
                key: `${group._id}`,
                className: 'group-item',
                style: { zIndex: studyTip === 0 ? 3 : 1 },
                label: (
                  <span>
                    <UserOutlined />
                    {/* 文字用与普通分组相同的直属文本渲染，再由 Popover 提供引导浮层，
                        避免 Popover 包裹节点自带内边距导致文字与其它分组不对齐 */}
                    <Popover
                      overlayClassName="popover-index"
                      content={<GuideBtns />}
                      title={tip}
                      placement="right"
                      open={studyTip === 0 && !study}
                    >
                      <span className="group-name-text">{group.group_name}</span>
                    </Popover>
                  </span>
                )
              };
            }
            return {
              key: `${group._id}`,
              className: 'group-item',
              label: (
                <span>
                  <FolderOpenOutlined />
                  <span className="group-name-text">{group.group_name}</span>
                </span>
              )
            };
          })}
        />
      </div>
      {addGroupModalVisible ? (
        <Modal
          title="添加分组"
          open={addGroupModalVisible}
          onOk={addGroup}
          onCancel={hideModal}
          className="add-group-modal"
        >
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label">分组名：</div>
            </Col>
            <Col span="15">
              <Input placeholder="请输入分组名称" onChange={inputNewGroupName} />
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label">简介：</div>
            </Col>
            <Col span="15">
              <TextArea rows={3} placeholder="请输入分组描述" onChange={inputNewGroupDesc} />
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span="5">
              <div className="label">组长：</div>
            </Col>
            <Col span="15">
              <UsernameAutoComplete callbackState={onUserSelect} />
            </Col>
          </Row>
        </Modal>
      ) : (
        ''
      )}
    </div>
  );
};

GroupList.propTypes = {
  groupList: PropTypes.array,
  currGroup: PropTypes.object,
  fetchGroupList: PropTypes.func,
  setCurrGroup: PropTypes.func,
  match: PropTypes.object,
  history: PropTypes.object,
  curUserRole: PropTypes.string,
  curUserRoleInGroup: PropTypes.string,
  studyTip: PropTypes.number,
  study: PropTypes.bool,
  fetchNewsData: PropTypes.func,
  fetchGroupMsg: PropTypes.func
};

export default GroupList;

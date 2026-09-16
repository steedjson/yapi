import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Modal, Input, message,Spin,  Row, Menu, Col, Popover, Tooltip } from 'antd';
import { FolderAddOutlined, FolderOpenOutlined, UserOutlined } from '@ant-design/icons';
import { autobind } from 'core-decorators';
import axios from 'axios';
import withRouter from '../../../withRouter';
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
import _ from 'underscore';

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

@connect(
  state => ({
    groupList: state.group.groupList,
    currGroup: state.group.currGroup,
    curUserRole: state.user.role,
    curUserRoleInGroup: state.group.currGroup.role || state.group.role,
    studyTip: state.user.studyTip,
    study: state.user.study
  }),
  {
    fetchGroupList,
    setCurrGroup,
    fetchNewsData,
    fetchGroupMsg
  }
)
@withRouter
export default class GroupList extends Component {
  static propTypes = {
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

  state = {
    addGroupModalVisible: false,
    newGroupName: '',
    newGroupDesc: '',
    currGroupName: '',
    currGroupDesc: '',
    groupList: [],
    owner_uids: []
  };

  constructor(props) {
    super(props);
  }

  async UNSAFE_componentWillMount() {
    // 竞态修复：await 恢复时 this.props.groupList 可能仍是本次 dispatch 前渲染传入的旧列表，
    // 初始化必须使用 fetchGroupList 返回的 action payload（redux-promise 以最新响应 resolve）。
    const res = await this.props.fetchGroupList();
    const list =
      res && res.payload && res.payload.data ? res.payload.data.data : this.props.groupList;
    this.syncGroupSelection(list, this.props.match.params);
  }

  /**
   * 按路由参数同步选中分组：命中则保持 URL 不动；
   * 无参数/参数非法/指向不存在的分组时回退首个分组并 replace 归一化 URL；
   * 列表为空时仅展示加载态，不产生 /group/undefined 这类无效 URL。
   */
  @autobind
  syncGroupSelection(groupList, params) {
    const list = Array.isArray(groupList) ? groupList : [];
    this.setState({ groupList: list });
    const routeId = parseRouteGroupId(params);
    const target = resolveTargetGroup(list, routeId);
    if (!target || target._id === undefined || target._id === null) {
      return null;
    }
    this.props.setCurrGroup(target);
    if (routeId !== Number(target._id)) {
      this.props.history.replace(buildGroupPath(target._id));
    }
    return target;
  }

  @autobind
  showModal() {
    this.setState({
      addGroupModalVisible: true
    });
  }
  @autobind
  hideModal() {
    this.setState({
      newGroupName: '',
      group_name: '',
      owner_uids: [],
      addGroupModalVisible: false
    });
  }
  @autobind
  async addGroup() {
    const { newGroupName: group_name, newGroupDesc: group_desc, owner_uids } = this.state;
    const res = await axios.post('/api/group/add', { group_name, group_desc, owner_uids });
    if (!res.data.errcode) {
      this.setState({
        newGroupName: '',
        group_name: '',
        owner_uids: [],
        addGroupModalVisible: false
      });
      await this.props.fetchGroupList();
      this.setState({ groupList: this.props.groupList });
      this.props.fetchGroupMsg(this.props.currGroup._id);
      this.props.fetchNewsData(this.props.currGroup._id, 'group', 1, 10);
    } else {
      message.error(res.data.errmsg);
    }
  }
  @autobind
  async editGroup() {
    const { currGroupName: group_name, currGroupDesc: group_desc } = this.state;
    const id = this.props.currGroup._id;
    const res = await axios.post('/api/group/up', { group_name, group_desc, id });
    if (res.data.errcode) {
      message.error(res.data.errmsg);
    } else {
      await this.props.fetchGroupList();

      this.setState({ groupList: this.props.groupList });
      const currGroup = _.find(this.props.groupList, group => {
        return +group._id === +id;
      });

      this.props.setCurrGroup(currGroup);
      // this.props.setCurrGroup({ group_name, group_desc, _id: id });
      this.props.fetchGroupMsg(this.props.currGroup._id);
      this.props.fetchNewsData(this.props.currGroup._id, 'group', 1, 10);
    }
  }
  @autobind
  inputNewGroupName(e) {
    this.setState({ newGroupName: e.target.value });
  }
  @autobind
  inputNewGroupDesc(e) {
    this.setState({ newGroupDesc: e.target.value });
  }

  @autobind
  selectGroup(e) {
    const groupId = e.key;
    const currGroup = findGroupById(this.props.groupList, groupId);
    // 严格匹配失败时不更新选中态，避免把 undefined 写进 URL 与 redux
    if (!currGroup) {
      return;
    }
    // 点击当前分组直接返回，不重复请求
    if (Number(currGroup._id) === Number(this.props.currGroup._id)) {
      return;
    }
    // 只推送 URL（保留历史，后退可恢复上一个分组），
    // 选中统一由路由变化生命周期 syncGroupSelection 派发，避免点击+路由双重请求；
    // 动态数据由 TimeTree 监听 typeid 变化自行重拉，此处不再直发新闻请求
    this.props.history.push(buildGroupPath(currGroup._id));
  }

  @autobind
  onUserSelect(uids) {
    this.setState({
      owner_uids: uids
    });
  }

  @autobind
  searchGroup(e, value) {
    const v = value !== undefined ? value : e.target.value;
    this.setState({
      groupList: filterGroups(this.props.groupList, v)
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    // GroupSetting 组件设置的分组信息，通过redux同步到左侧分组菜单中
    if (this.props.groupList !== nextProps.groupList) {
      this.setState({
        groupList: nextProps.groupList
      });
      // 列表刷新后（如当前分组被删除），路由不再指向有效分组时重新归一化选中
      if (!findGroupById(nextProps.groupList, parseRouteGroupId(nextProps.match.params))) {
        this.syncGroupSelection(nextProps.groupList, nextProps.match.params);
      }
    } else if (
      parseRouteGroupId(nextProps.match.params) !== parseRouteGroupId(this.props.match.params)
    ) {
      // 路由参数变化（前进/后退、直接改 URL）时同步选中分组
      this.syncGroupSelection(nextProps.groupList, nextProps.match.params);
    }
  }

  render() {
    const { currGroup } = this.props;
    return (
      <div className="m-group">
        {!this.props.study ? <div className="study-mask" /> : null}
        <div className="group-bar">
          <div className="curr-group">
            <div className="curr-group-name">
              <span className="name">{currGroup.group_name}</span>
              <Tooltip title="添加分组">
                <a className="editSet">
                  <FolderAddOutlined className="btn" onClick={this.showModal} />
                </a>
              </Tooltip>
            
            </div>
            <div className="curr-group-desc">简介: {currGroup.group_desc}</div>
          </div>

          <div className="group-operate">
            <div className="search">
              <Search
                placeholder="搜索分类"
                onChange={this.searchGroup}
                onSearch={v => this.searchGroup(null, v)}
              />
            </div>
          </div>
          {this.state.groupList.length === 0 && <Spin style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'center'
          }} />}
          <Menu
            className="group-list"
            mode="inline"
            onClick={this.selectGroup}
            selectedKeys={[`${currGroup._id}`]}
            items={this.state.groupList.map(group => {
              if (group.type === 'private') {
                return {
                  key: `${group._id}`,
                  className: 'group-item',
                  style: { zIndex: this.props.studyTip === 0 ? 3 : 1 },
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
                        open={this.props.studyTip === 0 && !this.props.study}
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
        {this.state.addGroupModalVisible ? (
          <Modal
            title="添加分组"
            open={this.state.addGroupModalVisible}
            onOk={this.addGroup}
            onCancel={this.hideModal}
            className="add-group-modal"
          >
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">分组名：</div>
              </Col>
              <Col span="15">
                <Input placeholder="请输入分组名称" onChange={this.inputNewGroupName} />
              </Col>
            </Row>
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">简介：</div>
              </Col>
              <Col span="15">
                <TextArea rows={3} placeholder="请输入分组描述" onChange={this.inputNewGroupDesc} />
              </Col>
            </Row>
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">组长：</div>
              </Col>
              <Col span="15">
                <UsernameAutoComplete callbackState={this.onUserSelect} />
              </Col>
            </Row>
          </Modal>
        ) : (
          ''
        )}
      </div>
    );
  }
}

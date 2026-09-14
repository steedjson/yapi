// @ts-check
import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
  fetchInterfaceListMenu,
  fetchInterfaceList,
  fetchInterfaceCatList,
  fetchInterfaceData,
  deleteInterfaceData,
  deleteInterfaceCatData,
  initInterface
} from '../../../../reducer/modules/interface.js';
import { getProject } from '../../../../reducer/modules/project.js';
import { Input, Button, Modal, message, Tree, Tooltip } from 'antd';
import {
  FolderOpenOutlined,
  FolderOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  EditOutlined,
  CopyOutlined
} from '@ant-design/icons';
import AddInterfaceForm from './AddInterfaceForm';
import AddInterfaceCatForm from './AddInterfaceCatForm';
import axios from 'axios';
import { Link, withRouter } from 'react-router-dom';
import produce from 'immer';
import { arrayChangeIndex } from '../../../../common.js';

import './interfaceMenu.scss';

const confirm = Modal.confirm;
const TreeNode = Tree.TreeNode;
const headHeight = 240; // menu顶部到网页顶部部分的高度

@connect(
  (/** @type {any} */ state) => {
    return {
      list: state.inter.list,
      inter: state.inter.curdata,
      curProject: state.project.currProject,
      expands: []
    };
  },
  {
    fetchInterfaceListMenu,
    fetchInterfaceData,
    deleteInterfaceCatData,
    deleteInterfaceData,
    initInterface,
    getProject,
    fetchInterfaceCatList,
    fetchInterfaceList
  }
)
class InterfaceMenu extends Component {
  static propTypes = {
    match: PropTypes.object,
    inter: PropTypes.object,
    projectId: PropTypes.string,
    list: PropTypes.array,
    fetchInterfaceListMenu: PropTypes.func,
    curProject: PropTypes.object,
    fetchInterfaceData: PropTypes.func,
    addInterfaceData: PropTypes.func,
    deleteInterfaceData: PropTypes.func,
    initInterface: PropTypes.func,
    history: PropTypes.object,
    router: PropTypes.object,
    getProject: PropTypes.func,
    fetchInterfaceCatList: PropTypes.func,
    fetchInterfaceList: PropTypes.func
  };

  /**
   * @param {String} key
   */
  /**
   * @param {any} key
   * @param {any} status
   * @returns {void}
   */
  changeModal = (key, status) => {
    //visible add_cat_modal_visible change_cat_modal_visible del_cat_modal_visible
    let newState = /** @type {any} */ ({});
    newState[key] = status;
    this.setState(newState);
  };

  /**
   * @returns {void}
   */
  handleCancel = () => {
    this.setState({
      visible: false
    });
  };

  constructor(/** @type {any} */ props) {
    super(props);
    this.state = /** @type {any} */ ({
      curKey: null,
      visible: false,
      delIcon: null,
      curCatid: null,
      add_cat_modal_visible: false,
      change_cat_modal_visible: false,
      del_cat_modal_visible: false,
      curCatdata: {},
      expands: null,
      list: []
    });
  }

  /**
   * @returns {void}
   */
  handleRequest() {
    this.props.initInterface();
    this.getList();
  }

  /**
   * @returns {Promise<void>}
   */
  async getList() {
    let r = await this.props.fetchInterfaceListMenu(this.props.projectId);
    this.setState({
      list: r.payload.data.data
    });
  }

  /**
   * @returns {void}
   */
  UNSAFE_componentWillMount() {
    this.handleRequest();
  }

  /**
   * @param {any} nextProps
   * @returns {void}
   */
  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.list !== nextProps.list) {
      // console.log('next', nextProps.list)
      this.setState({
        list: nextProps.list
      });
    }
  }

  /**
   * @param {any} selectedKeys
   * @returns {any}
   */
  onSelect = selectedKeys => {
    const { history, match } = this.props;
    let curkey = selectedKeys[0];

    if (!curkey || !selectedKeys) {
      return false;
    }
    let basepath = '/project/' + match.params.id + '/interface/api';
    if (curkey === 'root') {
      history.push(basepath);
    } else {
      history.push(basepath + '/' + curkey);
    }
    this.setState({
      expands: null
    });
  };

  /**
   * @returns {void}
   */
  changeExpands = () => {
    this.setState({
      expands: null
    });
  };

  /**
   * @param {any} data
   * @param {any} cb
   * @returns {Promise<any>}
   */
  handleAddInterface = async (data, cb) => {
    data.project_id = this.props.projectId;
    try {
      const res = await axios.post('/api/interface/add', data);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口添加成功');
      let interfaceId = res.data.data._id;
      this.props.history.push('/project/' + this.props.projectId + '/interface/api/' + interfaceId);
      await this.getList();
      this.setState({
        visible: false
      });
      if (cb) cb();
    } catch (/** @type {any} */ err) {
      message.error('接口添加失败：' + err.message);
    }
  };

  /**
   * @param {any} list
   * @returns {any[]}
   */
  flattenCategories = list => {
    const result = [];
    const stack = (list || []).slice().reverse().map((/** @type {any} */ item) => ({ item, prefix: '' }));
    // 使用显式栈遍历，避免层级较深时递归调用耗尽调用栈。
    while (stack.length) {
      const current = stack.pop();
      const item = current.item;
      if (!item) continue;
      result.push({ _id: item._id, label: current.prefix + item.name });
      const children = (item.children || []).slice().reverse();
      children.forEach((/** @type {any} */ child) => stack.push({ item: child, prefix: current.prefix + '└ ' }));
    }
    return result;
  };

  /**
   * @param {any} data
   * @returns {Promise<any>}
   */
  handleAddInterfaceCat = async data => {
    data.project_id = this.props.projectId;
    try {
      const res = await axios.post('/api/interface/add_cat', data);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口分类添加成功');
      await Promise.all([this.getList(), this.props.getProject(data.project_id)]);
      this.setState({
        add_cat_modal_visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口分类添加失败：' + err.message);
    }
  };

  /**
   * @param {any} data
   * @returns {Promise<any>}
   */
  handleChangeInterfaceCat = async data => {
    data.project_id = this.props.projectId;

    let params = {
      catid: this.state.curCatdata._id,
      name: data.name,
      desc: data.desc
    };

    try {
      const res = await axios.post('/api/interface/up_cat', params);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口分类更新成功');
      await Promise.all([this.getList(), this.props.getProject(data.project_id)]);
      this.setState({
        change_cat_modal_visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口分类更新失败：' + err.message);
    }
  };

  /**
   * @param {any} data
   * @returns {void}
   */
  showConfirm = data => {
    let that = this;
    let id = data._id;
    let catid = data.catid;
    const ref = confirm({
      title: '您确认删除此接口????',
      content: '温馨提示：接口删除后，无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        try {
          const result = await that.props.deleteInterfaceData(id, that.props.projectId);
          if (result && result.payload && result.payload.data.errcode !== 0) {
            return message.error(result.payload.data.errmsg);
          }
          await that.getList();
          await that.props.fetchInterfaceCatList({ catid });
          that.props.history.push(
            '/project/' + that.props.match.params.id + '/interface/api/cat_' + catid
          );
        } catch (/** @type {any} */ err) {
          message.error('接口删除失败：' + err.message);
        } finally {
          ref.destroy();
        }
      },
      onCancel() {
        ref.destroy();
      }
    });
  };

  /**
   * @param {any} catid
   * @returns {void}
   */
  showDelCatConfirm = catid => {
    let that = this;
    const ref = confirm({
      title: '确定删除此接口分类吗？',
      content: '温馨提示：该操作会删除该分类下所有接口，接口删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        try {
          const result = await that.props.deleteInterfaceCatData(catid, that.props.projectId);
          if (result && result.payload && result.payload.data.errcode !== 0) {
            return message.error(result.payload.data.errmsg);
          }
          await that.getList();
          await that.props.fetchInterfaceList({ project_id: that.props.projectId });
          that.props.history.push('/project/' + that.props.match.params.id + '/interface/api');
        } catch (/** @type {any} */ err) {
          message.error('接口分类删除失败：' + err.message);
        } finally {
          ref.destroy();
        }
      },
      onCancel() {}
    });
  };

  /**
   * @param {any} id
   * @returns {Promise<any>}
   */
  copyInterface = async id => {
    try {
      let interfaceData = await this.props.fetchInterfaceData(id);
      let data = interfaceData.payload.data.data;
      let newData = produce(data, draftData => {
        draftData.title = draftData.title + '_copy';
        draftData.path = draftData.path + '_' + Date.now();
      });

      const res = await axios.post('/api/interface/add', newData);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口添加成功');
      let interfaceId = res.data.data._id;
      await this.getList();
      this.props.history.push('/project/' + this.props.projectId + '/interface/api/' + interfaceId);
      this.setState({
        visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口复制失败：' + err.message);
    }
  };

  /**
   * @param {any} id
   * @returns {void}
   */
  enterItem = id => {
    this.setState({ delIcon: id });
  };

  /**
   * @returns {void}
   */
  leaveItem = () => {
    this.setState({ delIcon: null });
  };

  /**
   * @param {any} e
   * @returns {void}
   */
  onFilter = e => {
    this.setState({
      filter: e.target.value,
      list: JSON.parse(JSON.stringify(this.props.list))
    });
  };

  /**
   * @param {any} e
   * @returns {void}
   */
  onExpand = e => {
    this.setState({
      expands: e
    });
  };

  /**
   * @param {any} e
   * @returns {Promise<void>}
   */
  /**
   * 递归在分类树中按接口 ID 查找所属分类、接口列表以及接口在该分类中的下标。
   * @param {Array<any>} tree 分类树数组
   * @param {string|number} interfaceId 接口 ID
   * @returns {{ cat: any, list: Array<any>, index: number } | null}
   */
  findCatByInterfaceId = (tree, interfaceId) => {
    if (!Array.isArray(tree)) return null;
    for (const cat of tree) {
      if (Array.isArray(cat.list)) {
        const idx = cat.list.findIndex((/** @type {any} */ item) => String(item._id) === String(interfaceId));
        if (idx !== -1) {
          return { cat, list: cat.list, index: idx };
        }
      }
      if (Array.isArray(cat.children) && cat.children.length) {
        const found = this.findCatByInterfaceId(cat.children, interfaceId);
        if (found) return found;
      }
    }
    return null;
  };

  /**
   * 递归在分类树中按分类 ID 查找分类对象。
   * @param {Array<any>} tree 分类树数组
   * @param {string|number} catId 分类 ID
   * @returns {any | null}
   */
  findCatById = (tree, catId) => {
    if (!Array.isArray(tree)) return null;
    for (const cat of tree) {
      if (String(cat._id) === String(catId)) return cat;
      if (Array.isArray(cat.children) && cat.children.length) {
        const found = this.findCatById(cat.children, catId);
        if (found) return found;
      }
    }
    return null;
  };

  /**
   * 递归在分类树中按分类 ID 查找所属兄弟列表及自身下标，用于同级分类拖拽排序。
   * @param {Array<any>} tree 分类树数组
   * @param {string|number} catId 分类 ID
   * @param {any} parent 父分类对象
   * @returns {{ parent: any, list: Array<any>, index: number } | null}
   */
  findCatSiblingInfo = (tree, catId, parent = null) => {
    if (!Array.isArray(tree)) return null;
    for (let i = 0; i < tree.length; i++) {
      const item = tree[i];
      if (String(item._id) === String(catId)) {
        return { parent, list: tree, index: i };
      }
      if (Array.isArray(item.children) && item.children.length) {
        const res = this.findCatSiblingInfo(item.children, catId, item);
        if (res) return res;
      }
    }
    return null;
  };

  /**
   * @param {any} e
   * @returns {Promise<void>}
   */
  onDrop = async e => {
    try {
      // 搜索过滤状态下树节点索引与完整列表错位,继续排序可能把接口移入错误分类
      if (this.state.filter) {
        message.info('搜索过滤中无法拖拽排序，请清空搜索后重试');
        return;
      }

      const { list, projectId, router } = this.props;
      const dragKey = String(e.dragNode.props.eventKey || '');
      const dropKey = String(e.node.props.eventKey || '');

      // 拖放到根节点「全部接口」(eventKey="root")时没有具体分类: 接口必须归属于某个分类
      if (dropKey === 'root') {
        message.info('接口必须位于具体分类下，请拖拽到分类或接口节点上');
        return;
      }

      const isDragCat = dragKey.indexOf('cat_') === 0;
      const isDropCat = dropKey.indexOf('cat_') === 0;

      if (!isDragCat) {
        // === 场景 1：拖动的是【接口】 ===
        const dragInterfaceId = dragKey;
        const dragCatInfo = this.findCatByInterfaceId(list, dragInterfaceId);
        if (!dragCatInfo) {
          return;
        }
        const dragCatId = dragCatInfo.cat._id;
        const dragIndex = dragCatInfo.index;

        let targetCat = null;
        let dropIndex = 0;

        if (isDropCat) {
          // 放置目标是【分类】：接口移动到该分类的末尾（或顶部）
          const dropCatId = dropKey.replace('cat_', '');
          targetCat = this.findCatById(list, dropCatId);
          if (!targetCat) return;
          dropIndex = (targetCat.list || []).length;
        } else {
          // 放置目标是【另一个接口】：放置到该目标接口所在的分类中
          const dropInterfaceId = dropKey;
          const dropCatInfo = this.findCatByInterfaceId(list, dropInterfaceId);
          if (!dropCatInfo) return;
          targetCat = dropCatInfo.cat;
          dropIndex = dropCatInfo.index;
        }

        const dropCatId = targetCat._id;

        if (String(dropCatId) === String(dragCatId)) {
          // 同一个分类下的接口调整排序顺序
          const colList = targetCat.list || [];
          const changes = arrayChangeIndex(colList, dragIndex, dropIndex);
          await axios.post('/api/interface/up_index', changes);
        } else {
          // 跨分类移动接口（支持从子分类移动到根分类、根分类移动到子分类、或不同子分类互移）
          await axios.post('/api/interface/up', { id: dragInterfaceId, catid: dropCatId });
        }

        const requests = [
          this.props.fetchInterfaceListMenu(projectId),
          this.props.fetchInterfaceList({ project_id: projectId })
        ];
        if (router && isNaN(router.params.actionId)) {
          const catid = router.params.actionId.substr(4);
          requests.push(this.props.fetchInterfaceCatList({ catid }));
        }
        await Promise.all(requests);
      } else {
        // === 场景 2：拖动的是【分类】 ===
        if (!isDropCat) {
          // 分类不能拖放到接口节点内
          return;
        }
        const dragCatId = dragKey.replace('cat_', '');
        const dropCatId = dropKey.replace('cat_', '');
        const dragCatInfo = this.findCatSiblingInfo(list, dragCatId);
        const dropCatInfo = this.findCatSiblingInfo(list, dropCatId);

        if (!dragCatInfo || !dropCatInfo) {
          return;
        }

        // 同级分类之间调整排序顺序
        if (dragCatInfo.parent === dropCatInfo.parent) {
          const siblingList = dragCatInfo.list;
          const changes = arrayChangeIndex(siblingList, dragCatInfo.index, dropCatInfo.index);
          await axios.post('/api/interface/up_cat_index', changes);
          await this.props.fetchInterfaceListMenu(projectId);
        }
      }
    } catch (/** @type {any} */ err) {
      message.error('拖拽排序失败：' + err.message);
    }
  };
  // 数据过滤
  /**
   * 递归收集分类及其所有子分类的 key（搜索命中后用于自动展开）
   * @param {any} cat
   * @param {any[]} arr
   * @returns {void}
   */
  collectCatKeys = (cat, arr) => {
    arr.push('cat_' + cat._id);
    (cat.children || []).forEach((/** @type {any} */ child) => this.collectCatKeys(child, arr));
  };

  /**
   * 递归过滤分类树：分类名命中则保留整棵子树；
   * 否则按关键字过滤该分类下的接口与子分类，命中才保留。
   * @param {any[]} list
   * @returns {any}
   */
  filterList = list => {
    let that = this;
    let arr = /** @type {any[]} */ ([]);
    const filterChildren = (/** @type {any[]} */ draftList) => {
      const kept = draftList.filter((/** @type {any} */ item) => {
        // 分类名命中：保留整棵子树并展开全部层级
        if (item.name.indexOf(that.state.filter) !== -1) {
          that.collectCatKeys(item, arr);
          return true;
        }
        // 过滤当前分类下的接口
        item.list = (item.list || []).filter((/** @type {any} */ inter) => {
          return (
            inter.title.indexOf(that.state.filter) !== -1 ||
            inter.path.indexOf(that.state.filter) !== -1
          );
        });
        // 递归过滤子分类
        item.children = filterChildren(item.children || []);
        const kept = item.list.length > 0 || item.children.length > 0;
        if (kept) arr.push('cat_' + item._id);
        return kept;
      });
      // 原地替换 draft 内容：immer 的 recipe 不得既返回新值又修改 draft
      draftList.splice(0, draftList.length, ...kept);
      return draftList;
    };
    const menuList = produce(list, draftList => {
      filterChildren(draftList);
    });
    return { menuList, arr };
  };

  /**
   * @param {any} item
   * @param {any} matchParams
   * @param {any} itemInterfaceCreate
   * @returns {any}
   */
  renderCategory = (item, matchParams, itemInterfaceCreate) => (
    <TreeNode
      title={
        <Link
          className="interface-item"
          onClick={(/** @type {any} */ e) => {
            e.stopPropagation();
            this.changeExpands();
          }}
          to={'/project/' + matchParams.id + '/interface/api/cat_' + item._id}
        >
          <FolderOpenOutlined style={{ marginRight: 5 }} />
          {item.name}
          <DeleteOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              this.showDelCatConfirm(item._id);
            }}
          />
          <EditOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              this.changeModal('change_cat_modal_visible', true);
              this.setState({ curCatdata: item });
            }}
          />
          <FolderAddOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              this.changeModal('add_cat_modal_visible', true);
              this.setState({ curCatid: item._id });
            }}
          />
        </Link>
      }
      key={'cat_' + item._id}
      className={`interface-item-nav ${(item.list || []).length || (item.children || []).length ? '' : 'cat_switch_hidden'}`}
    >
      {(item.list || []).map(itemInterfaceCreate)}
      {(item.children || []).map((/** @type {any} */ child) => this.renderCategory(child, matchParams, itemInterfaceCreate))}
    </TreeNode>
  );

  /**
   * @returns {any}
   */
  render() {
    const matchParams = this.props.match.params;
    // let menuList = this.state.list;
    const searchBox = (
      <div className="interface-filter">
        <Input onChange={this.onFilter} value={this.state.filter} placeholder="搜索接口" />
        <Button
          type="primary"
          onClick={() => this.changeModal('add_cat_modal_visible', true)}
          className="btn-filter"
        >
          添加分类
        </Button>
        {this.state.visible ? (
          <Modal
            title="添加接口"
            visible={this.state.visible}
            onCancel={() => this.changeModal('visible', false)}
            footer={null}
            className="addcatmodal"
          >
            <AddInterfaceForm
              catdata={this.props.curProject.cat}
              catid={this.state.curCatid}
              onCancel={() => this.changeModal('visible', false)}
              onSubmit={this.handleAddInterface}
            />
          </Modal>
        ) : (
          ''
        )}

        {this.state.add_cat_modal_visible ? (
          <Modal
            title="添加分类"
            visible={this.state.add_cat_modal_visible}
            onCancel={() => this.changeModal('add_cat_modal_visible', false)}
            footer={null}
            className="addcatmodal"
          >
            <AddInterfaceCatForm
              onCancel={() => this.changeModal('add_cat_modal_visible', false)}
              categories={this.flattenCategories(this.state.list)}
              parentId={this.state.curCatid}
              onSubmit={this.handleAddInterfaceCat}
            />
          </Modal>
        ) : (
          ''
        )}

        {this.state.change_cat_modal_visible ? (
          <Modal
            title="修改分类"
            visible={this.state.change_cat_modal_visible}
            onCancel={() => this.changeModal('change_cat_modal_visible', false)}
            footer={null}
            className="addcatmodal"
          >
            <AddInterfaceCatForm
              catdata={this.state.curCatdata}
              onCancel={() => this.changeModal('change_cat_modal_visible', false)}
              onSubmit={this.handleChangeInterfaceCat}
            />
          </Modal>
        ) : (
          ''
        )}
      </div>
    );
    const defaultExpandedKeys = () => {
      const { router, inter, list } = this.props,
        rNull = { expands: [], selects: [] };
      if (list.length === 0) {
        return rNull;
      }
      if (router) {
        if (!isNaN(router.params.actionId)) {
          if (!inter || !inter._id) {
            return rNull;
          }
          return {
            expands: this.state.expands ? this.state.expands : ['cat_' + inter.catid],
            selects: [inter._id + '']
          };
        } else {
          let catid = router.params.actionId.substr(4);
          return {
            expands: this.state.expands ? this.state.expands : ['cat_' + catid],
            selects: ['cat_' + catid]
          };
        }
      } else {
        return {
          expands: this.state.expands ? this.state.expands : ['cat_' + list[0]._id],
          selects: ['root']
        };
      }
    };

    /**
     * @param {any} item
     * @returns {any}
     */
    const itemInterfaceCreate = item => {
      return (
        <TreeNode
          title={
            <div
              className="container-title"
              onMouseEnter={() => this.enterItem(item._id)}
              onMouseLeave={this.leaveItem}
            >
              <Link
                className="interface-item"
                onClick={(/** @type {any} */ e) => e.stopPropagation()}
                to={'/project/' + matchParams.id + '/interface/api/' + item._id}
              >
                {item.title}
              </Link>
              <div className="btns">
                <Tooltip title="删除接口">
                  <DeleteOutlined
                    className="interface-delete-icon"
                  onClick={(/** @type {any} */ e) => {
                    e.stopPropagation();
                    this.showConfirm(item);
                    }}
                    style={{ display: this.state.delIcon == item._id ? 'block' : 'none' }}
                  />
                </Tooltip>
                <Tooltip title="复制接口">
                  <CopyOutlined
                    className="interface-delete-icon"
                  onClick={(/** @type {any} */ e) => {
                    e.stopPropagation();
                    this.copyInterface(item._id);
                    }}
                    style={{ display: this.state.delIcon == item._id ? 'block' : 'none' }}
                  />
                </Tooltip>
              </div>
              {/*<Dropdown overlay={menu(item)} trigger={['click']} onClick={e => e.stopPropagation()}>
            
          </Dropdown>*/}
            </div>
          }
          key={'' + item._id}
        />
      );
    };

    let currentKes = defaultExpandedKeys();
    let menuList;
    if (this.state.filter) {
      let res = this.filterList(this.state.list);
      menuList = res.menuList;
      currentKes.expands = res.arr;
    } else {
      menuList = this.state.list;
    }

    return (
      <div>
        {searchBox}
        {menuList.length > 0 ? (
          <div
            className="tree-wrappper"
            style={{ maxHeight: parseInt(/** @type {any} */ (document.body.clientHeight)) - headHeight + 'px' }}
          >
            <Tree
              className="interface-list"
              defaultExpandedKeys={currentKes.expands}
              defaultSelectedKeys={currentKes.selects}
              expandedKeys={currentKes.expands}
              selectedKeys={currentKes.selects}
              onSelect={this.onSelect}
              onExpand={this.onExpand}
              draggable
              onDrop={this.onDrop}
            >
              <TreeNode
                className="item-all-interface"
                title={
                  <Link
                    onClick={(/** @type {any} */ e) => {
                      e.stopPropagation();
                      this.changeExpands();
                    }}
                    to={'/project/' + matchParams.id + '/interface/api'}
                  >
                    <FolderOutlined style={{ marginRight: 5 }} />
                    全部接口
                  </Link>
                }
                key="root"
              />
              {menuList.map((/** @type {any} */ item) => this.renderCategory(item, matchParams, itemInterfaceCreate))}
            </Tree>
          </div>
        ) : null}
      </div>
    );
  }
}

export default withRouter(InterfaceMenu);

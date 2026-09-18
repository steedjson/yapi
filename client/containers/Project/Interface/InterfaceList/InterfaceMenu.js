// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Link } from 'react-router-dom';
import { produce } from 'immer';
import { arrayChangeIndex } from '../../../../common.js';

import './interfaceMenu.scss';

const confirm = Modal.confirm;
const headHeight = 240; // menu顶部到网页顶部部分的高度

/**
 * 递归在分类树中按接口 ID 查找所属分类、接口列表以及接口在该分类中的下标。
 * @param {Array<any>} tree 分类树数组
 * @param {string|number} interfaceId 接口 ID
 * @returns {{ cat: any, list: Array<any>, index: number } | null}
 */
function findCatByInterfaceId(tree, interfaceId) {
  if (!Array.isArray(tree)) return null;
  for (const cat of tree) {
    if (Array.isArray(cat.list)) {
      const idx = cat.list.findIndex((/** @type {any} */ item) => String(item._id) === String(interfaceId));
      if (idx !== -1) {
        return { cat, list: cat.list, index: idx };
      }
    }
    if (Array.isArray(cat.children) && cat.children.length) {
      const found = findCatByInterfaceId(cat.children, interfaceId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 递归在分类树中按分类 ID 查找从根到该分类的完整祖先路径（包含目标自身）。
 * 用于在选中子分类时自动展开所有上级分类，避免多级分类点击后折叠跳出。
 * @param {Array<any>} tree 分类树数组
 * @param {string|number} targetCatId 目标分类 ID
 * @param {Array<string>} [currentPath] 递归路径前缀
 * @returns {Array<string> | null}
 */
function findCatPath(tree, targetCatId, currentPath = []) {
  if (!Array.isArray(tree)) return null;
  for (const item of tree) {
    if (!item) continue;
    const nextPath = [...currentPath, 'cat_' + item._id];
    if (String(item._id) === String(targetCatId)) {
      return nextPath;
    }
    if (Array.isArray(item.children) && item.children.length) {
      const found = findCatPath(item.children, targetCatId, nextPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 递归在分类树中按分类 ID 查找分类对象。
 * @param {Array<any>} tree 分类树数组
 * @param {string|number} catId 分类 ID
 * @returns {any | null}
 */
function findCatById(tree, catId) {
  if (!Array.isArray(tree)) return null;
  for (const cat of tree) {
    if (String(cat._id) === String(catId)) return cat;
    if (Array.isArray(cat.children) && cat.children.length) {
      const found = findCatById(cat.children, catId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 递归在分类树中按分类 ID 查找所属兄弟列表及自身下标，用于同级分类拖拽排序。
 * @param {Array<any>} tree 分类树数组
 * @param {string|number} catId 分类 ID
 * @param {any} parent 父分类对象
 * @returns {{ parent: any, list: Array<any>, index: number } | null}
 */
function findCatSiblingInfo(tree, catId, parent = null) {
  if (!Array.isArray(tree)) return null;
  for (let i = 0; i < tree.length; i++) {
    const item = tree[i];
    if (String(item._id) === String(catId)) {
      return { parent, list: tree, index: i };
    }
    if (Array.isArray(item.children) && item.children.length) {
      const res = findCatSiblingInfo(item.children, catId, item);
      if (res) return res;
    }
  }
  return null;
}

/**
 * 按扁平顺序展开分类树（添加/修改分类表单的父级分类下拉数据）。
 * @param {any} list
 * @returns {any[]}
 */
function flattenCategories(list) {
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
}

/**
 * 递归收集分类及其所有子分类的 key（搜索命中后用于自动展开）。
 * @param {any} cat
 * @param {any[]} arr
 * @returns {void}
 */
function collectCatKeys(cat, arr) {
  arr.push('cat_' + cat._id);
  (cat.children || []).forEach((/** @type {any} */ child) => collectCatKeys(child, arr));
}

/**
 * 接口左侧目录树。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（旧 expands: [] 映射仅声明未消费，
 *   随迁移移除），旧 withRouter 注入的 match/history 改为 useParams/useNavigate，
 *   父级传入的 projectId / router props 保持不变；
 * - 旧 UNSAFE_componentWillMount / UNSAFE_componentWillReceiveProps 分别改为
 *   挂载期 useEffect 与 redux list 变化 useEffect（prev ref 比较）；
 * - 纯函数实例方法（findCatXxx / flattenCategories / collectCatKeys）提升为
 *   模块级函数；
 * - Modal.confirm 异步 onOk 等回调中对 this.props 的实时读取改为 latestRef
 *   镜像读取，语义一致。
 */
const InterfaceMenu = (/** @type {any} */ props) => {
  const { projectId, router } = props;
  const dispatch = useDispatch();
  const list = useSelector(state => state.inter.list);
  const inter = useSelector(state => state.inter.curdata);
  const curProject = useSelector(state => state.project.currProject);
  const navigate = useNavigate();
  const params = useParams();

  const [state, setState] = useState(
    /** @type {any} */ ({
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
    })
  );
  const patchState = (/** @type {any} */ patch) =>
    setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 镜像最新 props/state：confirm 弹窗异步 onOk 等回调中的读取
  // 等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { projectId, router, list, inter, curProject, params, state };

  const changeModal = (/** @type {any} */ key, /** @type {any} */ status) => {
    // visible add_cat_modal_visible change_cat_modal_visible del_cat_modal_visible
    patchState({ [key]: status });
  };

  const getList = async () => {
    const r = await dispatch(fetchInterfaceListMenu(latestRef.current.projectId));
    patchState({
      list: r.payload.data.data
    });
  };

  const handleRequest = () => {
    dispatch(initInterface());
    getList();
  };

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    handleRequest();
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：redux 分类树变化时同步本地镜像
  const prevListRef = useRef(list);
  useEffect(() => {
    if (prevListRef.current === list) return;
    prevListRef.current = list;
    patchState({ list });
  }, [list]);

  const onSelect = (/** @type {any} */ selectedKeys) => {
    const curkey = selectedKeys[0];

    if (!curkey || !selectedKeys) {
      return false;
    }
    const basepath = '/project/' + params.id + '/interface/api';
    if (curkey === 'root') {
      navigate(basepath);
    } else {
      navigate(basepath + '/' + curkey);
    }
  };

  const changeExpands = () => {
    // 保留当前展开状态，避免切换分类时整棵树意外折叠
  };

  const handleAddInterface = async (/** @type {any} */ data, /** @type {any} */ cb) => {
    data.project_id = projectId;
    try {
      const res = await axios.post('/api/interface/add', data);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口添加成功');
      const interfaceId = res.data.data._id;
      navigate('/project/' + projectId + '/interface/api/' + interfaceId);
      await getList();
      patchState({
        visible: false
      });
      if (cb) cb();
    } catch (/** @type {any} */ err) {
      message.error('接口添加失败：' + err.message);
    }
  };

  const handleAddInterfaceCat = async (/** @type {any} */ data) => {
    data.project_id = projectId;
    try {
      const res = await axios.post('/api/interface/add_cat', data);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口分类添加成功');
      await Promise.all([getList(), dispatch(getProject(data.project_id))]);
      patchState({
        add_cat_modal_visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口分类添加失败：' + err.message);
    }
  };

  const handleChangeInterfaceCat = async (/** @type {any} */ data) => {
    data.project_id = projectId;

    const catParams = {
      catid: state.curCatdata._id,
      name: data.name,
      desc: data.desc
    };

    try {
      const res = await axios.post('/api/interface/up_cat', catParams);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口分类更新成功');
      await Promise.all([getList(), dispatch(getProject(data.project_id))]);
      patchState({
        change_cat_modal_visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口分类更新失败：' + err.message);
    }
  };

  const showConfirm = (/** @type {any} */ data) => {
    const delId = data._id;
    const catid = data.catid;
    const ref = confirm({
      title: '您确认删除此接口????',
      content: '温馨提示：接口删除后，无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        try {
          const { projectId: currentProjectId, params: currentParams } = latestRef.current;
          const result = await dispatch(
            /** @type {any} */ (deleteInterfaceData)(delId, currentProjectId)
          );
          if (result && result.payload && result.payload.data.errcode !== 0) {
            return message.error(result.payload.data.errmsg);
          }
          await getList();
          await dispatch(fetchInterfaceCatList({ catid }));
          navigate('/project/' + currentParams.id + '/interface/api/cat_' + catid);
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

  const showDelCatConfirm = (/** @type {any} */ catid) => {
    const ref = confirm({
      title: '确定删除此接口分类吗？',
      content: '温馨提示：该操作会删除该分类下所有接口，接口删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        try {
          const { projectId: currentProjectId, params: currentParams } = latestRef.current;
          const result = await dispatch(
            /** @type {any} */ (deleteInterfaceCatData)(catid, currentProjectId)
          );
          if (result && result.payload && result.payload.data.errcode !== 0) {
            return message.error(result.payload.data.errmsg);
          }
          await getList();
          await dispatch(fetchInterfaceList({ project_id: currentProjectId }));
          navigate('/project/' + currentParams.id + '/interface/api');
        } catch (/** @type {any} */ err) {
          message.error('接口分类删除失败：' + err.message);
        } finally {
          ref.destroy();
        }
      },
      onCancel() {}
    });
  };

  const copyInterface = async (/** @type {any} */ copyId) => {
    try {
      const interfaceData = await dispatch(fetchInterfaceData(copyId));
      const data = interfaceData.payload.data.data;
      const newData = produce(data, draftData => {
        draftData.title = draftData.title + '_copy';
        draftData.path = draftData.path + '_' + Date.now();
      });

      const res = await axios.post('/api/interface/add', newData);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      message.success('接口添加成功');
      const interfaceId = res.data.data._id;
      await getList();
      navigate('/project/' + latestRef.current.projectId + '/interface/api/' + interfaceId);
      patchState({
        visible: false
      });
    } catch (/** @type {any} */ err) {
      message.error('接口复制失败：' + err.message);
    }
  };

  const enterItem = (/** @type {any} */ id) => {
    patchState({ delIcon: id });
  };

  const leaveItem = () => {
    patchState({ delIcon: null });
  };

  const onFilter = (/** @type {any} */ e) => {
    patchState({
      filter: e.target.value,
      list: JSON.parse(JSON.stringify(list))
    });
  };

  const onExpand = (/** @type {any} */ e) => {
    patchState({
      expands: e
    });
  };

  const onDrop = async (/** @type {any} */ e) => {
    try {
      // 搜索过滤状态下树节点索引与完整列表错位,继续排序可能把接口移入错误分类
      if (state.filter) {
        message.info('搜索过滤中无法拖拽排序，请清空搜索后重试');
        return;
      }

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
        const dragCatInfo = findCatByInterfaceId(list, dragInterfaceId);
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
          targetCat = findCatById(list, dropCatId);
          if (!targetCat) return;
          dropIndex = (targetCat.list || []).length;
        } else {
          // 放置目标是【另一个接口】：放置到该目标接口所在的分类中
          const dropInterfaceId = dropKey;
          const dropCatInfo = findCatByInterfaceId(list, dropInterfaceId);
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
          dispatch(fetchInterfaceListMenu(projectId)),
          dispatch(fetchInterfaceList({ project_id: projectId }))
        ];
        if (router && isNaN(router.params.actionId)) {
          const catid = router.params.actionId.substr(4);
          requests.push(dispatch(fetchInterfaceCatList({ catid })));
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
        const dragCatInfo = findCatSiblingInfo(list, dragCatId);
        const dropCatInfo = findCatSiblingInfo(list, dropCatId);

        if (!dragCatInfo || !dropCatInfo) {
          return;
        }

        // 同级分类之间调整排序顺序
        if (dragCatInfo.parent === dropCatInfo.parent) {
          const siblingList = dragCatInfo.list;
          const changes = arrayChangeIndex(siblingList, dragCatInfo.index, dropCatInfo.index);
          await axios.post('/api/interface/up_cat_index', changes);
          await dispatch(fetchInterfaceListMenu(projectId));
        }
      }
    } catch (/** @type {any} */ err) {
      message.error('拖拽排序失败：' + err.message);
    }
  };

  /**
   * 递归过滤分类树：分类名命中则保留整棵子树；
   * 否则按关键字过滤该分类下的接口与子分类，命中才保留。
   * @param {any[]} listTree
   * @param {any} filterValue
   * @returns {any}
   */
  const filterList = (listTree, filterValue) => {
    const arr = /** @type {any[]} */ ([]);
    const filterChildren = (/** @type {any[]} */ draftList) => {
      const kept = draftList.filter(item => {
        // 分类名命中：保留整棵子树并展开全部层级
        if (item.name.indexOf(filterValue) !== -1) {
          collectCatKeys(item, arr);
          return true;
        }
        // 过滤当前分类下的接口
        item.list = (item.list || []).filter((/** @type {any} */ interItem) => {
          return (
            interItem.title.indexOf(filterValue) !== -1 ||
            interItem.path.indexOf(filterValue) !== -1
          );
        });
        // 递归过滤子分类
        item.children = filterChildren(item.children || []);
        const keptItem = item.list.length > 0 || item.children.length > 0;
        if (keptItem) arr.push('cat_' + item._id);
        return keptItem;
      });
      // 原地替换 draft 内容：immer 的 recipe 不得既返回新值又修改 draft
      draftList.splice(0, draftList.length, ...kept);
      return draftList;
    };
    const menuList = produce(listTree, draftList => {
      filterChildren(draftList);
    });
    return { menuList, arr };
  };

  /**
   * antd5 Tree 移除 TreeNode JSX,改用 treeData 配置({ key, title, className, children })
   * @param {any} item
   * @param {any} matchParams
   * @param {any} itemInterfaceCreate
   * @returns {any}
   */
  const renderCategory = (item, matchParams, itemInterfaceCreate) => ({
    title: (
      <div className="category-title">
        <Link
          className="category-link"
          onClick={(/** @type {any} */ e) => {
            e.stopPropagation();
            changeExpands();
          }}
          to={'/project/' + matchParams.id + '/interface/api/cat_' + item._id}
        >
          <FolderOpenOutlined style={{ marginRight: 5 }} />
          <span>{item.name}</span>
        </Link>
        <div className="category-actions">
          <FolderAddOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              changeModal('add_cat_modal_visible', true);
              patchState({ curCatid: item._id });
            }}
          />
          <EditOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              changeModal('change_cat_modal_visible', true);
              patchState({ curCatdata: item });
            }}
          />
          <DeleteOutlined
            className="interface-delete-icon"
            onClick={(/** @type {any} */ e) => {
              e.preventDefault();
              e.stopPropagation();
              showDelCatConfirm(item._id);
            }}
          />
        </div>
      </div>
    ),
    key: 'cat_' + item._id,
    className: `interface-item-nav ${(item.list || []).length || (item.children || []).length ? '' : 'cat_switch_hidden'}`,
    children: [
      ...(item.list || []).map(itemInterfaceCreate),
      ...(item.children || []).map((
        /** @type {any} */ child
      ) => renderCategory(child, matchParams, itemInterfaceCreate))
    ]
  });

  const matchParams = params;
  // let menuList = this.state.list;
  const searchBox = (
    <div className="interface-filter">
      <Input onChange={onFilter} value={state.filter} placeholder="搜索接口" />
      <Button
        type="primary"
        onClick={() => changeModal('add_cat_modal_visible', true)}
        className="btn-filter"
      >
        添加分类
      </Button>
      {state.visible ? (
        <Modal
          title="添加接口"
          open={state.visible}
          onCancel={() => changeModal('visible', false)}
          footer={null}
          className="addcatmodal"
        >
          <AddInterfaceForm
            catdata={list && list.length ? list : curProject.cat}
            catid={state.curCatid}
            onCancel={() => changeModal('visible', false)}
            onSubmit={handleAddInterface}
          />
        </Modal>
      ) : (
        ''
      )}

      {state.add_cat_modal_visible ? (
        <Modal
          title="添加分类"
          open={state.add_cat_modal_visible}
          onCancel={() => changeModal('add_cat_modal_visible', false)}
          footer={null}
          className="addcatmodal"
        >
          <AddInterfaceCatForm
            onCancel={() => changeModal('add_cat_modal_visible', false)}
            categories={flattenCategories(state.list)}
            parentId={state.curCatid}
            onSubmit={handleAddInterfaceCat}
          />
        </Modal>
      ) : (
        ''
      )}

      {state.change_cat_modal_visible ? (
        <Modal
          title="修改分类"
          open={state.change_cat_modal_visible}
          onCancel={() => changeModal('change_cat_modal_visible', false)}
          footer={null}
          className="addcatmodal"
        >
          <AddInterfaceCatForm
            catdata={state.curCatdata}
            onCancel={() => changeModal('change_cat_modal_visible', false)}
            onSubmit={handleChangeInterfaceCat}
          />
        </Modal>
      ) : (
        ''
      )}
    </div>
  );
  const defaultExpandedKeys = () => {
    const rNull = { expands: [], selects: [] };
    if (list.length === 0) {
      return rNull;
    }
    if (router) {
      if (!isNaN(router.params.actionId)) {
        if (!inter || !inter._id) {
          return rNull;
        }
        const activePath = findCatPath(list, inter.catid) || ['cat_' + inter.catid];
        const combinedExpands = Array.from(new Set([...(state.expands || []), ...activePath]));
        return {
          expands: combinedExpands,
          selects: [inter._id + '']
        };
      } else {
        const catid = router.params.actionId.substr(4);
        const activePath = findCatPath(list, catid) || ['cat_' + catid];
        const combinedExpands = Array.from(new Set([...(state.expands || []), ...activePath]));
        return {
          expands: combinedExpands,
          selects: ['cat_' + catid]
        };
      }
    } else {
      return {
        expands: state.expands ? state.expands : ['cat_' + list[0]._id],
        selects: ['root']
      };
    }
  };

  /**
   * @param {any} item
   * @returns {any}
   */
  const itemInterfaceCreate = item => {
    return {
      title: (
        <div
          className="container-title"
          onMouseEnter={() => enterItem(item._id)}
          onMouseLeave={leaveItem}
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
                  showConfirm(item);
                }}
                style={{ display: state.delIcon == item._id ? 'block' : 'none' }}
              />
            </Tooltip>
            <Tooltip title="复制接口">
              <CopyOutlined
                className="interface-delete-icon"
                onClick={(/** @type {any} */ e) => {
                  e.stopPropagation();
                  copyInterface(item._id);
                }}
                style={{ display: state.delIcon == item._id ? 'block' : 'none' }}
              />
            </Tooltip>
          </div>
          {/*<Dropdown overlay={menu(item)} trigger={['click']} onClick={e => e.stopPropagation()}>

        </Dropdown>*/}
        </div>
      ),
      key: '' + item._id
    };
  };

  let currentKes = defaultExpandedKeys();
  let menuList;
  if (state.filter) {
    const res = filterList(state.list, state.filter);
    menuList = res.menuList;
    currentKes.expands = res.arr;
  } else {
    menuList = state.list;
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
            blockNode={true}
            defaultExpandedKeys={currentKes.expands}
            defaultSelectedKeys={currentKes.selects}
            expandedKeys={currentKes.expands}
            selectedKeys={currentKes.selects}
            onSelect={onSelect}
            onExpand={onExpand}
            draggable={{ icon: false }}
            onDrop={onDrop}
            treeData={[
              {
                className: 'item-all-interface',
                title: (
                  <Link
                    onClick={(/** @type {any} */ e) => {
                      e.stopPropagation();
                      changeExpands();
                    }}
                    to={'/project/' + matchParams.id + '/interface/api'}
                  >
                    <FolderOutlined style={{ marginRight: 5 }} />
                    全部接口
                  </Link>
                ),
                key: 'root'
              },
              ...menuList.map((
                /** @type {any} */ item
              ) => renderCategory(item, matchParams, itemInterfaceCreate))
            ]}
          />
        </div>
      ) : null}
    </div>
  );
};

export default InterfaceMenu;



// @ts-check
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchInterfaceColList,
  setColData,
  fetchCaseData
} from '../../../../reducer/modules/interfaceCol';
import { fetchProjectList } from '../../../../reducer/modules/project';
import axios from 'axios';
import ImportInterface from './ImportInterface';
import { Input, Button, Modal, message, Tooltip, Tree, Form } from 'antd';

import {
  FolderOpenOutlined,
  DeleteOutlined,
  CopyOutlined,
  EditOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { arrayChangeIndex } from '../../../../common.js';

const FormItem = Form.Item;
const confirm = Modal.confirm;
const headHeight = 240; // menu顶部到网页顶部部分的高度

import './InterfaceColMenu.scss';

// 极简防抖：延迟 wait 毫秒执行最后一次调用，透传参数（替代 underscore 的 debounce）
/**
 * @param {any} fn
 * @param {any} wait
 */
function debounce(fn, wait) {
  /** @type {any} */
  let timer = null;
  /**
   * @this {any}
   * @param {...any} args
   */
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * @param {any} props
 */
const ColModalForm = props => {
  const { visible, onCancel, onCreate, title, saveFormRef } = props;
  const [form] = Form.useForm();
  // 将 form 实例上报给父组件(antd3 时代经表单包装组件的 ref 获取),
  // 供父组件 getFieldsValue / setFieldsValue
  React.useEffect(() => {
    saveFormRef(form);
  }, [form, saveFormRef]);
  return (
    <Modal open={visible} title={title} onCancel={onCancel} onOk={onCreate} forceRender>
      <Form form={form} layout="vertical">
        <FormItem
          label="集合名"
          name="colName"
          rules={[{ required: true, message: '请输入集合命名！' }]}
        >
          <Input />
        </FormItem>
        <FormItem label="简介" name="colDesc">
          <Input.TextArea />
        </FormItem>
      </Form>
    </Modal>
  );
};

/**
 * 测试集合左侧目录树。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（isRander 为历史遗留仅声明未消费，
 *   保留订阅避免行为差异），旧 @withRouter 注入的 match/history 改为
 *   useParams/useNavigate，父级传入的 projectId / router props 保持不变；
 * - 旧 UNSAFE_componentWillMount / UNSAFE_componentWillReceiveProps 分别改为
 *   挂载期 useEffect 与 redux interfaceColList 变化 useEffect（prev ref 比较）；
 * - 实例字段 this.form / this._copyInterfaceSign 改为 ref；500ms 防抖的 onSelect
 *   经 useMemo 保持实例唯一，防抖触发时经 latestRef 镜像读取最新路由参数，
 *   等价旧类组件的实时 this.props。
 */
/**
 * @param {any} props
 */
export default function InterfaceColMenu(props) {
  const { router } = props;
  const dispatch = useDispatch();
  const interfaceColList = useSelector(state => state.interfaceCol.interfaceColList);
  const currCase = useSelector(state => state.interfaceCol.currCase);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.interfaceCol.isRander);
  const currCaseId = useSelector(state => state.interfaceCol.currCaseId);
  // 当前项目的信息
  const curProject = useSelector(state => state.project.currProject);
  const navigate = useNavigate();
  const { id } = useParams();

  const [state, setState] = useState({
    colModalType: '',
    colModalVisible: false,
    editColId: 0,
    filterValue: '',
    importInterVisible: false,
    importInterIds: [],
    importColId: 0,
    expands: null,
    list: [],
    delIcon: null,
    selectedProject: null
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  const formRef = useRef(null);
  const copyInterfaceSignRef = useRef(false);

  // 镜像最新 redux 值与路由参数：防抖回调 / confirm 异步 onOk 中的读取
  // 等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { id, currCaseId };

  const getList = async () => {
    const r = await dispatch(fetchInterfaceColList(latestRef.current.id));
    patchState({
      list: r.payload.data.data
    });
    return r;
  };

  const addorEditCol = async () => {
    const { colName: name, colDesc: desc } = formRef.current.getFieldsValue();
    const { colModalType, editColId: col_id } = state;
    const project_id = id;
    let res = /** @type {any} */ ({});
    if (colModalType === 'add') {
      res = await axios.post('/api/col/add_col', { name, desc, project_id });
    } else if (colModalType === 'edit') {
      res = await axios.post('/api/col/up_col', { name, desc, col_id });
    }
    if (!res.data.errcode) {
      patchState({
        colModalVisible: false
      });
      message.success(colModalType === 'edit' ? '修改集合成功' : '添加集合成功');
      // await dispatch(fetchInterfaceColList(project_id));
      getList();
    } else {
      message.error(res.data.errmsg);
    }
  };

  /**
   * @param {any} keys
   */
  const onExpand = keys => {
    patchState({ expands: keys });
  };

  // 旧实例字段 onSelect = debounce(...)：整个实例生命周期仅创建一次，
  // 这里经 useMemo 保持同一防抖实例；防抖 500ms 后触发，读取最新路由参数
  const onSelect = useMemo(
    () =>
      debounce((/** @type {any} */ keys) => {
        if (keys.length) {
          const type = keys[0].split('_')[0];
          const nodeId = keys[0].split('_')[1];
          const project_id = latestRef.current.id;
          if (type === 'col') {
            dispatch(setColData({
              isRander: false
            }));
            navigate('/project/' + project_id + '/interface/col/' + nodeId);
          } else {
            dispatch(setColData({
              isRander: false
            }));
            navigate('/project/' + project_id + '/interface/case/' + nodeId);
          }
        }
        patchState({
          expands: null
        });
      }, 500),
    []
  );

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    getList();
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：redux 集合列表变化时同步本地镜像
  const prevListRef = useRef(interfaceColList);
  useEffect(() => {
    if (prevListRef.current === interfaceColList) return;
    prevListRef.current = interfaceColList;
    patchState({ list: interfaceColList });
  }, [interfaceColList]);

  /**
   * @param {any} colId
   */
  const showDelColConfirm = colId => {
    const paramsId = id;
    confirm({
      title: '您确认删除此测试集合',
      content: '温馨提示：该操作会删除该集合下所有测试用例，用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        const res = await axios.get('/api/col/del_col?col_id=' + colId);
        if (!res.data.errcode) {
          message.success('删除集合成功');
          const result = await getList();
          const nextColId = result.payload.data.data[0]._id;

          navigate('/project/' + paramsId + '/interface/col/' + nextColId);
        } else {
          message.error(res.data.errmsg);
        }
      }
    });
  };

  // 复制测试集合
  /**
   * @param {any} item
   */
  const copyInterface = async item => {
    if (copyInterfaceSignRef.current === true) {
      return;
    }
    copyInterfaceSignRef.current = true;
    const { desc, project_id, _id: col_id } = item;
    let { name } = item;
    name = `${name} copy`;

    // 添加集合
    const add_col_res = await axios.post('/api/col/add_col', { name, desc, project_id });

    if (add_col_res.data.errcode) {
      message.error(add_col_res.data.errmsg);
      return;
    }

    const new_col_id = add_col_res.data.data._id;

    // 克隆集合
    const add_case_list_res = await axios.post('/api/col/clone_case_list', {
      new_col_id,
      col_id,
      project_id
    });
    copyInterfaceSignRef.current = false;

    if (add_case_list_res.data.errcode) {
      message.error(add_case_list_res.data.errmsg);
      return;
    }

    // 刷新接口列表
    // await dispatch(fetchInterfaceColList(project_id));
    getList();
    dispatch(setColData({ isRander: true }));
    message.success('克隆测试集成功');
  };

  /**
   * @param {any} caseId
   */
  const caseCopy = async caseId => {
    const caseData = await dispatch(fetchCaseData(caseId));
    let data = caseData.payload.data.data;
    data = JSON.parse(JSON.stringify(data));
    data.casename = `${data.casename}_copy`;
    delete data._id;
    const res = await axios.post('/api/col/add_case', data);
    if (!res.data.errcode) {
      message.success('克隆用例成功');
      const colId = res.data.data.col_id;
      const projectId = res.data.data.project_id;
      await getList();
      navigate('/project/' + projectId + '/interface/col/' + colId);
      patchState({
        visible: false
      });
    } else {
      message.error(res.data.errmsg);
    }
  };

  /**
   * @param {any} caseId
   */
  const showDelCaseConfirm = caseId => {
    const paramsId = id;
    confirm({
      title: '您确认删除此测试用例',
      content: '温馨提示：用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        const res = await axios.get('/api/col/del_case?caseid=' + caseId);
        if (!res.data.errcode) {
          message.success('删除用例成功');
          getList();
          // 如果删除当前选中 case，切换路由到集合
          if (+caseId === +latestRef.current.currCaseId) {
            navigate('/project/' + paramsId + '/interface/col/');
          } else {
            // dispatch(fetchInterfaceColList(latestRef.current.id));
            dispatch(setColData({ isRander: true }));
          }
        } else {
          message.error(res.data.errmsg);
        }
      }
    });
  };

  /**
   * @param {any} type
   * @param {any} [col]
   */
  const showColModal = (type, col) => {
    const editCol =
      type === 'edit' ? { colName: col.name, colDesc: col.desc } : { colName: '', colDesc: '' };
    patchState({
      colModalVisible: true,
      colModalType: type || 'add',
      editColId: col && col._id
    });
    formRef.current.setFieldsValue(editCol);
  };

  const saveFormRef = useCallback((/** @type {any} */ form) => {
    formRef.current = form;
  }, []);

  /**
   * @param {any} importInterIds
   * @param {any} selectedProject
   */
  const selectInterface = (importInterIds, selectedProject) => {
    patchState({ importInterIds, selectedProject });
  };

  /**
   * @param {any} colId
   */
  const showImportInterfaceModal = async colId => {
    // const projectId = this.props.match.params.id;
    // console.log('project', this.props.curProject)
    const groupId = curProject.group_id;
    await dispatch((/** @type {any} */ (fetchProjectList))(groupId));
    // await dispatch(fetchInterfaceListMenu(projectId))
    patchState({ importInterVisible: true, importColId: colId });
  };

  const handleImportOk = async () => {
    const project_id = state.selectedProject || id;
    const { importColId, importInterIds } = state;
    const res = await axios.post('/api/col/add_case_list', {
      interface_list: importInterIds,
      col_id: importColId,
      project_id
    });
    if (!res.data.errcode) {
      patchState({ importInterVisible: false });
      message.success('导入集合成功');
      // await dispatch(fetchInterfaceColList(project_id));
      getList();

      dispatch(setColData({ isRander: true }));
    } else {
      message.error(res.data.errmsg);
    }
  };

  const handleImportCancel = () => {
    patchState({ importInterVisible: false });
  };

  /**
   * @param {any} e
   */
  const filterCol = e => {
    const value = e.target.value;
    // console.log('list', interfaceColList);
    // const newList = produce(interfaceColList, draftList => {})
    // console.log('newList',newList);
    patchState({
      filterValue: value,
      list: JSON.parse(JSON.stringify(interfaceColList))
      // list: newList
    });
  };

  /**
   * @param {any} e
   */
  const onDrop = async e => {
    // const projectId = this.props.match.params.id;
    const dropColIndex = e.node.props.pos.split('-')[1];
    const dropColId = interfaceColList[dropColIndex]._id;
    const dragNodeKey = e.dragNode.props.eventKey;
    const dragColIndex = e.dragNode.props.pos.split('-')[1];
    const dragColId = interfaceColList[dragColIndex]._id;

    const dropPos = e.node.props.pos.split('-');
    const dropIndex = Number(dropPos[dropPos.length - 1]);
    const dragPos = e.dragNode.props.pos.split('-');
    const dragIndex = Number(dragPos[dragPos.length - 1]);

    if (dragNodeKey.indexOf('col') === -1) {
      if (dropColId === dragColId) {
        // 同一个测试集合下的接口交换顺序
        const caseList = interfaceColList[dropColIndex].caseList;
        const changes = arrayChangeIndex(caseList, dragIndex, dropIndex);
        axios.post('/api/col/up_case_index', changes).then();
      }
      await axios.post('/api/col/up_case', { id: dragNodeKey.split('_')[1], col_id: dropColId });
      // dispatch(fetchInterfaceColList(id));
      getList();
      dispatch(setColData({ isRander: true }));
    } else {
      const changes = arrayChangeIndex(interfaceColList, dragIndex, dropIndex);
      axios.post('/api/col/up_col_index', changes).then();
      getList();
    }
  };

  /**
   * @param {any} nodeId
   */
  const enterItem = nodeId => {
    patchState({ delIcon: nodeId });
  };

  const leaveItem = () => {
    patchState({ delIcon: null });
  };

  // const { currColId, currCaseId, isShowCol } = this.props;
  const { colModalType, colModalVisible, importInterVisible } = state;
  const currProjectId = id;
  // const menu = (col) => {
  //   return (
  //     <Menu>
  //       <Menu.Item>
  //         <span onClick={() => this.showColModal('edit', col)}>修改集合</span>
  //       </Menu.Item>
  //       <Menu.Item>
  //         <span onClick={() => {
  //           this.showDelColConfirm(col._id)
  //         }}>删除集合</span>
  //       </Menu.Item>
  //       <Menu.Item>
  //         <span onClick={() => this.showImportInterface(col._id)}>导入接口</span>
  //       </Menu.Item>
  //     </Menu>
  //   )
  // };

  const defaultExpandedKeys = () => {
    const rNull = { expands: [], selects: [] };
    if (interfaceColList.length === 0) {
      return rNull;
    }
    if (router) {
      if (router.params.action === 'case') {
        if (!currCase || !currCase._id) {
          return rNull;
        }
        return {
          expands: state.expands ? state.expands : ['col_' + currCase.col_id],
          selects: ['case_' + currCase._id + '']
        };
      } else {
        const col_id = router.params.actionId;
        return {
          expands: state.expands ? state.expands : ['col_' + col_id],
          selects: ['col_' + col_id]
        };
      }
    } else {
      return {
        expands: state.expands ? state.expands : ['col_' + interfaceColList[0]._id],
        selects: ['col_' + interfaceColList[0]._id]
      };
    }
  };

  // antd5 Tree 移除 TreeNode JSX,改用 treeData 配置({ key, title, children })
  /**
   * @param {any} interfaceCase
   */
  const itemInterfaceColCreate = interfaceCase => {
    return {
      key: 'case_' + interfaceCase._id,
      style: { width: '100%' },
      title: (
        <div
          className="menu-title"
          onMouseEnter={() => enterItem(interfaceCase._id)}
          onMouseLeave={leaveItem}
          title={interfaceCase.casename}
        >
          <span className="casename">{interfaceCase.casename}</span>
          <div className="btns">
            <Tooltip title="删除用例">
              <DeleteOutlined
                className="interface-delete-icon"
                onClick={(/** @type {any} */ e) => {
                  e.stopPropagation();
                  showDelCaseConfirm(interfaceCase._id);
                }}
                style={{ display: state.delIcon == interfaceCase._id ? 'block' : 'none' }}
              />
            </Tooltip>
            <Tooltip title="克隆用例">
              <CopyOutlined
                className="interface-delete-icon"
                onClick={(/** @type {any} */ e) => {
                  e.stopPropagation();
                  caseCopy(interfaceCase._id);
                }}
                style={{ display: state.delIcon == interfaceCase._id ? 'block' : 'none' }}
              />
            </Tooltip>
          </div>
        </div>
      )
    };
  };

  let currentKes = defaultExpandedKeys();
  // console.log('currentKey', currentKes)

  /** @type {any} */
  let list = state.list;

  if (state.filterValue) {
    /** @type {any[]} */
    const arr = [];
    list = list.filter((/** @type {any} */ item) => {

      item.caseList = item.caseList.filter((/** @type {any} */ inter) => {
        if (
          inter.casename.indexOf(state.filterValue) === -1 &&
          inter.path.indexOf(state.filterValue) === -1
        ) {
          return false;
        }
        return true;
      });

      arr.push('col_' + item._id);
      return true;
    });
    // console.log('arr', arr);
    if (arr.length > 0) {
      currentKes.expands = arr;
    }
  }

  // console.log('list', list);
  // console.log('currentKey', currentKes)

  return (
    <div>
      <div className="interface-filter">
        <Input placeholder="搜索测试集合" onChange={filterCol} />
        <Tooltip placement="bottom" title="添加集合">
          <Button
            type="primary"
            style={{ marginLeft: '16px' }}
            onClick={() => showColModal('add')}
            className="btn-filter"
          >
            添加集合
          </Button>
        </Tooltip>
      </div>
      <div className="tree-wrapper" style={{ maxHeight: parseInt((/** @type {any} */ (document.body.clientHeight))) - headHeight + 'px'}}>
        <Tree
          className="col-list-tree"
          defaultExpandedKeys={currentKes.expands}
          defaultSelectedKeys={currentKes.selects}
          expandedKeys={currentKes.expands}
          selectedKeys={currentKes.selects}
          onSelect={onSelect}
          autoExpandParent
          draggable={{ icon: false }}
          onExpand={onExpand}
          onDrop={onDrop}
          treeData={list.map((/** @type {any} */ col) => ({
            key: 'col_' + col._id,
            title: (
              <div className="menu-title">
                <span>
                  <FolderOpenOutlined style={{ marginRight: 5 }} />
                  <span>{col.name}</span>
                </span>
                <div className="btns">
                  <Tooltip title="删除集合">
                    <DeleteOutlined
                      style={{ display: list.length > 1 ? '' : 'none' }}
                      className="interface-delete-icon"
                      onClick={() => {
                        showDelColConfirm(col._id);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="编辑集合">
                    <EditOutlined
                      className="interface-delete-icon"
                      onClick={(/** @type {any} */ e) => {
                        e.stopPropagation();
                        showColModal('edit', col);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="导入接口">
                    <PlusOutlined
                      className="interface-delete-icon"
                      onClick={(/** @type {any} */ e) => {
                        e.stopPropagation();
                        showImportInterfaceModal(col._id);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="克隆集合">
                    <CopyOutlined
                      className="interface-delete-icon"
                      onClick={(/** @type {any} */ e) => {
                        e.stopPropagation();
                        copyInterface(col);
                      }}
                    />
                  </Tooltip>
                </div>
                {/*<Dropdown overlay={menu(col)} trigger={['click']} onClick={e => e.stopPropagation()}>

                </Dropdown>*/}
              </div>
            ),
            children: col.caseList.map(itemInterfaceColCreate)
          }))}
        />
      </div>
      <ColModalForm
        saveFormRef={saveFormRef}
        type={colModalType}
        open={colModalVisible}
        onCancel={() => {
          patchState({ colModalVisible: false });
        }}
        onCreate={addorEditCol}
      />

      <Modal
        title="导入接口到集合"
        open={importInterVisible}
        onOk={handleImportOk}
        onCancel={handleImportCancel}
        className="import-case-modal"
        width={800}
      >
        <ImportInterface currProjectId={currProjectId} selectInterface={selectInterface} />
      </Modal>
    </div>
  );
}

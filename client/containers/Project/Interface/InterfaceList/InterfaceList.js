// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Table, Button, Modal, message, Tooltip, Select, TreeSelect } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import AddInterfaceForm from './AddInterfaceForm';
// interface 切片已迁至 Zustand（批次5）：动作全部直调
import useInterfaceStore from '../../../../store/interfaceStore';
import useProjectStore from '../../../../store/projectStore';
import { Link } from 'react-router-dom';
import variable from '../../../../constants/variable';
import './Edit.scss';
import Label from '../../../../components/Label/Label.js';
import { formatCatTreeData } from 'common/utils.js';

const Option = Select.Option;
const limit = 20;

/**
 * 接口列表页。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 store 订阅（interface 切片批次5 迁 Zustand；curData 为历史
 *   遗留仅声明未消费，随迁移删除），旧 props.match.params / history.push 改为
 *   useParams / useNavigate；
 * - 旧 UNSAFE_componentWillMount / UNSAFE_componentWillReceiveProps 分别改为
 *   挂载期 useEffect 与 actionId 变化 useEffect（prev ref 比较）；
 * - 旧 handleChange 经 setState 回调以「更新后的 state」调用 handleRequest，
 *   迁移后改为显式传入更新后的分页/筛选快照，语义一致；
 * - 异步回调对 this.state / this.props 的实时读取改为 latestRef 镜像读取。
 */
const InterfaceList = () => {
  const curProject = useProjectStore(state => state.currProject);
  const getProject = useProjectStore(state => state.getProject);
  const catList = useInterfaceStore(state => state.list);
  const totalTableList = useInterfaceStore(state => state.totalTableList);
  const catTableList = useInterfaceStore(state => state.catTableList);
  const totalCount = useInterfaceStore(state => state.totalCount);
  const count = useInterfaceStore(state => state.count);
  const fetchInterfaceListMenu = useInterfaceStore(state => state.fetchInterfaceListMenu);
  const fetchInterfaceList = useInterfaceStore(state => state.fetchInterfaceList);
  const fetchInterfaceCatList = useInterfaceStore(state => state.fetchInterfaceCatList);
  const { id, actionId } = /** @type {any} */ (useParams());
  const navigate = useNavigate();

  const [state, setState] = useState({
    visible: false,
    data: [],
    filteredInfo: {},
    catid: null,
    total: null,
    current: 1
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 镜像最新 redux 值、路由参数与本地 state：异步回调中的读取
  // 等价于旧类组件的实时 this.props / this.state
  const latestRef = useRef({});
  latestRef.current = { id, actionId, curProject, state };

  /**
   * @param {any} [stateOverride]
   */
  const handleRequest = async stateOverride => {
    // stateOverride：调用方显式传入更新后的 { current, filteredInfo } 快照；
    // 缺省时读取镜像（等价旧实现回调时机下的 this.state）
    const snapshot = stateOverride || latestRef.current.state;
    const routeActionId = latestRef.current.actionId;
    const projectId = latestRef.current.id;
    if (!routeActionId) {
      patchState({
        catid: null
      });
      const option = {
        page: snapshot.current,
        limit,
        project_id: projectId,
        status: snapshot.filteredInfo.status,
        tag: snapshot.filteredInfo.tag
      };
      await fetchInterfaceList(option);
    } else if (isNaN(routeActionId)) {
      const catid = routeActionId.substr(4);
      patchState({ catid: +catid });
      const option = {
        page: snapshot.current,
        limit,
        catid,
        status: snapshot.filteredInfo.status,
        tag: snapshot.filteredInfo.tag
      };
      await fetchInterfaceCatList(option);
    }
  };

  // 更新分类简介
  /**
   * @param {any} desc
   * @param {any} name
   */
  const handleChangeInterfaceCat = async (desc, name) => {
    const params = {
      catid: state.catid,
      name,
      desc
    };

    try {
      const res = await axios.post('/api/interface/up_cat', params);
      if (res.data.errcode !== 0) {
        return message.error(res.data.errmsg);
      }
      const projectId = latestRef.current.id;
      await Promise.all([getProject(projectId), fetchInterfaceListMenu(projectId)]);
      message.success('接口集合简介更新成功');
    } catch (/** @type {any} */ err) {
      message.error('接口集合简介更新失败：' + err.message);
    }
  };

  /**
   * @param {any} pagination
   * @param {any} filters
   * @param {any} sorter
   */
  const handleChange = (pagination, filters, sorter) => {
    const nextState = {
      ...state,
      current: pagination.current || 1,
      sortedInfo: sorter,
      filteredInfo: filters
    };
    setState(nextState);
    // 等价旧实现的 setState 回调：以更新后的 state 调用 handleRequest
    handleRequest({ current: nextState.current, filteredInfo: nextState.filteredInfo });
  };

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    handleRequest();
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：路由分类变化时重置页码并重新拉取
  const prevActionIdRef = useRef(actionId);
  useEffect(() => {
    if (prevActionIdRef.current === actionId) return;
    prevActionIdRef.current = actionId;
    patchState({
      current: 1
    });
    // 等价旧实现的 setState 回调：current 重置为 1，filteredInfo 保持不变
    handleRequest({ current: 1, filteredInfo: latestRef.current.state.filteredInfo });
  }, [actionId]);

  /**
   * @param {any} data
   */
  const handleAddInterface = async data => {
    data.project_id = curProject._id;
    try {
      const res = await axios.post('/api/interface/add', data);
      if (res.data.errcode !== 0) {
        return message.error(`${res.data.errmsg}, 你可以在左侧的接口列表中对接口进行删改`);
      }
      message.success('接口添加成功');
      const interfaceId = res.data.data._id;
      navigate('/project/' + data.project_id + '/interface/api/' + interfaceId);
      await fetchInterfaceListMenu(data.project_id);
    } catch (/** @type {any} */ err) {
      message.error('接口添加失败：' + err.message);
    }
  };

  /**
   * @param {any} interfaceId
   * @param {any} catid
   */
  const changeInterfaceCat = async (interfaceId, catid) => {
    const params = {
      id: interfaceId,
      catid
    };
    try {
      const result = await axios.post('/api/interface/up', params);
      if (result.data.errcode !== 0) {
        return message.error(result.data.errmsg);
      }
      message.success('修改成功');
      await Promise.all([handleRequest(), fetchInterfaceListMenu(curProject._id)]);
    } catch (/** @type {any} */ err) {
      message.error('修改分类失败：' + err.message);
    }
  };

  /**
   * @param {any} value
   */
  const changeInterfaceStatus = async value => {
    const params = {
      id: value.split('-')[0],
      status: value.split('-')[1]
    };
    try {
      const result = await axios.post('/api/interface/up', params);
      if (result.data.errcode !== 0) {
        return message.error(result.data.errmsg);
      }
      message.success('修改成功');
      await handleRequest();
    } catch (/** @type {any} */ err) {
      message.error('修改状态失败：' + err.message);
    }
  };

  // page change will be processed in handleChange by pagination
  // changePage = current => {
  //   if (this.state.current !== current) {
  //     this.setState(
  //       {
  //         current: current
  //       },
  //       () => this.handleRequest(this.props)
  //     );
  //   }
  // };

  const tag = curProject.tag;
  const tagFilter = tag.map((/** @type {any} */ item) => {
    return { text: item.name, value: item.name };
  });

  /** @type {any[]} */
  const columns = [
    {
      title: '接口名称',
      dataIndex: 'title',
      key: 'title',
      width: 30,
      render: (/** @type {any} */ text, /** @type {any} */ item) => {
        return (
          <Link to={'/project/' + item.project_id + '/interface/api/' + item._id}>
            <span className="path">{text}</span>
          </Link>
        );
      }
    },
    {
      title: '接口路径',
      dataIndex: 'path',
      key: 'path',
      width: 50,
      render: (/** @type {any} */ item, /** @type {any} */ record) => {
        const path = curProject.basepath + item;
        const methodColor =
          (/** @type {Record<string, any>} */ (variable.METHOD_COLOR))[
            record.method ? record.method.toLowerCase() : 'get'
          ] || (/** @type {Record<string, any>} */ (variable.METHOD_COLOR))['get'];
        return (
          <div>
            <span
              style={{ color: methodColor.color, backgroundColor: methodColor.bac }}
              className="colValue"
            >
              {record.method}
            </span>
            <Tooltip title="开放接口" placement="topLeft">
              <span>{record.api_opened && <EyeOutlined className="opened" />}</span>
            </Tooltip>
            <Tooltip title={path} placement="topLeft" overlayClassName="toolTip">
              <span className="path">{path}</span>
            </Tooltip>
          </div>
        );
      }
    },
    {
      title: '接口分类',
      dataIndex: 'catid',
      key: 'catid',
      width: 28,
      render: (/** @type {any} */ item, /** @type {any} */ record) => {
        return (
          <TreeSelect
            className="select path"
            treeData={formatCatTreeData(catList)}
            value={item + ''}
            dropdownStyle={{ maxHeight: 400, overflow: 'auto', minWidth: 200 }}
            treeDefaultExpandAll={true}
            onChange={(/** @type {any} */ catid) => changeInterfaceCat(record._id, catid)}
          />
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 24,
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        const key = record.key;
        return (
          <Select value={key + '-' + text} className="select" onChange={changeInterfaceStatus}>
            <Option value={key + '-done'}>
              <span className="tag-status done">已完成</span>
            </Option>
            <Option value={key + '-undone'}>
              <span className="tag-status undone">未完成</span>
            </Option>
          </Select>
        );
      },
      filters: [
        {
          text: '已完成',
          value: 'done'
        },
        {
          text: '未完成',
          value: 'undone'
        }
      ],
      onFilter: (/** @type {any} */ value, /** @type {any} */ record) =>
        record.status.indexOf(value) === 0
    },
    {
      title: 'tag',
      dataIndex: 'tag',
      key: 'tag',
      width: 14,
      render: (/** @type {any} */ text) => {
        const textMsg = Array.isArray(text) && text.length > 0 ? text.join(' , ') : '未设置';
        return (
          <Tooltip title={textMsg}>
            <div className="table-desc">{textMsg}</div>
          </Tooltip>
        );
      },
      filters: tagFilter,
      onFilter: (/** @type {any} */ value, /** @type {any} */ record) => {
        return record.tag.indexOf(value) >= 0;
      }
    }
  ];
  let intername = '';
  let desc = '';
  const cat = curProject ? curProject.cat : [];

  if (cat) {
    for (let i = 0; i < cat.length; i++) {
      if (cat[i]._id === state.catid) {
        intername = cat[i].name;
        desc = cat[i].desc;
        break;
      }
    }
  }
  // const data = this.state.data ? this.state.data.map(item => {
  //   item.key = item._id;
  //   return item;
  // }) : [];
  let data = [];
  let total = 0;
  if (!actionId) {
    data = totalTableList;
    total = totalCount;
  } else if (isNaN(actionId)) {
    data = catTableList;
    total = count;
  }

  data = data.map((/** @type {any} */ item) => {
    item.key = item._id;
    return item;
  });

  const pageConfig = {
    total: total,
    pageSize: limit,
    current: state.current
    // onChange: this.changePage
  };

  const isDisabled = catList.length === 0;

  // console.log(curProject.tag)

  return (
    <div style={{ padding: '24px' }}>
      <h2 className="interface-title" style={{ display: 'inline-block', margin: 0 }}>
        {intername ? intername : '全部接口'}共 ({total}) 个
      </h2>

      <Button
        style={{ float: 'right' }}
        disabled={isDisabled}
        type="primary"
        onClick={() => patchState({ visible: true })}
      >
        添加接口
      </Button>
      <div style={{ marginTop: '10px' }}>
        <Label
          onChange={(/** @type {any} */ value) => handleChangeInterfaceCat(value, intername)}
          desc={desc}
        />
      </div>
      <Table
        className="table-interfacelist"
        tableLayout="fixed"
        pagination={pageConfig}
        columns={columns}
        onChange={handleChange}
        dataSource={data}
      />
      {state.visible && (
        <Modal
          title="添加接口"
          open={state.visible}
          onCancel={() => patchState({ visible: false })}
          footer={null}
          className="addcatmodal"
        >
          <AddInterfaceForm
            catid={state.catid}
            catdata={catList && catList.length ? catList : cat}
            onCancel={() => patchState({ visible: false })}
            onSubmit={handleAddInterface}
          />
        </Modal>
      )}
    </div>
  );
};

export default InterfaceList;

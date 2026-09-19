// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
//import constants from '../../../../constants/variable.js'
import { Tooltip, Input, Button, Row, Col, Spin, Modal, message, Select, Switch, Table } from 'antd';
import {
  CheckCircleFilled,
  InfoCircleFilled,
  ExclamationCircleFilled,
  QuestionCircleOutlined
} from '@ant-design/icons';
import {
  fetchInterfaceColList,
  fetchCaseList,
  setColData,
  fetchCaseEnvList
} from '../../../../reducer/modules/interfaceCol';
import { getToken } from '../../../../reducer/modules/project';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { DndContext, PointerSensor } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import CaseReport from './CaseReport.js';
import { initCrossRequest } from 'client/components/Postman/CheckCrossInstall.js';
import { produce } from 'immer';
import {InsertCodeMap} from 'client/components/Postman/Postman.js'

const plugin = require('client/plugin.js');
const {
  handleParams,
  crossRequest,
  handleCurrDomain,
  checkNameIsExistInArray
} = require('common/postmanLib.js');
const { handleParamsValue, json_parse, ArrayToObject } = require('common/utils.js');
import CaseEnv from 'client/components/CaseEnv';
import Label from '../../../../components/Label/Label.js';

const Option = Select.Option;
const createContext = require('common/createContext')

import { copyText } from '../../../../common.js';

const defaultModalStyle = {
  top: 10
}

// @dnd-kit/sortable 的 SortableContext 类型要求必填 children 且依赖 @types/react 的
// JSX children 映射；本项目的最小 JSX 声明未启用该映射，经 any 中转绕开误报。
/** @type {any} */
const SortableContextAny = SortableContext;

// 拖拽传感器：5px 激活距离，保证行内链接/按钮的单击不受拖拽影响。
const dndSensors = [
  {
    sensor: PointerSensor,
    options: { activationConstraint: { distance: 5 } }
  }
];

// 可排序行组件：整行拖拽（等价原 dnd.Row 的整行拖拽交互）。
/**
 * @param {any} props
 */
const SortableRow = props => {
  const { children, ...restProps } = props;
  const rowId = restProps['data-row-key'];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId
  });
  const style = {
    ...restProps.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 999 } : {})
  };
  return (
    <tr {...restProps} {...attributes} {...listeners} ref={setNodeRef} style={style}>
      {children}
    </tr>
  );
};

/**
 * @param {string} json
 */
function handleReport(json) {
  try {
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
}

/**
 * 测试集合内容区（用例表格 / 自动化测试）。原类组件经 Hooks 现代化迁移，
 * 渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（isShowCol / projectEnv 为历史
 *   遗留仅声明未消费，保留订阅避免行为差异；getEnv 映射仅声明未消费，随迁移
 *   移除），旧 @withRouter 注入的 match 改为 useParams；
 * - 旧实例字段 this.reports / this.records / this.currColId / this.aceEditor /
 *   this._crossRequestInterval 改为对应 ref；
 * - 旧 async UNSAFE_componentWillMount（拉取集合/Token → 推导集合 id →
 *   加载用例 → 轮询 cross-request 插件）改为挂载期 useEffect，clearInterval
 *   清理对应旧 componentWillUnmount；
 * - 旧 UNSAFE_componentWillReceiveProps（路由集合 id 变化或 isRander 置位时
 *   重载）改为 actionId / isRander 变化 useEffect（prev ref 比较，挂载期跳过）；
 * - rows 采用「写入即同步 ref」模式：executeTests 循环逐行更新行状态，
 *   ref 恒等旧类组件在 await 恢复后读取的实时 this.state.rows；
 * - await 恢复后对 this.props 的实时读取统一改为 latestRef 镜像读取。
 */
const InterfaceColContent = () => {
  const dispatch = useDispatch();
  const interfaceColList = useSelector(state => state.interfaceCol.interfaceColList);
  const currColId = useSelector(state => state.interfaceCol.currColId);
  const currCaseId = useSelector(state => state.interfaceCol.currCaseId);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.interfaceCol.isShowCol);
  const isRander = useSelector(state => state.interfaceCol.isRander);
  const currCaseList = useSelector(state => state.interfaceCol.currCaseList);
  const currProject = useSelector(state => state.project.currProject);
  const token = useSelector(state => state.project.token);
  const envList = useSelector(state => state.interfaceCol.envList);
  const curProjectRole = useSelector(state => state.project.currProject.role);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.project.projectEnv);
  const curUid = useSelector(state => state.user.uid);
  const { id, actionId } = /** @type {any} */ (useParams());

  const [state, setState] = useState(/** @type {any} */ ({
    rows: [],
    reports: {},
    visible: false,
    curCaseid: null,
    hasPlugin: false,

    advVisible: false,
    curScript: '',
    enableScript: false,
    autoVisible: false,
    mode: 'html',
    email: false,
    download: false,
    currColEnvObj: {},
    collapseKey: '1',
    commonSettingModalVisible: false,
    commonSetting: {
      checkHttpCodeIs200: false,
      checkResponseField: {
        name: 'code',
        value: '0',
        enable: false
      },
      checkResponseSchema: false,
      checkScript:{
        enable: false,
        content: ''
      }
    }
  }));
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 旧实例字段：测试报告 / 断言上下文 / 当前集合 id / 插件轮询定时器 / 脚本编辑器
  const reportsRef = useRef({});
  const recordsRef = useRef({});
  const currColIdRef = useRef(null);
  const crossRequestIntervalRef = useRef(null);
  const aceEditorRef = useRef(null);

  // rows 写入即同步 ref：executeTests 逐行 await 后读取的行数据
  // 恒等旧类组件实时 this.state.rows
  const rowsRef = useRef(state.rows);
  /**
   * @param {any[]} nextRows
   */
  const setRows = nextRows => {
    rowsRef.current = nextRows;
    patchState({ rows: nextRows });
  };

  // 镜像最新 redux 值与路由参数：await 恢复后的读取等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = {
    id,
    actionId,
    currColId,
    currCaseId,
    currCaseList,
    currProject,
    token,
    envList,
    interfaceColList,
    curUid
  };

  // 整合header信息
  /**
   * @param {any} project_id
   * @param {any} req_header
   * @param {any} case_env
   */
  const handleReqHeader = (project_id, req_header, case_env) => {
    const envItem = latestRef.current.envList.find((/** @type {any} */ item) => {
      return item._id === project_id;
    });

    const currDomain = handleCurrDomain(envItem && envItem.env, case_env);
    const header = currDomain.header;
    header.forEach((/** @type {any} */ item) => {
      if (!checkNameIsExistInArray(item.name, req_header)) {
        // item.abled = true;
        item = {
          ...item,
          abled: true
        };
        req_header.push(item);
      }
    });
    return req_header;
  };

  /**
   * @param {any} rows
   * @param {any} [currColEnvObj]
   */
  const handleColdata = (rows, currColEnvObj = {}) => {
    const newRows = produce(rows, draftRows => {
      draftRows.map((/** @type {any} */ item) => {
        item.id = item._id;
        item._test_status = item.test_status;
        if(currColEnvObj[item.project_id]){
          item.case_env =currColEnvObj[item.project_id];
        }
        item.req_headers = handleReqHeader(item.project_id, item.req_headers, item.case_env);
        return item;
      });
    });
    setRows(newRows);
  };

  /**
   * @param {any} [key]
   */
  const changeCollapseClose = key => {
    if (key) {
      patchState({
        collapseKey: key
      });
    } else {
      patchState({
        collapseKey: '1',
        currColEnvObj: {}
      });
    }
  };

  /**
   * @param {any} newColId
   */
  const handleColIdChange = async newColId => {
    dispatch(setColData({
      currColId: +newColId,
      isShowCol: true,
      isRander: false
    }));

    const result = await dispatch(fetchCaseList(newColId));
    if (result.payload.data.errcode === 0) {
      reportsRef.current = handleReport(result.payload.data.colData.test_report);
      patchState((/** @type {any} */ prevState) => ({
        ...prevState,
        commonSetting:{
          ...prevState.commonSetting,
          ...result.payload.data.colData
        }
      }));
    }

    await dispatch(fetchCaseList(newColId));
    await dispatch(fetchCaseEnvList(newColId));
    changeCollapseClose();
    handleColdata(latestRef.current.currCaseList);
  };

  // 对应旧 async UNSAFE_componentWillMount 与 componentWillUnmount（清除插件轮询）
  useEffect(() => {
    (async () => {
      const currentParamsId = latestRef.current.id;
      const result = await dispatch(fetchInterfaceColList(currentParamsId));
      await dispatch(getToken(currentParamsId));
      const routeActionId = latestRef.current.actionId;
      const colList = result && result.payload && result.payload.data && result.payload.data.data;
      const firstCol = Array.isArray(colList) && colList.length > 0 ? colList[0] : null;
      currColIdRef.current = +routeActionId || (firstCol ? firstCol._id : 0);
      // this.props.history.push('/project/' + params.id + '/interface/col/' + currColId);
      if (currColIdRef.current && currColIdRef.current != 0) {
        await handleColIdChange(currColIdRef.current);
      }

      crossRequestIntervalRef.current = initCrossRequest((/** @type {any} */ hasPlugin) => {
        patchState({ hasPlugin: hasPlugin });
      });
    })();
    return () => {
      clearInterval(crossRequestIntervalRef.current);
    };
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：路由集合 id 变化或 isRander 置位时重载
  // （挂载期跳过首次执行，等价旧 cWRP 挂载时不触发）
  const prevRouteRef = useRef({ actionId, isRander });
  useEffect(() => {
    if (prevRouteRef.current.actionId === actionId && prevRouteRef.current.isRander === isRander) {
      return;
    }
    prevRouteRef.current = { actionId, isRander };
    const newColId = !isNaN(actionId) ? +actionId : 0;

    if (newColId && ((currColIdRef.current && newColId !== currColIdRef.current) || isRander)) {
      currColIdRef.current = newColId;
      handleColIdChange(newColId);
    }
  }, [actionId, isRander]);

  // 更新分类简介
  /**
   * @param {any} desc
   * @param {any} name
   */
  const handleChangeInterfaceCol = (desc, name) => {
    const params = {
      col_id: currColId,
      name: name,
      desc: desc
    };

    axios.post('/api/col/up_col', params).then(async (/** @type {any} */ res) => {
      if (res.data.errcode) {
        return message.error(res.data.errmsg);
      }
      const projectId = latestRef.current.id;
      await dispatch(fetchInterfaceColList(projectId));
      message.success('接口集合简介更新成功');
    });
  };

  const executeTests = async () => {
    const l = rowsRef.current.length;
    for (let i = 0; i < l; i++) {
      // 每轮迭代重新读取最新行数据，等价旧实现循环体内的 this.state.rows
      const rows = rowsRef.current;

      const envItem = latestRef.current.envList.find((/** @type {any} */ item) => {
        return item._id === rows[i].project_id;
      });

      let curitem = Object.assign(
        {},
        rows[i],
        {
          env: envItem.env,
          pre_script: latestRef.current.currProject.pre_script,
          after_script: latestRef.current.currProject.after_script
        },
        { test_status: 'loading' }
      );
      /** @type {any[]} */
      let newRows = [].concat([], rows);
      newRows[i] = curitem;
      setRows(newRows);
      let status = 'error',
        result;
      try {
        result = await handleTest(curitem);

        if (result.code === 400) {
          status = 'error';
        } else if (result.code === 0) {
          status = 'ok';
        } else if (result.code === 1) {
          status = 'invalid';
        }
      } catch (/** @type {any} */ e) {
        console.error(e);
        status = 'error';
        result = e;
      }

      //result.body = result.data;
      reportsRef.current[curitem._id] = result;
      recordsRef.current[curitem._id] = {
        status: result.status,
        params: result.params,
        body: result.res_body
      };

      curitem = Object.assign({}, rows[i], { test_status: status });
      newRows = [].concat([], rows);
      newRows[i] = curitem;
      setRows(newRows);
    }
    await axios.post('/api/col/up_col', {
      col_id: latestRef.current.currColId,
      test_report: JSON.stringify(reportsRef.current)
    });
  };

  /**
   * @param {any} interfaceData
   */
  const handleTest = async interfaceData => {
    let requestParams = {};
    const options = handleParams(interfaceData, handleValue, requestParams);

    let result = /** @type {any} */ ({
      code: 400,
      msg: '数据异常',
      validRes: []
    });

    await plugin.emitHook('before_col_request', Object.assign({}, options, {
      type: 'col',
      caseId: options.caseId,
      projectId: interfaceData.project_id,
      interfaceId: interfaceData.interface_id
    }));

    try {
      const data = await crossRequest(options, interfaceData.pre_script, interfaceData.after_script, createContext(
        latestRef.current.curUid,
        latestRef.current.id,
        interfaceData.interface_id
      ));
      options.taskId = latestRef.current.curUid;
      const res = (data.res.body = json_parse(data.res.body));
      result = {
        ...options,
        ...result,
        res_header: data.res.header,
        res_body: res,
        status: data.res.status,
        statusText: data.res.statusText
      };

      await plugin.emitHook('after_col_request', result, {
        type: 'col',
        caseId: options.caseId,
        projectId: interfaceData.project_id,
        interfaceId: interfaceData.interface_id
      });

      if (options.data && typeof options.data === 'object') {
        requestParams = {
          ...requestParams,
          ...options.data
        };
      }

      const validRes = /** @type {any[]} */ ([]);

      const responseData = Object.assign(
        {},
        {
          status: data.res.status,
          body: res,
          header: data.res.header,
          statusText: data.res.statusText
        }
      );

      // 断言测试
      await handleScriptTest(interfaceData, responseData, validRes, requestParams);

      if (validRes.length === 0) {
        result.code = 0;
        result.validRes = [
          {
            message: '验证通过'
          }
        ];
      } else if (validRes.length > 0) {
        result.code = 1;
        result.validRes = validRes;
      }
    } catch (/** @type {any} */ data) {
      result = {
        ...options,
        ...result,
        res_header: data.header,
        res_body: data.body || data.message,
        status: 0,
        statusText: data.message,
        code: 400,
        validRes: [
          {
            message: data.message
          }
        ]
      };
    }

    result.params = requestParams;
    return result;
  };

  // response, validRes
  // 断言测试
  /**
   * @param {any} interfaceData
   * @param {any} response
   * @param {any} validRes
   * @param {any} requestParams
   */
  const handleScriptTest = async (interfaceData, response, validRes, requestParams) => {
    // 是否启动断言
    try {
      const test = await axios.post('/api/col/run_script', {
        response: response,
        records: recordsRef.current,
        script: interfaceData.test_script,
        params: requestParams,
        col_id: latestRef.current.currColId,
        interface_id: interfaceData.interface_id
      });
      if (test.data.errcode !== 0) {
        test.data.data.logs.forEach((/** @type {any} */ item) => {
          validRes.push({ message: item });
        });
      }
    } catch (/** @type {any} */ err) {
      validRes.push({
        message: 'Error: ' + err.message
      });
    }
  };

  /**
   * @param {any} val
   * @param {any} global
   */
  const handleValue = (val, global) => {
    const globalValue = ArrayToObject(global);
    const context = Object.assign({}, { global: globalValue }, recordsRef.current);
    return handleParamsValue(val, context);
  };

  const onDrop = () => {
    /** @type {any[]} */
    const changes = [];
    state.rows.forEach((/** @type {any} */ item, /** @type {number} */ index) => {
      changes.push({ id: item._id, index: index });
    });
    axios.post('/api/col/up_case_index', changes).then(() => {
      dispatch(fetchInterfaceColList(latestRef.current.id));
    });
  };
  // 拖拽经过其它行时实时重排（等价原 dnd.Row 的 hover 换位体验）
  /**
   * @param {any} event
   */
  const onDragOver = event => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const rows = state.rows;
    const oldIndex = rows.findIndex((/** @type {any} */ item) => item.id === active.id);
    const newIndex = rows.findIndex((/** @type {any} */ item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    setRows(arrayMove(rows, oldIndex, newIndex));
  };
  // 拖拽结束持久化新顺序（未发生换位时不发冗余请求）
  /**
   * @param {any} event
   */
  const onDragEnd = event => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onDrop();
    }
  };

  /**
   * @param {any} d
   */
  const onChangeTest = d => {

    patchState({
      commonSetting: {
        ...state.commonSetting,
        checkScript: {
          ...state.commonSetting.checkScript,
          content: d.text
        }
      }
    });
  };

  /**
   * @param {any} code
   */
  const handleInsertCode = code => {
    aceEditorRef.current.editor.insertCode(code);
  };

  /**
   * @param {any} reportId
   */
  const openReport = reportId => {
    if (!reportsRef.current[reportId]) {
      return message.warning('还没有生成报告');
    }
    patchState({ visible: true, curCaseid: reportId });
  };

  /**
   * @param {any} d
   */
  const handleScriptChange = d => {
    patchState({ curScript: d.text });
  };

  const handleAdvCancel = () => {
    patchState({ advVisible: false });
  };

  const handleAdvOk = async () => {
    const { curCaseid, enableScript, curScript } = state;
    const res = await axios.post('/api/col/up_case', {
      id: curCaseid,
      test_script: curScript,
      enable_script: enableScript
    });
    if (res.data.errcode === 0) {
      message.success('更新成功');
    }
    patchState({ advVisible: false });
    const advCurrColId = currColIdRef.current;
    dispatch(setColData({
      currColId: +advCurrColId,
      isShowCol: true,
      isRander: false
    }));
    await dispatch(fetchCaseList(advCurrColId));

    handleColdata(latestRef.current.currCaseList);
  };

  const handleCancel = () => {
    patchState({ visible: false });
  };

  /**
   * @param {any} envName
   * @param {any} project_id
   */
  const currProjectEnvChange = (envName, project_id) => {
    const nextCurrColEnvObj = {
      ...state.currColEnvObj,
      [project_id]: envName
    };
    patchState({ currColEnvObj: nextCurrColEnvObj });
    // this.handleColdata(this.props.currCaseList, envName, project_id);
    handleColdata(currCaseList, nextCurrColEnvObj);
  };

  const autoTests = () => {
    patchState({ autoVisible: true, currColEnvObj: {}, collapseKey: '' });
  };

  const handleAuto = () => {
    patchState({
      autoVisible: false,
      email: false,
      download: false,
      mode: 'html',
      currColEnvObj: {},
      collapseKey: ''
    });
  };

  /**
   * @param {any} url
   */
  const copyUrl = url => {
    copyText(url);
    message.success('已经成功复制到剪切板');
  };

  /**
   * @param {any} mode
   */
  const modeChange = mode => {
    patchState({ mode });
  };

  /**
   * @param {any} email
   */
  const emailChange = email => {
    patchState({ email });
  };

  /**
   * @param {any} download
   */
  const downloadChange = download => {
    patchState({ download });
  };

  /**
   * @param {any} envObj
   */
  const handleColEnvObj = envObj => {
    let str = '';
    for (const key in envObj) {
      str += envObj[key] ? `&env_${key}=${envObj[key]}` : '';
    }
    return str;
  };

  const handleCommonSetting = ()=>{
    const setting = state.commonSetting;

    const params = {
      col_id: currColId,
      ...setting

    };
    console.log(params)

    axios.post('/api/col/up_col', params).then(async (/** @type {any} */ res) => {
      if (res.data.errcode) {
        return message.error(res.data.errmsg);
      }
      message.success('配置测试集成功');
    });

    patchState({
      commonSettingModalVisible: false
    })
  }

  const cancelCommonSetting = ()=>{
    patchState({
      commonSettingModalVisible: false
    })
  }

  const openCommonSetting = ()=>{
    patchState({
      commonSettingModalVisible: true
    })
  }

  /**
   * @param {any} key
   */
  const changeCommonFieldSetting = key => {
    return (/** @type {any} */ e) => {
      let value = e;
      if(typeof e === 'object' && e){
        value = e.target.value;
      }
      const {checkResponseField} = state.commonSetting;
      patchState({
        commonSetting: {
          ...state.commonSetting,
          checkResponseField: {
            ...checkResponseField,
            [key]: value
          }
        }
      })
    }
  }

  const currProjectId = currProject._id;
  /** @type {any[]} */
  const columns = [
    {
      title: '用例名称',
      dataIndex: 'casename',
      width: 250,
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        return (
          <Link to={'/project/' + currProjectId + '/interface/case/' + record._id}>
            {record.casename.length > 23 ? record.casename.substr(0, 20) + '...' : record.casename}
          </Link>
        );
      }
    },
    {
      title: (
        <Tooltip
          title={
            <span>
              {' '}
              每个用例都有唯一的key，用于获取所匹配接口的响应数据，例如使用{' '}
              <a
                href="https://hellosean1025.github.io/yapi/documents/case.html#%E7%AC%AC%E4%BA%8C%E6%AD%A5%EF%BC%8C%E7%BC%96%E8%BE%91%E6%B5%8B%E8%AF%95%E7%94%A8%E4%BE%8B"
                className="link-tooltip"
                target="blank"
              >
                {' '}
                变量参数{' '}
              </a>{' '}
              功能{' '}
            </span>
          }
        >
          Key
        </Tooltip>
      ),
      dataIndex: '_id',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'test_status',
      width: 100,
      render: (/** @type {any} */ value, /** @type {any} */ record) => {
        const rowId = record._id;
        const code = reportsRef.current[rowId] ? reportsRef.current[rowId].code : 0;
        if (record.test_status === 'loading') {
          return (
            <div>
              <Spin />
            </div>
          );
        }

        switch (code) {
          case 0:
            return (
              <div>
                <Tooltip title="Pass">
                  <CheckCircleFilled
                    style={{
                      color: '#00a854'
                    }}
                  />
                </Tooltip>
              </div>
            );
          case 400:
            return (
              <div>
                <Tooltip title="请求异常">
                  <InfoCircleFilled
                    style={{
                      color: '#f04134'
                    }}
                  />
                </Tooltip>
              </div>
            );
          case 1:
            return (
              <div>
                <Tooltip title="验证失败">
                  <ExclamationCircleFilled
                    style={{
                      color: '#ffbf00'
                    }}
                  />
                </Tooltip>
              </div>
            );
          default:
            return (
              <div>
                <CheckCircleFilled
                  style={{
                    color: '#00a854'
                  }}
                />
              </div>
            );
        }
      }
    },
    {
      title: '接口路径',
      dataIndex: 'path',
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        return (
          <Tooltip title="跳转到对应接口">
            <Link to={`/project/${record.project_id}/interface/api/${record.interface_id}`}>
              {record.path && record.path.length > 23 ? record.path.substr(0, 20) + '...' : record.path}
            </Link>
          </Tooltip>
        );
      }
    },
    {
      title: '测试报告',
      dataIndex: 'id',
      width: 200,
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        const reportFun = () => {
          if (!reportsRef.current[record.id]) {
            return null;
          }
          return <Button onClick={() => openReport(record.id)}>测试报告</Button>;
        };
        return <div className="interface-col-table-action">{reportFun()}</div>;
      }
    }
  ];
  const { rows } = state;

  const localUrl =
    location.protocol +
    '//' +
    location.hostname +
    (location.port !== '' ? ':' + location.port : '');
  const currColEnvObj = handleColEnvObj(state.currColEnvObj);
  const autoTestsUrl = `/api/open/run_auto_test?id=${currColId}&token=${
    token
  }${currColEnvObj ? currColEnvObj : ''}&mode=${state.mode}&email=${
    state.email
  }&download=${state.download}`;

  let col_name = '';
  let col_desc = '';

  for (let i = 0; i < interfaceColList.length; i++) {
    if (interfaceColList[i]._id === currColId) {
      col_name = interfaceColList[i].name;
      col_desc = interfaceColList[i].desc;
      break;
    }
  }

  return (
    <div className="interface-col">
      <Modal
          title="通用规则配置"
          open={state.commonSettingModalVisible}
          onOk={handleCommonSetting}
          onCancel={cancelCommonSetting}
          width={'1000px'}
          style={defaultModalStyle}
        >
        <div className="common-setting-modal">
          <Row className="setting-item">
            <Col className="col-item" span="4">
              <label>检查HttpCode:&nbsp;<Tooltip title={'检查 http code 是否为 200'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip></label>
            </Col>
            <Col className="col-item"  span="18">
              <Switch onChange={(/** @type {any} */ e)=>{
                patchState({
                  commonSetting :{
                    ...state.commonSetting,
                    checkHttpCodeIs200: e
                  }
                })
              }} checked={state.commonSetting.checkHttpCodeIs200}  checkedChildren="开" unCheckedChildren="关" />
            </Col>
          </Row>

          <Row className="setting-item">
            <Col className="col-item"  span="4">
              <label>检查返回json:&nbsp;<Tooltip title={'检查接口返回数据字段值，比如检查 code 是不是等于 0'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip></label>
            </Col>
            <Col  className="col-item" span="6">
              <Input value={state.commonSetting.checkResponseField.name} onChange={changeCommonFieldSetting('name')} placeholder="字段名"  />
            </Col>
            <Col  className="col-item" span="6">
              <Input  onChange={changeCommonFieldSetting('value')}  value={state.commonSetting.checkResponseField.value}   placeholder="值"  />
            </Col>
            <Col  className="col-item" span="6">
              <Switch  onChange={changeCommonFieldSetting('enable')}  checked={state.commonSetting.checkResponseField.enable}  checkedChildren="开" unCheckedChildren="关"  />
            </Col>
          </Row>

          <Row className="setting-item">
            <Col className="col-item" span="4">
              <label>检查返回数据结构:&nbsp;<Tooltip title={'只有 response 基于 json-schema 方式定义，该检查才会生效'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip></label>
            </Col>
            <Col className="col-item"  span="18">
              <Switch onChange={(/** @type {any} */ e)=>{
                patchState({
                  commonSetting :{
                    ...state.commonSetting,
                    checkResponseSchema: e
                  }
                })
              }} checked={state.commonSetting.checkResponseSchema}  checkedChildren="开" unCheckedChildren="关" />
            </Col>
          </Row>

          <Row className="setting-item">
            <Col className="col-item  " span="4">
              <label>全局测试脚本:&nbsp;<Tooltip title={'在跑自动化测试时，优先调用全局脚本，只有全局脚本通过测试，才会开始跑case自定义的测试脚本'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip></label>
            </Col>
            <Col className="col-item"  span="14">
              <div><Switch onChange={(/** @type {any} */ e)=>{
                patchState({
                  commonSetting :{
                    ...state.commonSetting,
                    checkScript: {
                      ...state.checkScript,
                      enable: e
                    }
                  }
                })
              }} checked={state.commonSetting.checkScript.enable}  checkedChildren="开" unCheckedChildren="关"  /></div>
              <AceEditor
                onChange={onChangeTest}
                className="case-script"
                data={state.commonSetting.checkScript.content}
                ref={(/** @type {any} */ aceEditor) => {
                  aceEditorRef.current = aceEditor;
                }}
              />
            </Col>
            <Col span="6">
              <div className="insert-code">
                {InsertCodeMap.map((/** @type {any} */ item) => {
                  return (
                    <div
                      style={{ cursor: 'pointer' }}
                      className="code-item"
                      key={item.title}
                      onClick={() => {
                        handleInsertCode('\n' + item.code);
                      }}
                    >
                      {item.title}
                    </div>
                  );
                })}
              </div>
            </Col>
          </Row>


        </div>
      </Modal>
      <Row type="flex" justify="center" align="top">
        <Col span={5}>
          <h2
            className="interface-title"
            style={{
              display: 'inline-block',
              margin: '8px 20px 16px 0px'
            }}
          >
            测试集合&nbsp;<a
              target="_blank"
              rel="noopener noreferrer"
              href="https://hellosean1025.github.io/yapi/documents/case.html"
            >
              <Tooltip title="点击查看文档">
                <QuestionCircleOutlined />
              </Tooltip>
            </a>
          </h2>
        </Col>
        <Col span={10}>
          <CaseEnv
            envList={envList}
            currProjectEnvChange={currProjectEnvChange}
            envValue={state.currColEnvObj}
            collapseKey={state.collapseKey}
            changeClose={changeCollapseClose}
          />
        </Col>
        <Col span={9}>
          {state.hasPlugin ? (
            <div
              style={{
                float: 'right',
                paddingTop: '8px'
              }}
            >
              {curProjectRole !== 'guest' && (
                <Tooltip title="在 YApi 服务端跑自动化测试，测试环境不能为私有网络，请确保 YApi 服务器可以访问到自动化测试环境domain">
                  <Button
                    style={{
                      marginRight: '8px'
                    }}
                    onClick={autoTests}
                  >
                    服务端测试
                  </Button>
                </Tooltip>
              )}
              <Button onClick={openCommonSetting} style={{
                      marginRight: '8px'
                    }} >通用规则配置</Button>
              &nbsp;
              <Button type="primary" onClick={executeTests}>
                开始测试
              </Button>
            </div>
          ) : (
            <Tooltip title="请安装 cross-request Chrome 插件">
              <Button
                disabled
                type="primary"
                style={{
                  float: 'right',
                  marginTop: '8px'
                }}
              >
                开始测试
              </Button>
            </Tooltip>
          )}
        </Col>
      </Row>

      <div className="component-label-wrapper">
        <Label onChange={(/** @type {any} */ val) => handleChangeInterfaceCol(val, col_name)} desc={col_desc} />
      </div>

      <DndContext
        sensors={dndSensors}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContextAny items={rows.map((/** @type {any} */ item) => item.id)} strategy={verticalListSortingStrategy}>
          <Table
            className="interface-col-table"
            columns={columns}
            dataSource={rows}
            rowKey="id"
            pagination={false}
            components={{ body: { row: SortableRow } }}
          />
        </SortableContextAny>
      </DndContext>
      <Modal
        title="测试报告"
        width="900px"
        style={{
          minHeight: '500px'
        }}
        open={state.visible}
        onCancel={handleCancel}
        footer={null}
      >
        <CaseReport {...reportsRef.current[state.curCaseid]} />
      </Modal>

      <Modal
        title="自定义测试脚本"
        width="660px"
        style={{
          minHeight: '500px'
        }}
        open={state.advVisible}
        onCancel={handleAdvCancel}
        onOk={handleAdvOk}
        maskClosable={false}
      >
        <h3>
          是否开启:&nbsp;
          <Switch
            checked={state.enableScript}
            onChange={(/** @type {any} */ e) => patchState({ enableScript: e })}
          />
        </h3>
        <AceEditor
          className="case-script"
          data={state.curScript}
          onChange={handleScriptChange}
        />
      </Modal>
      {state.autoVisible && (
        <Modal
          title="服务端自动化测试"
          width="780px"
          style={{
            minHeight: '500px'
          }}
          open={state.autoVisible}
          onCancel={handleAuto}
          className="autoTestsModal"
          footer={null}
        >
          <Row type="flex" justify="space-around" className="row" align="top">
            <Col span={3} className="label" style={{ paddingTop: '16px' }}>
              选择环境
              <Tooltip title="默认使用测试用例选择的环境">
                <QuestionCircleOutlined />
              </Tooltip>
              &nbsp;：
            </Col>
            <Col span={21}>
              <CaseEnv
                envList={envList}
                currProjectEnvChange={currProjectEnvChange}
                envValue={state.currColEnvObj}
                collapseKey={state.collapseKey}
                changeClose={changeCollapseClose}
              />
            </Col>
          </Row>
          <Row type="flex" justify="space-around" className="row" align="middle">
            <Col span={3} className="label">
              输出格式：
            </Col>
            <Col span={21}>
              <Select value={state.mode} onChange={modeChange}>
                <Option key="html" value="html">
                  html
                </Option>
                <Option key="json" value="json">
                  json
                </Option>
              </Select>
            </Col>
          </Row>
          <Row type="flex" justify="space-around" className="row" align="middle">
            <Col span={3} className="label">
              消息通知
              <Tooltip title={'测试不通过时，会给项目组成员发送消息通知'}>
                <QuestionCircleOutlined
                  style={{
                    width: '10px'
                  }}
                />
              </Tooltip>
              &nbsp;：
            </Col>
            <Col span={21}>
              <Switch
                checked={state.email}
                checkedChildren="开"
                unCheckedChildren="关"
                onChange={emailChange}
              />
            </Col>
          </Row>
          <Row type="flex" justify="space-around" className="row" align="middle">
            <Col span={3} className="label">
              下载数据
              <Tooltip title={'开启后，测试数据将被下载到本地'}>
                <QuestionCircleOutlined
                  style={{
                    width: '10px'
                  }}
                />
              </Tooltip>
              &nbsp;：
            </Col>
            <Col span={21}>
              <Switch
                checked={state.download}
                checkedChildren="开"
                unCheckedChildren="关"
                onChange={downloadChange}
              />
            </Col>
          </Row>
          <Row type="flex" justify="space-around" className="row" align="middle">
            <Col span={21} className="autoTestUrl">
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={localUrl + autoTestsUrl} >
                {autoTestsUrl}
              </a>
            </Col>
            <Col span={3}>
              <Button className="copy-btn" onClick={() => copyUrl(localUrl + autoTestsUrl)}>
                复制
              </Button>
            </Col>
          </Row>
          <div className="autoTestMsg">
            注：访问该URL，可以测试所有用例，请确保YApi服务器可以访问到环境配置的 domain
          </div>
        </Modal>
      )}
    </div>
  );
};

export default InterfaceColContent;

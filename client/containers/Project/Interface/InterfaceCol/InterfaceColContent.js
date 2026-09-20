// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
//import constants from '../../../../constants/variable.js'
import { message } from 'antd';
import {
  fetchInterfaceColList,
  fetchCaseList,
  setColData,
  fetchCaseEnvList
} from '../../../../reducer/modules/interfaceCol';
import { getToken } from '../../../../reducer/modules/project';
import { arrayMove } from '@dnd-kit/sortable';
import axios from 'axios';
import { initCrossRequest } from 'client/components/Postman/CheckCrossInstall.js';
import { produce } from 'immer';
import ColToolbar from './InterfaceColContent/ColToolbar.js';
import CaseTable from './InterfaceColContent/CaseTable.js';
import CommonSettingModal from './InterfaceColContent/CommonSettingModal.js';
import CaseReportModal from './InterfaceColContent/CaseReportModal.js';
import CaseScriptModal from './InterfaceColContent/CaseScriptModal.js';
import AutoTestModal from './InterfaceColContent/AutoTestModal.js';

const plugin = require('client/plugin.js');
const {
  handleParams,
  crossRequest,
  handleCurrDomain,
  checkNameIsExistInArray
} = require('common/postmanLib.js');
const { handleParamsValue, json_parse, ArrayToObject } = require('common/utils.js');
import Label from '../../../../components/Label/Label.js';

const createContext = require('common/createContext')

import { copyText } from '../../../../common.js';

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
 * 测试集合内容区（用例表格 / 自动化测试）—— 组合层。
 *
 * render 子组件化第一批：原 1304 行的单文件按 JSX 边界拆分为「容器 + 6 个展示子组件」，
 * 子组件位于 ./InterfaceColContent/：
 *   - ColToolbar.js         顶部区域：标题（文档入口）/ 环境选择 / 服务端测试·通用规则配置·开始测试
 *   - CaseTable.js          用例表格区：columns 定义 + SortableRow + DndContext/SortableContext 接线
 *   - CommonSettingModal.js 通用规则配置弹窗（含脚本编辑器与插入代码）
 *   - CaseReportModal.js    测试报告弹窗（正文复用既有 CaseReport）
 *   - CaseScriptModal.js    自定义测试脚本弹窗
 *   - AutoTestModal.js      服务端自动化测试弹窗
 *
 * 本文件保留全部 hooks 与数据处理（fetch / handleTest / executeTests / 断言脚本 /
 * 拖拽 POST 链 / 报告与 records 上下文），子组件只做「受控展示 + 事件回调上抛」，
 * 不引入状态、不引入包装 DOM 元素；抽取前后 DOM 逐字节等价（见交付报告验证记录）。
 *
 * 历史迁移说明（原类组件经 Hooks 现代化，渲染结构与行为保持一致）：
 * - 旧 @connect 改为 useSelector/useDispatch（isShowCol / projectEnv 为历史遗留仅声明
 *   未消费，保留订阅避免行为差异；getEnv 映射仅声明未消费，随迁移移除），旧 @withRouter
 *   注入的 match 改为 useParams；
 * - 旧实例字段 this.reports / this.records / this.currColId / this._crossRequestInterval
 *   改为对应 ref（this.aceEditor 随通用规则配置弹窗下放为该子组件的内部 ref）；
 * - 旧 async UNSAFE_componentWillMount（拉取集合/Token → 推导集合 id → 加载用例 →
 *   轮询 cross-request 插件）改为挂载期 useEffect，clearInterval 清理对应旧
 *   componentWillUnmount；
 * - 旧 UNSAFE_componentWillReceiveProps（路由集合 id 变化或 isRander 置位时重载）改为
 *   actionId / isRander 变化 useEffect（prev ref 比较，挂载期跳过）；
 * - rows 采用「写入即同步 ref」模式：executeTests 循环逐行更新行状态，ref 恒等旧类组件
 *   在 await 恢复后读取的实时 this.state.rows；
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

  // 旧实例字段：测试报告 / 断言上下文 / 当前集合 id / 插件轮询定时器
  const reportsRef = useRef({});
  const recordsRef = useRef({});
  const currColIdRef = useRef(null);
  const crossRequestIntervalRef = useRef(null);

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
   * @param {any} reportId
   */
  const openReport = reportId => {
    if (!reportsRef.current[reportId]) {
      return message.warning('还没有生成报告');
    }
    patchState({ visible: true, curCaseid: reportId });
  };

  /**
   * 通用规则配置片段合并（子组件只上抛片段，合并语义与抽取前各内联 handler 一致）
   * @param {any} partial
   */
  const changeCommonSetting = partial => {
    patchState({
      commonSetting: {
        ...state.commonSetting,
        ...partial
      }
    });
  };

  /**
   * 自定义测试脚本内容（子组件已从 AceEditor 载荷取出 text）
   * @param {any} text
   */
  const changeScript = text => {
    patchState({ curScript: text });
  };

  /**
   * 自定义测试脚本开关
   * @param {any} e
   */
  const changeEnableScript = e => {
    patchState({ enableScript: e });
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

  const currProjectId = currProject._id;
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
      <CommonSettingModal
        visible={state.commonSettingModalVisible}
        commonSetting={state.commonSetting}
        onChangeCommonSetting={changeCommonSetting}
        onOk={handleCommonSetting}
        onCancel={cancelCommonSetting}
      />
      <ColToolbar
        envList={envList}
        envValue={state.currColEnvObj}
        collapseKey={state.collapseKey}
        onEnvChange={currProjectEnvChange}
        onCollapseChange={changeCollapseClose}
        hasPlugin={state.hasPlugin}
        curProjectRole={curProjectRole}
        onAutoTests={autoTests}
        onOpenCommonSetting={openCommonSetting}
        onExecuteTests={executeTests}
      />
      <div className="component-label-wrapper">
        <Label onChange={(/** @type {any} */ val) => handleChangeInterfaceCol(val, col_name)} desc={col_desc} />
      </div>
      <CaseTable
        rows={rows}
        reportMap={reportsRef.current}
        currProjectId={currProjectId}
        onOpenReport={openReport}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      />
      <CaseReportModal
        visible={state.visible}
        report={reportsRef.current[state.curCaseid]}
        onCancel={handleCancel}
      />
      <CaseScriptModal
        visible={state.advVisible}
        enableScript={state.enableScript}
        curScript={state.curScript}
        onEnableScriptChange={changeEnableScript}
        onScriptChange={changeScript}
        onOk={handleAdvOk}
        onCancel={handleAdvCancel}
      />
      {state.autoVisible && (
        <AutoTestModal
          visible={state.autoVisible}
          envList={envList}
          envValue={state.currColEnvObj}
          collapseKey={state.collapseKey}
          onEnvChange={currProjectEnvChange}
          onCollapseChange={changeCollapseClose}
          mode={state.mode}
          email={state.email}
          download={state.download}
          onModeChange={modeChange}
          onEmailChange={emailChange}
          onDownloadChange={downloadChange}
          href={localUrl + autoTestsUrl}
          urlText={autoTestsUrl}
          onCopyUrl={copyUrl}
          onCancel={handleAuto}
        />
      )}
    </div>
  );
};

export default InterfaceColContent;

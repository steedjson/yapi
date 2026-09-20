// @ts-check
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Tabs, Tooltip } from 'antd';
import { isJson, deepCopyJson, json5_parse } from '../../common.js';
import axios from 'axios';
import { initCrossRequest } from './CheckCrossInstall.js';
import './Postman.scss';
import json5 from 'json5';
import UrlBar from './PostmanParts/UrlBar.js';
import RequestParamsPanel from './PostmanParts/RequestParamsPanel.js';
import ResponsePanel from './PostmanParts/ResponsePanel.js';
import TestPanel from './PostmanParts/TestPanel.js';
import PostmanModals from './PostmanParts/PostmanModals.js';
const { handleParamsValue, ArrayToObject, schemaValidator } = require('common/utils.js');
const {
  handleParams,
  crossRequest,
  checkNameIsExistInArray
} = require('common/postmanLib.js');

const plugin = require('client/plugin.js');

const createContext = require('common/createContext')

// InsertCodeMap 已随 Test 面板迁至 PostmanParts/insertCodeMap.js，此处按原路径转出，
// 既有消费方（CommonSettingModal 等）零改动；TestPanel 直接引用常量文件以避免循环依赖。
export { InsertCodeMap } from './PostmanParts/insertCodeMap.js';

/**
 * @param {any} data
 */
function checkInterfaceData(data) {
  if (!data || typeof data !== 'object' || !data._id) {
    return false;
  }
  return true;
}

/**
 * 接口运行页（原类组件经 Hooks 现代化，渲染结构与行为保持一致）：
 * - 类 state 单对象迁移为单个 useState + applyState 浅合并（等价旧 this.setState(对象)
 *   的合并语义），stateRef 同步镜像最新 state，异步回调（请求响应、防抖、定时器）
 *   经 stateRef / latestRef 读取，等价旧实现的实时 this.state / this.props；
 * - UNSAFE_componentWillMount 改为挂载期 useEffect（cross-request 插件探测定时器 +
 *   initState），componentWillUnmount 改为其清理函数（clearInterval）；
 * - UNSAFE_componentWillReceiveProps 改为 props.data 变化 useEffect（prev ref 比较），
 *   旧 setState 回调链（initState 回调里的 initEnvState 等）按「最终应用顺序等价」
 *   改写为直接顺序调用（详见对应 useEffect 注释）；
 * - forwardRef + useImperativeHandle 保留旧实例 API：Run.js / InterfaceCaseContent
 *   经 ref.state 读取实时 state（getter，恒为最新值）；
 * - 旧 render 中引用的 this.changePath / this.addPathParam / this.addQuery /
 *   this.addHeader / this.addBody 在类上从未定义（实例属性访问恒为 undefined，
 *   对应按钮均 display:none 不可点击），迁移后直接移除这些死引用。
 *
 * render 子组件化（本文件仅保留 hooks/数据逻辑 + 渲染组装）：
 *   - PostmanParts/UrlBar.js             请求地址栏：方法/环境/路径 + 发送/保存
 *   - PostmanParts/RequestParamsPanel.js 参数折叠面板：PATH/QUERY/HEADERS/BODY(F9)
 *   - PostmanParts/BodyPanel.js          BODY 面板：raw 编辑器 / form 行 / file 选择
 *   - PostmanParts/ParamsName.js         参数名展示单元（面板与 form 行共用）
 *   - PostmanParts/ResponsePanel.js      Response 页：状态行/校验告警/响应头与响应体
 *   - PostmanParts/TestPanel.js          Test 页（type=case）：脚本开关/编辑器/片段插入
 *   - PostmanParts/PostmanModals.js      高级参数插入弹窗 / 环境设置弹窗 / 插件提示
 *   - PostmanParts/insertCodeMap.js      断言代码片段表（按原路径转出，消费方零改动）
 * 子组件一律「受控展示 + 事件回调上抛」，不持有业务状态、不引入包装 DOM 元素；
 * ref 契约（useImperativeHandle 的 state getter）与请求链路（reqRealInterface 防双发、
 * crossRequest 调用、createContext 上下文）完整保留在本文件。抽取前后 DOM 逐字节等价
 * （14 场景独立进程比对，见交付报告）。
 */
const Run = forwardRef((props, ref) => {
  const [state, setState] = useState(() => ({
    loading: false,
    resStatusCode: null,
    test_valid_msg: null,
    resStatusText: null,
    case_env: '',
    mock_verify: false,
    enable_script: false,
    test_script: '',
    hasPlugin: true,
    inputValue: '',
    cursurPosition: { row: 1, column: -1 },
    envModalVisible: false,
    test_res_header: null,
    test_res_body: null,
    autoPreviewHTML: true,
    ...props.data
  }));

  // 镜像最新 state / props：异步回调中的读取等价于旧类组件的实时 this.state / this.props
  const stateRef = useRef(state);
  const latestRef = useRef({});
  latestRef.current = props;

  // 浅合并更新并同步镜像：等价旧 this.setState(对象)（对象键覆盖合并）
  /**
   * @param {any} patch
   */
  const applyState = patch => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
  };

  const aceEditorRef = useRef(null);
  const crossRequestIntervalRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      // Run.js / InterfaceCaseContent 经 ref.current.state 解构实时请求参数
      get state() {
        return stateRef.current;
      }
    }),
    []
  );

  // 整合header信息
  /**
   * @param {string} value
   * @param {any} env
   */
  const handleReqHeader = (value, env) => {
    let index = value
      ? env.findIndex((/** @type {any} */ item) => {
          return item.name === value;
        })
      : 0;
    index = index === -1 ? 0 : index;

    /** @type {any[]} */
    let req_header = [].concat(latestRef.current.data.req_headers || []);
    /** @type {any[]} */
    let header = [].concat(env[index].header || []);
    header.forEach(item => {
      if (!checkNameIsExistInArray(item.name, req_header)) {
        item = {
          ...item,
          abled: true
        };
        req_header.push(item);
      }
    });
    req_header = req_header.filter(item => {
      return item && typeof item === 'object';
    });
    return req_header;
  };

  /**
   * @param {string} value
   */
  const selectDomain = value => {
    let headers = handleReqHeader(value, stateRef.current.env);
    applyState({
      case_env: value,
      req_headers: headers
    });
  };

  /**
   * @param {any} data
   */
  const initState = async data => {
    if (!checkInterfaceData(data)) {
      return null;
    }

    const { req_body_other, req_body_type, req_body_is_json_schema } = data;
    let body = req_body_other;
    // 运行时才会进行转换
    if (
      latestRef.current.type === 'inter' &&
      req_body_type === 'json' &&
      req_body_other &&
      req_body_is_json_schema
    ) {
      let schema = {};
      try {
        schema = json5.parse(req_body_other);
      } catch (e) {
        console.log('e', e);
        return;
      }
      let result = await axios.post('/api/interface/schema2json', {
        schema: schema,
        required: true
      });
      body = JSON.stringify(result.data);
    }

    let example = {};
    if (latestRef.current.type === 'inter') {
      example = ['req_headers', 'req_query', 'req_body_form'].reduce(
        (res, key) => {
          res[key] = (data[key] || []).map((/** @type {any} */ item) => {
            if (
              item.type !== 'file' // 不是文件类型
                && (item.value == null || item.value === '') // 初始值为空
                && item.example != null // 有示例值
            ) {
              item.value = item.example;
            }
            return item;
          })
          return res;
        },
        /** @type {any} */ ({})
      )
    }

    // 对应旧 initState 的 setState（含 ...this.state 冗余展开，applyState 本身即
    // 基于最新 state 合并）与其回调（type==='inter' 时执行 initEnvState）
    applyState({
      test_res_header: null,
      test_res_body: null,
      ...data,
      ...example,
      req_body_other: body,
      resStatusCode: null,
      test_valid_msg: null,
      resStatusText: null
    });
    if (latestRef.current.type === 'inter') {
      initEnvState(data.case_env, data.env);
    }
  };

  /**
   * @param {string} case_env
   * @param {any} env
   */
  const initEnvState = (case_env, env) => {
    let headers = handleReqHeader(case_env, env);

    applyState({
      req_headers: headers,
      env: env
    });
    // 对应旧 initEnvState 的 setState 回调（此时新 env 已合并进 state）
    let s = !env.find((/** @type {any} */ item) => item.name === stateRef.current.case_env);
    if (!stateRef.current.case_env || s) {
      applyState({
        case_env: stateRef.current.env[0].name
      });
    }
  };

  // 对应旧 UNSAFE_componentWillMount + componentWillUnmount
  useEffect(() => {
    crossRequestIntervalRef.current = initCrossRequest((/** @type {any} */ hasPlugin) => {
      applyState({
        hasPlugin: hasPlugin
      });
    });
    initState(latestRef.current.data);
    return () => {
      clearInterval(crossRequestIntervalRef.current);
    };
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：data._id / interface_up_time 变化时重跑
  // initState；env 变化时以「当前 state.case_env」重算请求头。旧实现中 initState 的
  // setState 回调链与 env 分支的执行顺序按最终 state 等价改写：
  // - type==='inter' 且重初始化：旧版最后应用的是 initState 回调里的 initEnvState
  //   （以 data.case_env 计算请求头），即此处 initState 内部的顺序调用；
  // - type==='case' 且重初始化 + env 变化：旧版 env 分支的 initEnvState 是最后一次
  //   应用（以 cWRP 时刻的旧 case_env 计算请求头），故捕获旧值在其后调用。
  const prevDataRef = useRef(props.data);
  useEffect(() => {
    const prevData = prevDataRef.current;
    prevDataRef.current = props.data;
    const nextData = props.data;
    if (!checkInterfaceData(nextData) || !checkInterfaceData(prevData)) {
      return;
    }
    const shouldInitState =
      nextData._id !== prevData._id || nextData.interface_up_time !== prevData.interface_up_time;
    const envChanged = nextData.env !== prevData.env;
    if (shouldInitState) {
      const caseEnvAtReceive = stateRef.current.case_env;
      initState(nextData);
      if (envChanged && latestRef.current.type !== 'inter') {
        initEnvState(caseEnvAtReceive, nextData.env);
      }
    } else if (envChanged) {
      initEnvState(stateRef.current.case_env, nextData.env);
    }
  }, [props.data]);

  /**
   * @param {any} val
   * @param {any} global
   */
  const handleValue = (val, global) => {
    let globalValue = ArrayToObject(global);
    return handleParamsValue(val, {
      global: globalValue
    });
  };

  /**
   * @param {any} d
   */
  const onOpenTest = d => {
    applyState({
      test_script: d.text
    });
  };

  /**
   * @param {string} code
   */
  const handleInsertCode = code => {
    aceEditorRef.current.editor.insertCode(code);
  };

  /**
   * @param {any} d
   */
  const handleRequestBody = d => {
    applyState({
      req_body_other: d.text
    });
  };

  const reqRealInterface = async () => {
    if (stateRef.current.loading === true) {
      applyState({
        loading: false
      });
      return null;
    }
    applyState({
      loading: true
    });

    // postmanLib 的 handleParams 声明了第 3 个形参，历史调用只传 2 个实参，类型上按 any 调用放行
    let options = (/** @type {any} */ (handleParams))(stateRef.current, handleValue),
      result;


    await plugin.emitHook('before_request', options, {
      type: latestRef.current.type,
      caseId: options.caseId,
      projectId: latestRef.current.projectId,
      interfaceId: latestRef.current.interfaceId
    });

    try {
      options.taskId = latestRef.current.curUid;
      result = await crossRequest(options, options.pre_script || stateRef.current.pre_script, options.after_script || stateRef.current.after_script, createContext(
        latestRef.current.curUid,
        latestRef.current.projectId,
        latestRef.current.interfaceId
      ));

      await plugin.emitHook('after_request', result, {
        type: latestRef.current.type,
        caseId: options.caseId,
        projectId: latestRef.current.projectId,
        interfaceId: latestRef.current.interfaceId
      });

      result = {
        header: result.res.header,
        body: result.res.body,
        status: result.res.status,
        statusText: result.res.statusText,
        runTime: result.runTime
      };

    } catch (/** @type {any} */ data) {
      result = {
        header: data.header,
        body: data.body,
        status: null,
        statusText: data.message
      };
    }
    if (stateRef.current.loading === true) {
      applyState({
        loading: false
      });
    } else {
      return null;
    }

    let tempJson = result.body;
    if (tempJson && typeof tempJson === 'object') {
      result.body = JSON.stringify(tempJson, null, '  ');
      applyState({
        res_body_type: 'json'
      });
    } else if (isJson(result.body)) {
      applyState({
        res_body_type: 'json'
      });
    }

    // 对 返回值数据结构 和定义的 返回数据结构 进行 格式校验
    let validResult = resBodyValidator(latestRef.current.data, result.body);
    if (!validResult.valid) {
      applyState({ test_valid_msg: `返回参数 ${validResult.message}` });
    } else {
      applyState({ test_valid_msg: '' });
    }

    applyState({
      resStatusCode: result.status,
      resStatusText: result.statusText,
      test_res_header: result.header,
      test_res_body: result.body
    });
  };

  // 返回数据与定义数据的比较判断
  /**
   * @param {any} interfaceData
   * @param {any} test_res_body
   */
  const resBodyValidator = (interfaceData, test_res_body) => {
    const { res_body_type, res_body_is_json_schema, res_body } = interfaceData;
    /** @type {any} */
    let validResult = { valid: true };

    if (res_body_type === 'json' && res_body_is_json_schema) {
      const schema = json5_parse(res_body);
      const params = json5_parse(test_res_body);
      validResult = schemaValidator(schema, params);
    }

    return validResult;
  };

  /**
   * @param {string} name
   * @param {any} v
   * @param {number} index
   * @param {any} [key]
   */
  const changeParam = (name, v, index, key) => {

    key = key || 'value';
    const pathParam = deepCopyJson(stateRef.current[name]);

    pathParam[index][key] = v;
    if (key === 'value') {
      pathParam[index].enable = !!v;
    }
    applyState({
      [name]: pathParam
    });
  };

  /**
   * @param {any} v
   * @param {number} index
   * @param {any} [key]
   */
  const changeBody = (v, index, key) => {
    const bodyForm = deepCopyJson(stateRef.current.req_body_form);
    key = key || 'value';
    if (key === 'value') {
      bodyForm[index].enable = !!v;
      if (bodyForm[index].type === 'file') {
        bodyForm[index].value = 'file_' + index;
      } else {
        bodyForm[index].value = v;
      }
    } else if (key === 'enable') {
      bodyForm[index].enable = v;
    }
    applyState({ req_body_form: bodyForm });
  };

  // 模态框的相关操作
  /**
   * @param {any} val
   * @param {number} index
   * @param {string} type
   */
  const showModal = (val, index, type) => {
    let inputValue = '';
    let cursurPosition;
    if (type === 'req_body_other') {
      // req_body
      // 编辑器适配层提供光标绝对偏移（等价原 ace positionToIndex(getCursor())）
      cursurPosition = aceEditorRef.current.editor.editor.getCursorIndex();
      // 获取选中的数据
      inputValue = getInstallValue(val || '', cursurPosition).val;
    } else {
      // 其他input 输入
      let oTxt1 = /** @type {any} */ (document.getElementById(`${type}_${index}`));
      cursurPosition = oTxt1.selectionStart;
      inputValue = getInstallValue(val || '', cursurPosition).val;
      // cursurPosition = {row: 1, column: position}
    }

    applyState({
      modalVisible: true,
      inputIndex: index,
      inputValue,
      cursurPosition,
      modalType: type
    });
  };

  // 点击插入
  /**
   * @param {string} val
   */
  const handleModalOk = val => {
    const { inputIndex, modalType } = stateRef.current;
    if (modalType === 'req_body_other') {
      changeInstallBody(modalType, val);
    } else {
      changeInstallParam(modalType, val, inputIndex);
    }

    applyState({ modalVisible: false });
  };

  // 根据鼠标位置往req_body中动态插入数据
  /**
   * @param {string} type
   * @param {string} value
   */
  const changeInstallBody = (type, value) => {
    const pathParam = deepCopyJson(stateRef.current[type]);
    let oldValue = pathParam || '';
    let newValue = getInstallValue(oldValue, stateRef.current.cursurPosition);
    let left = newValue.left;
    let right = newValue.right;
    applyState({
      [type]: `${left}${value}${right}`
    });
  };

  // 获取截取的字符串
  /**
   * @param {string} oldValue
   * @param {number} cursurPosition
   */
  const getInstallValue = (oldValue, cursurPosition) => {
    let left = oldValue.substr(0, cursurPosition);
    let right = oldValue.substr(cursurPosition);

    let leftPostion = left.lastIndexOf('{{');
    let leftPostion2 = left.lastIndexOf('}}');
    let rightPostion = right.indexOf('}}');
    let val = '';
    // 需要切除原来的变量
    if (leftPostion !== -1 && rightPostion !== -1 && leftPostion > leftPostion2) {
      left = left.substr(0, leftPostion);
      right = right.substr(rightPostion + 2);
      val = oldValue.substring(leftPostion, cursurPosition + rightPostion + 2);
    }
    return {
      left,
      right,
      val
    };
  };

  // 根据鼠标位置动态插入数据
  /**
   * @param {string} name
   * @param {string} v
   * @param {number} index
   * @param {any} [key]
   */
  const changeInstallParam = (name, v, index, key) => {
    key = key || 'value';
    const pathParam = deepCopyJson(stateRef.current[name]);
    let oldValue = pathParam[index][key] || '';
    let newValue = getInstallValue(oldValue, stateRef.current.cursurPosition);
    let left = newValue.left;
    let right = newValue.right;
    pathParam[index][key] = `${left}${v}${right}`;
    applyState({
      [name]: pathParam
    });
  };

  // 取消参数插入
  const handleModalCancel = () => {
    applyState({ modalVisible: false, cursurPosition: -1 });
  };

  // 环境变量模态框相关操作
  const showEnvModal = () => {
    applyState({
      envModalVisible: true
    });
  };

  /**
   * @param {any} newEnv
   * @param {number} index
   */
  const handleEnvOk = (newEnv, index) => {
    applyState({
      envModalVisible: false,
      case_env: newEnv[index].name
    });
  };

  const handleEnvCancel = () => {
    applyState({
      envModalVisible: false
    });
  };

  const testResponseBodyIsHTML = () => {
    const hd = stateRef.current.test_res_header;
    return (
      hd != null &&
      typeof hd === 'object' &&
      String(hd['Content-Type'] || hd['content-type']).indexOf('text/html') !== -1
    );
  };

  const {
    method,
    env,
    path,
    req_params = [],
    req_headers = [],
    req_query = [],
    req_body_type,
    req_body_form = [],
    loading,
    case_env,
    inputValue,
    hasPlugin
  } = state;
  return (
    <div className="interface-test postman">
      <PostmanModals
        modalVisible={state.modalVisible}
        envModalVisible={state.envModalVisible}
        inputValue={inputValue}
        dataId={state._id}
        type={props.type}
        data={props.data}
        hasPlugin={hasPlugin}
        onModalCancel={handleModalCancel}
        onModalOk={handleModalOk}
        onEnvOk={handleEnvOk}
        onEnvCancel={handleEnvCancel}
      />

      <UrlBar
        method={method}
        case_env={case_env}
        env={env}
        path={path}
        hasPlugin={hasPlugin}
        loading={loading}
        type={props.type}
        onSelectDomain={selectDomain}
        onShowEnvModal={showEnvModal}
        onSend={reqRealInterface}
        onSave={props.save}
      />

      <RequestParamsPanel
        method={method}
        req_params={req_params}
        req_query={req_query}
        req_headers={req_headers}
        req_body_type={req_body_type}
        req_body_form={req_body_form}
        req_body_other={state.req_body_other}
        editorRef={aceEditorRef}
        onChangeParam={changeParam}
        onShowModal={showModal}
        onBodyChange={handleRequestBody}
        onFormChange={changeBody}
      />

      <Tabs
        size="large"
        defaultActiveKey="res"
        className="response-tab"
        items={[
          {
            label: 'Response',
            key: 'res',
            children: (
              <ResponsePanel
                loading={loading}
                resStatusCode={state.resStatusCode}
                resStatusText={state.resStatusText}
                test_valid_msg={state.test_valid_msg}
                autoPreviewHTML={state.autoPreviewHTML}
                test_res_header={state.test_res_header}
                test_res_body={state.test_res_body}
                previewHtml={state.autoPreviewHTML && testResponseBodyIsHTML()}
                onAutoPreviewChange={(/** @type {any} */ autoPreviewHTML) =>
                  applyState({ autoPreviewHTML })
                }
              />
            )
          },
          ...(props.type === 'case'
            ? [
                {
                  className: 'response-test',
                  label: (
                    <Tooltip title="测试脚本，可断言返回结果，使用方法请查看文档">Test</Tooltip>
                  ),
                  key: 'test',
                  children: (
                    <TestPanel
                      enable_script={state.enable_script}
                      test_script={state.test_script}
                      editorRef={aceEditorRef}
                      onEnableScriptChange={(/** @type {any} */ enable_script) =>
                        applyState({ enable_script })
                      }
                      onScriptChange={onOpenTest}
                      onInsertCode={handleInsertCode}
                    />
                  )
                }
              ]
            : [])
        ]}
      />
    </div>
  );
});

Run.displayName = 'Run';

Run.propTypes = {
  data: PropTypes.object, //接口原有数据
  save: PropTypes.func, //保存回调方法
  type: PropTypes.string, //enum[case, inter], 判断是在接口页面使用还是在测试集
  curUid: PropTypes.number.isRequired,
  interfaceId: PropTypes.number.isRequired,
  projectId: PropTypes.number.isRequired
};

export default Run;

// @ts-check
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { handlePath as handlePathUtil } from '../../../../common.js';
import { changeEditStatus } from '../../../../reducer/modules/interface.js';
// group 切片已迁至 Zustand（批次3），inter/project 模块仍未迁移
import useGroupStore from '../../../../store/groupStore';
import json5 from 'json5';
import { message, Affix, Form, Button } from 'antd';
import mockEditor from 'client/components/AceEditor/mockEditor';
import axios from 'axios';
import {
  HTTP_METHOD,
  checkIsJsonSchema,
  dataTpl,
  initState,
  validJson
} from './interfaceEditFormUtils/formDefaults.js';
// render 子组件化（第三批）：本文件仅保留 hooks / 副作用 / 事件处理 + 渲染组装，
// 各 JSX 区块按边界拆入 InterfaceEditFormParts/：
//   - BulkImportModal.js      批量添加参数弹窗
//   - BasicSettingPanel.js    基本设置（名称/分类/路径+方法+路径参数/Tag/状态/自定义字段）
//   - RequestParamsSetting.js 请求参数设置（页签 + Query / Headers 区块）
//   - RequestBodySetting.js   BODY 区块（form 行 / json-schema 编辑器 / file / raw）
//   - ResponseSetting.js      返回数据设置（JSON/RAW 页签、schema 编辑器、mock 预览容器）
//   - RemarkSetting.js        备注（MarkdownEditor）
//   - OtherSetting.js         其他（消息通知 / 开放接口开关）
//   - schemaEditors.js        json-schema 编辑器单例（ResBodySchema / ReqBodySchema）
// 子组件一律「受控展示 + 事件回调上抛」：不持有业务状态、不引入包装 DOM 元素；
// antd Form 接线（字段注册 / 校验 / 回填）与编辑器 ref 装配（mockPreviewRef /
// resBodyEditorRef / editorRef）完整保留在本文件，抽取前后 DOM 逐字节等价
// （7 场景 + nomethod 崩溃等价独立进程比对，见交付报告）。
import BulkImportModal from './InterfaceEditFormParts/BulkImportModal.js';
import BasicSettingPanel from './InterfaceEditFormParts/BasicSettingPanel.js';
import RequestParamsSetting from './InterfaceEditFormParts/RequestParamsSetting.js';
import RequestBodySetting from './InterfaceEditFormParts/RequestBodySetting.js';
import ResponseSetting from './InterfaceEditFormParts/ResponseSetting.js';
import RemarkSetting from './InterfaceEditFormParts/RemarkSetting.js';
import OtherSetting from './InterfaceEditFormParts/OtherSetting.js';

const FormItem = Form.Item;

function InterfaceEditForm(/** @type {any} */ props) {
  const [form] = Form.useForm();
  const custom_field = useGroupStore(state => state.field);
  const [state, setState] = useState(() => {
    const initStateData = initState(props.curdata, props.mockUrl);
    // 原 componentDidMount 中对 req_radio_type 的初始化；缺陷打捞：method 缺失/小写时
    // HTTP_METHOD[...] 为 undefined（原实现直接 .request_body 崩溃），归一化后回退 req-query
    const methodConfig = HTTP_METHOD[String(initStateData.method || '').toUpperCase()];
    initStateData.req_radio_type = methodConfig && methodConfig.request_body
      ? 'req-body'
      : 'req-query';
    return initStateData;
  });
  const editorRef = useRef(null);
  const mockPreviewRef = useRef(null);
  const resBodyEditorRef = useRef(null);
  const isMountedRef = useRef(false);
  const startTimeRef = useRef(new Date().getTime());

  // antd3 在渲染时直接 getFieldValue 读取以下字段控制显隐;
  // antd4 需通过 useWatch 订阅,初值未同步时回退到本地 state(语义与注册初始值一致)
  const reqBodyType =
    Form.useWatch('req_body_type', form) ??
    (HTTP_METHOD[state.method].request_body ? state.req_body_type : undefined);
  const resBodyType = Form.useWatch('res_body_type', form) ?? state.res_body_type;
  const reqBodyIsJsonSchema =
    Form.useWatch('req_body_is_json_schema', form) ??
    (state.req_body_is_json_schema || !props.projectMsg.is_json5);
  const resBodyIsJsonSchema =
    Form.useWatch('res_body_is_json_schema', form) ??
    (state.res_body_is_json_schema || !props.projectMsg.is_json5);

  useEffect(() => {
    isMountedRef.current = true;

    mockPreviewRef.current = mockEditor({
      container: 'mock-preview',
      data: '',
      readOnly: true
    });

    return () => {
      props.changeEditStatus(false);
      isMountedRef.current = false;
    };
  }, []);

  const scheduleSubmitReset = () => {
    setTimeout(() => {
      if (isMountedRef.current) {
        setState((/** @type {any} */ prev) => ({ ...prev, submitStatus: false }));
      }
    }, 3000);
  };

  // 表单校验成功(antd3 在 validateFields 回调的 !err 分支处理)
  const handleFinish = async (/** @type {any} */ values) => {
    setState((/** @type {any} */ prev) => ({ ...prev, submitStatus: true }));
    scheduleSubmitReset();
    values.desc = editorRef.current.getHtml();
    values.markdown = editorRef.current.getMarkdown();
    if (values.res_body_type === 'json') {
      if (state.res_body && validJson(state.res_body) === false) {
        return message.error('返回body json格式有问题，请检查！');
      }
      try {
        values.res_body = JSON.stringify(JSON.parse(state.res_body), null, '   ');
      } catch (e) {
        values.res_body = state.res_body;
      }
    }
    if (values.req_body_type === 'json') {
      if (state.req_body_other && validJson(state.req_body_other) === false) {
        return message.error('响应Body json格式有问题，请检查！');
      }
      try {
        values.req_body_other = JSON.stringify(JSON.parse(state.req_body_other), null, '   ');
      } catch (e) {
        values.req_body_other = state.req_body_other;
      }
    }

    values.method = state.method;
    values.req_params = values.req_params || [];
    values.req_headers = values.req_headers || [];
    values.req_body_form = values.req_body_form || [];
    let isfile = false,
      isHaveContentType = false;
    if (values.req_body_type === 'form') {
      values.req_body_form.forEach((/** @type {any} */ item) => {
        if (item.type === 'file') {
          isfile = true;
        }
      });

      values.req_headers.map((/** @type {any} */ item) => {
        if (item.name === 'Content-Type') {
          item.value = isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
          isHaveContentType = true;
        }
      });
      if (isHaveContentType === false) {
        values.req_headers.unshift({
          name: 'Content-Type',
          value: isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
        });
      }
    } else if (values.req_body_type === 'json') {
      values.req_headers
        ? values.req_headers.map((/** @type {any} */ item) => {
            if (item.name === 'Content-Type') {
              item.value = 'application/json';
              isHaveContentType = true;
            }
          })
        : [];
      if (isHaveContentType === false) {
        values.req_headers = values.req_headers || [];
        values.req_headers.unshift({
          name: 'Content-Type',
          value: 'application/json'
        });
      }
    }
    values.req_headers = values.req_headers
      ? values.req_headers.filter((/** @type {any} */ item) => item.name !== '')
      : [];

    values.req_body_form = values.req_body_form
      ? values.req_body_form.filter((/** @type {any} */ item) => item.name !== '')
      : [];
    values.req_params = values.req_params
      ? values.req_params.filter((/** @type {any} */ item) => item.name !== '')
      : [];
    values.req_query = values.req_query
      ? values.req_query.filter((/** @type {any} */ item) => item.name !== '')
      : [];

    if (HTTP_METHOD[values.method].request_body !== true) {
      values.req_body_form = [];
    }

    if (
      values.req_body_is_json_schema &&
      values.req_body_other &&
      values.req_body_type === 'json'
    ) {
      values.req_body_other = checkIsJsonSchema(values.req_body_other);
      if (!values.req_body_other) {
        return message.error('请求参数 json-schema 格式有误');
      }
    }
    if (
      values.res_body_is_json_schema &&
      values.res_body &&
      values.res_body_type === 'json'
    ) {
      values.res_body = checkIsJsonSchema(values.res_body);
      if (!values.res_body) {
        return message.error('返回数据 json-schema 格式有误');
      }
    }

    const saved = await props.onSubmit(values);
    // 只有保存成功才清除未保存状态，失败时保留离开页面提示。
    if (saved !== false) {
      props.changeEditStatus(false);
    }
  };

  // 校验失败时同样复位提交状态(antd3 回调在校验失败分支也会调度 3s 复位)
  const handleFinishFailed = () => {
    setState((/** @type {any} */ prev) => ({ ...prev, submitStatus: true }));
    scheduleSubmitReset();
  };

  /**
   * @param {any} val
   * @returns {void}
   */
  const onChangeMethod = val => {
    let radio = [];
    if (HTTP_METHOD[val].request_body) {
      radio = ['req', 'body'];
    } else {
      radio = ['req', 'query'];
    }

    setState((/** @type {any} */ prev) => ({
      ...prev,
      req_radio_type: radio.join('-'),
      method: val
    }));
    _changeRadioGroup(radio[0], radio[1]);
  };

  /**
   * @param {any} name
   * @param {any} [data]
   * @returns {void}
   */
  const addParams = (name, data) => {
    data = data || dataTpl[name];
    setState((/** @type {any} */ prev) => ({ ...prev, [name]: [].concat(prev[name], data) }));
  };

  /**
   * @param {any} key
   * @param {any} name
   * @returns {void}
   */
  const delParams = (key, name) => {
    let curValue = form.getFieldValue(name);
    let newValue = curValue.filter((/** @type {any} */ val, /** @type {any} */ index) => {
      return index !== key;
    });
    form.setFieldsValue({ [name]: newValue });
    setState((/** @type {any} */ prev) => ({ ...prev, [name]: newValue }));
  };

  const handleMockPreview = async () => {
    let str = '';

    try {
      if (form.getFieldValue('res_body_is_json_schema')) {
        let schema = json5.parse(form.getFieldValue('res_body'));
        let result = await axios.post('/api/interface/schema2json', {
          schema: schema
        });
        return mockPreviewRef.current.setValue(JSON.stringify(result.data));
      }
      if (resBodyEditorRef.current.editor.curData.format === true) {
        str = JSON.stringify(resBodyEditorRef.current.editor.curData.mockData(), null, '  ');
      } else {
        str = '解析出错: ' + resBodyEditorRef.current.editor.curData.format;
      }
    } catch (/** @type {any} */ err) {
      str = '解析出错: ' + err.message;
    }
    mockPreviewRef.current.setValue(str);
  };

  /**
   * @param {any} key
   * @returns {void}
   */
  const handleJsonType = key => {
    key = key || 'tpl';
    if (key === 'preview') {
      handleMockPreview();
    }
    setState((/** @type {any} */ prev) => ({
      ...prev,
      jsonType: key
    }));
  };

  /**
   * @param {any} e
   * @returns {void}
   */
  const handlePath = e => {
    let val = e.target.value,
      queue = /** @type {any[]} */ ([]);

    /**
     * @param {any} name
     */
    let insertParams = name => {
      let findExist = state.req_params.find((/** @type {any} */ item) => item.name === name);
      if (findExist) {
        queue.push(findExist);
      } else {
        queue.push({ name: name, desc: '' });
      }
    };
    val = handlePathUtil(val);
    form.setFieldsValue({
      path: val
    });
    if (val && val.indexOf(':') !== -1) {
      let paths = val.split('/'),
        name,
        i;
      for (i = 1; i < paths.length; i++) {
        if (paths[i][0] === ':') {
          name = paths[i].substr(1);
          insertParams(name);
        }
      }
    }

    if (val && val.length > 3) {
      val.replace(/\{(.+?)\}/g, function (/** @type {any} */ str, /** @type {any} */ match) {
        insertParams(match);
      });
    }
    setState((/** @type {any} */ prev) => ({
      ...prev,
      req_params: queue
    }));
  };

  // 点击切换radio
  /**
   * @param {any} e
   * @returns {void}
   */
  const changeRadioGroup = e => {
    const res = e.target.value.split('-');
    if (res[0] === 'req') {
      setState((/** @type {any} */ prev) => ({
        ...prev,
        req_radio_type: e.target.value
      }));
    }
    _changeRadioGroup(res[0], res[1]);
  };

  /**
   * @param {any} group
   * @param {any} item
   * @returns {void}
   */
  const _changeRadioGroup = (group, item) => {
    const obj = /** @type {any} */ ({});
    // 先全部隐藏
    for (let key in state.hideTabs[group]) {
      obj[key] = 'hide';
    }
    // 再取消选中项目的隐藏
    obj[item] = '';
    setState((/** @type {any} */ prev) => ({
      ...prev,
      hideTabs: {
        ...prev.hideTabs,
        [group]: obj
      }
    }));
  };

  /**
   * @param {any} name
   * @returns {any}
   */
  const handleDragMove = name => {
    return (/** @type {any} */ data) => {
      let newValue = {
        [name]: data
      };
      form.setFieldsValue(newValue);
      setState((/** @type {any} */ prev) => ({ ...prev, [name]: data }));
    };
  };

  // 处理res_body Editor
  /**
   * @param {any} d
   * @returns {void}
   */
  const handleResBody = d => {
    const initResBody = state.res_body;
    setState((/** @type {any} */ prev) => ({
      ...prev,
      res_body: d.text
    }));
    props.changeEditStatus(initResBody !== d.text);
  };

  // 处理 res_body 的 json-schema 编辑器（原 JSX 内联 onChange 上移到父组件）
  /**
   * @param {any} text
   * @returns {void}
   */
  const handleResBodySchemaChange = text => {
    setState((/** @type {any} */ prev) => ({
      ...prev,
      res_body: text
    }));
    if (new Date().getTime() - startTimeRef.current > 1000) {
      props.changeEditStatus(true);
    }
  };

  // 处理 req_body_other Editor
  /**
   * @param {any} d
   * @returns {void}
   */
  const handleReqBody = d => {
    const initReqBody = state.req_body_other;
    setState((/** @type {any} */ prev) => ({
      ...prev,
      req_body_other: d.text
    }));
    props.changeEditStatus(initReqBody !== d.text);
  };

  // 处理 req_body_other 的 json-schema 编辑器（原 JSX 内联 onChange 上移到父组件）
  /**
   * @param {any} text
   * @returns {void}
   */
  const handleReqBodySchemaChange = text => {
    setState((/** @type {any} */ prev) => ({
      ...prev,
      req_body_other: text
    }));
    if (new Date().getTime() - startTimeRef.current > 1000) {
      props.changeEditStatus(true);
    }
  };

  // 处理批量导入参数
  const handleBulkOk = () => {
    let curValue = form.getFieldValue(state.bulkName) || [];
    // { name: '', required: '1', desc: '', example: '' }
    let newValue = /** @type {any[]} */ ([]);

    state.bulkValue.split('\n').forEach(
      (/** @type {any} */ item, /** @type {any} */ index) => {
        let valueItem = Object.assign({}, curValue[index] || dataTpl[state.bulkName]);
        let indexOfColon = item.indexOf(':');
        if (indexOfColon !== -1) {
          valueItem.name = item.substring(0, indexOfColon);
          valueItem.example = item.substring(indexOfColon + 1) || '';
          newValue.push(valueItem);
        }
      }
    );

    form.setFieldsValue({ [state.bulkName]: newValue });
    setState((/** @type {any} */ prev) => ({
      ...prev,
      visible: false,
      bulkValue: null,
      bulkName: null,
      [state.bulkName]: newValue
    }));
  };

  // 取消批量导入参数
  const handleBulkCancel = () => {
    setState((/** @type {any} */ prev) => ({
      ...prev,
      visible: false,
      bulkValue: null,
      bulkName: null
    }));
  };

  /**
   * @param {any} name
   * @returns {void}
   */
  const showBulk = name => {
    let value = form.getFieldValue(name);

    let bulkValue = ``;
    if (value) {
      value.forEach((/** @type {any} */ item) => {
        return (bulkValue += item.name ? `${item.name}:${item.example || ''}\n` : '');
      });
    }

    setState((/** @type {any} */ prev) => ({
      ...prev,
      visible: true,
      bulkValue,
      bulkName: name
    }));
  };

  /**
   * @param {any} e
   * @returns {void}
   */
  const handleBulkValueInput = e => {
    setState((/** @type {any} */ prev) => ({
      ...prev,
      bulkValue: e.target.value
    }));
  };

  const { projectMsg } = props;

  return (
    <div>
      <BulkImportModal
        visible={state.visible}
        value={state.bulkValue}
        onChange={handleBulkValueInput}
        onOk={handleBulkOk}
        onCancel={handleBulkCancel}
      />
      <Form form={form} onFinish={handleFinish} onFinishFailed={handleFinishFailed} onValuesChange={() => props.changeEditStatus(true)} preserve={false}>
        <BasicSettingPanel
          basepath={props.basepath}
          cat={props.cat}
          custom_field={custom_field}
          tags={projectMsg.tag}
          title={state.title}
          catid={state.catid}
          method={state.method}
          path={state.path}
          tag={state.tag}
          status={state.status}
          custom_field_value={state.custom_field_value}
          req_params={state.req_params}
          onChangeMethod={onChangeMethod}
          onPathChange={handlePath}
          onTagClick={props.onTagClick}
        />

        <RequestParamsSetting
          method={state.method}
          req_radio_type={state.req_radio_type}
          reqHideTabs={state.hideTabs.req}
          req_query={state.req_query}
          req_headers={state.req_headers}
          onRadioChange={changeRadioGroup}
          onAddParams={addParams}
          onShowBulk={showBulk}
          onDragMove={handleDragMove}
          onDelParams={delParams}
        >
          <RequestBodySetting
            method={state.method}
            reqBodyType={reqBodyType}
            reqBodyIsJsonSchema={reqBodyIsJsonSchema}
            isJson5={projectMsg.is_json5}
            req_body_type={state.req_body_type}
            req_body_other={state.req_body_other}
            req_body_form={state.req_body_form}
            req_body_is_json_schema={state.req_body_is_json_schema}
            bodyHideTab={state.hideTabs.req.body}
            onAddParams={addParams}
            onShowBulk={showBulk}
            onDragMove={handleDragMove}
            onDelParams={delParams}
            onReqBodyChange={handleReqBody}
            onReqBodySchemaChange={handleReqBodySchemaChange}
          />
        </RequestParamsSetting>

        <ResponseSetting
          isJson5={projectMsg.is_json5}
          resBodyType={resBodyType}
          resBodyIsJsonSchema={resBodyIsJsonSchema}
          res_body_type={state.res_body_type}
          res_body={state.res_body}
          res_body_is_json_schema={state.res_body_is_json_schema}
          jsonType={state.jsonType}
          onJsonTypeChange={handleJsonType}
          onResBodyChange={handleResBody}
          onResBodySchemaChange={handleResBodySchemaChange}
          editorRef={resBodyEditorRef}
        />

        <RemarkSetting editorRef={editorRef} value={state.markdown || state.desc} />

        <OtherSetting noticed={props.noticed} api_opened={state.api_opened} />

        <FormItem
          className="interface-edit-item"
          style={{ textAlign: 'center', marginTop: '16px' }}
        >
          {/* <Button type="primary" htmlType="submit">保存1</Button> */}
          <Affix offsetBottom={0}>
            <Button
              className="interface-edit-submit-button"
              disabled={state.submitStatus}
              size="large"
              htmlType="submit"
            >
              保存
            </Button>
          </Affix>
        </FormItem>
      </Form>
    </div>
  );
}

InterfaceEditForm.propTypes = {
  curdata: PropTypes.object,
  mockUrl: PropTypes.string,
  onSubmit: PropTypes.func,
  basepath: PropTypes.string,
  noticed: PropTypes.bool,
  cat: PropTypes.array,
  changeEditStatus: PropTypes.func,
  projectMsg: PropTypes.object,
  onTagClick: PropTypes.func
};

export default connect(
  (/** @type {any} */ state) => {
    return {
      projectMsg: state.project.currProject
    };
  },
  {
    changeEditStatus
  }
)(InterfaceEditForm);
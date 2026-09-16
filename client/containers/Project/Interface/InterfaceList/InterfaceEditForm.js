// @ts-check
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import constants from '../../../../constants/variable.js';
import { handlePath as handlePathUtil, nameLengthLimit } from '../../../../common.js';
import { changeEditStatus } from '../../../../reducer/modules/interface.js';
import { formatCatTreeData } from 'common/utils.js';
import json5 from 'json5';
import { message, Affix, Tabs, Modal } from 'antd';
import EasyDragSort from '../../../../components/EasyDragSort/EasyDragSort.js';
import mockEditor from 'client/components/AceEditor/mockEditor';
import AceEditor from 'client/components/AceEditor/AceEditor';
import MarkdownEditor from '../../../../components/MarkdownEditor/index';
import axios from 'axios';
import { MOCK_SOURCE } from '../../../../constants/variable.js';
const jSchema = require('json-schema-editor-visual');
const ResBodySchema = jSchema({ lang: 'zh_CN', mock: MOCK_SOURCE });
const ReqBodySchema = jSchema({ lang: 'zh_CN', mock: MOCK_SOURCE });
// 编辑器内嵌 antd3 的全量样式:经 build/json-schema-css-scope-loader.js 把选择器
// 前缀化为 `.json-schema-editor-scope `,仅作用于下方编辑器容器,不再全局加载。
import 'json-schema-editor-visual/node_modules/antd/dist/antd.css';


/**
 * @param {any} json
 * @returns {any}
 */
function checkIsJsonSchema(json) {
  try {
    json = json5.parse(json);
    if (json.properties && typeof json.properties === 'object' && !json.type) {
      json.type = 'object';
    }
    if (json.items && typeof json.items === 'object' && !json.type) {
      json.type = 'array';
    }
    if (!json.type) {
      return false;
    }
    json.type = json.type.toLowerCase();
    let types = ['object', 'string', 'number', 'array', 'boolean', 'integer'];
    if (types.indexOf(json.type) === -1) {
      return false;
    }
    return JSON.stringify(json);
  } catch (e) {
    return false;
  }
}

/**
 * @param {any} json
 * @returns {boolean}
 */
const validJson = json => {
  try {
    json5.parse(json);
    return true;
  } catch (e) {
    return false;
  }
};

import {
  Select,
  TreeSelect,
  Input,
  Tooltip,
  Button,
  Row,
  Col,
  Radio,
  AutoComplete,
  Switch,
  Form
} from 'antd';

import {
  BarsOutlined,
  DeleteOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';

const Json5Example = `
  {
    /**
     * info
     */

    "id": 1 //appId
  }

`;

const TextArea = Input.TextArea;
const FormItem = Form.Item;
const Option = Select.Option;
const InputGroup = Input.Group;
const RadioButton = Radio.Button;
const RadioGroup = Radio.Group;
/**
 * @type {any}
 */
const dataTpl = {
  req_query: { name: '', required: '1', desc: '', example: '' },
  req_headers: { name: '', required: '1', desc: '', example: '' },
  req_params: { name: '', desc: '', example: '' },
  req_body_form: {
    name: '',
    type: 'text',
    required: '1',
    desc: '',
    example: ''
  }
};

const HTTP_METHOD = /** @type {any} */ (constants.HTTP_METHOD);
const HTTP_METHOD_KEYS = Object.keys(HTTP_METHOD);
const HTTP_REQUEST_HEADER = constants.HTTP_REQUEST_HEADER;

/**
 * @param {any} curdata
 * @param {any} mockUrl
 * @returns {any}
 */
function initState(curdata, mockUrl) {
  const startTime = new Date().getTime();
  // 编辑表单只处理副本，避免初始化时直接修改 Redux 中的历史接口数据。
  curdata = JSON.parse(JSON.stringify(curdata || {}));
  if (curdata.req_query && curdata.req_query.length === 0) {
    delete curdata.req_query;
  }
  if (curdata.req_headers && curdata.req_headers.length === 0) {
    delete curdata.req_headers;
  }
  if (curdata.req_body_form && curdata.req_body_form.length === 0) {
    delete curdata.req_body_form;
  }
  if (curdata.req_params && curdata.req_params.length === 0) {
    delete curdata.req_params;
  }
  if (curdata.req_body_form) {
    curdata.req_body_form = curdata.req_body_form.map((/** @type {any} */ item) => {
      item.type = item.type === 'text' ? 'text' : 'file';
      return item;
    });
  }
  // 设置标签的展开与折叠
  curdata['hideTabs'] = {
    req: {
      body: 'hide',
      query: 'hide',
      headers: 'hide'
    }
  };
  const methodConfig = HTTP_METHOD[curdata.method] || HTTP_METHOD.get;
  curdata['hideTabs']['req'][methodConfig.default_tab] = '';
  return Object.assign(
    {
      submitStatus: false,
      title: '',
      path: '',
      status: 'undone',
      method: 'get',

      req_params: [],

      req_query: [
        {
          name: '',
          desc: '',
          required: '1'
        }
      ],

      req_headers: [
        {
          name: '',
          value: '',
          required: '1'
        }
      ],

      req_body_type: 'form',
      req_body_form: [
        {
          name: '',
          type: 'text',
          required: '1'
        }
      ],
      req_body_other: '',

      res_body_type: 'json',
      res_body: '',
      desc: '',
      res_body_mock: '',
      jsonType: 'tpl',
      mockUrl: mockUrl,
      req_radio_type: 'req-query',
      custom_field_value: '',
      api_opened: false,
      visible: false
    },
    curdata,
    { startTime }
  );
}

function InterfaceEditForm(/** @type {any} */ props) {
  const [form] = Form.useForm();
  const [state, setState] = useState(() => {
    const initStateData = initState(props.curdata, props.mockUrl);
    // 原 componentDidMount 中对 req_radio_type 的初始化
    initStateData.req_radio_type = HTTP_METHOD[initStateData.method].request_body
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

  const { custom_field, projectMsg } = props;

  const formItemLayout = {
    labelCol: { span: 4 },
    wrapperCol: { span: 18 }
  };

  const res_body_use_schema_editor = checkIsJsonSchema(state.res_body) || '';

  const req_body_other_use_schema_editor = checkIsJsonSchema(state.req_body_other) || '';

  /**
   * @param {any} data
   * @param {any} index
   * @returns {any}
   */
  const queryTpl = (data, index) => {
    return (
      <Row key={index} className="interface-edit-item-content">
        <Col
          span="1"
          easy_drag_sort_child="true"
          className="interface-edit-item-content-col interface-edit-item-content-col-drag"
        >
          <BarsOutlined />
        </Col>
        <Col span="4" draggable="false" className="interface-edit-item-content-col">
          <FormItem name={['req_query', index, 'name']} initialValue={data.name}>
            <Input placeholder="参数名称" />
          </FormItem>
        </Col>
        <Col span="3" className="interface-edit-item-content-col">
          <FormItem name={['req_query', index, 'required']} initialValue={data.required}>
            <Select>
              <Option value="1">必需</Option>
              <Option value="0">非必需</Option>
            </Select>
          </FormItem>
        </Col>
        <Col span="6" className="interface-edit-item-content-col">
          <FormItem name={['req_query', index, 'example']} initialValue={data.example}>
            <TextArea autosize={true} placeholder="参数示例" />
          </FormItem>
        </Col>
        <Col span="9" className="interface-edit-item-content-col">
          <FormItem name={['req_query', index, 'desc']} initialValue={data.desc}>
            <TextArea autosize={true} placeholder="备注" />
          </FormItem>
        </Col>
        <Col span="1" className="interface-edit-item-content-col">
          <DeleteOutlined
            className="interface-edit-del-icon"
            onClick={() => delParams(index, 'req_query')}
          />
        </Col>
      </Row>
    );
  };

  /**
   * @param {any} data
   * @param {any} index
   * @returns {any}
   */
  const headerTpl = (data, index) => {
    return (
      <Row key={index} className="interface-edit-item-content">
        <Col
          span="1"
          easy_drag_sort_child="true"
          className="interface-edit-item-content-col interface-edit-item-content-col-drag"
        >
          <BarsOutlined />
        </Col>
        <Col span="4" className="interface-edit-item-content-col">
          <FormItem name={['req_headers', index, 'name']} initialValue={data.name}>
            <AutoComplete
              options={HTTP_REQUEST_HEADER.map(item => ({ value: item, label: item }))}
              filterOption={(/** @type {any} */ inputValue, /** @type {any} */ option) =>
                option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              placeholder="参数名称"
            />
          </FormItem>
        </Col>
        <Col span="5" className="interface-edit-item-content-col">
          <FormItem name={['req_headers', index, 'value']} initialValue={data.value}>
            <Input placeholder="参数值" />
          </FormItem>
        </Col>
        <Col span="5" className="interface-edit-item-content-col">
          <FormItem name={['req_headers', index, 'example']} initialValue={data.example}>
            <TextArea autosize={true} placeholder="参数示例" />
          </FormItem>
        </Col>
        <Col span="8" className="interface-edit-item-content-col">
          <FormItem name={['req_headers', index, 'desc']} initialValue={data.desc}>
            <TextArea autosize={true} placeholder="备注" />
          </FormItem>
        </Col>
        <Col span="1" className="interface-edit-item-content-col">
          <DeleteOutlined
            className="interface-edit-del-icon"
            onClick={() => delParams(index, 'req_headers')}
          />
        </Col>
      </Row>
    );
  };

  /**
   * @param {any} data
   * @param {any} index
   * @returns {any}
   */
  const requestBodyTpl = (data, index) => {
    return (
      <Row key={index} className="interface-edit-item-content">
        <Col
          span="1"
          easy_drag_sort_child="true"
          className="interface-edit-item-content-col interface-edit-item-content-col-drag"
        >
          <BarsOutlined />
        </Col>
        <Col span="4" className="interface-edit-item-content-col">
          <FormItem name={['req_body_form', index, 'name']} initialValue={data.name}>
            <Input placeholder="name" />
          </FormItem>
        </Col>
        <Col span="3" className="interface-edit-item-content-col">
          <FormItem name={['req_body_form', index, 'type']} initialValue={data.type}>
            <Select>
              <Option value="text">text</Option>
              <Option value="file">file</Option>
            </Select>
          </FormItem>
        </Col>
        <Col span="3" className="interface-edit-item-content-col">
          <FormItem name={['req_body_form', index, 'required']} initialValue={data.required}>
            <Select>
              <Option value="1">必需</Option>
              <Option value="0">非必需</Option>
            </Select>
          </FormItem>
        </Col>
        <Col span="5" className="interface-edit-item-content-col">
          <FormItem name={['req_body_form', index, 'example']} initialValue={data.example}>
            <TextArea autosize={true} placeholder="参数示例" />
          </FormItem>
        </Col>
        <Col span="7" className="interface-edit-item-content-col">
          <FormItem name={['req_body_form', index, 'desc']} initialValue={data.desc}>
            <TextArea autosize={true} placeholder="备注" />
          </FormItem>
        </Col>
        <Col span="1" className="interface-edit-item-content-col">
          <DeleteOutlined
            className="interface-edit-del-icon"
            onClick={() => delParams(index, 'req_body_form')}
          />
        </Col>
      </Row>
    );
  };

  /**
   * @param {any} data
   * @param {any} index
   * @returns {any}
   */
  const paramsTpl = (data, index) => {
    return (
      <Row key={index} className="interface-edit-item-content">
        <Col span="6" className="interface-edit-item-content-col">
          <FormItem name={['req_params', index, 'name']} initialValue={data.name}>
            <Input disabled placeholder="参数名称" />
          </FormItem>
        </Col>
        <Col span="7" className="interface-edit-item-content-col">
          <FormItem name={['req_params', index, 'example']} initialValue={data.example}>
            <TextArea autosize={true} placeholder="参数示例" />
          </FormItem>
        </Col>
        <Col span="11" className="interface-edit-item-content-col">
          <FormItem name={['req_params', index, 'desc']} initialValue={data.desc}>
            <TextArea autosize={true} placeholder="备注" />
          </FormItem>
        </Col>
      </Row>
    );
  };

  const paramsList = state.req_params.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return paramsTpl(item, index);
  });

  const QueryList = state.req_query.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return queryTpl(item, index);
  });

  const headerList = state.req_headers.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return headerTpl(item, index);
  });

  const requestBodyList = state.req_body_form.map(
    (/** @type {any} */ item, /** @type {any} */ index) => {
      return requestBodyTpl(item, index);
    }
  );

  const DEMOPATH = '/api/user/{id}';

  return (
    <div>
      <Modal
        title="批量添加参数"
        width={680}
        open={state.visible}
        onOk={handleBulkOk}
        onCancel={handleBulkCancel}
        okText="导入"
      >
        <div>
          <TextArea
            placeholder="每行一个name:examples"
            autosize={{ minRows: 6, maxRows: 10 }}
            value={state.bulkValue}
            onChange={handleBulkValueInput}
          />
        </div>
      </Modal>
      <Form form={form} onFinish={handleFinish} onFinishFailed={handleFinishFailed} onValuesChange={() => props.changeEditStatus(true)} preserve={false}>
        <h2 className="interface-title" style={{ marginTop: 0 }}>
          基本设置
        </h2>
        <div className="panel-sub">
          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label="接口名称"
            name="title"
            initialValue={state.title}
            rules={nameLengthLimit('接口')}
          >
            <Input id="title" placeholder="接口名称" />
          </FormItem>

          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label="选择分类"
            name="catid"
            initialValue={state.catid + ''}
            rules={[{ required: true, message: '请选择一个分类' }]}
          >
            <TreeSelect
              treeData={formatCatTreeData(props.cat)}
              placeholder="请选择一个分类"
              treeDefaultExpandAll={true}
              dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
            />
          </FormItem>

          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label={
              <span>
                接口路径&nbsp;
                <Tooltip
                  title={
                    <div>
                      <p>
                        1. 支持动态路由,例如:
                        {DEMOPATH}
                      </p>
                      <p>
                        2. 支持 ?controller=xxx 的QueryRouter,非router的Query参数请定义到
                        Request设置-&#62;Query
                      </p>
                    </div>
                  }
                >
                  <QuestionCircleOutlined style={{ width: '10px' }} />
                </Tooltip>
              </span>
            }
          >
            <InputGroup compact>
              <Select value={state.method} onChange={onChangeMethod} style={{ width: '15%' }}>
                {HTTP_METHOD_KEYS.map(item => {
                  return (
                    <Option key={item} value={item}>
                      {item}
                    </Option>
                  );
                })}
              </Select>

              <Tooltip
                title="接口基本路径，可在 项目设置 里修改"
                style={{
                  display: props.basepath == '' ? 'block' : 'none'
                }}
              >
                <Input
                  disabled
                  value={props.basepath}
                  readOnly
                  onChange={() => {}}
                  style={{ width: '25%' }}
                />
              </Tooltip>
              <FormItem
                name="path"
                noStyle
                initialValue={state.path}
                rules={[
                  {
                    required: true,
                    message: '请输入接口路径!'
                  }
                ]}
              >
                <Input onChange={handlePath} placeholder="/path" style={{ width: '60%' }} />
              </FormItem>
            </InputGroup>
            <Row className="interface-edit-item">
              <Col span={24} offset={0}>
                {paramsList}
              </Col>
            </Row>
          </FormItem>
          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label="Tag"
            name="tag"
            initialValue={state.tag}
          >
            <Select placeholder="请选择 tag " mode="multiple">
              {projectMsg.tag.map((/** @type {any} */ item) => {
                return (
                  <Option value={item.name} key={item._id}>
                    {item.name}
                  </Option>
                );
              })}
              <Option value="tag设置" disabled style={{ cursor: 'pointer', color: '#2395f1' }}>
                <Button type="primary" onClick={props.onTagClick}>
                  Tag设置
                </Button>
              </Option>
            </Select>
          </FormItem>
          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label="状态"
            name="status"
            initialValue={state.status}
          >
            <Select>
              <Option value="done">已完成</Option>
              <Option value="undone">未完成</Option>
            </Select>
          </FormItem>
          {custom_field.enable && (
            <FormItem
              className="interface-edit-item"
              {...formItemLayout}
              label={custom_field.name}
              name="custom_field_value"
              initialValue={state.custom_field_value}
            >
              <Input placeholder="请输入" />
            </FormItem>
          )}
        </div>

        <h2 className="interface-title">请求参数设置</h2>

        <div className="container-radiogroup">
          <RadioGroup
            value={state.req_radio_type}
            size="large"
            className="radioGroup"
            onChange={changeRadioGroup}
          >
            {HTTP_METHOD[state.method].request_body ? (
              <RadioButton value="req-body">Body</RadioButton>
            ) : null}
            <RadioButton value="req-query">Query</RadioButton>
            <RadioButton value="req-headers">Headers</RadioButton>
          </RadioGroup>
        </div>

        <div className="panel-sub">
          <FormItem className={'interface-edit-item ' + state.hideTabs.req.query}>
            <Row type="flex" justify="space-around">
              <Col span={12}>
                <Button size="small" type="primary" onClick={() => addParams('req_query')}>
                  添加Query参数
                </Button>
              </Col>
              <Col span={12}>
                <div className="bulk-import" onClick={() => showBulk('req_query')}>
                  批量添加
                </div>
              </Col>
            </Row>
          </FormItem>

          <Row className={'interface-edit-item ' + state.hideTabs.req.query}>
            <Col>
              <EasyDragSort
                data={() => form.getFieldValue('req_query')}
                onChange={handleDragMove('req_query')}
                onlyChild="easy_drag_sort_child"
              >
                {QueryList}
              </EasyDragSort>
            </Col>
          </Row>

          <FormItem className={'interface-edit-item ' + state.hideTabs.req.headers}>
            <Button size="small" type="primary" onClick={() => addParams('req_headers')}>
              添加Header
            </Button>
          </FormItem>

          <Row className={'interface-edit-item ' + state.hideTabs.req.headers}>
            <Col>
              <EasyDragSort
                data={() => form.getFieldValue('req_headers')}
                onChange={handleDragMove('req_headers')}
                onlyChild="easy_drag_sort_child"
              >
                {headerList}
              </EasyDragSort>
            </Col>
          </Row>
          {HTTP_METHOD[state.method].request_body ? (
            <div>
              <FormItem
                className={'interface-edit-item ' + state.hideTabs.req.body}
                name="req_body_type"
                initialValue={state.req_body_type}
              >
                <RadioGroup>
                  <Radio value="form">form</Radio>
                  <Radio value="json">json</Radio>
                  <Radio value="file">file</Radio>
                  <Radio value="raw">raw</Radio>
                </RadioGroup>
              </FormItem>

              <Row
                className={
                  'interface-edit-item ' +
                  (reqBodyType === 'form' ? state.hideTabs.req.body : 'hide')
                }
              >
                <Col style={{ minHeight: '50px' }}>
                  <Row type="flex" justify="space-around">
                    <Col span="12" className="interface-edit-item">
                      <Button size="small" type="primary" onClick={() => addParams('req_body_form')}>
                        添加form参数
                      </Button>
                    </Col>
                    <Col span="12">
                      <div className="bulk-import" onClick={() => showBulk('req_body_form')}>
                        批量添加
                      </div>
                    </Col>
                  </Row>
                  <EasyDragSort
                    data={() => form.getFieldValue('req_body_form')}
                    onChange={handleDragMove('req_body_form')}
                    onlyChild="easy_drag_sort_child"
                  >
                    {requestBodyList}
                  </EasyDragSort>
                </Col>
              </Row>
            </div>
          ) : null}

          <Row
            className={
              'interface-edit-item ' +
              (reqBodyType === 'json' ? state.hideTabs.req.body : 'hide')
            }
          >
            <span>
              JSON-SCHEMA:&nbsp;
              {!projectMsg.is_json5 && (
                <Tooltip title="项目 -> 设置 开启 json5">
                  <QuestionCircleOutlined />{' '}
                </Tooltip>
              )}
            </span>
            <FormItem
              name="req_body_is_json_schema"
              valuePropName="checked"
              initialValue={state.req_body_is_json_schema || !projectMsg.is_json5}
              noStyle
            >
              <Switch checkedChildren="开" unCheckedChildren="关" disabled={!projectMsg.is_json5} />
            </FormItem>

            <Col
              style={{ marginTop: '5px' }}
              className="interface-edit-json-info json-schema-editor-scope"
            >
              {!reqBodyIsJsonSchema ? (
                <span>
                  基于 Json5, 参数描述信息用注释的方式实现{' '}
                  <Tooltip title={<pre>{Json5Example}</pre>}>
                    <QuestionCircleOutlined style={{ color: '#086dbf' }} />
                  </Tooltip>
                  “全局编辑”或 “退出全屏” 请按 F9
                </span>
              ) : (
                <ReqBodySchema
                  onChange={(/** @type {any} */ text) => {
                    setState((/** @type {any} */ prev) => ({
                      ...prev,
                      req_body_other: text
                    }));

                    if (new Date().getTime() - startTimeRef.current > 1000) {
                      props.changeEditStatus(true);
                    }
                  }}
                  isMock={true}
                  data={req_body_other_use_schema_editor}
                />
              )}
            </Col>
            <Col>
              {!reqBodyIsJsonSchema && (
                <AceEditor
                  className="interface-editor"
                  data={state.req_body_other}
                  onChange={handleReqBody}
                  fullScreen={true}
                />
              )}
            </Col>
          </Row>

          {reqBodyType === 'file' && state.hideTabs.req.body !== 'hide' ? (
            <Row className="interface-edit-item">
              <Col className="interface-edit-item-other-body">
                <FormItem name="req_body_other" initialValue={state.req_body_other}>
                  <TextArea placeholder="" autosize={true} />
                </FormItem>
              </Col>
            </Row>
          ) : null}
          {reqBodyType === 'raw' && state.hideTabs.req.body !== 'hide' ? (
            <Row>
              <Col>
                <FormItem name="req_body_other" initialValue={state.req_body_other}>
                  <TextArea placeholder="" autosize={{ minRows: 8 }} />
                </FormItem>
              </Col>
            </Row>
          ) : null}
        </div>

        {/* ----------- Response ------------- */}

        <h2 className="interface-title">
          返回数据设置&nbsp;
          {!projectMsg.is_json5 && (
            <Tooltip title="项目 -> 设置 开启 json5">
              <QuestionCircleOutlined />{' '}
            </Tooltip>
          )}
          <FormItem
            name="res_body_is_json_schema"
            valuePropName="checked"
            initialValue={state.res_body_is_json_schema || !projectMsg.is_json5}
            noStyle
          >
            <Switch
              checkedChildren="json-schema"
              unCheckedChildren="json"
              disabled={!projectMsg.is_json5}
            />
          </FormItem>
        </h2>
        <div className="container-radiogroup">
          <FormItem name="res_body_type" initialValue={state.res_body_type} noStyle>
            <RadioGroup size="large" className="radioGroup">
              <RadioButton value="json">JSON</RadioButton>
              <RadioButton value="raw">RAW</RadioButton>
            </RadioGroup>
          </FormItem>
        </div>
        <div className="panel-sub">
          <Row
            className="interface-edit-item"
            style={{
              display: resBodyType === 'json' ? 'block' : 'none'
            }}
          >
            <Col>
              <Tabs
                size="large"
                defaultActiveKey="tpl"
                onChange={handleJsonType}
                items={[
                  { label: '模板', key: 'tpl' },
                  { label: '预览', key: 'preview' }
                ]}
              />
              <div style={{ marginTop: '10px' }}>
                {!resBodyIsJsonSchema ? (
                  <div style={{ padding: '10px 0', fontSize: '15px' }}>
                    <span>
                      基于 mockjs 和 json5,使用注释方式写参数说明{' '}
                      <Tooltip title={<pre>{Json5Example}</pre>}>
                        <QuestionCircleOutlined style={{ color: '#086dbf' }} />
                      </Tooltip>{' '}
                      ,具体使用方法请{' '}
                      <span
                        className="href"
                        onClick={() =>
                          window.open('https://hellosean1025.github.io/yapi/documents/mock.html', '_blank')
                        }
                      >
                        查看文档
                      </span>
                    </span>
                    ，“全局编辑”或 “退出全屏” 请按 <span style={{ fontWeight: '500' }}>F9</span>
                  </div>
                ) : (
                  <div
                    className="json-schema-editor-scope"
                    style={{ display: state.jsonType === 'tpl' ? 'block' : 'none' }}
                  >
                    <ResBodySchema
                      onChange={(/** @type {any} */ text) => {
                        setState((/** @type {any} */ prev) => ({
                          ...prev,
                          res_body: text
                        }));
                        if (new Date().getTime() - startTimeRef.current > 1000) {
                          props.changeEditStatus(true);
                        }
                      }}
                      isMock={true}
                      data={res_body_use_schema_editor}
                    />
                  </div>
                )}
                {!resBodyIsJsonSchema && state.jsonType === 'tpl' && (
                  <AceEditor
                    className="interface-editor"
                    data={state.res_body}
                    onChange={handleResBody}
                    ref={(/** @type {any} */ editor) => (resBodyEditorRef.current = editor)}
                    fullScreen={true}
                  />
                )}
                <div
                  id="mock-preview"
                  style={{
                    backgroundColor: '#eee',
                    lineHeight: '20px',
                    minHeight: '300px',
                    display: state.jsonType === 'preview' ? 'block' : 'none'
                  }}
                />
              </div>
            </Col>
          </Row>

          <Row
            className="interface-edit-item"
            style={{
              display: resBodyType === 'raw' ? 'block' : 'none'
            }}
          >
            <Col>
              <FormItem name="res_body" initialValue={state.res_body}>
                <TextArea style={{ minHeight: '150px' }} placeholder="" />
              </FormItem>
            </Col>
          </Row>
        </div>

        {/* ----------- remark ------------- */}

        <h2 className="interface-title">备 注</h2>
        <div className="panel-sub">
          <FormItem className={'interface-edit-item'}>
            <div>
              <MarkdownEditor
                ref={editorRef}
                className="remark-editor"
                value={state.markdown || state.desc}
                height={500}
              />
            </div>
          </FormItem>
        </div>

        {/* ----------- email ------------- */}
        <h2 className="interface-title">其 他</h2>
        <div className="panel-sub">
          <FormItem
            className={'interface-edit-item'}
            {...formItemLayout}
            label={
              <span>
                消息通知&nbsp;
                <Tooltip title={'开启消息通知，可在 项目设置 里修改'}>
                  <QuestionCircleOutlined style={{ width: '10px' }} />
                </Tooltip>
              </span>
            }
            name="switch_notice"
            valuePropName="checked"
            initialValue={props.noticed}
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </FormItem>
          <FormItem
            className={'interface-edit-item'}
            {...formItemLayout}
            label={
              <span>
                开放接口&nbsp;
                <Tooltip title={'用户可以在 数据导出 时选择只导出公开接口'}>
                  <QuestionCircleOutlined style={{ width: '10px' }} />
                </Tooltip>
              </span>
            }
            name="api_opened"
            valuePropName="checked"
            initialValue={state.api_opened}
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </FormItem>
        </div>

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
  custom_field: PropTypes.object,
  groupList: PropTypes.array,
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
      custom_field: state.group.field,
      projectMsg: state.project.currProject
    };
  },
  {
    changeEditStatus
  }
)(InterfaceEditForm);

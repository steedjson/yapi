// @ts-check
/**
 * InterfaceEditForm 纯逻辑模块：接口数据校验 / 表单默认值与回填组装 / 常量表。
 *
 * 职责（自 InterfaceEditForm.js 原位抽离，函数体逐字节不变，仅位置与 import 调整）：
 *   - checkIsJsonSchema / validJson：json-schema 与 json5 合法性校验（候选 d 接口数据校验）；
 *   - initState：编辑表单初始 state 组装（副本深拷贝 + 零值字段清理 + tab 展开计算，
 *     候选 b 表单默认值/数据回填组装）；
 *   - dataTpl / HTTP_METHOD(_KEYS) / HTTP_REQUEST_HEADER / Json5Example /
 *     formItemLayout / DEMOPATH：模块级常量与字段配置（候选 c）。
 *
 * 本模块不依赖组件实例、不携带 React 状态副作用；InterfaceEditForm.js 通过
 * import 复用，渲染输出与交互行为保持不变。
 */
import json5 from 'json5';
import constants from '../../../../../constants/variable.js';

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

const Json5Example = `
  {
    /**
     * info
     */

    "id": 1 //appId
  }

`;

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
  // 方法名归一化后查表（大小写/缺失均回退 GET；原实现 HTTP_METHOD[curdata.method] || HTTP_METHOD.get
  // 的小写兜底键不存在，缺失/小写 method 会在此处 methodConfig.default_tab 崩溃）
  const methodConfig = HTTP_METHOD[String(curdata.method || '').toUpperCase()] || HTTP_METHOD.GET;
  curdata['hideTabs']['req'][methodConfig.default_tab] = '';
  return Object.assign(
    {
      submitStatus: false,
      title: '',
      path: '',
      status: 'undone',
      // 缺陷打捞：默认方法用小写 'get' 时 HTTP_METHOD['get'] 不存在，
      // 表单渲染期多处 .request_body 读取会崩溃；HTTP_METHOD 键为大写，此处对齐
      method: 'GET',

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

const formItemLayout = {
  labelCol: { span: 4 },
  wrapperCol: { span: 18 }
};

const DEMOPATH = '/api/user/{id}';

export {
  checkIsJsonSchema,
  validJson,
  Json5Example,
  dataTpl,
  HTTP_METHOD,
  HTTP_METHOD_KEYS,
  HTTP_REQUEST_HEADER,
  initState,
  formItemLayout,
  DEMOPATH
};

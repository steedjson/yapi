// @ts-check

const schema = require('./schema-transformTo-table.js');

/**
 * HTML 文本位转义, 规则与 server/utils/escapeHtml.js 对齐(转义 & < >)。
 * common/ 不允许反向依赖 server/utils, 故在此局部实现, 两处规则如需调整必须同步修改。
 * 仅用于表格单元格等纯文本插值位; desc 等 Markdown 创作面字段(设计上允许 HTML)禁止使用本函数。
 * @param {any} value - 用户可控纯文本数据
 * @returns {string} 转义后的字符串
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * HTML 属性位转义, 在 escapeHtml 基础上额外转义 " 与 ',
 * 用于引号包裹的属性插值位(如接口锚点 id), 阻断属性边界逃逸注入事件处理器。
 * 调用点必须配合引号包裹的属性值(id="${escapeHtmlAttr(...)}")使用。
 * @param {any} value - 用户可控属性位数据
 * @returns {string} 转义后的字符串
 */
function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 解析 JSON 字符串，失败时返回空对象
 * @param {string} json - JSON 字符串
 * @returns {any} 解析结果
 */
const json_parse = function(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    return {};
  }
};
// 处理字符串换行
/**
 * 将换行符替换为 HTML 换行标签
 * @param {string} str - 原始字符串
 * @returns {string} 替换后的字符串
 */
const handleWrap = str => {
  return typeof str === 'string' ? str.replace(/\n/gi, '<br/>') : str;
};
/** @type {Record<string, string>} */
const messageMap = {
  desc: '备注',
  default: '实例',
  maximum: '最大值',
  minimum: '最小值',
  maxItems: '最大数量',
  minItems: '最小数量',
  maxLength: '最大长度',
  minLength: '最小长度',
  uniqueItems: '元素是否都不同',
  itemType: 'item 类型',
  format: 'format',
  enum: '枚举',
  enumDesc: '枚举备注',
  mock: 'mock'
};

const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name'
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type'
  },
  {
    title: '是否必须',
    dataIndex: 'required',
    key: 'required'
  },
  {
    title: '默认值',
    dataIndex: 'default',
    key: 'default'
  },
  {
    title: '备注',
    dataIndex: 'desc',
    key: 'desc'
  },
  {
    title: '其他信息',
    dataIndex: 'sub',
    key: 'sub'
  }
];

/**
 * 目录模式下转义标题字符串
 * @param {string} str - 原始字符串
 * @param {boolean} isToc - 是否为目录模式
 * @returns {string} 处理后的字符串
 */
function escapeStr(str, isToc) {
  return isToc ? escape(str) : str;
}

/**
 * 生成接口基本信息段落
 * @param {string} basepath - 接口基础路径
 * @param {Record<string, any>} inter - 接口数据
 * @returns {string} Markdown 片段
 */
function createBaseMessage(basepath, inter) {
  // 基本信息
  let baseMessage = `### 基本信息\n\n**Path：** ${basepath + inter.path}\n\n**Method：** ${
    inter.method
  }\n\n**接口描述：**\n${inter.desc === undefined ? '' : inter.desc}\n`;
  return baseMessage;
}

/**
 * 生成请求头表格
 * @param {any[]} req_headers - 请求头列表
 * @returns {string} Markdown 表格
 */
function createReqHeaders(req_headers) {
  // Request-headers
  if (req_headers && req_headers.length) {
    let headersTable = `**Headers**\n\n`;
    headersTable += `| 参数名称  | 参数值  |  是否必须 | 示例  | 备注  |\n| ------------ | ------------ | ------------ | ------------ | ------------ |\n`;
    for (let j = 0; j < req_headers.length; j++) {
      // name/value/example 为用户可控纯文本位, 转义防注入; desc 为 Markdown 创作面字段, 按设计保留原样
      headersTable += `| ${escapeHtml(req_headers[j].name || '')}  |  ${escapeHtml(
        req_headers[j].value || ''
      )} | ${req_headers[j].required == 1 ? '是' : '否'}  |  ${handleWrap(
        escapeHtml(req_headers[j].example || '')
      ) || ''} |  ${handleWrap(req_headers[j].desc) || ''} |\n`;
    }
    return headersTable;
  }
  return '';
}

/**
 * 生成路径参数表格
 * @param {any[]} req_params - 路径参数列表
 * @returns {string} Markdown 表格
 */
function createPathParams(req_params) {
  if (req_params && req_params.length) {
    let paramsTable = `**路径参数**\n\n`;
    paramsTable += `| 参数名称 | 示例  | 备注  |\n| ------------ | ------------ | ------------ |\n`;
    for (let j = 0; j < req_params.length; j++) {
      // name/example 为用户可控纯文本位, 转义防注入; desc 为 Markdown 创作面字段, 按设计保留原样
      paramsTable += `| ${escapeHtml(req_params[j].name || '')} |  ${handleWrap(
        escapeHtml(req_params[j].example || '')
      ) || ''} |  ${handleWrap(req_params[j].desc) || ''} |\n`;
    }
    return paramsTable;
  }
  return '';
}

/**
 * 生成 Query 参数表格
 * @param {any[]} req_query - Query 参数列表
 * @returns {string} Markdown 表格
 */
function createReqQuery(req_query) {
  if (req_query && req_query.length) {
    let headersTable = `**Query**\n\n`;
    headersTable += `| 参数名称  |  是否必须 | 示例  | 备注  |\n| ------------ | ------------ | ------------ | ------------ |\n`;
    for (let j = 0; j < req_query.length; j++) {
      // name/example 为用户可控纯文本位, 转义防注入; desc 为 Markdown 创作面字段, 按设计保留原样
      headersTable += `| ${escapeHtml(req_query[j].name || '')} | ${
        req_query[j].required == 1 ? '是' : '否'
      }  |  ${handleWrap(escapeHtml(req_query[j].example || '')) || ''} |  ${handleWrap(
        req_query[j].desc
      ) || ''} |\n`;
    }
    return headersTable;
  }
  return '';
}

/**
 * 生成请求 Body 段落
 * @param {string} req_body_type - 请求体类型
 * @param {any[]} req_body_form - form 数据列表
 * @param {string} req_body_other - 其他类型请求体
 * @param {boolean} req_body_is_json_schema - 是否为 JSON Schema
 * @returns {string} Markdown 片段
 */
function createReqBody(req_body_type, req_body_form, req_body_other, req_body_is_json_schema) {
  if (req_body_type === 'form' && req_body_form.length) {
    let bodyTable = `**Body**\n\n`;
    bodyTable += `| 参数名称  | 参数类型  |  是否必须 | 示例  | 备注  |\n| ------------ | ------------ | ------------ | ------------ | ------------ |\n`;
    let req_body = req_body_form;
    for (let j = 0; j < req_body.length; j++) {
      // name/example 为用户可控纯文本位, 转义防注入; desc 为 Markdown 创作面字段, 按设计保留原样;
      // type 为内部枚举(text/file), 非用户自由文本, 不转义
      bodyTable += `| ${escapeHtml(req_body[j].name || '')} | ${req_body[j].type || ''}  |  ${
        req_body[j].required == 1 ? '是' : '否'
      } |  ${escapeHtml(req_body[j].example || '')}  |  ${req_body[j].desc || ''} |\n`;
    }
    return `${bodyTable}\n\n`;
  } else if (req_body_other) {
    if (req_body_is_json_schema) {
      let reqBody = createSchemaTable(req_body_other);
      return `**Body**\n\n` + reqBody;
    } else {
      //other
      return `**Body**\n\n` + '```javascript' + `\n${req_body_other || ''}` + '\n```';
    }
  }
  return '';
}

/**
 * 生成表格表头
 * @param {any[]} columns - 列配置
 * @returns {string} HTML 表头片段
 */
function tableHeader(columns) {
  let header = ``;
  columns.map(item => {
    header += `<th key=${item.key}>${item.title}</th>`;
  });

  return header;
}

/**
 * 渲染对象其他信息为 HTML 段落
 * @param {Record<string, any>} text - 属性键值对
 * @returns {*} HTML 片段或原始入参
 */
function handleObject(text) {
  if (!text || typeof text !== 'object') {
    return text;
  }
  let tpl = ``;
  Object.keys(text || {}).map((item, index) => {
    let name = messageMap[item];
    // 其他信息子项(默认值/枚举/枚举备注/mock 等)均为用户可控纯文本位, 转义防注入
    let value = escapeHtml(text[item]);
    tpl += text[item] === undefined
      ? ''
      : `<p key=${index}><span style="font-weight: '700'">${name}: </span><span>${value}</span></p>`;
  });

  return tpl;
}

/**
 * 渲染表格单行
 * @param {Record<string, any>} col - 行数据
 * @param {any[]} columns - 列配置
 * @param {number} level - 嵌套层级
 * @returns {string} HTML 行片段
 */
function tableCol(col, columns, level) {
  let tpl = ``;
  columns.map((item, index) => {
    let dataIndex = item.dataIndex;
    let value = col[dataIndex];
    value = value === undefined ? '' : value;
    let text = ``;

    switch (dataIndex) {
      case 'sub':
        text = handleObject(value);
        break;
      case 'type':
        // type/itemType 源自用户编写的 schema JSON, 属用户可控纯文本位, 转义防注入
        text =
          value === 'array'
            ? `<span>${escapeHtml(col.sub ? col.sub.itemType || '' : 'array')} []</span>`
            : `<span>${escapeHtml(value)}</span>`;
        break;
      case 'required':
        text = value ? '必须' : '非必须';
        break;
      case 'desc':
        // desc 为 Markdown 创作面字段(设计上允许 HTML), 按设计保留原样
        text = col.childrenDesc === undefined
          ? `<span style="white-space: pre-wrap">${value}</span>`
          : `<span style="white-space: pre-wrap">${col.childrenDesc}</span>`;
        break;
      case 'name':
        // schema 属性名为用户可控纯文本位, 转义防注入
        text = `<span style="padding-left: ${20 * level}px"><span style="color: #8c8a8a">${
          level > 0 ? '├─' : ''
        }</span> ${escapeHtml(value)}</span>`;
        break;
      default:
        // 仅 default 列落入默认分支, 为用户可控纯文本位, 转义防注入
        text = escapeHtml(value);
    }
    tpl += `<td key=${index}>${text}</td>`;
  });

  return tpl;
}

/**
 * 渲染表格主体，递归处理子节点
 * @param {any[]} dataSource - 行数据列表
 * @param {any[]} columns - 列配置
 * @param {number} level - 嵌套层级
 * @returns {string} HTML 行片段
 */
function tableBody(dataSource, columns, level) {
  //  按照columns的顺序排列数据
  let tpl = ``;
  dataSource.map(col => {
    let child = null;
    tpl += `<tr key=${col.key}>${tableCol(col, columns, level)}</tr>`;
    if (col.children !== undefined && Array.isArray(col.children)) {
      let index = level + 1;
      child = tableBody(col.children, columns, index);
    }
    tpl += child ? `${child}` : ``;
  });

  return tpl;
}

/**
 * 由 JSON Schema 生成 HTML 表格
 * @param {string} body - JSON 字符串
 * @returns {string} HTML 表格
 */
function createSchemaTable(body) {
  let template = ``;
  let dataSource = schema.schemaTransformToTable(json_parse(body));
  template += `<table>
  <thead class="ant-table-thead">
    <tr>
      ${tableHeader(columns)}
    </tr>
  </thead>`;

  template += `<tbody className="ant-table-tbody">${tableBody(dataSource, columns, 0)}
               </tbody>
              </table>
            `;

  return template;
}

/**
 * 生成返回数据段落
 * @param {string} res_body - 返回数据定义
 * @param {boolean} res_body_is_json_schema - 是否为 JSON Schema
 * @param {string} res_body_type - 返回数据类型
 * @returns {string} Markdown 片段
 */
function createResponse(res_body, res_body_is_json_schema, res_body_type) {
  let resTitle = `\n### 返回数据\n\n`;
  if (res_body) {
    if (res_body_is_json_schema && res_body_type === 'json') {
      let resBody = createSchemaTable(res_body);
      return resTitle + resBody;
    } else {
      let resBody = '```javascript' + `\n${res_body || ''}\n` + '```';
      return resTitle + resBody;
    }
  }
  return '';
}

/**
 * 生成单个接口的 Markdown 文档
 * @param {string} basepath - 接口基础路径
 * @param {Record<string, any>} listItem - 接口数据
 * @param {boolean} isToc - 是否生成目录
 * @returns {string} Markdown 文档片段
 */
function createInterMarkdown(basepath, listItem, isToc) {
  let mdTemplate = ``;
  const toc = `[TOC]\n\n`;
  // 接口名称
  // 锚点 id 属性位: title/catid 用户可控, 属性值加引号并转义 " ' 等字符,
  // 阻断无引号属性位逃逸注入事件处理器; 标题文本位的 title 由插件层 escapeHtml 覆盖 & < >, 此处不复转义
  mdTemplate += `\n## ${escapeStr(
    `${listItem.title}\n<a id="${escapeHtmlAttr(`${listItem.title}${listItem.catid}`)}"> </a>`,
    isToc
  )}\n`;
  isToc && (mdTemplate += toc);
  // 基本信息
  mdTemplate += createBaseMessage(basepath, listItem);
  // Request
  mdTemplate += `\n### 请求参数\n`;
  // Request-headers
  mdTemplate += createReqHeaders(listItem.req_headers);
  // Request-params
  mdTemplate += createPathParams(listItem.req_params);
  // Request-query
  mdTemplate += createReqQuery(listItem.req_query);
  // Request-body
  mdTemplate += createReqBody(
    listItem.req_body_type,
    listItem.req_body_form,
    listItem.req_body_other,
    listItem.req_body_is_json_schema
  );
  // Response
  // Response-body
  mdTemplate += createResponse(
    listItem.res_body,
    listItem.res_body_is_json_schema,
    listItem.res_body_type
  );

  return mdTemplate;
}

/**
 * 生成项目级 Markdown 文档
 * @param {Record<string, any>} curProject - 项目数据
 * @param {Record<string, any>} wikiData - 公共 wiki 数据
 * @returns {string} Markdown 文档片段
 */
function createProjectMarkdown(curProject, wikiData) {
  let mdTemplate = ``;
  // 项目名、项目描述
  let title = `<h1 class="curproject-name"> ${curProject.name} </h1>`;

  mdTemplate += `\n ${title} \n ${curProject.desc || ''}\n\n`;

  // 增加公共wiki信息展示
  mdTemplate += wikiData ? `\n### 公共信息\n${wikiData.desc || ''}\n` : '';
  return mdTemplate;
}

/**
 * 生成接口分类列表的 Markdown 文档
 * @param {Record<string, any>} curProject - 项目数据
 * @param {any[]} list - 接口分类列表
 * @param {boolean} isToc - 是否生成目录
 * @returns {string} Markdown 文档
 */
function createClassMarkdown(curProject, list, isToc) {
  let mdTemplate = ``;
  const toc = `[TOC]\n\n`;
  list.map(item => {
    // 分类名称
    mdTemplate += `\n# ${escapeStr(item.name, isToc)}\n`;
    isToc && (mdTemplate += toc);
    for (let i = 0; i < item.list.length; i++) {
      //循环拼接 接口
      // 接口内容
      mdTemplate += createInterMarkdown(curProject.basepath, item.list[i], isToc);
    }
  });
  return mdTemplate;
}

let r = {
  createInterMarkdown,
  createProjectMarkdown,
  createClassMarkdown
};

module.exports = r;

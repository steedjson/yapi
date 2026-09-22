// @ts-check
import { message } from 'antd';
import URL from 'url';

// 批次1（首屏性能优化，docs/first-paint-perf-plan.md）：common/utils.js 顶层挂有
// ajv(+draft-04/i18n/fast-uri，合计 ~400KB 源码)，顶层 import 会把它锁进 index 入口
// 首屏 vendor。本插件仅导入 run 流程消费 json_parse/unbase64，改为运行时动态 import()
// 并做单例缓存（babel 生产分支 exclude proposal-dynamic-import，import() 保留为原生
// 分包点；common/utils.js 为 client/server 共享 CJS，此处以 default interop 取导出）。
/** @type {Promise<any> | null} */
let utilsPromise = null;
/**
 * @returns {Promise<any>} common/utils.js 导出（json_parse/unbase64 等），单例缓存
 */
function getUtils() {
  if (!utilsPromise) {
    utilsPromise = import('../../common/utils.js')
      .then(m => m.default || m)
      .catch(err => {
        // 动态 import 失败（发版后旧 chunk 404 / 网络中断）不得缓存 rejected promise：
        // 置空以便下次调用重试（缺陷打捞：原实现失败后需刷新页面）
        utilsPromise = null;
        throw err;
      });
  }
  return utilsPromise;
}

/**
 * unbase64 运行时获取（common/utils 动态加载后的调用包装）。
 * @param {string} text
 * @returns {Promise<string>}
 */
async function utilsUnbase64(text) {
  const utils = await getUtils();
  return utils.unbase64(text);
}

/**
 * JSON -> JSON Schema 转换（generate-schema 与 common/utils 均运行时动态获取，
 * 见文件头注释）。async 化后仅在导入 run 流程内 await，调用方（importHar）已 async。
 * @param {any} json
 */
async function transformJsonToSchema(json) {
  const [{ default: GenerateSchema }, utils] = await Promise.all([
    import('generate-schema/src/schemas/json.js'),
    getUtils()
  ]);
  json = json || {};
  let jsonData = utils.json_parse(json);

  jsonData = GenerateSchema(jsonData);

  let schemaData = JSON.stringify(jsonData);

  return schemaData;
}

/**
 * HAR 数据导入插件（import_data 钩子实现）。
 * 由插件运行时以实例对象调用（this 为插件运行时，可 bindHook）。
 * @this {any}
 * @param {any} importDataModule
 */
function postman(importDataModule) {
  /**
   * @param {string} url
   */
  function parseUrl(url) {
    return URL.parse(url);
  }

  /**
   * @param {any} interData
   */
  function checkInterRepeat(interData) {
    /** @type {Record<string, boolean>} */
    let obj = {};
    let arr = [];
    for (let item in interData) {
      // console.log(interData[item].url + "-" + interData[item].method);
      let key = interData[item].request.url + '|' + interData[item].request.method;
      if (!obj[key]) {
        arr.push(interData[item]);
        obj[key] = true;
      }
    }
    return arr;
  }

  /**
   * @param {any} query
   */
  function handleReq_query(query) {
    let res = [];
    if (query && query.length) {
      for (let item in query) {
        res.push({
          name: query[item].name,
          value: query[item].value
        });
      }
    }
    return res;
  }
  // function handleReq_headers(headers){
  //   let res = [];
  //   if(headers&&headers.length){
  //     for(let item in headers){
  //       res.push({
  //         name: headers[item].key,
  //         desc: headers[item].description,
  //         value: headers[item].value,
  //         required: headers[item].enable
  //       });
  //     }
  //   }
  //   return res;
  // }

  /**
   * @param {any} body_form
   */
  function handleReq_body_form(body_form) {
    let res = [];
    if (body_form && typeof body_form === 'object') {
      for (let item in body_form) {
        res.push({
          name: body_form[item].name,
          value: body_form[item].value,
          type: 'text'
        });
      }
    }
    return res;
  }

  /**
   * @param {string} path
   */
  function handlePath(path) {
    path = parseUrl(path).pathname;
    path = decodeURIComponent(path);
    if (!path) return '';

    path = path.replace(/{{\w*}}/g, '');

    if (path[0] != '/') {
      path = '/' + path;
    }
    return path;
  }

  /**
   * 导入入口。utils/generate-schema 经动态 import 获取（见文件头注释），故 run
   * async 化：import_data 钩子的 run 本就以 `await run(res)` 调用（异步契约不变）。
   * @this {any}
   * @param {any} res
   */
  async function run(res) {
    try {
      res = JSON.parse(res);
      res = res.log.entries;

      res = res.filter((/** @type {any} */ item) => {
        if (!item) return false;
        return item.response.content.mimeType.indexOf('application/json') === 0;
      });

      /** @type {Record<string, any>} */
      let interfaceData = { apis: [] };
      res = checkInterRepeat.bind(this)(res);
      if (res && res.length) {
        for (let item in res) {
          let data = await importHar.bind(this)(res[item]);
          interfaceData.apis.push(data);
        }
      }

      return interfaceData;
    } catch (e) {
      console.error(e);
      message.error('数据格式有误');
    }
  }

  /**
   * @this {any}
   * @param {any} data
   * @param {any} [key]
   */
  async function importHar(data, key) {
    /** @type {Record<string, any>} */
    let reflect = {
      //数据字段映射关系
      title: 'url',
      path: 'url',
      method: 'method',
      desc: 'description',
      req_query: 'queryString',
      req_body_form: 'params',
      req_body_other: 'text'
    };
    let allKey = [
      'title',
      'path',
      'method',
      'req_query',
      'req_body_type',
      'req_body_form',
      'req_body_other',
      'res_body_type',
      'res_body',
      'req_headers'
    ];
    key = key || allKey;
    /** @type {Record<string, any>} */
    let res = {};

    let reqType = 'json',
      header;
    data.request.headers.forEach((/** @type {any} */ item) => {
      if (!item || !item.name || !item.value) return null;
      if (/content-type/i.test(item.name) && item.value.indexOf('application/json') === 0) {
        reqType = 'json';
        header = 'application/json';
      } else if (
        /content-type/i.test(item.name) &&
        item.value.indexOf('application/x-www-form-urlencoded') === 0
      ) {
        header = 'application/x-www-form-urlencoded';
        reqType = 'form';
      } else if (
        /content-type/i.test(item.name) &&
        item.value.indexOf('multipart/form-data') === 0
      ) {
        header = 'multipart/form-data';
        reqType = 'form';
      }
    });

    for (let item in key) {
      item = key[item];
      if (item === 'req_query') {
        res[item] = handleReq_query.bind(this)(data.request[reflect[item]]);
      } else if (item === 'req_body_form' && reqType === 'form' && data.request.postData) {
        if (header === 'application/x-www-form-urlencoded') {
          res[item] = handleReq_body_form.bind(this)(data.request.postData[reflect[item]]);
        } else if (header === 'multipart/form-data') {
          res[item] = [];
        }
      } else if (item === 'req_body_other' && reqType === 'json' && data.request.postData) {
        res.req_body_is_json_schema = true;
        res[item] = await transformJsonToSchema(data.request.postData.text);
      } else if (item === 'req_headers') {
        res[item] = [
          {
            name: 'Content-Type',
            value: header
          }
        ];
      } else if (item === 'req_body_type') {
        res[item] = reqType;
      } else if (item === 'path') {
        res[item] = handlePath.bind(this)(data.request[reflect[item]]);
      } else if (item === 'title') {
        let path = handlePath.bind(this)(data.request[reflect['path']]);
        if (data.request[reflect[item]].indexOf(path) > -1) {
          res[item] = path;
          if (res[item] && res[item].indexOf('/:') > -1) {
            res[item] = res[item].substr(0, res[item].indexOf('/:'));
          }
        } else {
          res[item] = data.request[reflect[item]];
        }
      } else if (item === 'res_body_type') {
        res[item] = 'json';
      } else if (item === 'res_body') {
        res.res_body_is_json_schema = true;
        if (data.response.content.encoding && data.response.content.encoding == 'base64') {
            //base64
            res[item] = await transformJsonToSchema(await utilsUnbase64(data.response.content.text));
        } else {
            res[item] = await transformJsonToSchema(data.response.content.text);
        }
      } else {
        res[item] = data.request[reflect[item]];
      }
    }
    return res;
  }

  if (!importDataModule || typeof importDataModule !== 'object') {
    console.error('obj参数必需是一个对象');
    return null;
  }

  importDataModule.har = {
    name: 'HAR',
    run: run,
    desc: '使用chrome录制请求功能，具体使用请查看文档'
  };
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('import_data', postman);
};

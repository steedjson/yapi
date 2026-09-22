// @ts-check
import { message } from 'antd';
import URL from 'url';

// 批次1（首屏性能优化，docs/first-paint-perf-plan.md）：common/utils.js 顶层挂有
// ajv(+draft-04/i18n/fast-uri，合计 ~400KB 源码)，顶层 import 会把它锁进 index 入口
// 首屏 vendor。本插件仅导入 run 流程消费 json_parse，改为运行时动态 import() 并做
// 单例缓存（babel 生产分支 exclude proposal-dynamic-import，import() 保留为原生分包点；
// common/utils.js 为 client/server 共享 CJS，此处以 default interop 取导出）。
/** @type {Promise<any> | null} */
let utilsPromise = null;
/**
 * @returns {Promise<any>} common/utils.js 导出（json_parse 等），单例缓存
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
 * Postman 数据导入插件（import_data 钩子实现）。
 * 由插件运行时以实例对象调用（this 为插件运行时，可 bindHook）。
 * @this {any}
 * @param {any} importDataModule
 */
function postman(importDataModule) {
  /** @type {any[]} */
  var folders = [];

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
      if (!obj[interData[item].url + '-' + interData[item].method + '-' + interData[item].method]) {
        arr.push(interData[item]);
        obj[
          interData[item].url + '-' + interData[item].method + '-' + interData[item].method
        ] = true;
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
          name: query[item].key,
          desc: query[item].description,
          // example: query[item].value,
          value: query[item].value,
          required: query[item].enabled ? '1' : '0'
        });
      }
    }
    return res;
  }
  /**
   * @param {any} headers
   */
  function handleReq_headers(headers) {
    let res = [];
    if (headers && headers.length) {
      for (let item in headers) {
        res.push({
          name: headers[item].key,
          desc: headers[item].description,
          value: headers[item].value,
          required: headers[item].enabled ? '1' : '0'
        });
      }
    }
    return res;
  }

  /**
   * @param {any} body_form
   */
  function handleReq_body_form(body_form) {
    let res = [];
    if (body_form && body_form.length) {
      for (let item in body_form) {
        res.push({
          name: body_form[item].key,
          // example: body_form[item].value,
          value: body_form[item].value,
          type: body_form[item].type,
          required: body_form[item].enabled ? '1' : '0',
          desc: body_form[item].description
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

    path = path.replace(/\{\{.*\}\}/g, '');

    if (path[0] != '/') {
      path = '/' + path;
    }
    return path;
  }

  /**
   * @this {any}
   * @param {any} res
   */
  /**
   * 导入入口。utils/generate-schema 经动态 import 获取（见文件头注释），故 run
   * async 化：import_data 钩子的 run 本就以 `await run(res)` 调用（异步契约不变）。
   * @this {any}
   * @param {any} res
   */
  async function run(res) {
    try {
      res = JSON.parse(res);
      let interData = res.requests;
      /** @type {Record<string, any>} */
      let interfaceData = { apis: [], cats: [] };
      interData = checkInterRepeat.bind(this)(interData);

      if (res.folders && Array.isArray(res.folders)) {
        res.folders.forEach((/** @type {any} */ tag) => {
          interfaceData.cats.push({
            name: tag.name,
            desc: tag.description
          });
        });
      }

      if (Array.isArray(res.folders) && res.folders.find((/** @type {any} */ item) => item.collectionId === res.id)) {
        folders = res.folders;
      }

      if (interData && interData.length) {
        for (let item in interData) {
          let data = await importPostman.bind(this)(interData[item]);
          interfaceData.apis.push(data);
        }
      }

      return interfaceData;
    } catch (e) {
      message.error('文件格式必须为JSON');
    }
  }

  /**
   * @this {any}
   * @param {any} data
   * @param {any} [key]
   */
  async function importPostman(data, key) {
    /** @type {Record<string, any>} */
    let reflect = {
      //数据字段映射关系
      title: 'name',
      path: 'url',
      method: 'method',
      desc: 'description',
      req_query: 'queryParams',
      req_headers: 'headerData',
      req_params: '',
      req_body_type: 'dataMode',
      req_body_form: 'data',
      req_body_other: 'rawModeData',
      res_body: 'text',
      res_body_type: 'language'
    };
    let allKey = [
      'title',
      'path',
      'catname',
      'method',
      'desc',
      'req_query',
      'req_headers',
      'req_body_type',
      'req_body_form',
      'req_body_other',
      'res'
    ];
    key = key || allKey;
    /** @type {Record<string, any>} */
    let res = {};
    try {
      for (let item in key) {
        item = key[item];
        if (item === 'req_query') {
          res[item] = handleReq_query.bind(this)(data[reflect[item]]);
        } else if (item === 'req_headers') {
          res[item] = handleReq_headers.bind(this)(data[reflect[item]]);
        } else if (item === 'req_body_form') {
          res[item] = handleReq_body_form.bind(this)(data[reflect[item]]);
        } else if (item === 'req_body_type') {
          if (data[reflect[item]] === 'urlencoded' || data[reflect[item]] === 'params') {
            res[item] = 'form';
          } else {
            if (typeof data.headers === 'string' && data.headers.indexOf('application/json') > -1) {
              res[item] = 'json';
            } else {
              res[item] = 'raw';
            }
          }
        } else if (item === 'req_body_other') {
          if (typeof data.headers === 'string' && data.headers.indexOf('application/json') > -1) {
            res.req_body_is_json_schema = true;
            res[item] = await transformJsonToSchema(data[reflect[item]]);
          } else {
            res[item] = data[reflect[item]];
          }
        } else if (item === 'path') {
          res[item] = handlePath.bind(this)(data[reflect[item]]);
          if (res[item] && res[item].indexOf('/:') > -1) {
            let params = res[item].substr(res[item].indexOf('/:') + 2).split('/:');
            // res[item] = res[item].substr(0,res[item].indexOf("/:"));
            let arr = [];
            for (let i in params) {
              arr.push({
                name: params[i],
                desc: ''
              });
            }
            res['req_params'] = arr;
          }
        } else if (item === 'title') {
          let path = handlePath.bind(this)(data[reflect['path']]);
          if (data[reflect[item]].indexOf(path) > -1) {
            res[item] = path;
            if (res[item] && res[item].indexOf('/:') > -1) {
              res[item] = res[item].substr(0, res[item].indexOf('/:'));
            }
          } else {
            res[item] = data[reflect[item]];
          }
        } else if (item === 'catname') {
          let found = folders.filter(item => {
            return item.id === data.folder;
          });
          res[item] = found && Array.isArray(found) && found.length > 0 ? found[0].name : null;
        } else if (item === 'res') {
          let response = await handleResponses(data['responses']);
          if (response) {
            (res['res_body'] = response['res_body']),
              (res['res_body_type'] = response['res_body_type']);
          }
        } else {
          res[item] = data[reflect[item]];
        }
      }
    } catch (/** @type {any} */ err) {
      console.log(err.message);
      message.error(`${err.message}, 导入的postman格式有误`);
    }
    return res;
  }

  /**
   * @param {any} data
   */
  const handleResponses = async data => {
    if (data && data.length) {
      let res = data[0];
      /** @type {Record<string, any>} */
      let response = {};
      response['res_body_type'] = res.language === 'json' ? 'json' : 'raw';
      // response['res_body'] = res.language === 'json' ? transformJsonToSchema(res.text): res.text;
      if (res.language === 'json') {
        response['res_body_is_json_schema'] = true;
        response['res_body'] = await transformJsonToSchema(res.text);
      } else {
        response['res_body'] = res.text;
      }
      return response;
    }

    return null;
  };

  /**
   * JSON -> JSON Schema 转换（generate-schema 与 common/utils 均运行时动态获取，
   * 见文件头注释）。async 化后仅在导入 run 流程内 await，调用方（importPostman）已 async。
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

  if (!importDataModule || typeof importDataModule !== 'object') {
    console.error('obj参数必需是一个对象');
    return null;
  }

  importDataModule.postman = {
    name: 'Postman',
    run: run,
    desc: '注意：只支持json格式数据'
  };
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('import_data', postman);
};

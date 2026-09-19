// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const yapi = requireAny('../yapi.js');
const baseController = require('./base.js');
const fs = requireAny('fs'); //引入文件模块
const path = requireAny('path');

class interfaceColController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
  }

  /**
   * 测试 get
   * @interface /test/get
   * @method GET
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testGet(ctx) {
    try {
      let query = ctx.query;
      // cookie 检测
      ctx.cookies.set('_uid', 12, {
        expires: yapi.commons.expireDate(7),
        httpOnly: true
      });
      ctx.body = yapi.commons.resReturn(query);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 code
   * @interface /http/code
   * @method GET
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testHttpCode(ctx) {
    try {
      let params = ctx.request.body;
      ctx.status = +ctx.query.code || 200;
      ctx.body = yapi.commons.resReturn(params);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 post
   * @interface /test/post
   * @method POST
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testPost(ctx) {
    try {
      let params = ctx.request.body;
      ctx.body = yapi.commons.resReturn(params);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 单文件上传
   * @interface /test/single/upload
   * @method POST
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testSingleUpload(ctx) {
    try {
      // let params = ctx.request.body;
      let req = ctx.req;

      let chunks = /** @type {any[]} */ ([]),
        size = 0;
      req.on('data', function(/** @type {any} */ chunk) {
        chunks.push(chunk);
        size += chunk.length;
      });

      req.on('finish', function() {
        console.log(34343);
      });

      // 原实现把回调误传给 writeFileSync 的第 3 参（实为 options，被静默忽略），
      // 「写入失败返回 402」从未生效。改为 fs.promises.writeFile 异步写入并真实接收错误：
      // 失败返回 402（原为抛异常导致 500），成功在写入完成后响应（由同步变为事件循环延迟）。
      // koa-body 已消费请求体（multipart/json 等场景）时 end 不会再触发，直接按已收集数据落盘。
      await new Promise((/** @type {(v?: void) => void} */ resolve) => {
        if (req.readableEnded) {
          resolve();
          return;
        }
        req.on('end', resolve);
        req.on('error', resolve);
      });

      let data = Buffer.alloc(size);
      for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
        let chunk = chunks[i];
        chunk.copy(data, pos);
        pos += chunk.length;
      }

      try {
        await fs.promises.writeFile(path.join(yapi.WEBROOT_RUNTIME, 'test.text'), data);
      } catch (/** @type {any} */ e) {
        ctx.body = yapi.commons.resReturn(null, 402, '写入失败');
        return;
      }
      ctx.body = yapi.commons.resReturn({ res: '上传成功' });
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 文件上传
   * @interface /test/files/upload
   * @method POST
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testFilesUpload(ctx) {
    try {
      // koa-body v8: 文件在 ctx.request.files(formidable File 对象, 路径属性为 filepath)
      let file = ctx.request.files.file;
      let newPath = path.join(yapi.WEBROOT_RUNTIME, 'test.text');
      fs.renameSync(file.filepath, newPath);
      ctx.body = yapi.commons.resReturn({ res: '上传成功' });
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 put
   * @interface /test/put
   * @method PUT
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testPut(ctx) {
    try {
      let params = ctx.request.body;
      ctx.body = yapi.commons.resReturn(params);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 delete
   * @interface /test/delete
   * @method DELETE
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testDelete(ctx) {
    try {
      let body = ctx.request.body;
      ctx.body = yapi.commons.resReturn(body);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 head
   * @interface /test/head
   * @method HEAD
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testHead(ctx) {
    try {
      let query = ctx.query;
      ctx.body = yapi.commons.resReturn(query);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 options
   * @interface /test/options
   * @method OPTIONS
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testOptions(ctx) {
    try {
      let query = ctx.query;
      ctx.body = yapi.commons.resReturn(query);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试 patch
   * @interface /test/patch
   * @method PATCH
   * @returns {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testPatch(ctx) {
    try {
      let params = ctx.request.body;
      ctx.body = yapi.commons.resReturn(params);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }
  /**
   * 测试 raw
   * @interface /test/raw
   * @method POST
   * @return {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testRaw(ctx) {
    try {
      let params = ctx.request.body;
      ctx.body = yapi.commons.resReturn(params);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 测试返回值
   * @interface /test/response
   * @method get
   * @return {Object}
   * @example
   */

  /**
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<void>}
   */
  async testResponse(ctx) {
    try {
      // let result = `<div><h2>12222222</h2></div>`;
      // let result = `wieieieieiieieie`
      let result = { b: '12', c: '23' };
      ctx.set('Access-Control-Allow-Origin', '*');
      ctx.set('Content-Type', 'text');
      console.log(ctx.response);
      ctx.body = result;
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }
}

module.exports = interfaceColController;

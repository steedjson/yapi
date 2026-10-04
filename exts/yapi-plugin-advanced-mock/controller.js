// @ts-check
const baseController = require('controllers/base.js');
const advModel = require('./advMockModel.js');
const yapi = require('yapi.js');
const caseModel = require('./caseModel.js');
const userModel = require('models/user.js');
const interfaceModel = require('models/interface.js');
const config = require('./index.js');

class advMockController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(advModel);
    this.caseModel = yapi.getInst(caseModel);
    this.userModel = yapi.getInst(userModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async getMock(ctx) {
    let id = ctx.query.interface_id;
    if (!id) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少interface_id'));
    }
    // token 请求仅允许读取归属项目的接口配置
    let interfaceData = await this.interfaceModel.get(id);
    if (
      !interfaceData ||
      (this.$tokenAuth && Number(interfaceData.project_id) !== Number(this.$tokenProjectId))
    ) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }
    // 登录态需要项目 view 权限; token 请求经严格域已是归属项目 dev
    let auth = await this.checkAuth(interfaceData.project_id, 'project', 'view');
    if (!auth) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }
    let mockData = await this.Model.get(id);
    if (!mockData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, 'mock脚本不存在'));
    }
    return (ctx.body = yapi.commons.resReturn(mockData));
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async upMock(ctx) {
    let params = ctx.request.body;
    try {
      if (!params.interface_id) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '缺少interface_id'));
      }
      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '缺少project_id'));
      }
      // 落库与鉴权均以接口真实归属为准, 防止伪报 project_id 跨项目写
      let interfaceData = await this.interfaceModel.get(params.interface_id);
      if (!interfaceData) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '接口不存在'));
      }
      let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');

      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }

      let data = {
        interface_id: params.interface_id,
        mock_script: params.mock_script || '',
        project_id: interfaceData.project_id,
        uid: this.getUid(),
        enable: params.enable === true ? true : false
      };
      let result;
      let mockData = await this.Model.get(data.interface_id);
      if (mockData) {
        result = await this.Model.up(data);
      } else {
        result = await this.Model.save(data);
      }
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async list(ctx) {
    try {
      let id = ctx.query.interface_id;
      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '缺少 interface_id'));
      }
      let interfaceData = await this.interfaceModel.get(id);
      if (!interfaceData) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '接口不存在'));
      }
      let auth = await this.checkAuth(interfaceData.project_id, 'project', 'view');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
      let result = await this.caseModel.list(id);
      for (let i = 0, len = result.length; i < len; i++) {
        let userinfo = await this.userModel.findById(result[i].uid);
        result[i] = result[i].toObject();
        result[i].username = userinfo.username;
      }

      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ err) {
      ctx.body = yapi.commons.resReturn(null, 400, err.message);
    }
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async getCase(ctx) {
    let id = ctx.query.id;
    if (!id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '缺少 id'));
    }
    let result = await this.caseModel.get({
      _id: id
    });
    if (!result) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '期望不存在'));
    }
    let interfaceData = await this.interfaceModel.get(result.interface_id);
    if (!interfaceData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '接口不存在'));
    }
    // 登录态需要项目 view 权限; token 请求经严格域已是归属项目 dev
    let auth = await this.checkAuth(interfaceData.project_id, 'project', 'view');
    if (!auth) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }

    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async saveCase(ctx) {
    let params = ctx.request.body;

    if (!params.interface_id) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少interface_id'));
    }
    if (!params.project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少project_id'));
    }

    if (!params.res_body) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '请输入 Response Body'));
    }

    // token 请求仅允许给归属项目的接口添加 Mock 期望
    let interfaceData = await this.interfaceModel.get(params.interface_id);
    if (
      !interfaceData ||
      (this.$tokenAuth && Number(interfaceData.project_id) !== Number(this.$tokenProjectId))
    ) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }

    // 登录态需要项目 edit 权限(与 upMock 对齐); token 请求经严格域已是归属项目 dev
    let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');
    if (!auth) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }

    /** @type {any} */
    let data = {
      interface_id: params.interface_id,
      project_id: interfaceData.project_id,
      ip_enable: params.ip_enable,
      name: params.name,
      params: params.params || [],
      uid: this.getUid(),
      code: params.code || 200,
      delay: params.delay || 0,
      headers: params.headers || [],
      up_time: yapi.commons.time(),
      res_body: params.res_body,
      ip: params.ip
    };

    data.code = isNaN(data.code) ? 200 : +data.code;
    data.delay = isNaN(data.delay) ? 0 : +data.delay;
    if (config.httpCodes.indexOf(data.code) === -1) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '非法的 httpCode'));
    }

    let findRepeat;
    /** @type {Record<string, any>} */
    let findRepeatParams;
    findRepeatParams = {
      project_id: data.project_id,
      interface_id: data.interface_id,
      ip_enable: data.ip_enable
    };

    if (data.params && typeof data.params === 'object' && Object.keys(data.params).length > 0) {
      for (let i in data.params) {
        findRepeatParams['params.' + i] = data.params[i];
      }
    }

    if (data.ip_enable) {
      findRepeatParams.ip = data.ip;
    }

    findRepeat = await this.caseModel.get(findRepeatParams);

    if (findRepeat && findRepeat._id !== params.id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '已存在的期望'));
    }

    let result;
    if (params.id && !isNaN(params.id)) {
      data.id = +params.id;
      result = await this.caseModel.up(data);
    } else {
      result = await this.caseModel.save(data);
    }
    return (ctx.body = yapi.commons.resReturn(result));
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async delCase(ctx) {
    let id = ctx.request.body.id;
    if (!id) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少 id'));
    }
    let caseData = await this.caseModel.get({
      _id: id
    });
    if (!caseData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '期望不存在'));
    }
    let interfaceData = await this.interfaceModel.get(caseData.interface_id);
    if (!interfaceData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '接口不存在'));
    }
    // 登录态需要项目 edit 权限; token 请求经严格域已是归属项目 dev
    let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');
    if (!auth) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }
    let result = await this.caseModel.del(id);
    return (ctx.body = yapi.commons.resReturn(result));
  }

  /**
   * @param {any} ctx Koa 请求上下文
   */
  async hideCase(ctx) {
    let id = ctx.request.body.id;
    let enable = ctx.request.body.enable;
    if (!id) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少 id'));
    }
    let caseData = await this.caseModel.get({
      _id: id
    });
    if (!caseData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '期望不存在'));
    }
    let interfaceData = await this.interfaceModel.get(caseData.interface_id);
    if (!interfaceData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '接口不存在'));
    }
    // 登录态需要项目 edit 权限; token 请求经严格域已是归属项目 dev
    let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');
    if (!auth) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
    }
    let data = {
      id,
      case_enable: enable
    };
    let result = await this.caseModel.up(data);
    return (ctx.body = yapi.commons.resReturn(result));
  }
}

module.exports = advMockController;

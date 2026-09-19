// @ts-check
/**
 * 用户头像与皮肤方法组：上传头像（uploadAvatar）、读取头像（avatar）、读取全局皮肤（getSkinConfig）、
 * 设置全局皮肤（setSkinConfig）。defaultAvatarBuffer 为模块级进程内缓存，与唯一消费方法 avatar 同模块迁入，
 * 避免拆分后模块分叉产生双份缓存。
 * 由 user.js 通过 Object.assign 合并到 userController.prototype（P9c God file 拆分，
 * 沿用 P9b interface.js 试点已验收的原型合并模式）。
 * 约束：this 由控制器实例调用时注入（原型合并模式）；各函数体自原文件原样搬移、逐字节不变，
 *       仅在 JSDoc 补充 this 标注、require 路径随目录深度调整（纯注释/导入调整，不影响运行时逻辑）。
 */
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const yapi = requireAny('../../yapi.js');
const avatarModel = requireAny('../../models/avatar.js');

// 默认头像图片内容固定不变，进程内缓存避免每次未设置头像的请求都同步读盘。
// 自 user.js 原样迁入：与唯一消费方法 avatar 同模块，保证全进程共享同一份缓存。
/** @type {Buffer | null} */
let defaultAvatarBuffer = null;

  /**
   * 上传用户头像
   * @interface /user/upload_avatar
   * @method POST
   * @param {*} basecode  base64编码，通过h5 api传给后端
   * @category user
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function uploadAvatar(ctx) {
    try {
      let basecode = ctx.request.body.basecode;
      if (!basecode) {
        return (ctx.body = yapi.commons.resReturn(null, 400, 'basecode不能为空'));
      }
      let pngPrefix = 'data:image/png;base64,';
      let jpegPrefix = 'data:image/jpeg;base64,';
      let type;
      if (basecode.substr(0, pngPrefix.length) === pngPrefix) {
        basecode = basecode.substr(pngPrefix.length);
        type = 'image/png';
      } else if (basecode.substr(0, jpegPrefix.length) === jpegPrefix) {
        basecode = basecode.substr(jpegPrefix.length);
        type = 'image/jpeg';
      } else {
        return (ctx.body = yapi.commons.resReturn(null, 400, '仅支持jpeg和png格式的图片'));
      }
      let strLength = basecode.length;
      if (parseInt(/** @type {any} */ (strLength - (strLength / 8) * 2)) > 200000) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '图片大小不能超过200kb'));
      }

      let avatarInst = yapi.getInst(avatarModel);
      let result = await avatarInst.up(this.getUid(), basecode, type);
      ctx.body = yapi.commons.resReturn(result);
    } catch (/** @type {any} */ e) {
      ctx.body = yapi.commons.resReturn(null, 401, e.message);
    }
  }

  /**
   * 根据用户uid头像
   * @interface /user/avatar
   * @method GET
   * @param {*} uid
   * @category user
   * @returns {Object}
   * @example
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function avatar(ctx) {
    try {
      let uid = ctx.query.uid ? ctx.query.uid : this.getUid();
      let avatarInst = yapi.getInst(avatarModel);
      let data = await avatarInst.get(uid);
      let dataBuffer, type;
      if (!data || !data.basecode) {
        if (!defaultAvatarBuffer) {
          defaultAvatarBuffer = yapi.fs.readFileSync(yapi.path.join(yapi.WEBROOT, 'static/image/avatar.png'));
        }
        dataBuffer = defaultAvatarBuffer;
        type = 'image/png';
      } else {
        type = data.type;
        dataBuffer = Buffer.from(data.basecode, 'base64');
      }

      ctx.set('Content-type', type);
      ctx.body = dataBuffer;
    } catch (/** @type {any} */ err) {
      ctx.body = 'error:' + err.message;
    }
  }

  /**
   * 获取全局默认皮肤
   * @interface /user/skin_config
   * @method GET
   * @category user
   * @returns {Object}
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function getSkinConfig(ctx) {
    try {
      const skinStorage = require('../../utils/storage.js')('skin_config');
      const data = await skinStorage.getItem('default');
      return (ctx.body = yapi.commons.resReturn({ skin: data || 'enterprise' }));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

  /**
   * 设置全局默认皮肤(仅 admin)
   * @interface /user/skin_config
   * @method POST
   * @category user
   * @param {String} skin 皮肤名,枚举 enterprise | gov | anime | dark
   * @returns {Object}
   */

  /**
   * @this {any}
   * @param {any} ctx Koa 请求上下文
   * @returns {Promise<any>}
   */
  async function setSkinConfig(ctx) {
    if (this.getRole() !== 'admin') {
      return (ctx.body = yapi.commons.resReturn(null, 402, '没有权限'));
    }
    const skin = ctx.request.body.skin;
    if (['enterprise', 'gov', 'anime', 'dark'].indexOf(skin) === -1) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '皮肤参数不合法'));
    }
    try {
      const skinStorage = require('../../utils/storage.js')('skin_config');
      await skinStorage.setItem('default', skin);
      return (ctx.body = yapi.commons.resReturn({ skin: skin }));
    } catch (/** @type {any} */ e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

module.exports = {
  uploadAvatar,
  avatar,
  getSkinConfig,
  setSkinConfig
};

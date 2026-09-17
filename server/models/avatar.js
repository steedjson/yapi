// @ts-check
const baseModel = require('./base.js');

class avatarModel extends baseModel {
  getName() {
    return 'avatar';
  }

  getSchema() {
    return {
      uid: { type: Number, required: true },
      basecode: String,
      type: String
    };
  }

  /**
   * 获取用户头像
   * @param {Number} uid 用户uid
   */
  get(uid) {
    return this.model.findOne({
      uid: uid
    });
  }

  /**
   * 更新用户头像
   * @param {Number} uid 用户uid
   * @param {String} basecode 头像图片的base64编码
   * @param {String} type 头像类型
   */
  up(uid, basecode, type) {
    return this.model.updateOne(
      {
        uid: uid
      },
      {
        type: type,
        basecode: basecode
      },
      {
        upsert: true
      }
    );
  }
}

module.exports = avatarModel;

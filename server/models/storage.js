// @ts-check
const baseModel = require('./base.js');
const mongoose = require('mongoose');

class stroageModel extends baseModel {
  constructor() {
    super()
    let storageCol = (/** @type {*} */ (mongoose.connection.db)).collection('storage');
    storageCol.createIndex(
      {
        key: 1
      },
      {
        unique: true
      }
    );
  }

  getName() {
    return 'storage';
  }

  getSchema() {
    return {
      // key 使用字符串 id(如皮肤配置 'skin_config'、插件命名空间);
      // storage 集合在本仓库无存量数据,且上游插件生态按字符串命名空间使用
      key: { type: String, required: true },
      data: {
        type: String,
        default: ''
      } //用于原始数据存储
    };
  }
  /**
   * 保存键值数据（isInsert 为 true 时插入新文档，否则按 key 更新）
   * @param {String} key 字符串命名空间标识
   * @param {*} data 待存储的对象数据
   * @param {Boolean} [isInsert] 是否以插入方式保存
   */
  save(key, data = {}, isInsert = false) {

    let saveData = {
      key,
      data: JSON.stringify(data, null, 2)
    };
    if(isInsert){
      let r = new this.model(saveData);
      return r.save();
    }
    return this.model.updateOne({
      key
    }, saveData)
  }

  /**
   * 按key删除存储数据
   * @param {String} key 字符串命名空间标识
   */
  del(key) {
    return this.model.deleteMany({
      key
    });
  }

  /**
   * 按key读取存储数据（无数据时自动初始化为空对象）
   * @param {String} key 字符串命名空间标识
   */
  get(key) {
    return this.model
      .findOne({
        key
      })
      .exec().then(/** @param {any} data */ data => {
        this.save(key, {})
        if (!data) return null;
        data = data.toObject().data;
        try {
          return JSON.parse(data)
        } catch (e) {
          return {}
        }
      });
  }
}

module.exports = stroageModel;

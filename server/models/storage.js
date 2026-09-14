const baseModel = require('./base.js');
const mongoose = require('mongoose');

class stroageModel extends baseModel {
  constructor() {
    super()
    let storageCol = mongoose.connection.db.collection('storage');
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

  del(key) {
    return this.model.remove({
      key
    });
  }

  get(key) {
    return this.model
      .findOne({
        key
      })
      .exec().then(data => {
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

// @ts-check
const yapi = require('../yapi.js');
const mongoose = require('mongoose');
const autoIncrement = require('../utils/mongoose-auto-increment');

/**
 * 所有的model都需要继承baseModel, 且需要 getSchema和getName方法，不然会报错
 */

class baseModel {
  constructor() {
    this.schema = new mongoose.Schema(this.getSchema());
    this.name = this.getName();

    if (this.isNeedAutoIncrement() === true) {
      this.schema.plugin(autoIncrement.plugin, {
        model: this.name,
        field: this.getPrimaryKey(),
        startAt: 11,
        incrementBy: yapi.commons.rand(1, 10)
      });
    }

    this.initIndexes();

    this.model = yapi.db(this.name, this.schema);
  }

  /**
   * 业务复合索引声明，子模型按需覆盖。autoIndex 已在 db.js 中关闭，
   * Schema 声明用于集中表达查询路径，实际创建由 install.js 同步完成。
   */
  initIndexes() {}

  isNeedAutoIncrement() {
    return true;
  }

  /**
   * 可通过覆盖此方法生成其他自增字段
   */
  getPrimaryKey() {
    return '_id';
  }

  /**
   * 获取collection的schema结构
   */
  getSchema() {
    yapi.commons.log('Model Class need getSchema function', 'error');
    // 基类占位返回空对象：子模型必须覆写 getSchema 提供真实 schema 定义
    return (/** @type {any} */ ({}));
  }

  getName() {
    yapi.commons.log('Model Class need name', 'error');
  }
}

module.exports = baseModel;

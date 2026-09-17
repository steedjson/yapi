// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');

/**
 * 接口分类
 */
class interfaceCat extends baseModel {
  getName() {
    return 'interface_cat';
  }

  getSchema() {
    return {
      name: { type: String, required: true },
      uid: { type: Number, required: true },
      project_id: { type: Number, required: true },
      parent_id: { type: Number, default: 0 },
      desc: String,
      add_time: Number,
      up_time: Number,
      index: { type: Number, default: 0 }
    };
  }

  // 分类菜单按项目筛选后按排序号排列的高频复合索引
  initIndexes() {
    this.schema.index({ project_id: 1, index: 1 });
  }

  /**
   * 新增接口分类
   * @param {*} data 分类数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 按id查询单个分类
   * @param {Number} id 分类id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  /**
   * 按名称统计分类数量（查重）
   * @param {String} name 分类名称
   */
  checkRepeat(name) {
    return this.model.countDocuments({
      name: name
    });
  }

  /**
   * 按项目id查询分类列表（按index排序）
   * @param {Number} project_id 项目id
   */
  list(project_id) {
    return this.model
      .find({
        project_id: project_id
      })
      .sort({ index: 1 })
      .exec();
  }

  /**
   * 按id删除分类
   * @param {Number} id 分类id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按项目id删除该项目下全部分类
   * @param {Number} id 项目id
   */
  delByProjectId(id) {
    return this.model.deleteMany({
      project_id: id
    });
  }

  /**
   * 更新分类并刷新更新时间
   * @param {Number} id 分类id
   * @param {*} data 待更新的分类字段
   */
  up(id, data) {
    data.up_time = yapi.commons.time();
    return this.model.updateOne(
      {
        _id: id
      },
      data
    );
  }

  /**
   * 更新分类排序号
   * @param {Number} id 分类id
   * @param {Number} index 排序号
   */
  upCatIndex(id, index) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        index: index
      }
    );
  }
}

module.exports = interfaceCat;

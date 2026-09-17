// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');

class interfaceCol extends baseModel {
  getName() {
    return 'interface_col';
  }

  getSchema() {
    return {
      name: { type: String, required: true },
      uid: { type: Number, required: true },
      project_id: { type: Number, required: true },
      desc: String,
      add_time: Number,
      up_time: Number,
      index: { type: Number, default: 0 },
      test_report: { type: String, default: '{}' },
      checkHttpCodeIs200: {
        type:Boolean,
        default: false
      },
      checkResponseSchema: {
        type:Boolean,
        default: false
      },
      checkResponseField: {
        name: {
          type: String,
          required: true,
          default: "code"
        },
        value: {
          type: String,
          required: true,
          default: "0"
        },
        enable: {
          type: Boolean,
          default: false
        }
      },
      checkScript: {
        content: {
          type: String
        },
        enable: {
          type: Boolean,
          default: false
        }
      }
    };
  }

  // 接口集列表按项目筛选后按排序号排列的高频复合索引
  initIndexes() {
    this.schema.index({ project_id: 1, index: 1 });
  }

  /**
   * 新增接口集
   * @param {*} data 接口集数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 按id查询单个接口集
   * @param {Number} id 接口集id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  /**
   * 按名称统计接口集数量（查重）
   * @param {String} name 接口集名称
   */
  checkRepeat(name) {
    return this.model.countDocuments({
      name: name
    });
  }

  /**
   * 按项目id查询接口集列表
   * @param {Number} project_id 项目id
   */
  list(project_id) {
    return this.model
      .find({
        project_id: project_id
      })
      .select('name uid project_id desc add_time up_time, index')
      .exec();
  }

  /**
   * 按id删除接口集
   * @param {Number} id 接口集id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按项目id删除该项目下全部接口集
   * @param {Number} id 项目id
   */
  delByProjectId(id) {
    return this.model.deleteMany({
      project_id: id
    });
  }

  /**
   * 更新接口集并刷新更新时间
   * @param {Number} id 接口集id
   * @param {*} data 待更新的接口集字段
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
   * 更新接口集排序号
   * @param {Number} id 接口集id
   * @param {Number} index 排序号
   */
  upColIndex(id, index) {
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

module.exports = interfaceCol;

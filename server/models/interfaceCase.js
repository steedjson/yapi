// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

class interfaceCase extends baseModel {
  getName() {
    return 'interface_case';
  }

  getSchema() {
    return {
      casename: { type: String, required: true },
      uid: { type: Number, required: true },
      col_id: { type: Number, required: true },
      index: { type: Number, default: 0 },
      project_id: { type: Number, required: true },
      interface_id: { type: Number, required: true },
      add_time: Number,
      up_time: Number,
      case_env: { type: String },
      req_params: [
        {
          name: String,
          value: String
        }
      ],
      req_headers: [
        {
          name: String,
          value: String
        }
      ],
      req_query: [
        {
          name: String,
          value: String,
          enable: { type: Boolean, default: true }
        }
      ],

      req_body_form: [
        {
          name: String,
          value: String,
          enable: { type: Boolean, default: true }
        }
      ],
      req_body_other: String,
      test_res_body: String,
      test_status: { type: String, enum: ['ok', 'invalid', 'error', ''] },
      test_res_header: Schema.Types.Mixed,
      mock_verify: { type: Boolean, default: false },
      enable_script: { type: Boolean, default: false },
      test_script: String
    };
  }

  // 接口集内用例排序与按项目删除/统计的高频复合索引
  initIndexes() {
    this.schema.index({ col_id: 1, index: 1 });
    this.schema.index({ project_id: 1 });
  }

  /**
   * 新增接口用例
   * @param {*} data 接口用例数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  //获取全部测试接口信息
  getInterfaceCaseListCount() {
    return this.model.countDocuments({});
  }

  /**
   * 按id查询单个接口用例
   * @param {Number} id 用例id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  /**
   * 一次读取多个接口集的用例，避免接口集列表逐项查询产生 N+1 请求。
   * @param {Number[]} colIds 接口集id数组
   * @param {String} [select] 可选查询字段，默认返回用例基础字段
   */
  listByColIds(colIds, select) {
    if (!colIds || colIds.length === 0) {
      return Promise.resolve([]);
    }
    select = select || 'casename uid col_id _id index interface_id project_id';
    return this.model
      .find({
        col_id: { $in: colIds }
      })
      .select(select)
      .exec();
  }

  /**
   * 按接口集id查询用例列表
   * @param {Number} col_id 接口集id
   * @param {String} [select] 可选查询字段，传 'all' 返回完整文档
   */
  list(col_id, select) {
    select = select || 'casename uid col_id _id index interface_id project_id';
    if (select === 'all') {
      return this.model
        .find({
          col_id: col_id
        })
        .exec();
    }
    return this.model
      .find({
        col_id: col_id
      })
      .select(select)
      .exec();
  }

  /**
   * 按id删除接口用例
   * @param {Number} id 用例id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按项目id删除该项目下全部接口用例
   * @param {Number} id 项目id
   */
  delByProjectId(id) {
    return this.model.deleteMany({
      project_id: id
    });
  }

  /**
   * 按接口id删除该接口下全部用例
   * @param {Number} id 接口id
   */
  delByInterfaceId(id) {
    return this.model.deleteMany({
      interface_id: id
    });
  }

  /**
   * 按接口集id删除该接口集下全部用例
   * @param {Number} id 接口集id
   */
  delByCol(id) {
    return this.model.deleteMany({
      col_id: id
    });
  }

  /**
   * 更新接口用例并刷新更新时间
   * @param {Number} id 用例id
   * @param {*} data 待更新的用例字段
   */
  up(id, data) {
    data.up_time = yapi.commons.time();
    return this.model.updateOne({ _id: id }, data);
  }

  /**
   * 更新用例排序号
   * @param {Number} id 用例id
   * @param {Number} index 排序号
   */
  upCaseIndex(id, index) {
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

module.exports = interfaceCase;

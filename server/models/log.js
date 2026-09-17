// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

class logModel extends baseModel {
  getName() {
    return 'log';
  }

  getSchema() {
    return {
      uid: { type: Number, required: true },
      typeid: { type: Number, required: true },
      type: {
        type: String,
        enum: ['user', 'group', 'interface', 'project', 'other', 'interface_col'],
        required: true
      },
      content: { type: String, required: true },
      username: { type: String, required: true },
      add_time: Number,
      data: Schema.Types.Mixed //用于原始数据存储
    };
  }

  /**
   * 新增日志
   * @param {*} data 日志数据，含 content/type/uid/username/typeid/data
   */
  save(data) {
    let saveData = {
      content: data.content,
      type: data.type,
      uid: data.uid,
      username: data.username,
      typeid: data.typeid,
      add_time: yapi.commons.time(),
      data: data.data
    };

    let log = new this.model(saveData);

    return log.save();
  }

  /**
   * 按id删除日志
   * @param {*} id 日志id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按类型id与类型查询日志列表
   * @param {*} typeid 类型id
   * @param {String} type 日志类型
   */
  list(typeid, type) {
    return this.model
      .find({
        typeid: typeid,
        type: type
      })
      .exec();
  }

  /**
   * 分页查询日志列表，支持按动态数据(wiki/接口id)过滤
   * @param {*} typeid 类型id
   * @param {String} type 日志类型
   * @param {*} page 页码
   * @param {*} limit 每页条数
   * @param {*} [selectValue] 可选过滤值，'wiki' 或接口id
   */
  listWithPaging(typeid, type, page, limit, selectValue) {
    page = parseInt(page);
    limit = parseInt(limit);
    /** @type {Record<string, any>} */
    const params = {
      type: type,
      typeid: typeid
    };

    if (selectValue === 'wiki') {
      params['data.type'] = selectValue;
    }
    if (selectValue && !isNaN(selectValue)) {
      params['data.interface_id'] = +selectValue;
    }
    return this.model
      .find(params)
      .sort({ add_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }
  /**
   * 分页查询分组及其下属项目的日志列表
   * @param {*} typeid 分组id
   * @param {Number[]} pidList 项目id数组
   * @param {*} page 页码
   * @param {*} limit 每页条数
   */
  listWithPagingByGroup(typeid, pidList, page, limit) {
    page = parseInt(page);
    limit = parseInt(limit);
    return this.model
      .find({
        $or: [
          {
            type: 'project',
            typeid: { $in: pidList }
          },
          {
            type: 'group',
            typeid: typeid
          }
        ]
      })
      .sort({ add_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }
  /**
   * 统计分组及其下属项目的日志数量
   * @param {*} typeid 分组id
   * @param {Number[]} pidList 项目id数组
   */
  listCountByGroup(typeid, pidList) {
    return this.model.countDocuments({
      $or: [
        {
          type: 'project',
          typeid: { $in: pidList }
        },
        {
          type: 'group',
          typeid: typeid
        }
      ]
    });
  }
  /**
   * 统计日志数量，支持按动态数据(wiki/接口id)过滤
   * @param {*} typeid 类型id
   * @param {String} type 日志类型
   * @param {*} [selectValue] 可选过滤值，'wiki' 或接口id
   */
  listCount(typeid, type, selectValue) {
    /** @type {Record<string, any>} */
    const params = {
      type: type,
      typeid: typeid
    };

    if (selectValue === 'wiki') {
      params['data.type'] = selectValue;
    }

    if (selectValue && !isNaN(selectValue)) {
      params['data.interface_id'] = +selectValue;
    }
    return this.model.countDocuments(params);
  }

  /**
   * 查询某条接口最近一条日志
   * @param {*} typeid 类型id
   * @param {String} type 日志类型
   * @param {*} interfaceId 接口id
   */
  listWithCatid(typeid, type, interfaceId) {
    /** @type {Record<string, any>} */
    const params = {
      type: type,
      typeid: typeid
    };
    if (interfaceId && !isNaN(interfaceId)) {
      params['data.interface_id'] = +interfaceId;
    }
    return this.model
      .find(params)
      .sort({ add_time: -1 })
      .limit(1)
      .select('uid content type username typeid add_time')
      .exec();
  }
}

module.exports = logModel;

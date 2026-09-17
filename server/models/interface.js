// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');

class interfaceModel extends baseModel {
  // 只统一空批量参数的快速返回，不改变非空参数的原始查询内容。
  /**
   * 判断批量id参数是否为空
   * @param {any[]} ids id数组
   */
  _hasNoIds(ids) {
    return !ids || ids.length === 0;
  }

  getName() {
    return 'interface';
  }

  getSchema() {
    return {
      title: { type: String, required: true },
      uid: { type: Number, required: true },
      path: { type: String, required: true },
      method: { type: String, required: true },
      project_id: { type: Number, required: true },
      catid: { type: Number, required: true },
      edit_uid: { type: Number, default: 0 },
      status: { type: String, enum: ['undone', 'done'], default: 'undone' },
      desc: String,
      markdown: String,
      add_time: Number,
      up_time: Number,
      type: { type: String, enum: ['static', 'var'], default: 'static' },
      query_path: {
        path: String,
        params: [
          {
            name: String,
            value: String
          }
        ]
      },
      req_query: [
        {
          name: String,
          value: String,
          example: String,
          desc: String,
          required: {
            type: String,
            enum: ['1', '0'],
            default: '1'
          }
        }
      ],
      req_headers: [
        {
          name: String,
          value: String,
          example: String,
          desc: String,
          required: {
            type: String,
            enum: ['1', '0'],
            default: '1'
          }
        }
      ],
      req_params: [
        {
          name: String,
          desc: String,
          example: String
        }
      ],
      req_body_type: {
        type: String,
        enum: ['form', 'json', 'text', 'file', 'raw']
      },
      req_body_is_json_schema: { type: Boolean, default: false },
      req_body_form: [
        {
          name: String,
          type: { type: String, enum: ['text', 'file'] },
          example: String,
          value: String,
          desc: String,
          required: {
            type: String,
            enum: ['1', '0'],
            default: '1'
          }
        }
      ],
      req_body_other: String,
      res_body_type: {
        type: String,
        enum: ['json', 'text', 'xml', 'raw', 'json-schema']
      },
      res_body: String,
      res_body_is_json_schema: { type: Boolean, default: false },
      custom_field_value: String,
      field2: String,
      field3: String,
      api_opened: { type: Boolean, default: false },
      index: { type: Number, default: 0 },
      tag: Array
    };
  }

  // MockServer 路由匹配（getByPath/checkRepeat）与接口菜单、列表排序的高频复合索引
  initIndexes() {
    this.schema.index({ project_id: 1, path: 1, method: 1 });
    this.schema.index({ project_id: 1, catid: 1, index: 1 });
    this.schema.index({ project_id: 1, index: 1 });
  }

  /**
   * 新增接口
   * @param {*} data 接口数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 按id查询单个接口
   * @param {*} id 接口id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  /**
   * 批量读取测试用例关联的接口详情，避免逐条读取接口。
   * @param {any[]} ids 接口id数组
   */
  getByIds(ids) {
    if (this._hasNoIds(ids)) {
      return Promise.resolve([]);
    }
    return this.model
      .find({
        _id: { $in: ids }
      })
      .exec();
  }

  /**
   * 按id查询接口基础信息
   * @param {*} id 接口id
   */
  getBaseinfo(id) {
    return this.model
      .findOne({
        _id: id
      })
      .select('path method uid title project_id cat_id status ')
      .exec();
  }

  /**
   * 批量读取用例所需的接口基础信息，避免每条用例单独查询接口。
   * @param {any[]} ids 接口id数组
   */
  getBaseinfoByIds(ids) {
    if (this._hasNoIds(ids)) {
      return Promise.resolve([]);
    }
    return this.model
      .find({
        _id: { $in: ids }
      })
      .select('path method uid title project_id cat_id status ')
      .exec();
  }

  /**
   * 查询项目下某方法的所有可变接口
   * @param {*} project_id 项目id
   * @param {String} method 请求方法
   */
  getVar(project_id, method) {
    return this.model
      .find({
        project_id: project_id,
        type: 'var',
        method: method
      })
      .select('_id path')
      .exec();
  }

  /**
   * 按 query_path 中的路径查询接口
   * @param {*} project_id 项目id
   * @param {String} path query_path路径
   * @param {String} method 请求方法
   */
  getByQueryPath(project_id, path, method) {
    return this.model
      .find({
        project_id: project_id,
        'query_path.path': path,
        method: method
      })
      .exec();
  }

  /**
   * 按路径与方法查询接口列表
   * @param {*} project_id 项目id
   * @param {String} path 接口路径
   * @param {String} method 请求方法
   * @param {String} [select] 可选查询字段，默认返回接口完整字段
   */
  getByPath(project_id, path, method, select) {
    select =
      select ||
      '_id title uid path method project_id catid edit_uid status add_time up_time type query_path req_query req_headers req_params req_body_type req_body_form req_body_other res_body_type custom_field_value res_body res_body_is_json_schema req_body_is_json_schema';
    return this.model
      .find({
        project_id: project_id,
        path: path,
        method: method
      })
      .select(select)
      .exec();
  }

  /**
   * 检查同路径同方法的接口是否重复
   * @param {*} id 项目id
   * @param {String} path 接口路径
   * @param {String} method 请求方法
   */
  checkRepeat(id, path, method) {
    return this.model.countDocuments({
      project_id: id,
      path: path,
      method: method
    });
  }

  /**
   * 统计项目下的接口数量
   * @param {*} id 项目id
   */
  countByProjectId(id) {
    return this.model.countDocuments({
      project_id: id
    });
  }

  /**
   * 查询项目下的接口列表
   * @param {*} project_id 项目id
   * @param {String} [select] 可选查询字段，默认返回接口基础字段
   */
  list(project_id, select) {
    select =
      select || '_id title uid path method project_id catid edit_uid status add_time up_time';
    return this.model
      .find({
        project_id: project_id
      })
      .select(select)
      .sort({ title: 1 })
      .exec();
  }

  /**
   * 分页查询项目下的接口列表
   * @param {*} project_id 项目id
   * @param {*} page 页码
   * @param {*} limit 每页条数
   */
  listWithPage(project_id, page, limit) {
    page = parseInt(page);
    limit = parseInt(limit);
    return this.model
      .find({
        project_id: project_id
      })
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        '_id title uid path method project_id catid api_opened edit_uid status add_time up_time tag'
      )
      .exec();
  }

  /**
   * 按项目id查询接口列表并按标题排序
   * @param {*} project_id 项目id
   */
  listByPid(project_id) {
    return this.model
      .find({
        project_id: project_id
      })
      .sort({ title: 1 })
      .exec();
  }

  /**
   * 一次读取项目接口，避免分类菜单按分类逐次查询产生 N+1 请求。
   * @param {*} project_id 项目id
   */
  listByProjectIdForMenu(project_id) {
    return this.model
      .find({
        project_id: project_id
      })
      .select('_id title uid path method project_id catid edit_uid status add_time up_time index tag')
      .sort({ catid: 1, index: 1 })
      .exec();
  }

  //获取全部接口信息
  getInterfaceListCount() {
    return this.model.countDocuments({});
  }

  /**
   * 按分类id查询接口列表
   * @param {*} catid 分类id
   * @param {String} [select] 可选查询字段，默认返回接口基础字段
   */
  listByCatid(catid, select) {
    select =
      select || '_id title uid path method project_id catid edit_uid status add_time up_time index tag';
    return this.model
      .find({
        catid: catid
      })
      .select(select)
      .sort({ index: 1 })
      .exec();
  }

  /**
   * 批量读取多个分类下的接口，供分类删除等场景减少重复查询。
   * @param {any[]} catids 分类id数组
   * @param {String} [select] 可选查询字段，默认返回接口基础字段
   */
  listByCatids(catids, select) {
    if (this._hasNoIds(catids)) {
      return Promise.resolve([]);
    }
    select =
      select || '_id title uid path method project_id catid edit_uid status add_time up_time index tag';
    return this.model
      .find({
        catid: { $in: catids }
      })
      .select(select)
      .sort({ catid: 1, index: 1 })
      .exec();
  }

  /**
   * 分页查询分类下的接口列表
   * @param {*} catid 分类id
   * @param {*} page 页码
   * @param {*} limit 每页条数
   */
  listByCatidWithPage(catid, page, limit) {
    page = parseInt(page);
    limit = parseInt(limit);
    return this.model
      .find({
        catid: catid
      })
      .sort({ index: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        '_id title uid path method project_id catid edit_uid api_opened status add_time up_time, index, tag'
      )
      .exec();
  }

  /**
   * 按查询条件分页查询接口列表
   * @param {Record<string, any>} option 查询条件
   * @param {*} page 页码
   * @param {*} limit 每页条数
   */
  listByOptionWithPage(option, page, limit) {
    page = parseInt(page);
    limit = parseInt(limit);
    return this.model
      .find(option)
      .sort({index: 1})
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        '_id title uid path method project_id catid edit_uid api_opened status add_time up_time, index, tag'
      )
      .exec();
  }

  /**
   * 按开放状态查询分类下的接口列表
   * @param {*} catid 分类id
   * @param {String} status 开放状态，'open' 表示仅查开放接口
   */
  listByInterStatus(catid, status) {
    /** @type {Record<string, any>} */
    let option = {};
    if (status === 'open') {
      option = {
        catid: catid,
        api_opened: true
      };
    } else {
      option = {
        catid: catid
      };
    }
    return this.model
      .find(option)
      .select()
      .sort({ title: 1 })
      .exec();
  }

  /**
   * 批量读取多个分类下的开放接口，供开放接口列表减少分类循环查询。
   * @param {any[]} catids 分类id数组
   */
  listOpenByCatids(catids) {
    if (this._hasNoIds(catids)) {
      return Promise.resolve([]);
    }
    return this.model
      .find({
        catid: { $in: catids },
        api_opened: true
      })
      .sort({ title: 1 })
      .exec();
  }

  /**
   * 按id删除接口
   * @param {*} id 接口id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按分类id删除接口
   * @param {*} id 分类id
   */
  delByCatid(id) {
    return this.model.deleteMany({
      catid: id
    });
  }

  /**
   * 按项目id删除接口
   * @param {*} id 项目id
   */
  delByProjectId(id) {
    return this.model.deleteMany({
      project_id: id
    });
  }

  /**
   * 更新接口信息并刷新更新时间
   * @param {*} id 接口id
   * @param {Record<string, any>} data 待更新的接口字段
   */
  up(id, data) {
    data.up_time = yapi.commons.time();
    return this.model.updateOne(
      {
        _id: id
      },
      data,
      { runValidators: true }
    );
  }

  /**
   * 更新接口的编辑者
   * @param {*} id 接口id
   * @param {Number} uid 编辑者用户id
   */
  upEditUid(id, uid) {
    return this.model.updateOne(
      {
        _id: id
      },
      { edit_uid: uid },
      { runValidators: true }
    );
  }
  /**
   * 查询项目下自定义字段值匹配的接口列表
   * @param {*} id 项目id
   * @param {String} value 自定义字段值
   */
  getcustomFieldValue(id, value) {
    return this.model
      .find({
        project_id: id,
        custom_field_value: value
      })
      .select(
        'title uid path method edit_uid status desc add_time up_time type query_path req_query req_headers req_params req_body_type req_body_form req_body_other res_body_type custom_field_value'
      )
      .exec();
  }

  /**
   * 批量读取多个项目的自定义字段接口，避免项目循环产生重复查询。
   * @param {any[]} ids 项目id数组
   * @param {String} value 自定义字段值
   */
  getcustomFieldValueByProjectIds(ids, value) {
    if (this._hasNoIds(ids)) {
      return Promise.resolve([]);
    }
    return this.model
      .find({
        project_id: { $in: ids },
        custom_field_value: value
      })
      .select(
        'project_id title uid path method edit_uid status desc add_time up_time type query_path req_query req_headers req_params req_body_type req_body_form req_body_other res_body_type custom_field_value'
      )
      .exec();
  }

  /**
   * 按查询条件统计接口数量
   * @param {Record<string, any>} option 查询条件
   */
  listCount(option) {
    return this.model.countDocuments(option);
  }

  /**
   * 更新接口的排序序号
   * @param {*} id 接口id
   * @param {Number} index 排序序号
   */
  upIndex(id, index) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        index: index
      }
    );
  }

  /**
   * 按关键字搜索接口，匹配title或path
   * @param {String} keyword 搜索关键字
   */
  search(keyword) {
    return this.model
      .find({
        $or: [
          { 'title': new RegExp(keyword, 'ig') },
          { 'path': new RegExp(keyword, 'ig') }
        ]
      })
      .limit(10);
  }
}

module.exports = interfaceModel;
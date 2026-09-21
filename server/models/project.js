// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');

class projectModel extends baseModel {
  getName() {
    return 'project';
  }

  constructor(){
    super()
    this.handleEnvNullData = this.handleEnvNullData.bind(this)
  }

  /**
   * 按用户id查询其有权限访问的项目所属分组
   * @param {Number} uid 用户id
   */
  getAuthList(uid){
    return this.model.find({
      $or: [{
        'members.uid': uid,
        project_type: 'private'
      }, {
        uid,
        project_type: 'private'
      }, {
        project_type: 'public'
      }]
    }).select('group_id')
    .exec();
  }

  getSchema() {
    return {
      uid: { type: Number, required: true },
      name: { type: String, required: true },
      basepath: { type: String },
      switch_notice: { type: Boolean, default: true },
      desc: String,
      group_id: { type: Number, required: true },
      project_type: { type: String, required: true, enum: ['public', 'private'] },
      members: [
        {
          uid: Number,
          role: { type: String, enum: ['owner', 'dev'] },
          username: String,
          email: String,
          email_notice: { type: Boolean, default: true }
        }
      ],
      env: [{ name: String, domain: String, header: Array, global: [{
        name: String,
        value: String
      }] }],
      icon: String,
      color: String,
      add_time: Number,
      up_time: Number,
      pre_script: String,
      after_script: String,
      project_mock_script: String,
      is_mock_open: { type: Boolean, default: false },
      strice: { type: Boolean, default: false },
      is_json5: { type: Boolean, default: true },
      tag: [{name: String, desc: String}]
    };
  }

  // 项目列表按分组筛选的高频查询索引
  initIndexes() {
    this.schema.index({ group_id: 1 });
  }

  /**
   * 按成员uid批量更新项目内成员的用户名与邮箱
   * @param {*} data 成员更新数据，含 uid/username/email
   */
  updateMember(data) {
    return this.model.updateOne(
      {
        'members.uid': data.uid
      },
      {
        $set: {
          'members.$.username': data.username,
          'members.$.email': data.email
        }
      }
    );
  }

  /**
   * 新增项目
   * @param {*} data 项目数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 清洗项目环境数据中的非法 global 项，并回写修复结果
   * @param {Record<string, any>} data 项目文档，可为 mongoose 文档对象
   */
  handleEnvNullData(data){
    // findOne/get 未命中时上游会传入 null，直接透传，避免 null.toObject 抛 TypeError
    if (!data) return data;
    data = data.toObject();
    data.toObject = ()=> data;
    let isFix = false;
    if(Array.isArray(data.env)){
      data.env = data.env.map(item=>{
        item.global = item.global.filter(/** @param {*} g */ g => {
          if(!g || typeof g !== 'object'){
            isFix = true;
            return false;
          }
          return true;
        })
        return item;
      })
    }
    
    if(isFix){
      this.model.updateOne(
        {
          _id: data._id

        },
        {
          $set: { env: data.env }
        },
        { runValidators: true }
      );
    }
    return data;
  }

  /**
   * 按id查询单个项目
   * @param {*} id 项目id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec().then(this.handleEnvNullData)
  }

  /**
   * 按id查询单个项目的环境配置
   * @param {*} id 项目id
   */
  getByEnv(id) {
    return this.model
      .findOne({
        _id: id
      })
      .select('env')
      .exec().then(this.handleEnvNullData);
  }

  /**
   * 统计用户在指定分组下有权限的项目数量
   * @param {Number} group_id 分组id
   * @param {Number} uid 用户id
   */
  getProjectWithAuth(group_id, uid) {
    return this.model.countDocuments({
      group_id: group_id,
      'members.uid': uid
    });
  }

  /**
   * 按id查询项目基础信息
   * @param {*} id 项目id
   * @param {String} [select] 可选查询字段，默认返回项目基础字段
   */
  getBaseInfo(id, select) {
    select =
      select ||
      '_id uid name basepath switch_notice desc group_id project_type env icon color add_time up_time pre_script after_script project_mock_script is_mock_open strice is_json5 tag';
    return this.model
      .findOne({
        _id: id
      })
      .select(select)
      .exec().then(this.handleEnvNullData);
  }

  /**
   * 批量读取项目基础信息，供接口集环境列表复用，避免逐个项目查询。
   * @param {Number[]} ids 项目id数组
   * @param {String} [select] 可选查询字段，默认返回 _id uid name env
   */
  listBaseInfoByIds(ids, select) {
    if (!ids || ids.length === 0) {
      return Promise.resolve([]);
    }
    select = select || '_id uid name env';
    return this.model
      .find({
        _id: { $in: ids }
      })
      .select(select)
      .exec()
      .then(/** @param {any[]} list */ list => list.map(this.handleEnvNullData));
  }

  /**
   * 按域名查询项目列表
   * @param {String} domain 项目域名
   */
  getByDomain(domain) {
    return this.model
      .find({
        prd_host: domain
      })
      .exec().then(this.handleEnvNullData);
  }

  /**
   * 检查分组内项目名称是否重复
   * @param {String} name 项目名称
   * @param {Number} groupid 分组id
   */
  checkNameRepeat(name, groupid) {
    return this.model.countDocuments({
      name: name,
      group_id: groupid
    });
  }

  /**
   * 检查域名与基础路径组合是否重复
   * @param {String} domain 项目域名
   * @param {String} basepath 基础路径
   */
  checkDomainRepeat(domain, basepath) {
    return this.model.countDocuments({
      prd_host: domain,
      basepath: basepath
    });
  }

  /**
   * 按分组id查询项目列表
   * @param {Number} group_id 分组id
   */
  list(group_id) {
    let params = { group_id: group_id };
    return this.model
      .find(params)
      .select(
        '_id uid name basepath switch_notice desc group_id project_type color icon env add_time up_time'
      )
      .sort({ _id: -1 })
      .exec();
  }

  // 获取项目数量统计
  getProjectListCount() {
    return this.model.countDocuments();
  }

  /**
   * 统计公开项目数量
   * @param {Number} group_id 分组id
   */
  countWithPublic(group_id) {
    let params = { group_id: group_id, project_type: 'public' };
    return this.model.countDocuments(params);
  }

  /**
   * 分页查询分组下的项目列表
   * @param {Number} group_id 分组id
   * @param {*} page 页码
   * @param {*} limit 每页条数
   */
  listWithPaging(group_id, page, limit) {
    page = parseInt(page);
    limit = parseInt(limit);
    return this.model
      .find({
        group_id: group_id
      })
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  /**
   * 统计分组下的项目数量
   * @param {Number} group_id 分组id
   */
  listCount(group_id) {
    return this.model.countDocuments({
      group_id: group_id
    });
  }

  /**
   * 按分组id统计项目数量
   * @param {Number} group_id 分组id
   */
  countByGroupId(group_id) {
    return this.model.countDocuments({
      group_id: group_id
    });
  }

  /**
   * 按id删除项目
   * @param {*} id 项目id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 按分组id删除项目
   * @param {Number} groupId 分组id
   */
  delByGroupid(groupId) {
    return this.model.deleteMany({
      group_id: groupId
    });
  }

  /**
   * 更新项目信息并刷新更新时间
   * @param {*} id 项目id
   * @param {Record<string, any>} data 待更新的项目字段
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
   * 向项目批量添加成员
   * @param {*} id 项目id
   * @param {Object[]} data 待添加的成员数组
   */
  addMember(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        // $push: { members: data }
        $push: { members: { $each: data } }
      }
    );
  }

  /**
   * 按成员uid从项目中删除成员
   * @param {*} id 项目id
   * @param {Number} uid 成员用户id
   */
  delMember(id, uid) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        $pull: { members: { uid: uid } }
      }
    );
  }

  /**
   * 按项目id与成员uid统计成员记录（查重）
   * @param {*} id 项目id
   * @param {Number} uid 成员用户id
   */
  checkMemberRepeat(id, uid) {
    return this.model.countDocuments({
      _id: id,
      'members.uid': uid
    });
  }

  /**
   * 修改项目内成员角色
   * @param {*} id 项目id
   * @param {Number} uid 成员用户id
   * @param {String} role 角色，仅允许owner|dev
   */
  changeMemberRole(id, uid, role) {
    return this.model.updateOne(
      {
        _id: id,
        'members.uid': uid
      },
      {
        $set: { 'members.$.role': role }
      }
    );
  }

  /**
   * 修改项目内成员的消息提醒开关
   * @param {*} id 项目id
   * @param {Number} uid 成员用户id
   * @param {Boolean} notice 是否提醒
   */
  changeMemberEmailNotice(id, uid, notice) {
    return this.model.updateOne(
      {
        _id: id,
        'members.uid': uid
      },
      {
        $set: { 'members.$.email_notice': notice }
      }
    );
  }

  /**
   * 按关键字搜索项目，按name不区分大小写匹配
   * @param {String} keyword 搜索关键字
   */
  search(keyword) {
    return this.model
      .find({
        name: new RegExp(keyword, 'ig')
      })
      .limit(10);
  }
}

module.exports = projectModel;

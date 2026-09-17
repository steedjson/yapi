// @ts-check
const yapi = require('../yapi.js');
const baseModel = require('./base.js');

class groupModel extends baseModel {
  getName() {
    return 'group';
  }

  getSchema() {
    return {
      uid: Number,
      group_name: String,
      group_desc: String,
      add_time: Number,
      up_time: Number,
      type: { type: String, default: 'public', enum: ['public', 'private'] },
      members: [
        {
          uid: Number,
          role: { type: String, enum: ['owner', 'dev'] },
          username: String,
          email: String
        }
      ],

      custom_field1: {
        name: String,
        enable: { type: Boolean, default: false }
      }
      // custom_field2: {
      //   name: String,
      //   enable: { type: Boolean, default: false }
      // },
      // custom_field3: {
      //   name: String,
      //   enable: { type: Boolean, default: false }
      // }
    };
  }

  /**
   * 新增分组
   * @param {*} data 分组数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 按id查询单个分组
   * @param {Number} id 分组id
   */
  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  /**
   * 按成员uid批量更新分组内成员的用户名与邮箱
   * @param {*} data 成员更新数据，含 uid/username/email
   */
  updateMember(data) {
    return this.model.updateMany(
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
   * 按用户id查询其个人分组
   * @param {Number} uid 用户id
   */
  getByPrivateUid(uid) {
    return this.model
      .findOne({
        uid: uid,
        type: 'private'
      })
      .select('group_name _id group_desc add_time up_time type custom_field1')
      .exec();
  }

  /**
   * 按id查询单个分组
   * @param {Number} id 分组id
   */
  getGroupById(id) {
    return this.model
      .findOne({
        _id: id
      })
      .select('uid group_name group_desc add_time up_time type custom_field1')
      .exec();
  }

  /**
   * 按名称统计分组数量（查重）
   * @param {String} name 分组名称
   */
  checkRepeat(name) {
    return this.model.countDocuments({
      group_name: name
    });
  }
  //  分组数量统计
  getGroupListCount() {
    return this.model.countDocuments({ type: 'public' });
  }

  /**
   * 向分组批量添加成员
   * @param {Number} id 分组id
   * @param {Object[]} data 待添加的成员数组
   */
  addMember(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        // $push: { members: data },
        $push: { members: { $each: data } }
      }
    );
  }

  /**
   * 按成员uid从分组中删除成员
   * @param {Number} id 分组id
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
   * 修改分组内成员角色
   * @param {Number} id 分组id
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
   * 按分组id与成员uid统计成员记录（查重）
   * @param {Number} id 分组id
   * @param {Number} uid 成员用户id
   */
  checkMemberRepeat(id, uid) {
    return this.model.countDocuments({
      _id: id,
      'members.uid': uid
    });
  }

  list() {
    return this.model
      .find({
        type: 'public'
      })
      .select('group_name _id group_desc add_time up_time type uid custom_field1')
      .exec();
  }

  /**
   * 按用户id查询其有权限访问的公开分组
   * @param {Number} uid 用户id
   */
  getAuthList(uid){
    return this.model.find({
      $or: [{
        'members.uid': uid,
        'type': 'public'
      }, {
        'type': 'public',
        uid
      }]
    }).select(' _id group_name group_desc add_time up_time type uid custom_field1')
    .exec();

  }

  /**
   * 按分组id数组查询公开分组
   * @param {Number[]} [ids] 分组id数组，默认为空数组
   */
  findByGroups(ids = []){
    return this.model.find({
      _id: {
        $in: ids
      },
      type: 'public'
    })
  }

  /**
   * 按id删除分组
   * @param {Number} id 分组id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 更新分组基础信息并刷新更新时间
   * @param {Number} id 分组id
   * @param {*} data 待更新的分组字段，含 custom_field1/group_name/group_desc
   */
  up(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        custom_field1: data.custom_field1,
        group_name: data.group_name,
        group_desc: data.group_desc,
        up_time: yapi.commons.time()
      }
    );
  }

  /**
   * 按名称查询启用的自定义字段分组
   * @param {String} name 自定义字段名称
   */
  getcustomFieldName(name) {
    return this.model
      .find({
        'custom_field1.name': name,
        'custom_field1.enable': true
      })
      .select('_id')
      .exec();
  }

  /**
   * 按关键字搜索分组，按group_name不区分大小写匹配
   * @param {String} keyword 搜索关键字
   */
  search(keyword) {
    return this.model
      .find({
        group_name: new RegExp(keyword, 'i')
      })
      .limit(10);
  }
}

module.exports = groupModel;

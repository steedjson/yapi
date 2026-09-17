// @ts-check
const baseModel = require('./base.js');

class userModel extends baseModel {
  getName() {
    return 'user';
  }

  getSchema() {
    return {
      username: {
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true
      },
      passsalt: String,
      study: { type: Boolean, default: false },
      role: String,
      disabled: { type: Boolean, default: false }, //账号是否被禁用, 旧数据无此字段视为启用
      add_time: Number,
      up_time: Number,
      type: { type: String, enum: ['site', 'third'], default: 'site' } //site用户是网站注册用户, third是第三方登录过来的用户
    };
  }

  /**
   * 新增用户
   * @param {*} data 用户数据
   */
  save(data) {
    let user = new this.model(data);
    return user.save();
  }

  /**
   * 按邮箱统计用户数量（查重）
   * @param {String} email 邮箱
   */
  checkRepeat(email) {
    return this.model.countDocuments({
      email: email
    });
  }

  list() {
    return this.model
      .find()
      .select('_id username email role type  add_time up_time study')
      .exec(); //显示id name email role
  }

  /**
   * 按用户id数组批量查询用户
   * @param {Number[]} uids 用户id数组
   */
  findByUids(uids) {
    return this.model
      .find({
        _id: { $in: uids }
      })
      .select('_id username email role type  add_time up_time study')
      .exec();
  }

  /**
   * 分页查询用户列表，支持按email/username关键字过滤
   * @param {*} page 页码
   * @param {*} limit 每页条数
   * @param {String} [keyword] 可选过滤关键字，按email/username不区分大小写匹配
   */
  listWithPaging(page, limit, keyword) {
    page = parseInt(page);
    limit = parseInt(limit);
    let query = {};
    if (keyword) {
      //参照 search(): 按 email/username 不区分大小写正则过滤
      query = {
        $or: [{ email: new RegExp(keyword, 'i') }, { username: new RegExp(keyword, 'i') }]
      };
    }
    return this.model
      .find(query)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('_id username email role type  add_time up_time study disabled')
      .exec();
  }

  /**
   * 统计用户总数，支持按email/username关键字过滤
   * @param {String} [keyword] 可选过滤关键字
   */
  listCount(keyword) {
    let query = {};
    if (keyword) {
      query = {
        $or: [{ email: new RegExp(keyword, 'i') }, { username: new RegExp(keyword, 'i') }]
      };
    }
    return this.model.countDocuments(query);
  }

  /**
   * 按邮箱查询单个用户
   * @param {String} email 邮箱
   */
  findByEmail(email) {
    return this.model.findOne({ email: email });
  }

  /**
   * 按id查询单个用户
   * @param {Number} id 用户id
   */
  findById(id) {
    return this.model.findOne({
      _id: id
    });
  }

  /**
   * 按id删除用户
   * @param {Number} id 用户id
   */
  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  /**
   * 更新用户信息
   * @param {Number} id 用户id
   * @param {*} data 待更新的用户字段
   */
  update(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      data
    );
  }

  /**
   * 按关键字搜索用户，按email/username不区分大小写匹配
   * @param {String} keyword 搜索关键字
   */
  search(keyword) {
    return this.model
      .find(
        {
          $or: [{ email: new RegExp(keyword, 'i') }, { username: new RegExp(keyword, 'i') }]
        },
        {
          passsalt: 0,
          password: 0
        }
      )
      .limit(10);
  }
}

module.exports = userModel;

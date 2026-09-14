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

  save(data) {
    let user = new this.model(data);
    return user.save();
  }

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

  findByUids(uids) {
    return this.model
      .find({
        _id: { $in: uids }
      })
      .select('_id username email role type  add_time up_time study')
      .exec();
  }

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

  listCount(keyword) {
    let query = {};
    if (keyword) {
      query = {
        $or: [{ email: new RegExp(keyword, 'i') }, { username: new RegExp(keyword, 'i') }]
      };
    }
    return this.model.countDocuments(query);
  }

  findByEmail(email) {
    return this.model.findOne({ email: email });
  }

  findById(id) {
    return this.model.findOne({
      _id: id
    });
  }

  del(id) {
    return this.model.deleteMany({
      _id: id
    });
  }

  update(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      data
    );
  }

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

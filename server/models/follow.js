// @ts-check
const baseModel = require('./base.js');

class followModel extends baseModel {
  getName() {
    return 'follow';
  }

  getSchema() {
    return {
      uid: { type: Number, required: true },
      projectid: { type: Number, required: true },
      projectname: { type: String, required: true },
      icon: String,
      color: String
    };
  }

  /**
   * 新增关注（关注项目）
   * @param {*} data 关注数据，含 uid/projectid/projectname/icon/color
   */
  save(data) {
    //关注
    let saveData = {
      uid: data.uid,
      projectid: data.projectid,
      projectname: data.projectname,
      icon: data.icon,
      color: data.color
    };
    let follow = new this.model(saveData);
    return follow.save();
  }

  /**
   * 按项目id与用户id取消关注
   * @param {Number} projectid 项目id
   * @param {Number} uid 用户id
   */
  del(projectid, uid) {
    return this.model.deleteMany({
      projectid: projectid,
      uid: uid
    });
  }

  /**
   * 按项目id删除该项目下全部关注记录
   * @param {Number} projectid 项目id
   */
  delByProjectId(projectid){
    return this.model.deleteMany({
      projectid: projectid
    })
  }

  /**
   * 按用户id查询其关注的全部项目
   * @param {Number} uid 用户id
   */
  list(uid) {
    return this.model
      .find({
        uid: uid
      })
      .exec();
  }

  /**
   * 按项目id查询全部关注记录
   * @param {Number} projectid 项目id
   */
  listByProjectId(projectid) {
    return this.model.find({
      projectid: projectid
    });
  }

  /**
   * 按用户id与项目id统计关注记录（查重）
   * @param {Number} uid 用户id
   * @param {Number} projectid 项目id
   */
  checkProjectRepeat(uid, projectid) {
    return this.model.countDocuments({
      uid: uid,
      projectid: projectid
    });
  }

  /**
   * 按用户id与项目id更新关注记录
   * @param {Number} id 用户id
   * @param {Number} typeid 项目id
   * @param {*} data 待更新的关注字段
   */
  updateById(id, typeid, data) {
    return this.model.updateOne(
      {
        uid: id,
        projectid: typeid
      },
      data,
      { runValidators: true }
    );
  }
}

module.exports = followModel;

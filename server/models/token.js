// @ts-check
const baseModel = require('./base.js');

class tokenModel extends baseModel {
  getName() {
    return 'token';
  }

  getSchema() {
    return {
      project_id: { type: Number, required: true },
      token: String
    };
  }

  /**
   * 新增项目token
   * @param {*} data token数据
   */
  save(data) {
    let m = new this.model(data);
    return m.save();
  }

  /**
   * 按项目id查询token
   * @param {Number} project_id 项目id
   */
  get(project_id) {
    return this.model.findOne({
      project_id: project_id
    });
  }

  /**
   * 按token值反查项目id
   * @param {String} token 项目token
   */
  findId(token) {
    return this.model
      .findOne({
        token: token
      })
      .select('project_id')
      .exec();
  }

  /**
   * 更新项目token
   * @param {Number} project_id 项目id
   * @param {String} token 项目token
   */
  up(project_id, token) {
    return this.model.updateOne(
      {
        project_id: project_id
      },
      {
        token: token
      }
    );
  }
}

module.exports = tokenModel;

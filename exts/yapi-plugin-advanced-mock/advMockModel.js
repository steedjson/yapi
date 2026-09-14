const yapi = require('yapi.js');
const baseModel = require('models/base.js');

class advMockModel extends baseModel {
  getName() {
    return 'adv_mock';
  }

  getSchema() {
    return {
      interface_id: { type: Number, required: true },
      project_id: {type: Number, required: true},
      enable: {type: Boolean, default: false}, 
      mock_script: String,
      uid: String,
      up_time: Number
    };
  }

  get(interface_id) {

    return this.model.findOne({
      interface_id: interface_id
    });
  }

  delByInterfaceId(interface_id) {
    // mongoose 7 起移除 Model.remove，等价替换为 deleteMany。
    return this.model.deleteMany({
      interface_id: interface_id
    });
  }

  delByProjectId(project_id){
    return this.model.deleteMany({
      project_id: project_id
    })
  }

  save(data) {
    data.up_time = yapi.commons.time();
    let m = new this.model(data);
    return m.save();
  }

  up(data) {
    data.up_time = yapi.commons.time();
    // mongoose 7 起移除 Model.update，接口维度单条配置，等价替换为 updateOne（保留 upsert）。
    return this.model.updateOne({
      interface_id: data.interface_id
    }, {
        uid: data.uid,
        up_time: data.up_time,
        mock_script: data.mock_script,
        enable: data.enable
      }, {
        upsert: true
      })
  }

}

module.exports = advMockModel;
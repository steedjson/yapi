/**
 * Created by gxl.gao on 2017/10/24.
 */
const yapi = require('yapi.js');
const mongoose = require('mongoose');
const controller = require('./controller');
const statisModel = require('./statisMockModel.js');
const commons = require('./util.js');

module.exports = function() {
  // 启动期集合索引改为注册启动任务：由 connect() 就绪链统一执行并等待，
  // 不再是 yapi.connect 之后的 fire-and-forget 操作（索引键与选项保持不变）。
  yapi.registerStartupTask(function() {
    let Col = mongoose.connection.db.collection('statis_mock');
    return Promise.all([
      Col.createIndex({
        interface_id: 1
      }),
      Col.createIndex({
        project_id: 1
      }),
      Col.createIndex({
        group_id: 1
      }),
      Col.createIndex({
        time: 1
      }),
      Col.createIndex({
        date: 1
      })
    ]);
  });

  this.bindHook('add_router', function(addRouter) {
    addRouter({
      controller: controller,
      method: 'get',
      path: 'statismock/count',
      action: 'getStatisCount'
    });

    addRouter({
      controller: controller,
      method: 'get',
      path: 'statismock/get',
      action: 'getMockDateList'
    });
    addRouter({
      controller: controller,
      method: 'get',
      path: 'statismock/get_system_status',
      action: 'getSystemStatus'
    });
    addRouter({
      controller: controller,
      method: 'get',
      path: 'statismock/group_data_statis',
      action: 'groupDataStatis'
    });
  });

  // MockServer生成mock数据后触发
  this.bindHook('mock_after', function(context) {
    let interfaceId = context.interfaceData._id;
    let projectId = context.projectData._id;
    let groupId = context.projectData.group_id;
    //let ip = context.ctx.originalUrl;
    let ip = yapi.commons.getIp(context.ctx);

    let data = {
      interface_id: interfaceId,
      project_id: projectId,
      group_id: groupId,
      time: yapi.commons.time(),
      ip: ip,
      date: commons.formatYMD(new Date())
    };
    let inst = yapi.getInst(statisModel);

    try {
      inst.save(data).then();
    } catch (e) {
      yapi.commons.log('mockStatisError', e);
    }
  });
};

const controller = require('./controller');
const advModel = require('./advMockModel.js');
const caseModel = require('./caseModel.js');
const yapi = require('yapi.js');
const mongoose = require('mongoose');
const path = require('path');
const lib = require(path.resolve(yapi.WEBROOT, 'common/lib.js'));
const Mock = require('mockjs');
const mockExtra = require(path.resolve(yapi.WEBROOT, 'common/mock-extra.js'));

function arrToObj(arr) {
  let obj = { 'Set-Cookie': [] };
  arr.forEach(item => {
    if (item.name === 'Set-Cookie') {
      obj['Set-Cookie'].push(item.value);
    } else obj[item.name] = item.value;
  });
  return obj;
}

module.exports = function() {
  // 启动期集合索引改为注册启动任务：由 connect() 就绪链统一执行并等待，
  // 不再是 yapi.connect 之后的 fire-and-forget 操作（索引键与选项保持不变）。
  yapi.registerStartupTask(function() {
    let Col = mongoose.connection.db.collection('adv_mock');
    let caseCol = mongoose.connection.db.collection('adv_mock_case');
    return Promise.all([
      Col.createIndex({
        interface_id: 1
      }),
      Col.createIndex({
        project_id: 1
      }),
      caseCol.createIndex({
        interface_id: 1
      }),
      caseCol.createIndex({
        project_id: 1
      })
    ]);
  });

  async function checkCase(ctx, interfaceId) {
    let reqParams = Object.assign({}, ctx.query, ctx.request.body);
    let caseInst = yapi.getInst(caseModel);

    // let ip = ctx.ip.match(/\d+.\d+.\d+.\d+/)[0];
    // request.ip

    let ip = yapi.commons.getIp(ctx);
    //   数据库信息查询
    // 过滤 开启IP
    let listWithIp = await caseInst.model
      .find({
        interface_id: interfaceId,
        ip_enable: true,
        ip: ip
      })
      .select('_id params case_enable');

    let matchList = [];
    listWithIp.forEach(item => {
      let params = item.params;
      if (item.case_enable && lib.isDeepMatch(reqParams, params)) {
        matchList.push(item);
      }
    });

    // 其他数据
    if (matchList.length === 0) {
      let list = await caseInst.model
        .find({
          interface_id: interfaceId,
          ip_enable: false
        })
        .select('_id params case_enable');
      list.forEach(item => {
        let params = item.params;
        if (item.case_enable && lib.isDeepMatch(reqParams, params)) {
          matchList.push(item);
        }
      });
    }

    if (matchList.length > 0) {
      // 等价于 _.max(matchList, item => ...): 取匹配参数最多的一条, 并列时保留先出现者
      let maxItem = matchList.reduce((best, item) => {
        const score = item => (item.params && Object.keys(item.params).length) || 0;
        return score(item) > score(best) ? item : best;
      });
      return maxItem;
    }
    return null;
  }

  async function handleByCase(caseData) {
    let caseInst = yapi.getInst(caseModel);
    let result = await caseInst.get({
      _id: caseData._id
    });
    return result;
  }

  this.bindHook('add_router', function(addRouter) {
    addRouter({
      controller: controller,
      method: 'get',
      path: 'advmock/get',
      action: 'getMock'
    });
    addRouter({
      controller: controller,
      method: 'post',
      path: 'advmock/save',
      action: 'upMock'
    });
    addRouter({
      /**
       * 保存期望
       */
      controller: controller,
      method: 'post',
      path: 'advmock/case/save',
      action: 'saveCase'
    });

    addRouter({
      controller: controller,
      method: 'get',
      path: 'advmock/case/get',
      action: 'getCase'
    });

    addRouter({
      /**
       * 获取期望列表
       */
      controller: controller,
      method: 'get',
      path: 'advmock/case/list',
      action: 'list'
    });

    addRouter({
      /**
       * 删除期望列表
       */
      controller: controller,
      method: 'post',
      path: 'advmock/case/del',
      action: 'delCase'
    });

    addRouter({
      /**
       * 隐藏期望列表
       */
      controller: controller,
      method: 'post',
      path: 'advmock/case/hide',
      action: 'hideCase'
    });
  });
  this.bindHook('interface_del', async function(id) {
    let inst = yapi.getInst(advModel);
    await inst.delByInterfaceId(id);
  });
  this.bindHook('project_del', async function(id) {
    let inst = yapi.getInst(advModel);
    await inst.delByProjectId(id);
  });
  /**
   * let context = {
      projectData: project,
      interfaceData: interfaceData,
      ctx: ctx,
      mockJson: res 
    } 
   */
  this.bindHook('mock_after', async function(context) {
    let interfaceId = context.interfaceData._id;
    let caseData = await checkCase(context.ctx, interfaceId);

    // 只有开启高级mock才可用
    if (caseData && caseData.case_enable) {
      // 匹配到高级mock
      let data = await handleByCase(caseData);

      context.mockJson = yapi.commons.json_parse(data.res_body);
      try {
        context.mockJson = Mock.mock(
          mockExtra(context.mockJson, {
            query: context.ctx.query,
            body: context.ctx.request.body,
            params: Object.assign({}, context.ctx.query, context.ctx.request.body)
          })
        );
      } catch (err) {
        yapi.commons.log(err, 'error');
      }

      context.resHeader = arrToObj(data.headers);
      context.httpCode = data.code;
      context.delay = data.delay;
      return true;
    }
    let inst = yapi.getInst(advModel);
    let data = await inst.get(interfaceId);

    if (!data || !data.enable || !data.mock_script) {
      return context;
    }

    // mock 脚本
    let script = data.mock_script;
    await yapi.commons.handleMockScript(script, context);
  });
};

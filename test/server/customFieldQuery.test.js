import test from 'ava';

const rewire = require('rewire');
const InterfaceModel = require('../../server/models/interface');
const controller = rewire('../../server/controllers/interface');
const commons = require('../../server/utils/commons');
controller.__set__('yapi', { commons });

// 在模型查询边界模拟 MongoDB 的字段投影，不能直接返回包含全部字段的假文档。
// 同时调用真实模型方法和控制器，才能发现分组字段被 select 排除的问题。
test('自定义字段批量查询保留项目分组和旧响应字段', async t => {
  const rows = [
    { _id: 101, project_id: 1, title: '项目一接口', custom_field_value: 'demo' },
    { _id: 201, project_id: 2, title: '项目二接口', custom_field_value: 'demo' }
  ];
  let queryCount = 0;
  const model = Object.create(InterfaceModel.prototype);
  model.model = {
    find(filter) {
      queryCount++;
      t.deepEqual(filter, { project_id: { $in: [2, 1, 3] }, custom_field_value: 'demo' });
      return {
        select(fields) {
          return {
            exec: async () => rows.map(row => {
              const selected = { _id: row._id };
              fields.trim().split(/\s+/).forEach(field => {
                if (Object.prototype.hasOwnProperty.call(row, field)) selected[field] = row[field];
              });
              return Object.assign({}, selected, { toObject: () => Object.assign({}, selected) });
            })
          };
        }
      };
    }
  };
  const ctx = { request: { query: { app_code: 'demo' } } };
  await controller.prototype.getCustomField.call({
    Model: model,
    groupModel: { getcustomFieldName: async () => [{ _id: 10 }] },
    projectModel: { list: async () => [
      { _id: 2, name: '项目二' }, { _id: 1, name: '项目一' }, { _id: 3, name: '空项目' }
    ] }
  }, ctx);

  t.is(queryCount, 1);
  t.is(ctx.body.errcode, 0);
  t.deepEqual(ctx.body.data.map(project => project.project_id), [2, 1]);
  t.deepEqual(ctx.body.data.map(project => project.list.map(item => item._id)), [[201], [101]]);
  ctx.body.data.forEach(project => {
    // project_id 只用于内部分组；旧接口明细投影不包含它。
    t.false(Object.prototype.hasOwnProperty.call(project.list[0], 'project_id'));
    t.is(project.list[0].custom_field_value, 'demo');
  });
});

test('空项目集合不查询接口数据库', async t => {
  const model = Object.create(InterfaceModel.prototype);
  model.model = { find() { t.fail('不应发起无范围查询'); } };
  t.deepEqual(await model.getcustomFieldValueByProjectIds([], 'demo'), []);
});

import test from 'ava';

const rewire = require('rewire');
const yapi = require('../../server/yapi.js');
const baseController = require('../../server/controllers/base.js');
const groupModel = require('../../server/models/group.js');
const projectModel = require('../../server/models/project.js');
const userModel = require('../../server/models/user.js');
const interfaceModel = require('../../server/models/interface.js');
const interfaceColModel = require('../../server/models/interfaceCol.js');
const interfaceCaseModel = require('../../server/models/interfaceCase.js');

// 通过 rewire 加载控制器，既拿到导出的 groupController 类，也能读取模块私有变量 rolename
const groupController = rewire('../../server/controllers/group.js');

// 与 server/controllers/group.js 构造函数中定义保持一致的校验规则
const idRule = 'number';
const groupNameRule = {
  type: 'string',
  minLength: 1
};
const groupDescRule = 'string';
const roleRule = {
  type: 'string',
  enum: ['owner', 'dev', 'guest']
};
const memberUidsRule = {
  type: 'array',
  items: 'number',
  minItems: 1
};
const customFieldRule = {
  name: 'string',
  enable: 'boolen'
};

// 模拟用户数据：22 号用户 role 为 member，用于区分默认 role 'dev' 与用户自身 role
const mockUsers = {
  11: {
    _id: 11,
    role: 'admin',
    username: 'admin',
    email: 'admin@example.com'
  },
  22: {
    _id: 22,
    role: 'member',
    username: 'alice',
    email: 'alice@example.com'
  }
};

test.before('注入 mock model 实例，避免真实 mongoose 连接', () => {
  // yapi.getInst 按 model 类缓存实例，预先写入 mock 可阻止真实 model 构造（其依赖 yapi.db/mongodb）
  yapi.getInsts.set(userModel, {
    findById: async uid => mockUsers[uid] || null
  });
  yapi.getInsts.set(groupModel, {
    del: async id => ({ result: 'deleted', id })
  });
  yapi.getInsts.set(projectModel, {
    list: async () => [],
    delByGroupid: async () => true
  });
  yapi.getInsts.set(interfaceModel, { delByProjectId: async () => true });
  yapi.getInsts.set(interfaceColModel, { delByProjectId: async () => true });
  yapi.getInsts.set(interfaceCaseModel, { delByProjectId: async () => true });
  // server/app.js 运行时才挂载 yapi.commons，测试环境手动挂载真实实现
  yapi.commons = require('../../server/utils/commons.js');
});

test('groupController 继承自 baseController', t => {
  t.is(Object.getPrototypeOf(groupController), baseController);
  t.is(Object.getPrototypeOf(groupController.prototype), baseController.prototype);
  const inst = new groupController({});
  t.true(inst instanceof baseController);
  t.true(inst instanceof groupController);
});

test('实例化时初始化 schemaMap，且包含全部 8 个 action 键', t => {
  const inst = new groupController({});
  t.truthy(inst.schemaMap);
  t.deepEqual(Object.keys(inst.schemaMap).sort(), [
    'add',
    'addMember',
    'changeMemberRole',
    'del',
    'delMember',
    'get',
    'getMemberList',
    'up'
  ]);
});

test('schemaMap.get 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.get, {
    '*id': idRule
  });
});

test('schemaMap.add 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.add, {
    '*group_name': groupNameRule,
    group_desc: groupDescRule,
    owner_uids: ['number']
  });
});

test('schemaMap.addMember 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.addMember, {
    '*id': idRule,
    role: roleRule,
    '*member_uids': memberUidsRule
  });
});

test('schemaMap.changeMemberRole 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.changeMemberRole, {
    '*member_uid': 'number',
    '*id': idRule,
    role: roleRule
  });
});

test('schemaMap.getMemberList 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.getMemberList, {
    '*id': idRule
  });
});

test('schemaMap.delMember 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.delMember, {
    '*id': idRule,
    '*member_uid': 'number'
  });
});

test('schemaMap.del 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.del, {
    '*id': idRule
  });
});

test('schemaMap.up 校验规则', t => {
  const inst = new groupController({});
  t.deepEqual(inst.schemaMap.up, {
    '*id': idRule,
    '*group_name': groupNameRule,
    group_desc: groupDescRule,
    custom_field1: customFieldRule,
    custom_field2: customFieldRule,
    custom_field3: customFieldRule
  });
});

test('rolename 权限映射表', t => {
  const rolename = groupController.__get__('rolename');
  t.deepEqual(rolename, {
    owner: '组长',
    dev: '开发者',
    guest: '访客'
  });
});

test('getUserdata: 用户不存在时返回 null', async t => {
  const inst = new groupController({});
  t.is(await inst.getUserdata(999), null);
});

test('getUserdata: 用户存在且未传 role 时默认 role 为 dev', async t => {
  const inst = new groupController({});
  const userdata = await inst.getUserdata(22);
  t.deepEqual(userdata, {
    _role: 'member',
    role: 'dev',
    uid: 22,
    username: 'alice',
    email: 'alice@example.com'
  });
});

test('getUserdata: 传入自定义 role 时正确映射', async t => {
  const inst = new groupController({});
  const ownerUserdata = await inst.getUserdata(22, 'owner');
  t.deepEqual(ownerUserdata, {
    _role: 'member',
    role: 'owner',
    uid: 22,
    username: 'alice',
    email: 'alice@example.com'
  });
  const guestUserdata = await inst.getUserdata(11, 'guest');
  t.deepEqual(guestUserdata, {
    _role: 'admin',
    role: 'guest',
    uid: 11,
    username: 'admin',
    email: 'admin@example.com'
  });
});

test('del: 非 admin 用户返回 401 没有权限', async t => {
  const inst = new groupController({});
  inst.$user = { role: 'dev', username: 'alice' };
  const ctx = { params: { id: 1 } };
  await inst.del(ctx);
  t.deepEqual(ctx.body, { errcode: 401, errmsg: '没有权限', data: null });
});

test('del: admin 用户通过权限校验并删除分组', async t => {
  const inst = new groupController({});
  inst.$user = { role: 'admin', username: 'admin' };
  const ctx = { params: { id: 100 } };
  await inst.del(ctx);
  t.deepEqual(ctx.body, {
    errcode: 0,
    errmsg: '成功！',
    data: { result: 'deleted', id: 100 }
  });
});

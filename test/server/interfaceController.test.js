import test from 'ava';

const rewire = require('rewire');
const controller = rewire('../../server/controllers/interface');
const InterfaceController = controller.__get__('interfaceController');
const clearProjectCategoryCache = controller.__get__('clearProjectCategoryCache');
const BaseController = require('../../server/controllers/base');
const InterfaceModel = require('../../server/models/interface');
const InterfaceCatModel = require('../../server/models/interfaceCat');
const ProjectModel = require('../../server/models/project');
const InterfaceCaseModel = require('../../server/models/interfaceCase');
const FollowModel = require('../../server/models/follow');
const UserModel = require('../../server/models/user');
const GroupModel = require('../../server/models/group');
const ttlCache = require('../../server/utils/ttlCache');

// 结构化响应与控制器内保持同一契约，便于断言 errcode / errmsg。
const resReturn = (data, errcode, errmsg) => ({ data, errcode: errcode || 0, errmsg: errmsg || '成功' });

// 控制器方法通过模块级 yapi 读取 commons 与模型实例，测试期间临时替换避免触达数据库。
async function withMockYapi(mock, run) {
  const revert = controller.__set__('yapi', mock);
  try {
    await run();
  } finally {
    revert();
  }
}

// 模块内共享可变状态（yapi 绑定与 ttlCache），串行执行避免用例间相互干扰。
test.serial('构造函数继承 baseController 并按序挂载 7 个 Model 单例', t => {
  const insts = [];
  const mockYapi = {
    getInst: cls => {
      const inst = { modelClass: cls };
      insts.push(inst);
      return inst;
    }
  };
  const revert = controller.__set__('yapi', mockYapi);
  let instance;
  try {
    instance = new InterfaceController({ path: '/api/interface/get' });
  } finally {
    revert();
  }

  t.is(insts.length, 7);
  t.deepEqual(
    insts.map(inst => inst.modelClass),
    [InterfaceModel, InterfaceCatModel, ProjectModel, InterfaceCaseModel, FollowModel, UserModel, GroupModel]
  );
  t.true(instance instanceof BaseController);
  t.is(instance.Model.modelClass, InterfaceModel);
  t.is(instance.catModel.modelClass, InterfaceCatModel);
  t.is(instance.projectModel.modelClass, ProjectModel);
  t.is(instance.caseModel.modelClass, InterfaceCaseModel);
  t.is(instance.followModel.modelClass, FollowModel);
  t.is(instance.userModel.modelClass, UserModel);
  t.is(instance.groupModel.modelClass, GroupModel);
  // 继承自 baseController 的登录角色定义不应被子类覆盖。
  t.deepEqual(instance.roles, { admin: 'Admin', member: '网站会员' });
});

test.serial('schemaMap 定义 add/up/save 三个规则并声明必须字段', t => {
  const revert = controller.__set__('yapi', { getInst: () => ({}) });
  let instance;
  try {
    instance = new InterfaceController({});
  } finally {
    revert();
  }
  const schemaMap = instance.schemaMap;

  t.deepEqual(Object.keys(schemaMap).sort(), ['add', 'save', 'up']);

  // add: 项目、路径、标题、方式、分类均为必须字段。
  t.is(schemaMap.add['*project_id'], 'number');
  t.is(schemaMap.add['*catid'], 'number');
  t.deepEqual(schemaMap.add['*path'], { type: 'string', minLength: 1 });
  t.deepEqual(schemaMap.add['*title'], { type: 'string', minLength: 1 });
  t.deepEqual(schemaMap.add['*method'], { type: 'string', minLength: 1 });

  // up: 仅 id 必须，其余字段（含 project_id）全部可选。
  t.is(schemaMap.up['*id'], 'number');
  t.is(schemaMap.up.project_id, 'number');
  t.is(schemaMap.up.catid, 'number');
  t.is(schemaMap.up.switch_notice, 'boolean');
  t.deepEqual(schemaMap.up.message, { type: 'string', minLength: 1 });
  t.false(Object.prototype.hasOwnProperty.call(schemaMap.up, '*project_id'));
  t.false(Object.prototype.hasOwnProperty.call(schemaMap.up, '*path'));

  // save: 无必须字段，用于 openapi 批量导入时按 add 或 up 语义补全。
  ['*project_id', '*path', '*title', '*method', '*catid', '*id'].forEach(requiredKey => {
    t.false(Object.prototype.hasOwnProperty.call(schemaMap.save, requiredKey));
  });
  t.is(schemaMap.save.project_id, 'number');
  t.is(schemaMap.save.dataSync, 'string');
});

test.serial('schemaMap 三个规则共享接口通用可选字段', t => {
  const revert = controller.__set__('yapi', { getInst: () => ({}) });
  let instance;
  try {
    instance = new InterfaceController({});
  } finally {
    revert();
  }

  const commonFields = [
    'desc',
    'status',
    'req_query',
    'req_headers',
    'req_body_type',
    'req_params',
    'req_body_form',
    'req_body_other',
    'res_body_type',
    'res_body',
    'custom_field_value',
    'api_opened',
    'req_body_is_json_schema',
    'res_body_is_json_schema',
    'markdown',
    'tag'
  ];

  ['add', 'up', 'save'].forEach(rule => {
    commonFields.forEach(field => {
      t.true(Object.prototype.hasOwnProperty.call(instance.schemaMap[rule], field), rule + ' 缺少字段 ' + field);
    });
    t.is(instance.schemaMap[rule].tag, 'array');
    t.is(instance.schemaMap[rule].api_opened, 'boolean');
  });
});

test.serial('clearProjectCategoryCache 按项目精确清理 menu 与 tree 前缀', t => {
  const calls = [];
  const origClearByPrefix = ttlCache.clearByPrefix;
  const origClear = ttlCache.clear;
  ttlCache.clearByPrefix = prefix => calls.push(['clearByPrefix', prefix]);
  ttlCache.clear = () => calls.push(['clear']);
  try {
    clearProjectCategoryCache(7);
    clearProjectCategoryCache('42');

    t.deepEqual(calls, [
      ['clearByPrefix', 'menu:7'],
      ['clearByPrefix', 'tree:7'],
      ['clearByPrefix', 'menu:42'],
      ['clearByPrefix', 'tree:42']
    ]);
  } finally {
    ttlCache.clearByPrefix = origClearByPrefix;
    ttlCache.clear = origClear;
  }
});

test.serial('clearProjectCategoryCache 缺失项目 id 时全量清理且 0 视为有效 id', t => {
  const calls = [];
  const origClearByPrefix = ttlCache.clearByPrefix;
  const origClear = ttlCache.clear;
  ttlCache.clearByPrefix = prefix => calls.push(['clearByPrefix', prefix]);
  ttlCache.clear = () => calls.push(['clear']);
  try {
    clearProjectCategoryCache(undefined);
    clearProjectCategoryCache(null);
    clearProjectCategoryCache(0);

    t.deepEqual(calls, [
      ['clear'],
      ['clear'],
      ['clearByPrefix', 'menu:0'],
      ['clearByPrefix', 'tree:0']
    ]);
  } finally {
    ttlCache.clearByPrefix = origClearByPrefix;
    ttlCache.clear = origClear;
  }
});

test.serial('get 缺失接口 id 时返回 400', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    const ctx = { params: {} };
    await InterfaceController.prototype.get.call({}, ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '接口id不能为空');
    t.is(ctx.body.data, null);
  });
});

test.serial('del 缺失接口 id 时返回 400 且不访问数据库', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    let modelTouched = false;
    const fakeThis = {
      Model: { get: async () => { modelTouched = true; return null; } }
    };
    const ctx = { request: { body: {} } };
    await InterfaceController.prototype.del.call(fakeThis, ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '接口id不能为空');
    t.false(modelTouched);
  });
});

test.serial('delCat 缺失 catid 时按不存在分类返回 400', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    let queriedCatid;
    const fakeThis = {
      catModel: { get: async catid => { queriedCatid = catid; return null; } }
    };
    const ctx = { request: { body: {} } };
    await InterfaceController.prototype.delCat.call(fakeThis, ctx);

    t.is(queriedCatid, undefined);
    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '不存在的分类');
  });
});

test.serial('getCatMenu 缺失项目 id 时返回 400', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    const ctx = { params: {} };
    await InterfaceController.prototype.getCatMenu.call({}, ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '项目id不能为空');
  });
});

test.serial('getCatMenu 项目 id 非数字时返回 400', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    const ctx = { params: { project_id: 'abc' } };
    await InterfaceController.prototype.getCatMenu.call({}, ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '项目id不能为空');
  });
});

test.serial('getCatTree 缺失项目 id 时返回 400', async t => {
  await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
    const ctx = { params: {} };
    await InterfaceController.prototype.getCatTree.call({}, ctx);

    t.is(ctx.body.errcode, 400);
    t.is(ctx.body.errmsg, '项目id不能为空');
  });
});

test.serial('downloadCrx 设置下载响应头并返回 zip Buffer', async t => {
  const zipBuffer = Buffer.from('PK\x03\x04crossRequest');
  const headers = [];
  await withMockYapi(
    {
      getInst: () => ({}),
      WEBROOT: '/webroot',
      fs: {
        readFileSync: file => {
          t.is(file, '/webroot/static/attachment/cross-request.zip');
          return zipBuffer;
        }
      },
      path: { join: (...parts) => parts.join('/') }
    },
    async () => {
      const ctx = {
        set: (name, value) => headers.push([name, value]),
        body: null
      };
      await InterfaceController.prototype.downloadCrx.call({}, ctx);

      t.deepEqual(headers, [
        ['Content-disposition', 'attachment; filename=crossRequest.zip'],
        ['Content-Type', 'application/zip']
      ]);
      t.true(Buffer.isBuffer(ctx.body));
      t.is(ctx.body, zipBuffer);
    }
  );
});

test.serial('getCatMenu 命中缓存时直接返回且不查询分类', async t => {
  ttlCache.clear();
  ttlCache.set('menu:88', [{ _id: 3, name: '缓存分类' }]);
  try {
    await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
      let catListCalled = 0;
      const fakeThis = {
        projectModel: { getBaseInfo: async () => ({ _id: 88, project_type: 'public' }) },
        checkAuth: async () => true,
        catModel: { list: async () => { catListCalled += 1; return []; } }
      };
      const ctx = { params: { project_id: 88 } };
      await InterfaceController.prototype.getCatMenu.call(fakeThis, ctx);

      t.is(catListCalled, 0);
      t.is(ctx.body.errcode, 0);
      t.deepEqual(ctx.body.data, [{ _id: 3, name: '缓存分类' }]);
    });
  } finally {
    ttlCache.clear();
  }
});

test.serial('getCatMenu 缓存未命中时读取分类并写入缓存', async t => {
  ttlCache.clear();
  try {
    await withMockYapi({ getInst: () => ({}), commons: { resReturn } }, async () => {
      let catListCalled = 0;
      const fakeThis = {
        projectModel: { getBaseInfo: async () => ({ _id: 88, project_type: 'public' }) },
        checkAuth: async () => true,
        catModel: {
          list: async () => {
            catListCalled += 1;
            return [{ toObject: () => ({ _id: 5, name: '新分类' }) }];
          }
        }
      };
      const ctx = { params: { project_id: 88 } };
      await InterfaceController.prototype.getCatMenu.call(fakeThis, ctx);

      t.is(catListCalled, 1);
      t.is(ctx.body.errcode, 0);
      t.deepEqual(ctx.body.data, [{ _id: 5, name: '新分类' }]);
      t.deepEqual(ttlCache.get('menu:88'), [{ _id: 5, name: '新分类' }]);
    });
  } finally {
    ttlCache.clear();
  }
});

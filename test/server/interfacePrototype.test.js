import test from 'ava';

// P9b God file 拆分试点回归契约：方法组模块经 Object.assign 合并到原型后，
// interfaceController 的原型面必须与拆分前（1549 行单文件版本）完全一致：
// 23 个方法 + constructor，共 24 个自有属性。任何方法丢失都会导致路由挂载
// 静默 404；任何多余方法则意味着拆分引入了新行为。
//
// 方法归属（后续批次搬移时同步更新此清单）：
//   - 留守主文件 server/controllers/interface.js：
//     save, get, downloadCrx, del, solveConflict, delCat, getCatMenu,
//     getCatTree, getCustomField, requiredSort, upIndex, upCatIndex, schema2json
//   - server/controllers/interface/saveMethods.js：add, autoAddTag
//   - server/controllers/interface/upMethods.js：up, diffHTML
//   - server/controllers/interface/categoryMethods.js：addCat, upCat, listByMenu
//   - server/controllers/interface/listMethods.js：list, listByCat, listByOpen
const InterfaceController = require('../../server/controllers/interface');
const controller = require('rewire')('../../server/controllers/interface');

const EXPECTED_METHODS = [
  'add',
  'addCat',
  'autoAddTag',
  'del',
  'delCat',
  'diffHTML',
  'downloadCrx',
  'get',
  'getCatMenu',
  'getCatTree',
  'getCustomField',
  'list',
  'listByCat',
  'listByMenu',
  'listByOpen',
  'requiredSort',
  'save',
  'schema2json',
  'solveConflict',
  'up',
  'upCat',
  'upCatIndex',
  'upIndex'
];

test('interfaceController 原型面保持 23 个方法，无丢失且无新增', t => {
  const names = Object.getOwnPropertyNames(InterfaceController.prototype);
  const methods = names.filter(name => name !== 'constructor').sort();

  t.is(names.length, EXPECTED_METHODS.length + 1, '自有属性应为 23 方法 + constructor');
  t.deepEqual(methods, EXPECTED_METHODS);
});

test('interfaceController 原型上每个方法均为函数', t => {
  Object.getOwnPropertyNames(InterfaceController.prototype).forEach(name => {
    if (name === 'constructor') return;
    t.is(typeof InterfaceController.prototype[name], 'function', `原型方法 ${name} 应为函数`);
  });
});

// rewire 测试契约：既有 3 个测试文件（interfaceSave / interfaceController /
// customFieldQuery）依赖主文件模块作用域的这三个同名绑定，拆分不得移除。
test('rewire 测试契约绑定齐备（interfaceController/clearProjectCategoryCache/handleHeaders）', t => {
  t.is(typeof controller.__get__('interfaceController'), 'function');
  t.is(typeof controller.__get__('clearProjectCategoryCache'), 'function');
  t.is(typeof controller.__get__('handleHeaders'), 'function');
});

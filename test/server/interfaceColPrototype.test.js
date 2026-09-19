import test from 'ava';

// P9c God file 拆分回归契约：方法组模块经 Object.assign 合并到原型后，
// interfaceColController 的原型面必须与拆分前（1027 行单文件版本）完全一致：
// 18 个方法 + constructor，共 19 个自有属性。任何方法丢失都会导致路由挂载
// 静默 404；任何多余方法则意味着拆分引入了新行为。
// （无 rewire 契约，无需绑定固化，仅快照原型面。）
//
// 方法归属：
//   - 留守主文件 server/controllers/interfaceCol.js：仅 constructor（组装器形态）
//   - server/controllers/interfaceCol/colMethods.js：list, addCol, upCol, upColIndex, delCol
//   - server/controllers/interfaceCol/caseQueryMethods.js：
//     getCaseList, getCaseEnvList, requestParamsToObj, getCaseListByVariableParams,
//     getCase, runCaseScript, unique
//   - server/controllers/interfaceCol/caseAddMethods.js：addCase, addCaseList, cloneCaseList
//   - server/controllers/interfaceCol/caseUpdateMethods.js：upCase, upCaseIndex, delCase
const InterfaceColController = require('../../server/controllers/interfaceCol');

const EXPECTED_METHODS = [
  'addCase',
  'addCaseList',
  'addCol',
  'cloneCaseList',
  'delCase',
  'delCol',
  'getCase',
  'getCaseEnvList',
  'getCaseList',
  'getCaseListByVariableParams',
  'list',
  'requestParamsToObj',
  'runCaseScript',
  'unique',
  'upCase',
  'upCaseIndex',
  'upCol',
  'upColIndex'
];

test('interfaceColController 原型面保持 18 个方法，无丢失且无新增', t => {
  const names = Object.getOwnPropertyNames(InterfaceColController.prototype);
  const methods = names.filter(name => name !== 'constructor').sort();

  t.is(names.length, EXPECTED_METHODS.length + 1, '自有属性应为 18 方法 + constructor');
  t.deepEqual(methods, EXPECTED_METHODS);
});

test('interfaceColController 原型上每个方法均为函数', t => {
  Object.getOwnPropertyNames(InterfaceColController.prototype).forEach(name => {
    if (name === 'constructor') return;
    t.is(typeof InterfaceColController.prototype[name], 'function', `原型方法 ${name} 应为函数`);
  });
});

import test from 'ava';

// P9c God file 拆分回归契约：方法组模块经 Object.assign 合并到原型后，
// projectController 的原型面必须与拆分前（1272 行单文件版本）完全一致：
// 23 个方法 + constructor，共 24 个自有属性。任何方法丢失都会导致路由挂载
// 静默 404；任何多余方法则意味着拆分引入了新行为。
// （无 rewire 契约，无需绑定固化，仅快照原型面。）
//
// 方法归属：
//   - 留守主文件 server/controllers/project.js：
//     add, copy, del, handleBasepath, swaggerUrl, up, upSet, verifyDomain
//   - server/controllers/project/memberMethods.js：
//     addMember, changeMemberEmailNotice, changeMemberRole, delMember, getMemberList
//   - server/controllers/project/envTokenMethods.js：
//     arrRepeat, getEnv, token, upEnv, upTag, updateToken
//   - server/controllers/project/queryMethods.js：
//     checkProjectName, get, list, search
const ProjectController = require('../../server/controllers/project');

const EXPECTED_METHODS = [
  'add',
  'addMember',
  'arrRepeat',
  'changeMemberEmailNotice',
  'changeMemberRole',
  'checkProjectName',
  'copy',
  'del',
  'delMember',
  'get',
  'getEnv',
  'getMemberList',
  'handleBasepath',
  'list',
  'search',
  'swaggerUrl',
  'token',
  'up',
  'upEnv',
  'upSet',
  'upTag',
  'updateToken',
  'verifyDomain'
];

test('projectController 原型面保持 23 个方法，无丢失且无新增', t => {
  const names = Object.getOwnPropertyNames(ProjectController.prototype);
  const methods = names.filter(name => name !== 'constructor').sort();

  t.is(names.length, EXPECTED_METHODS.length + 1, '自有属性应为 23 方法 + constructor');
  t.deepEqual(methods, EXPECTED_METHODS);
});

test('projectController 原型上每个方法均为函数', t => {
  Object.getOwnPropertyNames(ProjectController.prototype).forEach(name => {
    if (name === 'constructor') return;
    t.is(typeof ProjectController.prototype[name], 'function', `原型方法 ${name} 应为函数`);
  });
});

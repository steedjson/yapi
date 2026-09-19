import test from 'ava';

// P9c God file 拆分回归契约：方法组模块经 Object.assign 合并到原型后，
// userController 的原型面必须与拆分前（1150 行单文件版本）完全一致：
// 24 个方法 + constructor，共 25 个自有属性。任何方法丢失都会导致路由挂载
// 静默 404；任何多余方法则意味着拆分引入了新行为。
// （无 rewire 契约，无需绑定固化，仅快照原型面。）
//
// 注意：模块级可变状态 defaultAvatarBuffer（默认头像进程内缓存）已与其唯一
// 消费方法 avatar 同迁至 server/controllers/user/avatarMethods.js，保证全进程
// 共享同一份缓存，不因拆分产生模块分叉。
//
// 方法归属：
//   - 留守主文件 server/controllers/user.js：
//     changePassword, findById, list, project, search, upStudy, update
//   - server/controllers/user/authMethods.js：
//     login, logout, loginByToken, getLdapAuth, handleThirdLogin,
//     handlePrivateGroup, setLoginCookie, reg
//   - server/controllers/user/adminMethods.js：
//     del, add, resetPassword, changeStatus, changeRole
//   - server/controllers/user/avatarMethods.js：
//     uploadAvatar, avatar, getSkinConfig, setSkinConfig
const UserController = require('../../server/controllers/user');

const EXPECTED_METHODS = [
  'add',
  'avatar',
  'changePassword',
  'changeRole',
  'changeStatus',
  'del',
  'findById',
  'getLdapAuth',
  'getSkinConfig',
  'handlePrivateGroup',
  'handleThirdLogin',
  'list',
  'login',
  'loginByToken',
  'logout',
  'project',
  'reg',
  'resetPassword',
  'search',
  'setLoginCookie',
  'setSkinConfig',
  'upStudy',
  'update',
  'uploadAvatar'
];

test('userController 原型面保持 24 个方法，无丢失且无新增', t => {
  const names = Object.getOwnPropertyNames(UserController.prototype);
  const methods = names.filter(name => name !== 'constructor').sort();

  t.is(names.length, EXPECTED_METHODS.length + 1, '自有属性应为 24 方法 + constructor');
  t.deepEqual(methods, EXPECTED_METHODS);
});

test('userController 原型上每个方法均为函数', t => {
  Object.getOwnPropertyNames(UserController.prototype).forEach(name => {
    if (name === 'constructor') return;
    t.is(typeof UserController.prototype[name], 'function', `原型方法 ${name} 应为函数`);
  });
});

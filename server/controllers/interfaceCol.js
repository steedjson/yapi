// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

const interfaceColModel = requireAny('../models/interfaceCol.js');
const interfaceCaseModel = requireAny('../models/interfaceCase.js');
const interfaceModel = requireAny('../models/interface.js');
const projectModel = requireAny('../models/project.js');
const baseController = require('./base.js');
const yapi = requireAny('../yapi.js');

class interfaceColController extends baseController {
  /**
   * @param {any} ctx Koa 请求上下文
   */
  constructor(ctx) {
    super(ctx);
    this.colModel = yapi.getInst(interfaceColModel);
    this.caseModel = yapi.getInst(interfaceCaseModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
    this.projectModel = yapi.getInst(projectModel);
  }

}

// 方法组模块通过原型合并挂载（P9c God file 拆分，沿用 P9b interface.js 试点模式）：
// controller 方法名与路由挂载保持不变，this 在调用时由控制器实例注入。
// 遮蔽防护（约 5 行，P9c 拆分纪律）：合并前校验方法组导出键与原型自有属性名无交集，
// 防止 Object.assign 静默覆盖同名方法导致拆分前后行为分叉；交集非空立即抛错。
[
  ['colMethods', require('./interfaceCol/colMethods.js')],
  ['caseQueryMethods', require('./interfaceCol/caseQueryMethods.js')],
  ['caseAddMethods', require('./interfaceCol/caseAddMethods.js')],
  ['caseUpdateMethods', require('./interfaceCol/caseUpdateMethods.js')]
].forEach(([groupName, methods]) => {
  const shadowed = Object.keys(methods).filter(name =>
    Object.prototype.hasOwnProperty.call(interfaceColController.prototype, name)
  );
  if (shadowed.length > 0) {
    throw new Error(
      `[interfaceColController] 方法组 ${groupName} 与原型已有成员重名: ${shadowed.join(', ')}`
    );
  }
  Object.assign(interfaceColController.prototype, methods);
});

module.exports = interfaceColController;
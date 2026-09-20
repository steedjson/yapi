// @ts-check
/**
 * Postman 可插入断言代码片段表（自 Postman.js 原位迁出的模块级常量）。
 *
 * 为什么迁出：Test 面板（PostmanParts/TestPanel.js）与 CommonSettingModal 都要消费
 * 该表；若 TestPanel 反向 import Postman.js 会形成 Postman → TestPanel → Postman 的
 * 循环依赖，故常量单独成文件，Postman.js 仍按原路径 `client/components/Postman/Postman.js`
 * 原样转出（`export { InsertCodeMap } from './PostmanParts/insertCodeMap.js'`），
 * 既有消费方（CommonSettingModal）零改动。
 *
 * 内容与迁出前逐字一致（顺序即 UI 展示顺序，测试按此顺序断言）。
 */
export const InsertCodeMap = [
  {
    code: 'assert.equal(status, 200)',
    title: '断言 httpCode 等于 200'
  },
  {
    code: 'assert.equal(body.code, 0)',
    title: '断言返回数据 code 是 0'
  },
  {
    code: 'assert.notEqual(status, 404)',
    title: '断言 httpCode 不是 404'
  },
  {
    code: 'assert.notEqual(body.code, 40000)',
    title: '断言返回数据 code 不是 40000'
  },
  {
    code: 'assert.deepEqual(body, {"code": 0})',
    title: '断言对象 body 等于 {"code": 0}'
  },
  {
    code: 'assert.notDeepEqual(body, {"code": 0})',
    title: '断言对象 body 不等于 {"code": 0}'
  }
];
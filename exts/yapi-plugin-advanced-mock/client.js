// @ts-check
import AdvMock from './AdvMock'
import mockCol from './MockCol/mockColReducer.js'

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function(){
  this.bindHook('interface_tab', function(/** @type {any} */ tabs){
    tabs.advMock = {
      name: '高级Mock',
      component: AdvMock
    }
  })
  this.bindHook('add_reducer', function(/** @type {any} */ reducerModules){
    reducerModules.mockCol = mockCol;
  })
}

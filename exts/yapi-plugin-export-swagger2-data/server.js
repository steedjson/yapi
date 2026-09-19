// @ts-check
const exportSwaggerController = require('./controller');

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function(){
    this.bindHook('add_router', function(/** @type {any} */ addRouter){
        addRouter({
            controller: exportSwaggerController,
            method: 'get',
            path: 'exportSwagger',
            action: 'exportData'
        })
    })
}
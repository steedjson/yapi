// @ts-check
/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook / this.commons）。
 * @this {any}
 */
module.exports = function(){
  this.bindHook('import_data',
  /**
   * @this {any}
   * @param {any} importDataModule
   */
  function(importDataModule){
    importDataModule.swagger = async (/** @type {any} */ res)=>{
      try{
        return await require('./run.js')(res)
      }catch(/** @type {any} */ err){
        this.commons.log(err, 'error')
        return false;
      }
    }
  })
}
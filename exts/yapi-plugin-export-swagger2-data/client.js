// @ts-check
/**
 * Swagger 2.0 json 导出插件（export_data 钩子实现）。
 * @param {any} exportDataModule
 * @param {any} pid
 */
function exportData(exportDataModule, pid) {
    exportDataModule.swaggerjson = {
      name: 'swaggerjson',
      route: `/api/plugin/exportSwagger?type=OpenAPIV2&pid=${pid}`,
      desc: '导出项目接口文档为(Swagger 2.0)Json文件'
    };
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
    this.bindHook('export_data', exportData);
};
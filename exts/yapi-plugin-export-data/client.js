// @ts-check
// import {message} from 'antd'

/**
 * 导出数据插件（export_data 钩子实现）。
 * @param {any} exportDataModule
 * @param {any} pid
 */
function exportData(exportDataModule, pid) {
  exportDataModule.html = {
    name: 'html',
    route: `/api/plugin/export?type=html&pid=${pid}`,
    desc: '导出项目接口文档为 html 文件'
  };
  (exportDataModule.markdown = {
    name: 'markdown',
    route: `/api/plugin/export?type=markdown&pid=${pid}`,
    desc: '导出项目接口文档为 markdown 文件'
  }),
    (exportDataModule.json = {
      name: 'json',
      route: `/api/plugin/export?type=json&pid=${pid}`,
      desc: '导出项目接口文档为 json 文件,可使用该文件导入接口数据'
    });
  // exportDataModule.pdf = {
  //     name: 'pdf',
  //     route: `/api/plugin/export?type=pdf&pid=${pid}`,
  //     desc: '导出项目接口文档为 pdf 文件'
  // }
}

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('export_data', exportData);
};

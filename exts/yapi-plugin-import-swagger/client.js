// @ts-check
import { message } from 'antd';
// CJS 引用：run.js 同时服务 ESM(client) 与 CJS(test) 两类消费方，
// 用 require 避开 webpack 对 default 命名的静态链接校验（babel 7 起严格）。
const run = require('./run');

/**
 * 插件注册入口：由插件运行时以实例对象调用（this.bindHook）。
 * @this {any}
 */
module.exports = function() {
  this.bindHook('import_data',
  /**
   * @param {any} importDataModule
   */
  function(importDataModule) {
    if (!importDataModule || typeof importDataModule !== 'object') {
      console.error('importDataModule 参数Must be Object Type');
      return null;
    }
    importDataModule.swagger = {
      name: 'Swagger',
      /**
       * @param {any} res
       */
      run: async function(res) {
        try {
          return await run(res);
        } catch (err) {
          console.error(err);
          message.error('解析失败');
        }
      },
      desc: `<p>Swagger数据导入（ 支持 v2.0+ ）</p>
      <p>
        <a target="_blank" href="https://hellosean1025.github.io/yapi/documents/data.html#通过命令行导入接口数据">通过命令行导入接口数据</a>
      </p>
      `
    };
  });
};

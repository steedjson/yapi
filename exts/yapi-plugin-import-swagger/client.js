// @ts-check
import { message } from 'antd';

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
          // 批次1（首屏性能优化）：swagger-client 仅在用户实际触发导入时才需要。
          // 原 require('./run') 是模块级同步引用，会把 swagger-client(+7MB 源码树)
          // 锁进 index 入口模块图、被吸进首屏 vendor；改为运行时动态 import 后随
          // 数据导入面板按需加载（run.js 同时服务 ESM(client) 与 CJS(test) 消费方，
          // webpack 对 './run' 的异步引用不受 babel modules:commonjs 影响——动态
          // import() 被显式排除转译，保留为原生分包点）。
          const runModule = await import(/* webpackChunkName: "swagger-import" */ './run');
          // run.js 为 CJS（module.exports = run），babel interop 后 .default 即该函数
          const run = runModule.default || runModule;
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

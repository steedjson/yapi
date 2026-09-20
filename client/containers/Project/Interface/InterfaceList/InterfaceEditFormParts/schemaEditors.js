// @ts-check
/**
 * InterfaceEditForm 子组件共用模块：json-schema 可视化编辑器单例。
 *
 * 原在 InterfaceEditForm.js 模块作用域创建（ResBodySchema / ReqBodySchema 各一次
 * jSchema 调用），抽取后由 RequestParamsSetting / ResponseSetting 共用同一对单例：
 * 创建时机（模块加载期一次）与实例身份（同一次工厂调用的产物）与抽取前一致，
 * 编辑器内部状态不会因拆分为两个子组件而各自重建。
 *
 * 说明：内嵌 antd3 全量样式的导入（经 build/json-schema-css-scope-loader.js 前缀化）
 * 保留在 InterfaceEditForm.js 原位置，避免构建期样式导入顺序变化；本模块只负责
 * 工厂调用与单例导出。
 */
import { MOCK_SOURCE } from '../../../../../constants/variable.js';

const jSchema = require('json-schema-editor-visual');
const ResBodySchema = jSchema({ lang: 'zh_CN', mock: MOCK_SOURCE });
const ReqBodySchema = jSchema({ lang: 'zh_CN', mock: MOCK_SOURCE });

export { ResBodySchema, ReqBodySchema };
// @ts-check
/**
 * InterfaceEditForm 子组件共用模块：json-schema 可视化编辑器。
 *
 * 批次 3（消费方切换）：原 json-schema-editor-visual 工厂单例
 * （`jSchema({ lang: 'zh_CN', mock: MOCK_SOURCE })` 产出的 ResBodySchema /
 * ReqBodySchema）切换为自研 JsonSchemaEditor（client/components/JsonSchemaEditor，
 * antd5 纯栈、零新依赖）。props 契约与旧编辑器一致：
 *   - data：JSON Schema 字符串（空串 / 非法 JSON / 历史脏数据容错）；
 *   - onChange：输出 JSON Schema 字符串；
 *   - isMock：是否显示 mock 列（下拉复用 constants.MOCK_SOURCE），
 * 故 RequestBodySetting / ResponseSetting 的 JSX 零改动。
 *
 * 自研组件为纯受控组件（无内部 store），无需保留旧版「同一次工厂调用的单例身份」：
 * 两个导出同为同一组件引用，各挂载点的编辑器状态天然独立。
 *
 * 回退方案：git revert 本提交即整体恢复旧工厂单例——旧依赖 json-schema-editor-visual
 * 与 InterfaceEditForm.js 的 scoped antd3 css import 均保留至批次 4 才清理，revert 后
 * 构建与运行即恢复（不在本文件保留注释态旧代码）。
 */
import JsonSchemaEditor from '../../../../../components/JsonSchemaEditor/index.js';

export { JsonSchemaEditor as ResBodySchema, JsonSchemaEditor as ReqBodySchema };

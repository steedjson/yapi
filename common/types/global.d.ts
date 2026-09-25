/**
 * 项目相关的全局与模块类型声明。
 * Node.js 基础 API（Buffer / process / require / __dirname / crypto 模块等）由显式依赖的
 * @types/node 提供；此处不再手写垫片——旧垫片与 @types/node@24 的 Buffer 泛型定义冲突
 * （表现为 Buffer<ArrayBufferLike> 与 Uint8Array<ArrayBufferLike> 不可互赋）。
 */
declare module '*.scss';

declare module '*.css';

declare module '*/yapi' {
  const yapi: any;
  export = yapi;
}

declare module '*/yapi.js' {
  const yapi: any;
  export = yapi;
}

declare module 'safeify' {
  const Safeify: any;
  export default Safeify;
}

declare module 'jsonwebtoken' {
  export function verify(token: string, secretOrPublicKey: string | Buffer): any;
  export function sign(payload: string | Buffer | object, secretOrPrivateKey: string | Buffer, options?: any): string;
}

declare module 'underscore' {
  export function find(list: any[], predicate: (item: any) => any): any;
  export function throttle(fn: Function, wait: number): Function;
  const _: any;
  export default _;
}

declare module 'url' {
  const url: {
    parse(urlStr: string, parseQueryString?: boolean): any;
    format(urlObject: any): string;
  };
  export default url;
}

// 两种前端/服务端写法并存：client 侧普遍用 `import axios from 'axios'`（默认导出），
// 而 common/HandleImportData.js 用 `require('axios')`——axios 的 CJS 产物即
// `module.exports = axios`，require 拿到的是实例本身，故此处按使用到的成员补充声明。
// 新增成员时需同步补充。
declare module 'axios' {
  const axios: any;
  export default axios;
  export function post(url: string, data?: any, config?: any): Promise<{ data: any }>;
}

declare module 'mockjs' {
  export function mock(template: any): any;
  // mockjs 同时导出 Random 命名空间（沙箱子进程注入 Random 时使用）
  export const Random: any;
  const Mock: any;
  export default Mock;
}

// json5@2 自带类型仅导出 {parse, stringify}（无 default），而项目内既有 CJS
// `require('json5').parse` 也有 ESM `import json5 from 'json5'`，故此处按真实形态
// 同时声明命名导出与 default，避免任一用法报错。
declare module 'json5' {
  export function parse(text: string): any;
  export function stringify(value: any, replacer?: any, space?: any): string;
  const JSON5: { parse: typeof parse; stringify: typeof stringify };
  export default JSON5;
}

declare module 'qs' {
  export function stringify(obj: any, options?: any): string;
  // 同时保留 default 导出形态，兼容 `import qs from 'qs'` 用法
  const qs: { stringify: typeof stringify };
  export default qs;
}

// md5@2 / sha.js@2 / js-base64@2 均未内置类型且无对应 @types 包。
// 以下按运行时实际导出形态声明使用到的最小子集（当前仅 common/power-string.js 使用），
// 新增用法时需同步补充声明。
declare module 'md5' {
  function md5(input: string | Buffer): string;
  export = md5;
}

declare module 'sha.js' {
  // export = 与其它导出互斥，故用「函数 + 同名命名空间」合并，
  // 使 Algorithm/Hash 可通过 import('sha.js').Algorithm 引用。
  namespace sha {
    type Algorithm = 'sha' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
    interface Hash {
      update(data: string | Buffer): Hash;
      digest(encoding: 'hex'): string;
    }
  }
  function sha(algorithm: sha.Algorithm): sha.Hash;
  export = sha;
}

declare module 'js-base64' {
  export const Base64: {
    encode(input: string): string;
    decode(input: string): string;
  };
}

declare module 'immer' {
  // immer@10 移除了默认导出，仅保留命名导出（produce 等）
  export function produce(base: any, recipe: (draft: any) => void): any;
}

declare module 'react' {
  export class Component<P = any, S = any> {
    constructor(props?: P, context?: any);
    props: P;
    state: S;
    setState(
      state: Partial<S> | ((prevState: S, props: P) => Partial<S> | null),
      callback?: () => void
    ): void;
    forceUpdate(callback?: () => void): void;
    render(): any;
  }
  export class PureComponent<P = any, S = any> extends Component<P, S> {}
  export function useState<S = any>(
    initialState: S | (() => S)
  ): [S, (state: S | ((prevState: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef(initialValue?: any): { current: any };
  // client/components Hooks 现代化组件使用（P7a）：forwardRef + useImperativeHandle
  // 保留旧类组件实例 API；useMemo/useCallback 为 ProjectCard / VariablesSelect 使用。
  export function forwardRef(render: (props: any, ref: any) => any): any;
  export function useImperativeHandle(ref: any, init: () => any, deps?: any[]): void;
  export function useMemo<T = any>(factory: () => T, deps?: any[]): T;
  export function useCallback<T = any>(fn: T, deps?: any[]): T;
  // ReactNode / ReactElement / CSSProperties 供自带类型的第三方库（如
  // @dnd-kit/sortable 的 SortableContext Props）引用，统一按 any 放宽，
  // 与「内置元素 any、组件属性不校验」的 JSX 最小声明策略一致。
  export type ReactNode = any;
  export type ReactElement = any;
  export type CSSProperties = any;
  // lazy/Suspense 供插件 client.js 的组件级异步分包使用（批次1 首屏性能优化）：
  // 与 createAsyncComponent 同一异步形态，类型按本文件「最小子集 + any」策略声明。
  export function lazy(factory: () => Promise<{ default: any }>): any;
  export function Suspense(props: { fallback?: any; children?: any }): any;
  const React: any;
  export default React;
}

declare module 'react-dom/client' {
  // React 18 createRoot API（BlockPrompt 挂载使用）
  export function createRoot(container: any): { render(node: any): void; unmount(): void };
}

declare module 'prop-types' {
  const PropTypes: any;
  export default PropTypes;
}

declare module 'antd' {
  export const Form: any;
  export const Button: any;
  export const Input: any;
  export const Icon: any;
  export const message: any;
  export const Radio: any;
  export const Tabs: any;
  export const Row: any;
  export const Col: any;
  export const Card: any;
  export const Table: any;
  export const Tree: any;
  export const Modal: any;
  export const Tooltip: any;
  export const Affix: any;
  export const Select: any;
  export const TreeSelect: any;
  export const AutoComplete: any;
  export const Switch: any;
  export const Upload: any;
  export const Spin: any;
  export const Checkbox: any;
  // client/components 使用（P7a）：Header/Layout 系列、TimeLine、Breadcrumb、
  // Postman/ModalPostman、ErrorBoundary、ProjectCard、Subnav 等文件引用。
  export const Alert: any;
  export const Avatar: any;
  export const Breadcrumb: any;
  export const Collapse: any;
  export const ConfigProvider: any;
  export const Divider: any;
  export const Dropdown: any;
  export const Layout: any;
  export const Menu: any;
  export const Popconfirm: any;
  export const Popover: any;
  export const Result: any;
  export const Space: any;
  export const Tag: any;
  export const Timeline: any;
  // containers/Project 使用（P7c）：ProjectMember.js 引用 Badge。
  export const Badge: any;
  // exts/yapi-plugin-advanced-mock（P8b）CaseDesModal.js 引用 InputNumber。
  export const InputNumber: any;
  // client/theme.js 使用（P7d）：antd5 的 theme.darkAlgorithm（暗色皮肤算法）。
  export const theme: any;
}

// markdown-it 无内置类型且无 @types 包；插件（P8a export-data / gen-services）以
// CJS require 形态调用主函数并 .use/.render，故按「可调用 + 静态成员」的 export = 声明。
declare module 'markdown-it' {
  class MarkdownIt {
    constructor(options?: any);
    render(src: string): string;
    use(plugin: any, ...args: any[]): MarkdownIt;
  }
  interface MarkdownItStatic {
    new (options?: any): MarkdownIt;
    (options?: any): MarkdownIt;
  }
  const markdownIt: MarkdownItStatic;
  export = markdownIt;
}

// jsondiffpatch 0.7 起主入口为 ESM(create/diff/patch 等), formatters 为子路径导出;
// 客户端经 webpack 打包主入口, 服务端经 Node require(esm) 加载, 统一按 any 存根
declare module 'jsondiffpatch' {
  const jsondiffpatch: any;
  export = jsondiffpatch;
}
declare module 'jsondiffpatch/formatters/html' {
  const formattersHtml: any;
  export = formattersHtml;
}

// webpack 别名 common -> 仓库根 common/ 已通过 tsconfig paths 映射到真实文件，
// 不再用模块声明存根兜底（存根会压制真实文件类型，导致别名引用的类型盲区）。

/**
 * React 16 运行时的微量类型声明（项目未安装 @types/react，
 * 仅覆盖登录页等 @ts-check 组件用到的最小子集）
 */
declare namespace React {
  interface SyntheticEvent<T = any> {
    bubbles: boolean;
    cancelable: boolean;
    target: T;
    currentTarget: T;
    preventDefault(): void;
    stopPropagation(): void;
    [key: string]: any;
  }
  // P7d：@types/react 的 UMD 全局命名空间未被程序加载（react 模块被上方环境声明遮蔽，
  // node_modules 内 d.ts 的 React.* 引用均为 skipLibCheck 抑制的错误类型），
  // 组件类型按 any 放宽，供 @ts-check 文件在 JSDoc 中以 React.ComponentType<any> 标注。
  export type ComponentType<P = any> = any;
}

/**
 * JSX 检查的最小声明：内置元素统一按 any 处理，
 * 组件属性不校验（与 React 16 + Babel 6 的宽松运行时行为保持一致）
 */
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  // P7c：不再声明 JSX.ElementChildrenAttribute（children → children prop 映射）。
  // 实测它会令自带类型的第三方组件把 JSX children 纳入属性校验，导致既有
  // @ts-check 文件（如 User/Profile.js 的无 children 组件）出现新的 TS2322，
  // 得不偿失；对 @dnd-kit/sortable SortableContext 必填 children 的误报，
  // 在 InterfaceColContent.js 中以 any 中转解决。
}

// react-router 6 起自带类型（flat config 时代遗留的 v5 ambient 声明已删除：
// v6 无 withRouter/Switch/Redirect，且旧声明会遮蔽包内真实类型导致 tsc 误报）。
// 项目内的 v6 withRouter 兼容 HOC 见 client/withRouter.jsx。

declare module 'client/plugin.js' {
  export function emitHook(name: string, ...args: any[]): any;
}

// client/plugin-module.js 是 build/clientPluginModule.js 的生成物且被 gitignore
// （全新 checkout 在 build-client 前不存在，CI typecheck 先于 build-client 执行），
// client/plugin.js 经 webpack 别名 client/ 引入它，此处按 any 声明，
// 使类型检查不依赖该生成物是否存在于工作区。
declare module 'client/plugin-module.js' {
  const pluginModuleList: any;
  export = pluginModuleList;
}

// 以下 stub 供 containers/Project（P7c）内以 webpack 别名 client/... 绝对路径引用的
// 模块使用（tsconfig 未配置 client/* 的 paths 映射）；目标文件均为运行时真实存在的
// client 内文件，此处仅按使用到的导出形态声明最小子集，新增用法时需同步补充。
declare module 'client/components/Postman/CheckCrossInstall.js' {
  export function initCrossRequest(fn: (hasPlugin: any) => void): any;
}

declare module 'client/components/Postman/Postman.js' {
  export const InsertCodeMap: any;
}

declare module 'client/components/CaseEnv' {
  const CaseEnv: any;
  export default CaseEnv;
}

// exts/yapi-plugin-wiki（P8b）Editor.js 引用 MarkdownEditor 编辑器组件。
declare module 'client/components/MarkdownEditor' {
  const MarkdownEditor: any;
  export default MarkdownEditor;
}

declare module 'client/utils/sanitize.js' {
  function sanitizeHtml(dirty: any): any;
  export default sanitizeHtml;
}

declare module 'client/constants/variable.js' {
  const constants: any;
  export default constants;
}

// 以下 3 个声明供 exts 插件客户端组件（P8b advanced-mock）以 webpack 别名 client/...
// 绝对路径引用的模块使用；目标文件均为运行时真实存在的 client 内文件，此处仅按
// 使用到的导出形态声明最小子集，新增用法时需同步补充。
declare module 'client/withRouter' {
  /** react-router v6 兼容 HOC（client/withRouter.jsx），注入 match/params 等路由属性 */
  function withRouter(Component: any): any;
  export default withRouter;
}

declare module 'client/common.js' {
  export function safeAssign(target: any, nextObj: any): any;
  export function formatTime(timestamp: any): any;
  export function json5_parse(json: any): any;
}

// 旧 client/reducer/modules/* 的环境声明存根（mockCol/user/project action creators）
// 已随 Redux 全链路退役删除（收尾批）：目标模块文件不存在，全部消费方已迁 Zustand store。

// client/components/Loading/Loading.js 供 exts 插件 client.js 的 Suspense fallback
// 使用（批次1 组件级异步分包）；tsconfig 未配置 client/* 的 paths 映射，按最小子集声明。
declare module 'client/components/Loading/Loading' {
  function Loading(props: { visible?: boolean }): any;
  export default Loading;
}

// client/components/ErrorBoundary/ErrorBoundary.js 供 exts 插件 client.js 的
// 懒加载链兜底使用（批次2 M-1 顺手修，与 Application.js createAsyncComponent 同构）；
// tsconfig 未配置 client/* 的 paths 映射，按最小子集声明。
// client/components/AsyncComponent/index.js 为异步包装统一工厂（首屏性能优化批次 2
// 登记的双源漂移项下沉，五处统一引用：Application 路由 + 三个插件 client.js）：
declare module 'client/components/AsyncComponent' {
  import type { ComponentType } from 'react';
  export function createAsyncComponent(
    loader: () => Promise<any>,
    chunkName: string
  ): ComponentType<any>;
  export default createAsyncComponent;
}

declare module 'client/components/ErrorBoundary/ErrorBoundary' {
  import type { ComponentType, ReactNode } from 'react';
  const ErrorBoundary: ComponentType<{ children?: ReactNode; fallback?: ReactNode }>;
  export default ErrorBoundary;
}

// node-schedule 未内置类型且无对应 @types 包；swagger-auto-sync 插件（P8b）以
// scheduleJob(cron, fn) / Job.cancel() 形态使用。
declare module 'node-schedule' {
  const schedule: any;
  export = schedule;
}

// cpu-load 未内置类型且无对应 @types 包；statistics 插件以 cpu(1024, cb) 形态
// 采样 CPU 负载（P8b）。
declare module 'cpu-load' {
  function cpuLoad(interval: number, callback: (load: any) => void): void;
  export = cpuLoad;
}

declare module '*/mockEditor' {
  const mockEditor: any;
  export default mockEditor;
}

declare module '*/HandleImportData' {
  const HandleImportData: any;
  export = HandleImportData;
}

declare module '*/AceEditor' {
  const AceEditor: any;
  export default AceEditor;
}

declare module 'easy-json-schema' {
  const ejs: (schema: any) => any;
  export = ejs;
}

declare module 'json-schema-faker' {
  const jsf: any;
  export = jsf;
}

// 以下 4 个依赖（common/postmanLib.js 与 server/app.js 使用）未内置类型且无对应 @types 包，
// 按运行时实际导出形态声明最小子集，新增用法时需同步补充声明。
declare module 'crypto-js' {
  const CryptoJS: any;
  export = CryptoJS;
}

declare module 'jsrsasign' {
  const jsrsasign: any;
  export = jsrsasign;
}

declare module 'koa-websocket' {
  function websockify(app: any, options?: any): any;
  export = websockify;
}

declare module 'koa-static' {
  function koaStatic(root: string, opts?: any): any;
  export = koaStatic;
}

declare module 'extend' {
  function extend(...args: any[]): any;
  export = extend;
}

declare module 'ldapjs' {
  const ldap: any;
  export = ldap;
}

// crossRequest 由 YApi「测试增强」浏览器插件在页面加载时注入
// （client/components/Postman/CheckCrossInstall.js 轮询探测），非页面自身代码创建。
interface Window {
  crossRequest?: any;
  // client/Application.js 使用（P7d）：alertContent 以 window.chrome 探测 Chrome 浏览器。
  chrome?: any;
}

// webpack 别名 exts -> 仓库根 exts/（build/webpack.standalone.config.js alias）。
// P8b 收官：全部 exts 插件文件已加 @ts-check 并登记 tsconfig include，
// tsconfig paths 已配置 "exts/*" -> "./exts/*"，client/plugin-module.js 的
// require('exts/...') 直接解析到真实受检文件，故删除原 'exts/*' 通配 any 存根
// （P7d 评审遗留义务）。

// 以下声明供 exts 数据类插件（P8a）服务端代码使用：插件 controller 经 yapi 插件机制
// 加载时按裸模块名 require('controllers/base.js') / require('models/*.js') /
// require('yapi.js')（运行时由 server/yapi.js 注入的 module alias 解析到 server/ 内
// 真实文件）。目标文件均为运行时真实存在，此处按 any 放宽，仅覆盖裸模块名形态；
// 相对路径引用仍解析到真实文件。
declare module 'yapi.js' {
  const yapi: any;
  export = yapi;
}

declare module 'controllers/*' {
  const controller: any;
  export = controller;
}

declare module 'models/*' {
  const model: any;
  export = model;
}

declare module 'utils/*' {
  // swagger-auto-sync 插件（P8b）以 const { getToken } = require('utils/token') 解构使用，
  // 故按命名导出声明；新增其他 utils 裸模块用法时需同步补充。
  export function getToken(token: any, uid: any): any;
}

// 以下依赖为 exts 数据类插件（P8a）使用，未内置类型且无对应 @types 包，
// 按运行时实际导出形态声明最小子集，新增用法时需同步补充声明。
// generate-schema 的 JSON schema 生成入口（deep export，包根无该文件）。
declare module 'generate-schema/src/schemas/json.js' {
  function generateJsonSchema(data: any): any;
  export = generateJsonSchema;
}

declare module 'swagger-client' {
  // swagger-client@3 主入口为工厂函数 swagger({ spec })，返回解析后的 { spec } Promise
  const swagger: (...args: any[]) => any;
  export = swagger;
}

declare module 'markdown-it-anchor' {
  const anchor: any;
  export = anchor;
}

declare module 'markdown-it-table-of-contents' {
  const tableOfContents: any;
  export = tableOfContents;
}

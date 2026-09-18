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

declare module 'redux' {
  export function combineReducers(reducers: Record<string, any>): any;
  export function createStore(reducer: any, preloadedState?: any, enhancer?: any): any;
  export function applyMiddleware(...middleware: any[]): any;
}

declare module 'redux-promise' {
  const reduxPromise: any;
  export default reduxPromise;
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
  const React: any;
  export default React;
}

declare module 'prop-types' {
  const PropTypes: any;
  export default PropTypes;
}

declare module 'react-redux' {
  export function connect(
    mapStateToProps?: any,
    mapDispatchToProps?: any,
    mergeProps?: any,
    options?: any
  ): any;
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
}

// react-router 6 起自带类型（flat config 时代遗留的 v5 ambient 声明已删除：
// v6 无 withRouter/Switch/Redirect，且旧声明会遮蔽包内真实类型导致 tsc 误报）。
// 项目内的 v6 withRouter 兼容 HOC 见 client/withRouter.jsx。

declare module 'client/plugin.js' {
  export function emitHook(name: string, ...args: any[]): any;
}

declare module 'json-schema-editor-visual' {
  const createSchemaEditor: (...args: any[]) => any;
  export = createSchemaEditor;
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

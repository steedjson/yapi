/**
 * Node.js 基础运行时微量类型声明（避免引入整个 @types/node 破坏轻量性）
 */
declare var Buffer: {
  from(str: string, encoding?: string): Buffer;
  alloc(size: number): Buffer;
  concat(list: Uint8Array[], totalLength?: number): Buffer;
};

interface Buffer extends Uint8Array {
  subarray(begin?: number, end?: number): Buffer;
}

declare function require(id: string): any;

declare module '*.scss';

declare module '*.css';

declare var exports: any;
declare var module: { exports: any };
declare var __dirname: string;
declare var process: any;

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

declare module 'crypto' {
  export interface Hash {
    update(data: any): Hash;
    digest(): Buffer;
  }
  export interface Cipher {
    update(data: string, inputEncoding: string, outputEncoding: string): string;
    final(outputEncoding: string): string;
  }
  export interface Decipher {
    update(data: string, inputEncoding: string, outputEncoding: string): string;
    final(outputEncoding: string): string;
  }
  export function createHash(algorithm: string): Hash;
  export function createCipheriv(algorithm: string, key: any, iv: any): Cipher;
  export function createDecipheriv(algorithm: string, key: any, iv: any): Decipher;
}

declare module 'url' {
  const url: {
    parse(urlStr: string, parseQueryString?: boolean): any;
    format(urlObject: any): string;
  };
  export default url;
}

declare module 'axios' {
  const axios: any;
  export default axios;
}

declare module 'mockjs' {
  const Mock: any;
  export default Mock;
}

declare module 'json5' {
  const JSON5: { parse(text: string): any };
  export default JSON5;
}

declare module 'qs' {
  function stringify(obj: any, options?: any): string;
  export default { stringify };
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

// webpack 别名 common -> 仓库根 common/，tsc 无对应 paths，按项目惯例用模块声明兜底
declare module 'common/utils.js' {
  export function flattenCatList(list: any[]): any[];
  export function formatCatTreeData(list: any[]): any[];
}

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

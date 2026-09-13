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
  export default function produce(base: any, recipe: (draft: any) => void): any;
}

declare module 'react-router' {
  export function withRouter(component: any): any;
  export const Link: any;
}

declare module 'react-router-dom' {
  export function withRouter(component: any): any;
  export const Link: any;
  export const Route: any;
  export const Switch: any;
  export const Redirect: any;
}

declare module 'client/plugin.js' {
  export function emitHook(name: string, ...args: any[]): any;
}

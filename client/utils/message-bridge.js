// @ts-check
// message App 上下文批：静态 message 桥接模块。
//
// 背景：antd6 下直接调用 `message.success(...)` 等静态方法会在开发/测试环境触发
// `[antd: message] Static function can not consume context like dynamic theme`
// 警告，且 toast 渲染在 React 树外的模块级 holder（仅吃 ConfigProvider.config()
// 全局配置），无法消费组件树内 ConfigProvider 的动态主题——皮肤切到 dark 时
// toast 不跟随暗色。
//
// 方案：client/index.js 在 ConfigProvider 内挂 <AntdApp>，本模块的
// <MessageBridgeRegistrar/> 经 App.useApp() 拿到树内 message 实例并注册进来；
// 各业务文件把 `message` 的来源从 'antd' 换成本模块（调用点一字不改），运行时
// 路由到已注册实例；未注册（测试环境/首帧前）回退 antd 静态 message，保证
// 行为与既有测试断言（document.body.querySelector('.ant-message')）不变。
// App 实例的 holder 同样经 rc-notification 挂到 document.body，列表节点类名
// 仍含 `ant-message`（useMessage.js: prefixCls = getPrefixCls('message')）。
import { useEffect } from 'react';
import { App as AntdApp, message as staticMessage } from 'antd';

/**
 * 已注册的 App.useApp() message 实例。App 组件内部 messageApi 经 useMemo([]) 保持
 * 引用稳定，正常只需注册一次；以实例为 effect 依赖，实例变化时自动重注册。
 * @type {any}
 */
let registeredMessage = null;

/**
 * 注册 App 实例（由 MessageBridgeRegistrar 在 effect 中调用）。
 * @param {any} instance App.useApp() 返回的 message 实例
 */
export function registerAppMessage(instance) {
  registeredMessage = instance;
}

/**
 * 注销 App 实例（组件卸载时调用；仅当仍是当前注册实例时才清空，避免
 * 「新实例已注册、旧实例卸载」的时序把新实例误清掉）。
 * @param {any} instance 待注销的 message 实例
 */
export function unregisterAppMessage(instance) {
  if (registeredMessage === instance) {
    registeredMessage = null;
  }
}

/**
 * 生成与 antd message 同签名的方法：运行时路由到已注册实例，
 * 实例缺失（未挂 AntdApp）或缺少对应方法时回退静态 message。
 * @param {'success'|'error'|'warning'|'info'|'open'|'loading'|'destroy'} name 方法名
 */
function createRoutedMethod(name) {
  /**
   * @param {...any} args 与 antd message 对应方法一致的实参列表
   * @returns {any} 透传目标方法的返回值
   */
  function routedMessageMethod(...args) {
    const target =
      registeredMessage && typeof registeredMessage[name] === 'function'
        ? registeredMessage
        : staticMessage;
    return target[name].apply(target, args);
  }
  return routedMessageMethod;
}

/**
 * 与 antd 静态 message 同形的代理对象（success/error/warning/info/open/loading/
 * destroy 同签名）。业务代码 `import { message } from 'client/utils/message-bridge.js'`
 * 后调用方式与原先完全一致。
 */
export const message = {
  success: createRoutedMethod('success'),
  error: createRoutedMethod('error'),
  warning: createRoutedMethod('warning'),
  info: createRoutedMethod('info'),
  open: createRoutedMethod('open'),
  loading: createRoutedMethod('loading'),
  destroy: createRoutedMethod('destroy')
};

/**
 * 注册组件：挂在使用方 <AntdApp> 内部，把 App.useApp() 的 message 实例登记进桥。
 * 自身不渲染任何 DOM；实例引用变化（含卸载）经 effect 依赖自动重注册/注销。
 */
export function MessageBridgeRegistrar() {
  const { message: appMessage } = AntdApp.useApp();
  useEffect(() => {
    registerAppMessage(appMessage);
    return () => {
      unregisterAppMessage(appMessage);
    };
  }, [appMessage]);
  return null;
}

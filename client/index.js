// @ts-check
// antd 5 组件样式为 css-in-js 运行时注入,不再有全局 antd css;reset 提供基础 normalize。
import 'antd/dist/reset.css';
// json-schema-editor-visual(接口编辑的 JSON Schema 编辑器)内嵌 antd3 的全量样式
// 已不再全局加载:由 build/json-schema-css-scope-loader.js 前缀化后随
// InterfaceEditForm 的编辑器容器(./containers/Project/Interface/InterfaceList/InterfaceEditForm.js)
// 以 .json-schema-editor-scope 作用域加载,避免 antd3 全局规则污染应用。
import './styles/common.scss';
import './plugin';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import App from './Application';
import { Provider } from 'react-redux';
import createStore from './reducer/create';
import { initSkin, useSkinTheme } from './theme';

// 由于 antd 组件的默认文案是英文，所以需要修改为中文
import zhCN from 'antd/locale/zh_CN';

// antd5 日期类组件内部依赖 dayjs,统一初始化中文 locale
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

initSkin();

const store = createStore();

// 根组件消费皮肤主题:useSkinTheme 内部订阅 theme.js 的发布订阅,
// setSkin/initSkin 应用皮肤后通知,ConfigProvider 的 theme 随 getThemeConfig(skin) 即时切换。
/**
 * @param {{children?: any}} props children 可选:JSX children 不经 props 校验(P7c 决议)
 */
function ThemedRoot({ children }) {
  const skinTheme = useSkinTheme();
  // hashPriority high: cssinjs 规则以 .css-hash 前缀提升特异性,压过显式加载的
  // json-schema-editor-visual 内嵌 antd3 全量样式(否则 antd3 默认蓝覆盖皮肤 token)
  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider locale={zhCN} theme={skinTheme}>
        {children}
      </ConfigProvider>
    </StyleProvider>
  );
}

createRoot(document.getElementById('yapi')).render(
  <Provider store={store}>
    <ThemedRoot>
      <App />
    </ThemedRoot>
  </Provider>
);

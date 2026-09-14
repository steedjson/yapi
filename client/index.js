// antd 5 组件样式为 css-in-js 运行时注入,不再有全局 antd css;reset 提供基础 normalize。
import 'antd/dist/reset.css';
// json-schema-editor-visual(接口编辑的 JSON Schema 编辑器)内嵌 antd3 组件,
// 依赖全局 .ant-* 样式表;v5 后应用内无全局 antd css,显式加载其内嵌 antd3 的样式。
// 置于 common.scss 之前,保证应用层样式在级联中后置胜出。
import 'json-schema-editor-visual/node_modules/antd/dist/antd.css';
import './styles/common.scss';
import './plugin';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './Application';
import { Provider } from 'react-redux';
import createStore from './reducer/create';
import { initSkin, useSkinTheme } from './theme';

// 由于 antd 组件的默认文案是英文，所以需要修改为中文
import zhCN from 'antd/locale/zh_CN';

initSkin();

const store = createStore();

// 根组件消费皮肤主题:useSkinTheme 内部订阅 theme.js 的发布订阅,
// setSkin/initSkin 应用皮肤后通知,ConfigProvider 的 theme 随 getThemeConfig(skin) 即时切换。
function ThemedRoot({ children }) {
  const skinTheme = useSkinTheme();
  return (
    <ConfigProvider locale={zhCN} theme={skinTheme}>
      {children}
    </ConfigProvider>
  );
}

createRoot(document.getElementById('yapi')).render(
  <Provider store={store}>
    <ThemedRoot>
      <App />
    </ThemedRoot>
  </Provider>
);

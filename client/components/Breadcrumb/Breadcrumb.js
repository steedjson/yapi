// @ts-check
import './Breadcrumb.scss';
import { Breadcrumb, ConfigProvider } from 'antd';
import React from 'react';
import { Link } from 'react-router-dom';
// user 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useUserStore from '../../store/userStore';

// 函数组件 + Hooks 版：breadcrumb 取自 userStore；
// 渲染不依赖路由 props，旧版 @withRouter 包装已一并移除
export default function BreadcrumbNavigation() {
  const breadcrumb = useUserStore((/** @type {any} */ state) => state.breadcrumb);

  const items = (breadcrumb || []).map(
    (/** @type {any} */ item, /** @type {number} */ index) => {
      return {
        key: index,
        title: item.href ? <Link to={item.href}>{item.name}</Link> : item.name
      };
    }
  );

  return (
    <div className="breadcrumb-container">
      <ConfigProvider
        theme={{
          components: {
            Breadcrumb: {
              itemColor: '#ffffff',
              lastItemColor: '#ffffff',
              separatorColor: 'rgba(255, 255, 255, 0.7)',
              linkColor: '#ffffff',
              linkHoverColor: '#2395f1',
              fontSize: 16
            }
          }
        }}
      >
        <Breadcrumb items={items} />
      </ConfigProvider>
    </div>
  );
}

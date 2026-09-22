// @ts-check
import './News.scss';
import React, { useState } from 'react';
import NewsTimeline from './NewsTimeline/NewsTimeline';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { Button } from 'antd';
import Subnav from '../../components/Subnav/Subnav.js';

/**
 * 动态页容器。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 的 uid 映射为历史遗留仅声明未消费，批次2 期间保留订阅，
 *   批次4 user 切片迁移时随迁移移除；
 * - 旧 @connect 注入的 getMockUrl 仅存在于已注释代码中从未调用，随迁移移除；
 * - 旧 UNSAFE_componentWillMount 为空实现（getMockUrl 调用均被注释），随迁移移除；
 * - mockURL 旧 state 唯一赋值路径位于已注释代码中恒为初始值 ''，以 useState 表达。
 */
const News = () => {
  const [mockURL] = useState('');

  return (
    <div>
      <Subnav
        default={'动态'}
        data={[
          {
            name: '动态',
            path: '/news'
          },
          {
            name: '测试',
            path: '/follow'
          },
          {
            name: '设置',
            path: '/follow'
          }
        ]}
      />
      <div className="g-row">
        <section className="news-box m-panel">
          <div className="logHead">
            <Breadcrumb />
            <div className="Mockurl">
              <span>Mock地址：</span>
              <p>{mockURL}</p>
              <Button type="primary">下载Mock数据</Button>
            </div>
          </div>
          <NewsTimeline />
        </section>
      </div>
    </div>
  );
};

export default News;

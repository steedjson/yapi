// @ts-check
import React from 'react';
import { Drawer } from 'antd';

/**
 * 站内使用文档抽屉:iframe 加载 /docs/index.html 文档站
 * @param {{ open: boolean, onClose: function, title?: string }} props
 */
const DocDrawer = props => (
  <Drawer
    title={props.title || '使用文档'}
    size="80%"
    open={props.open}
    onClose={props.onClose}
    styles={{ body: { padding: 0, height: 'calc(100% - 55px)' } }}
  >
    <iframe
      src="/docs/index.html"
      title={props.title || '使用文档'}
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  </Drawer>
);

export default DocDrawer;

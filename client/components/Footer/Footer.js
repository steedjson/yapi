// @ts-check
import './Footer.scss';
import React, { useState } from 'react';
import { Row, Col } from 'antd';
import { getV4Icon } from '../../constants/v4IconMap';
import DocDrawer from '../DocDrawer/index.js';

const version = process.env.version;

/**
 * 默认页脚列表。「使用文档」为站内 Drawer 展示，项上挂 onClick 打开弹层；
 * 「版本」链接指向站内文档的版本说明章节。
 * @param {function} openDocs 打开使用文档 Drawer
 * @returns {any[]}
 */
function buildDefaultFootList(openDocs) {
  return [
    {
      title: 'GitHub',
      iconType: 'github',
      linkList: [
        {
          itemTitle: 'YApi 源码仓库',
          itemLink: 'https://github.com/YMFE/yapi'
        }
      ]
    },
    {
      title: '团队',
      iconType: 'team',
      linkList: [
        {
          itemTitle: 'YMFE',
          itemLink: 'https://ymfe.org'
        }
      ]
    },
    {
      title: '反馈',
      iconType: 'aliwangwang-o',
      linkList: [
        {
          itemTitle: 'Github Issues',
          itemLink: 'https://github.com/YMFE/yapi/issues'
        },
        {
          itemTitle: 'Github Pull Requests',
          itemLink: 'https://github.com/YMFE/yapi/pulls'
        }
      ]
    },
    {
      title: `Copyright © 2018-${new Date().getFullYear()} YMFE`,
      linkList: [
        {
          itemTitle: `版本: ${version} `,
          itemLink: '/docs/index.html#/version'
        },
        {
          itemTitle: '使用文档',
          onClick: openDocs
        }
      ]
    }
  ];
}

/**
 * @param {any} props
 */
function FootItem(props) {
  return (
    <Col span={6}>
      <h4 className="title">
        {props.iconType ? React.createElement(getV4Icon(props.iconType), { className: 'icon' }) : ''}
        {props.title}
      </h4>
      {props.linkList.map(function(
        /** @type {any} */ item,
        /** @type {number} */ i
      ) {
        return (
          <p key={i}>
            {item.onClick ? (
              <a className="link" style={{ cursor: 'pointer' }} onClick={item.onClick}>
                {item.itemTitle}
              </a>
            ) : (
              <a href={item.itemLink} className="link">
                {item.itemTitle}
              </a>
            )}
          </p>
        );
      })}
    </Col>
  );
}

/**
 * @param {any} props
 */
function Footer(props) {
  const [docVisible, setDocVisible] = useState(false);
  const footList = props.footList || buildDefaultFootList(function() {
    setDocVisible(true);
  });
  return (
    <div className="footer-wrapper">
      <Row className="footer-container">
        {footList.map(function(
          /** @type {any} */ item,
          /** @type {number} */ i
        ) {
          return (
            <FootItem
              key={i}
              linkList={item.linkList}
              title={item.title}
              iconType={item.iconType}
            />
          );
        })}
      </Row>
      <DocDrawer open={docVisible} onClose={() => setDocVisible(false)} />
    </div>
  );
}

export default Footer;

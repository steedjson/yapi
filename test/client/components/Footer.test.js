// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Footer } = require('../../../client/components/Footer/Footer.js');

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

test.serial('默认 footList 渲染 GitHub、团队、反馈等栏目标题', t => {
  const { container } = render(<Footer />);

  t.truthy(container.querySelector('.footer-wrapper'), '应渲染页脚容器');
  const titles = container.querySelectorAll('h4.title');
  t.is(titles.length, 4, '默认应渲染 4 个栏目, 实际 DOM: ' + container.innerHTML);
  t.truthy(screen.getByText('GitHub'));
  t.truthy(screen.getByText('团队'));
  t.truthy(screen.getByText('反馈'));
  t.truthy(screen.getByText(/Copyright © 2018-\d{4} YMFE/), '应渲染版权栏目');
});

test.serial('默认 footList 渲染各栏目链接及 href', t => {
  const { container } = render(<Footer />);

  const links = container.querySelectorAll('a.link');
  t.is(links.length, 6, '默认应渲染 6 个链接');

  const hrefMap = {};
  Array.from(links).forEach(function(a) {
    hrefMap[a.textContent] = a.getAttribute('href');
  });
  t.is(hrefMap['YApi 源码仓库'], 'https://github.com/YMFE/yapi');
  t.is(hrefMap['YMFE'], 'https://ymfe.org');
  t.is(hrefMap['Github Issues'], 'https://github.com/YMFE/yapi/issues');
  t.is(hrefMap['Github Pull Requests'], 'https://github.com/YMFE/yapi/pulls');
  // 「使用文档」已站内化：外链移除，改为挂 onClick 打开 Drawer 的站内入口
  t.is(hrefMap['使用文档'], null, '使用文档不应再是外链, 实际 DOM: ' + JSON.stringify(hrefMap));
  const docsTrigger = Array.from(links).find(a => a.textContent === '使用文档');
  t.truthy(docsTrigger, '使用文档入口应渲染为链接');
  t.is(docsTrigger.style.cursor, 'pointer', '站内入口应有 pointer 光标提示可点击');
  // 版本链接已指向站内文档的版本说明章节
  t.is(
    hrefMap[`版本: ${process.env.version} `],
    '/docs/index.html#/version',
    '版本链接应指向站内版本说明'
  );
});

test.serial('点击「使用文档」打开站内 Drawer 并加载 /docs/index.html', async t => {
  const { container } = render(<Footer />);

  const docsTrigger = Array.from(container.querySelectorAll('a.link')).find(
    a => a.textContent === '使用文档'
  );
  t.truthy(docsTrigger, '使用文档入口应存在');

  // 打开前 Drawer 未渲染（antd 懒渲染）
  t.falsy(container.ownerDocument.querySelector('.ant-drawer'), '初始不应渲染 Drawer');

  fireEvent.click(docsTrigger);
  await act(async () => {
    await sleep(50);
  });

  const drawer = container.ownerDocument.querySelector('.ant-drawer');
  t.truthy(drawer, '点击后应渲染 Drawer, 实际 DOM: ' + container.ownerDocument.body.innerHTML.slice(0, 800));
  t.truthy(screen.getAllByText('使用文档').length >= 2, 'Drawer 标题与入口文本均应存在');

  const iframe = container.ownerDocument.querySelector('.ant-drawer iframe[title="使用文档"]');
  t.truthy(iframe, 'Drawer 内应渲染使用文档 iframe');
  t.is(iframe.getAttribute('src'), '/docs/index.html', 'iframe 应加载站内文档首页');

  // 关闭 Drawer：断言 open 状态被移除。
  // 注：jsdom 无真实 transitionend，antd 关闭动画的 Portal 卸载不触发，
  // 因此不断言 iframe 节点移除时机，只断言可见状态语义。
  const closeBtn = container.ownerDocument.querySelector('.ant-drawer-close');
  t.truthy(closeBtn, 'Drawer 应有关闭按钮');
  fireEvent.click(closeBtn);
  await act(async () => {
    await sleep(100);
  });
  t.falsy(
    container.ownerDocument.querySelector('.ant-drawer-open'),
    '点击关闭后 Drawer 应退出 open 状态'
  );
});

test.serial('每个栏目渲染对应图标, 自定义 footList 覆盖默认值', t => {
  const { container } = render(
    <Footer
      footList={[
        {
          title: '自定义栏目',
          iconType: 'github',
          linkList: [{ itemTitle: '自定义链接', itemLink: 'https://example.com' }]
        }
      ]}
    />
  );

  t.is(container.querySelectorAll('h4.title').length, 1, '自定义 footList 应覆盖默认 4 栏');
  t.truthy(container.querySelector('h4.title .icon'), '有 iconType 的栏目应渲染图标');
  const link = container.querySelector('a.link');
  t.is(link.textContent, '自定义链接');
  t.is(link.getAttribute('href'), 'https://example.com');
});

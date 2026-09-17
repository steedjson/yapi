// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Footer } = require('../../../client/components/Footer/Footer.js');

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
  t.is(hrefMap['使用文档'], 'https://hellosean1025.github.io/yapi/');
  t.is(
    hrefMap[`版本: ${process.env.version} `],
    'https://github.com/YMFE/yapi/blob/master/CHANGELOG.md',
    '版本链接应指向 CHANGELOG'
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

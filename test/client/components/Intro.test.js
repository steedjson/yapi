// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: Intro } = require('../../../client/components/Intro/Intro.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const INTRO_DATA = {
  title: '接口管理平台',
  des: '让接口开发更简单高效',
  img: 'https://example.com/intro.png',
  detail: [
    { title: '项目管理', des: '提供项目级的接口管理', iconType: 'api' },
    { title: '接口协作', des: '团队协作编辑接口文档', iconType: 'fork' },
    { title: '自动化测试', des: '支持自动化测试集合', iconType: 'unknown-icon-x' }
  ]
};

// QueueAnim 逐条进场为异步动画，等待动画队列把内容全部挂载
async function renderIntro(props) {
  const utils = render(<Intro {...props} />);
  await act(async () => {
    await sleep(400);
  });
  return utils;
}

test.serial('渲染标题与描述文案', async t => {
  const { container } = await renderIntro({ intro: INTRO_DATA });

  t.is(
    container.querySelector('.des-title').textContent,
    '接口管理平台',
    '应渲染 intro.title, 实际 DOM: ' + container.innerHTML
  );
  t.is(container.querySelector('.des-detail').textContent, '让接口开发更简单高效');
});

test.serial('渲染展示图片', async t => {
  const { container } = await renderIntro({ intro: INTRO_DATA });

  const img = container.querySelector('.img-container img');
  t.truthy(img, '应渲染 .img-container img');
  t.is(img.getAttribute('src'), 'https://example.com/intro.png');
});

test.serial('渲染全部条目及各自的标题/描述/图标', async t => {
  const { container } = await renderIntro({ intro: INTRO_DATA });

  const items = container.querySelectorAll('li.switch-content');
  t.is(items.length, 3, '应渲染 3 个 detail 条目');
  t.deepEqual(
    Array.from(items).map(item => item.querySelector('b').textContent),
    ['项目管理', '接口协作', '自动化测试'],
    '各条目应渲染标题'
  );
  t.deepEqual(
    Array.from(items).map(item => {
      const ps = item.querySelectorAll('.text-switch p');
      return ps[1].textContent;
    }),
    ['提供项目级的接口管理', '团队协作编辑接口文档', '支持自动化测试集合'],
    '各条目应渲染描述'
  );
  t.is(
    container.querySelectorAll('li.switch-content .icon-switch svg').length,
    3,
    '每个条目应渲染一个图标（未知 iconType 回落到默认图标）'
  );
});

test.serial('未传 className 时容器类名保持 intro-container（与旧版一致）', async t => {
  const { container } = await renderIntro({ intro: INTRO_DATA });

  t.is(container.firstChild.className, 'intro-container');
});

test.serial('传入 className 时追加到容器类名', async t => {
  const { container } = await renderIntro({ intro: INTRO_DATA, className: 'custom-intro' });

  t.is(container.firstChild.className, 'intro-container custom-intro');
});

// React 19 迁移批次 T1 回归钉：运行时值等价性（DOM 序列化层面）。
// 背景：React 19 类型收紧迫使三处 JSX 取值改写，本文件用 react-dom/server 的
// renderToStaticMarkup 在 react-dom 19.3.0 实际实现下证明「旧值/新值序列化等价」，
// 防止后续改动造成行为漂移。纯服务端渲染测试，无 DOM 依赖，不引入 jsdom
// （参照 test/client/store/*.test.js 的纯 node 风格）。
// 钉住的三处改动：
//   1. client/containers/Home/Home.js：<ol start="1"> → <ol start={1}>；
//   2. client/containers/Project/Setting/ProjectEnv/index.js：
//      style color `item.name === '新环境' && '#2395f1'` → 三元 else 支 undefined；
//   3. client/containers/Project/Setting/ProjectData/ProjectData.js：
//      dangerouslySetInnerHTML __html null → ''。
import test from 'ava';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = React.createElement;

test('T1-1: <ol> 的 start 属性 number 1 与旧字符串 "1" 序列化等价（Home.js）', t => {
  const numeric = renderToStaticMarkup(h('ol', { start: 1 }, h('li', null, 'x')));
  const legacyString = renderToStaticMarkup(h('ol', { start: '1' }, h('li', null, 'x')));
  t.is(numeric, '<ol start="1"><li>x</li></ol>');
  t.is(numeric, legacyString);
});

test('T1-2: style.color 的 false（旧 && 短路）与 undefined（新三元 else 支）序列化等价（ProjectEnv）', t => {
  const legacyFalse = renderToStaticMarkup(h('span', { style: { color: false } }));
  const modernUndefined = renderToStaticMarkup(h('span', { style: { color: undefined } }));
  const matched = renderToStaticMarkup(h('span', { style: { color: '#2395f1' } }));
  t.is(legacyFalse, '<span></span>');
  t.is(legacyFalse, modernUndefined);
  t.is(matched, '<span style="color:#2395f1"></span>');
});

test('T1-3: dangerouslySetInnerHTML 的 __html null（旧）与空串（新）序列化等价（ProjectData）', t => {
  const emptyString = renderToStaticMarkup(h('div', { dangerouslySetInnerHTML: { __html: '' } }));
  const legacyNull = renderToStaticMarkup(h('div', { dangerouslySetInnerHTML: { __html: null } }));
  t.is(emptyString, '<div></div>');
  t.is(legacyNull, '<div></div>');
});

// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: MockDoc } = require('../../../client/components/MockDoc/MockDoc.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// 小样本 mock 结构，行数可手算核对 mockToArr 的输出：
// 0:'{' 1:'name : gateway,'(key=name) 2:'data : {' 3:'list : ['(key=data.list[])
// 4:'1' 5:'2' 6:']' 7:'}'(data 闭合) 8:'}'(根闭合)  共 9 行
const MOCK = { name: 'gateway', data: { list: [1, 2] } };

function getRows(container) {
  return Array.from(container.querySelectorAll('.MockDoc .jsonItem'));
}

test.serial('按 mock 结构渲染全部 jsonItem 行并带编号', t => {
  const { container } = render(<MockDoc mock={MOCK} doc={[]} />);

  const rows = getRows(container);
  t.is(rows.length, 9, '应渲染 9 行, 实际 DOM: ' + container.innerHTML);
  t.is(rows[0].textContent.indexOf('1.'), 0, '首行编号为 1');
  t.is(rows[8].querySelector('.jsonitemNum').textContent, '9.', '末行编号为 9');
});

test.serial('doc 匹配的行渲染 类型/必有字段/备注 标注', t => {
  const doc = [
    { type: 'string', key: 'name', required: true, desc: '名称' },
    { type: 'array', key: 'data.list[]', required: true, desc: '列表' }
  ];
  const { container } = render(<MockDoc mock={MOCK} doc={doc} />);

  const rows = getRows(container);
  const nameRow = rows[1].textContent;
  t.truthy(nameRow.indexOf('name : ') !== -1, '该行应渲染字段名');
  t.truthy(nameRow.indexOf('/ /类型：string') !== -1, '应标注字段类型');
  t.truthy(nameRow.indexOf('必有字段') !== -1, '应标注必有字段');
  t.truthy(nameRow.indexOf('备注：名称') !== -1, '应渲染备注');

  const listRow = rows[3].textContent;
  t.truthy(listRow.indexOf('list : [') !== -1, '数组起始行应渲染');
  t.truthy(listRow.indexOf('/ /类型：array') !== -1, '数组行应按 key=data.list[] 匹配到类型');
  t.truthy(listRow.indexOf('备注：列表') !== -1, '数组行应渲染备注');
});

test.serial('按嵌套层级渲染缩进空格', t => {
  const { container } = render(<MockDoc mock={MOCK} doc={[]} />);

  const rows = getRows(container);
  t.is(rows[0].querySelectorAll('.spaces').length, 0, '首行 { 无缩进');
  t.is(rows[1].querySelectorAll('.spaces').length, 1, 'name 行缩进 1 层');
  t.is(rows[3].querySelectorAll('.spaces').length, 2, 'list 行缩进 2 层');
  t.is(rows[4].querySelectorAll('.spaces').length, 3, '数组元素行缩进 3 层');
  t.is(rows[8].querySelectorAll('.spaces').length, 0, '末行 } 无缩进');
});

test.serial('叶子值渲染为 valueLight 高亮', t => {
  const { container } = render(<MockDoc mock={MOCK} doc={[]} />);

  const values = container.querySelectorAll('.valueLight');
  t.deepEqual(
    Array.from(values).map(v => v.textContent),
    ['gateway', '1', '2'],
    '叶子标量应以 valueLight 高亮渲染'
  );
});

test.serial('required 为假时不渲染 必有字段/备注 标注', t => {
  const doc = [{ type: 'string', key: 'name', required: false, desc: '' }];
  const { container } = render(<MockDoc mock={MOCK} doc={doc} />);

  const nameRow = getRows(container)[1].textContent;
  t.truthy(nameRow.indexOf('/ /类型：string') !== -1, '类型标注不受 required 影响');
  t.falsy(nameRow.indexOf('必有字段') !== -1, 'required 为假不应标注必有字段');
  t.falsy(nameRow.indexOf('备注：') !== -1, 'desc 为空不应渲染备注');
});

test.serial('doc 未匹配任何 key 时无标注', t => {
  const doc = [{ type: 'string', key: 'not_exist_key', required: true, desc: '不存在' }];
  const { container } = render(<MockDoc mock={MOCK} doc={doc} />);

  t.is(container.querySelectorAll('.keymes').length, 0, '不应出现任何 keymes 标注');
});

test.serial('未传 props 时使用默认 mock 与 doc 渲染', t => {
  const { container } = render(<MockDoc />);

  const rows = getRows(container);
  t.truthy(rows.length > 0, '默认数据应渲染出行, 实际 DOM: ' + container.innerHTML);
  const text = container.textContent;
  t.truthy(text.indexOf('ersrcode') !== -1, '默认 mock 应包含 ersrcode 字段');
  t.truthy(text.indexOf('/ /类型：strisng') !== -1, '默认 doc 的类型标注应生效');
  t.truthy(text.indexOf('备注：错误编码') !== -1, '默认 doc 的备注应生效');
});

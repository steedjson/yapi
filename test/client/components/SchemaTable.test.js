// jsdom 环境必须在任何生产代码之前装载
import '../../helpers/jsdom-setup';
import test from 'ava';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { cleanupDom } from '../../helpers/jsdom-setup';

const { default: SchemaTable } = require('../../../client/components/SchemaTable/SchemaTable.js');

test.serial.afterEach.always(() => {
  cleanup();
  cleanupDom();
});

// 合法 json5 schema 应渲染 antd Table：类型/是否必须/默认值/备注等列逐行呈现
test.serial('SchemaTable 合法 schema 渲染 Table 且嵌套结构与枚举展示正确', t => {
  const dataSource = JSON.stringify({
    type: 'object',
    properties: {
      name: { type: 'string', desc: '名称', mock: { mock: '@name' } },
      age: { type: 'integer', minimum: 1, maximum: 100, default: 18 },
      tags: {
        type: 'array',
        description: '标签列表',
        items: { type: 'string' }
      }
    },
    required: ['name']
  });

  const utils = render(React.createElement(SchemaTable, { dataSource }));
  const html = utils.container.innerHTML;

  t.truthy(utils.container.querySelector('.ant-table'), '应渲染 antd Table');
  t.true(html.indexOf('name') !== -1, '应包含字段名 name');
  t.true(html.indexOf('age') !== -1, '应包含字段名 age');
  t.true(html.indexOf('tags') !== -1, '应包含字段名 tags');
  t.true(html.indexOf('必须') !== -1, 'required 字段应展示「必须」');
  t.true(html.indexOf('非必须') !== -1, '非 required 字段应展示「非必须」');
  t.true(html.indexOf('[]') !== -1, '数组类型应展示「item 类型 []」标识');
  t.true(html.indexOf('item 类型') !== -1, '数组子项类型应展示在「其他信息」列');
  t.true(html.indexOf('备注') !== -1, '应包含备注列表头');
  t.true(html.indexOf('名称') !== -1, '应包含字段备注内容');

  utils.unmount();
});

// 非法输入时旧实现渲染 null，迁移保持一致
test.serial('SchemaTable 非法 json5 dataSource 渲染 null', t => {
  const utils = render(React.createElement(SchemaTable, { dataSource: '{bad json5' }));
  t.is(utils.container.innerHTML, '', '解析失败应渲染 null（空容器）');
  utils.unmount();
});

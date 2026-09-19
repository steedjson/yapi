// @ts-check
import React from 'react';
import { Table } from 'antd';
import json5 from 'json5';
import PropTypes from 'prop-types';
import { schemaTransformToTable } from '../../../common/schema-transformTo-table.js';
import './index.scss';

/** @type {Record<string, string>} */
const messageMap = {
  desc: '备注',
  default: '实例',
  maximum: '最大值',
  minimum: '最小值',
  maxItems: '最大数量',
  minItems: '最小数量',
  maxLength: '最大长度',
  minLength: '最小长度',
  enum: '枚举',
  enumDesc: '枚举备注',
  uniqueItems: '元素是否都不同',
  itemType: 'item 类型',
  format: 'format',
  itemFormat: 'format',
  mock: 'mock'
};

const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    width: 200
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 100,
    render: (/** @type {any} */ text, /** @type {any} */ item) => {
      // console.log('text',item.sub);
      return text === 'array' ? (
        <span>{item.sub ? item.sub.itemType || '' : 'array'} []</span>
      ) : (
        <span>{text}</span>
      );
    }
  },
  {
    title: '是否必须',
    dataIndex: 'required',
    key: 'required',
    width: 80,
    render: (/** @type {any} */ text) => {
      return <div>{text ? '必须' : '非必须'}</div>;
    }
  },
  {
    title: '默认值',
    dataIndex: 'default',
    key: 'default',
    width: 80,
    render: (/** @type {any} */ text) => {
      return <div>{typeof text === 'boolean' ? text + '' : text}</div>;
    }
  },
  {
    title: '备注',
    dataIndex: 'desc',
    key: 'desc',
    render: (/** @type {any} */ text, /** @type {any} */ item) => {
      return item.childrenDesc === undefined ? (
        <span className="table-desc">{text}</span>
      ) : (
        <span className="table-desc">{item.childrenDesc}</span>
      );
    }
  },
  {
    title: '其他信息',
    dataIndex: 'sub',
    key: 'sub',
    width: 180,
    render: (/** @type {any} */ text, /** @type {any} */ record) => {
      let result = text || record;

      return Object.keys(result).map((/** @type {string} */ item, /** @type {number} */ index) => {
        let name = messageMap[item];
        let value = result[item];
        let isShow = result[item] !== undefined && name !== undefined;

        return (
          isShow && (
            <p key={index}>
              <span style={{ fontWeight: '700' }}>{name}: </span>
              <span>{value.toString()}</span>
            </p>
          )
        );
      });
    }
  }
];

// 旧类组件（仅有空 constructor + render，无 state / 生命周期）直接改为函数组件，
// 渲染逻辑逐行保持一致：dataSource 解析失败或为空时渲染 null。
/**
 * @param {any} props
 */
const SchemaTable = props => {
  let product;
  try {
    product = json5.parse(props.dataSource);
  } catch (e) {
    product = null;
  }
  if (!product) {
    return null;
  }
  let data = schemaTransformToTable(product);
  data = Array.isArray(data) ? data : [];
  return <Table bordered size="small" pagination={false} dataSource={data} columns={columns} />;
};
SchemaTable.propTypes = {
  dataSource: PropTypes.string
};
export default SchemaTable;

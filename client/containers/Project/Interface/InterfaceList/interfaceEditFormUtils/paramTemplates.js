// @ts-check
/**
 * InterfaceEditForm 纯渲染模块：参数表格行模板（Query / Headers / Body form / 路径参数）。
 *
 * 自 InterfaceEditForm.js 原位抽离的 4 个 JSX 行模板，均为纯函数：给定
 * (data, index, delParams) 输出确定性元素，不依赖组件实例、无 React 状态副作用。
 * 与原实现唯一的差异是组件闭包变量 delParams 改为显式第三形参注入，
 * 函数体逐字节不变；组件侧渲染结构与输出保持不变。
 */
import React from 'react';
import { Row, Col, Input, Select, AutoComplete, Form } from 'antd';
import { BarsOutlined, DeleteOutlined } from '@ant-design/icons';
import { HTTP_REQUEST_HEADER } from './formDefaults.js';

const TextArea = Input.TextArea;
const FormItem = Form.Item;
const Option = Select.Option;

/**
 * @param {any} data
 * @param {any} index
 * @param {any} delParams 删除行回调（组件侧注入，见 InterfaceEditForm 的 delParams）
 * @returns {any}
 */
const queryTpl = (data, index, delParams) => {
  return (
    <Row key={index} className="interface-edit-item-content">
      <Col
        span="1"
        easy_drag_sort_child="true"
        className="interface-edit-item-content-col interface-edit-item-content-col-drag"
      >
        <BarsOutlined />
      </Col>
      <Col span="4" draggable="false" className="interface-edit-item-content-col">
        <FormItem name={['req_query', index, 'name']} initialValue={data.name}>
          <Input placeholder="参数名称" />
        </FormItem>
      </Col>
      <Col span="3" className="interface-edit-item-content-col">
        <FormItem name={['req_query', index, 'required']} initialValue={data.required}>
          <Select>
            <Option value="1">必需</Option>
            <Option value="0">非必需</Option>
          </Select>
        </FormItem>
      </Col>
      <Col span="6" className="interface-edit-item-content-col">
        <FormItem name={['req_query', index, 'example']} initialValue={data.example}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="参数示例" />
        </FormItem>
      </Col>
      <Col span="9" className="interface-edit-item-content-col">
        <FormItem name={['req_query', index, 'desc']} initialValue={data.desc}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="备注" />
        </FormItem>
      </Col>
      <Col span="1" className="interface-edit-item-content-col">
        <DeleteOutlined
          className="interface-edit-del-icon"
          onClick={() => delParams(index, 'req_query')}
        />
      </Col>
    </Row>
  );
};

/**
 * @param {any} data
 * @param {any} index
 * @param {any} delParams 删除行回调（组件侧注入，见 InterfaceEditForm 的 delParams）
 * @returns {any}
 */
const headerTpl = (data, index, delParams) => {
  return (
    <Row key={index} className="interface-edit-item-content">
      <Col
        span="1"
        easy_drag_sort_child="true"
        className="interface-edit-item-content-col interface-edit-item-content-col-drag"
      >
        <BarsOutlined />
      </Col>
      <Col span="4" className="interface-edit-item-content-col">
        <FormItem name={['req_headers', index, 'name']} initialValue={data.name}>
          <AutoComplete
            options={HTTP_REQUEST_HEADER.map(item => ({ value: item, label: item }))}
            filterOption={(/** @type {any} */ inputValue, /** @type {any} */ option) =>
              option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
            }
            placeholder="参数名称"
          />
        </FormItem>
      </Col>
      <Col span="5" className="interface-edit-item-content-col">
        <FormItem name={['req_headers', index, 'value']} initialValue={data.value}>
          <Input placeholder="参数值" />
        </FormItem>
      </Col>
      <Col span="5" className="interface-edit-item-content-col">
        <FormItem name={['req_headers', index, 'example']} initialValue={data.example}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="参数示例" />
        </FormItem>
      </Col>
      <Col span="8" className="interface-edit-item-content-col">
        <FormItem name={['req_headers', index, 'desc']} initialValue={data.desc}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="备注" />
        </FormItem>
      </Col>
      <Col span="1" className="interface-edit-item-content-col">
        <DeleteOutlined
          className="interface-edit-del-icon"
          onClick={() => delParams(index, 'req_headers')}
        />
      </Col>
    </Row>
  );
};

/**
 * @param {any} data
 * @param {any} index
 * @param {any} delParams 删除行回调（组件侧注入，见 InterfaceEditForm 的 delParams）
 * @returns {any}
 */
const requestBodyTpl = (data, index, delParams) => {
  return (
    <Row key={index} className="interface-edit-item-content">
      <Col
        span="1"
        easy_drag_sort_child="true"
        className="interface-edit-item-content-col interface-edit-item-content-col-drag"
      >
        <BarsOutlined />
      </Col>
      <Col span="4" className="interface-edit-item-content-col">
        <FormItem name={['req_body_form', index, 'name']} initialValue={data.name}>
          <Input placeholder="name" />
        </FormItem>
      </Col>
      <Col span="3" className="interface-edit-item-content-col">
        <FormItem name={['req_body_form', index, 'type']} initialValue={data.type}>
          <Select>
            <Option value="text">text</Option>
            <Option value="file">file</Option>
          </Select>
        </FormItem>
      </Col>
      <Col span="3" className="interface-edit-item-content-col">
        <FormItem name={['req_body_form', index, 'required']} initialValue={data.required}>
          <Select>
            <Option value="1">必需</Option>
            <Option value="0">非必需</Option>
          </Select>
        </FormItem>
      </Col>
      <Col span="5" className="interface-edit-item-content-col">
        <FormItem name={['req_body_form', index, 'example']} initialValue={data.example}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="参数示例" />
        </FormItem>
      </Col>
      <Col span="7" className="interface-edit-item-content-col">
        <FormItem name={['req_body_form', index, 'desc']} initialValue={data.desc}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="备注" />
        </FormItem>
      </Col>
      <Col span="1" className="interface-edit-item-content-col">
        <DeleteOutlined
          className="interface-edit-del-icon"
          onClick={() => delParams(index, 'req_body_form')}
        />
      </Col>
    </Row>
  );
};

/**
 * @param {any} data
 * @param {any} index
 * @returns {any}
 */
const paramsTpl = (data, index) => {
  return (
    <Row key={index} className="interface-edit-item-content">
      <Col span="6" className="interface-edit-item-content-col">
        <FormItem name={['req_params', index, 'name']} initialValue={data.name}>
          <Input disabled placeholder="参数名称" />
        </FormItem>
      </Col>
      <Col span="7" className="interface-edit-item-content-col">
        <FormItem name={['req_params', index, 'example']} initialValue={data.example}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="参数示例" />
        </FormItem>
      </Col>
      <Col span="11" className="interface-edit-item-content-col">
        <FormItem name={['req_params', index, 'desc']} initialValue={data.desc}>
          <TextArea rows={1} autoSize={{ minRows: 1 }} placeholder="备注" />
        </FormItem>
      </Col>
    </Row>
  );
};

export { queryTpl, headerTpl, requestBodyTpl, paramsTpl };

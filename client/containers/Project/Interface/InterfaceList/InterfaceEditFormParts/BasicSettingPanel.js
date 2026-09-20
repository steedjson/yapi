// @ts-check
/**
 * InterfaceEditForm 子组件：基本设置面板（自 InterfaceEditForm.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染「基本设置」标题与其下的表单区——接口名称 / 选择分类 / 接口路径
 * （方法选择器 + 只读 basepath + 路径输入 + 路径参数行）/ Tag / 状态 / 项目自定义字段。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：标题、分类、方法、路径、Tag、状态、自定义字段值均由
 *     父组件 state 提供；方法切换与路径输入经 onChangeMethod / onPathChange 上抛，
 *     Tag 设置的按钮点击经 onTagClick 透传（父组件仍负责打开 Tag 弹窗）；
 *   - antd Form 接线不变：各 FormItem 的 name / initialValue / rules 与抽取前逐字一致
 *     （字段注册由外层 <Form> 的 context 提供，与渲染层级无关）；
 *   - 路径参数行仍走 paramTemplates 的 paramsTpl（纯函数，契约未改），本组件只负责
 *     以父组件传入的 req_params 求值，故行内容与行序与抽取前一致；
 *   - 不引入包装 DOM 元素：根节点为 Fragment（标题与表单区在原父组件中的兄弟顺序保持）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Select, TreeSelect, Input, Tooltip, Button, Row, Col, Form } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { nameLengthLimit } from '../../../../../common.js';
import { formatCatTreeData } from 'common/utils.js';
import {
  DEMOPATH,
  HTTP_METHOD_KEYS,
  formItemLayout
} from '../interfaceEditFormUtils/formDefaults.js';
import { paramsTpl } from '../interfaceEditFormUtils/paramTemplates.js';

const FormItem = Form.Item;
const Option = Select.Option;
const InputGroup = Input.Group;

/**
 * @param {any} props
 */
const BasicSettingPanel = props => {
  const {
    basepath,
    cat,
    custom_field,
    tags,
    title,
    catid,
    method,
    path,
    tag,
    status,
    custom_field_value,
    req_params,
    onChangeMethod,
    onPathChange,
    onTagClick
  } = props;

  // 与原实现逐字等价：无兜底（父组件 state.req_params 由 initState 保证为数组）
  const paramsList = req_params.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return paramsTpl(item, index);
  });

  return (
    <>
      <h2 className="interface-title" style={{ marginTop: 0 }}>
        基本设置
      </h2>
      <div className="panel-sub">
        <FormItem
          className="interface-edit-item"
          {...formItemLayout}
          label="接口名称"
          name="title"
          initialValue={title}
          rules={nameLengthLimit('接口')}
        >
          <Input id="title" placeholder="接口名称" />
        </FormItem>

        <FormItem
          className="interface-edit-item"
          {...formItemLayout}
          label="选择分类"
          name="catid"
          initialValue={catid + ''}
          rules={[{ required: true, message: '请选择一个分类' }]}
        >
          <TreeSelect
            treeData={formatCatTreeData(cat)}
            placeholder="请选择一个分类"
            treeDefaultExpandAll={true}
            dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
          />
        </FormItem>

        <FormItem
          className="interface-edit-item"
          {...formItemLayout}
          label={
            <span>
              接口路径&nbsp;
              <Tooltip
                title={
                  <div>
                    <p>
                      1. 支持动态路由,例如:
                      {DEMOPATH}
                    </p>
                    <p>
                      2. 支持 ?controller=xxx 的QueryRouter,非router的Query参数请定义到
                      Request设置-&#62;Query
                    </p>
                  </div>
                }
              >
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip>
            </span>
          }
        >
          <InputGroup compact>
            <Select value={method} onChange={onChangeMethod} style={{ width: '15%' }}>
              {HTTP_METHOD_KEYS.map(item => {
                return (
                  <Option key={item} value={item}>
                    {item}
                  </Option>
                );
              })}
            </Select>

            <Tooltip
              title="接口基本路径，可在 项目设置 里修改"
              style={{
                display: basepath == '' ? 'block' : 'none'
              }}
            >
              <Input
                disabled
                value={basepath}
                readOnly
                onChange={() => {}}
                style={{ width: '25%' }}
              />
            </Tooltip>
            <FormItem
              name="path"
              noStyle
              initialValue={path}
              rules={[
                {
                  required: true,
                  message: '请输入接口路径!'
                }
              ]}
            >
              <Input onChange={onPathChange} placeholder="/path" style={{ width: '60%' }} />
            </FormItem>
          </InputGroup>
          <Row className="interface-edit-item">
            <Col span={24} offset={0}>
              {paramsList}
            </Col>
          </Row>
        </FormItem>
        <FormItem
          className="interface-edit-item"
          {...formItemLayout}
          label="Tag"
          name="tag"
          initialValue={tag}
        >
          <Select placeholder="请选择 tag " mode="multiple">
            {tags.map((/** @type {any} */ item) => {
              return (
                <Option value={item.name} key={item._id}>
                  {item.name}
                </Option>
              );
            })}
            <Option value="tag设置" disabled style={{ cursor: 'pointer', color: '#2395f1' }}>
              <Button type="primary" onClick={onTagClick}>
                Tag设置
              </Button>
            </Option>
          </Select>
        </FormItem>
        <FormItem
          className="interface-edit-item"
          {...formItemLayout}
          label="状态"
          name="status"
          initialValue={status}
        >
          <Select>
            <Option value="done">已完成</Option>
            <Option value="undone">未完成</Option>
          </Select>
        </FormItem>
        {custom_field.enable && (
          <FormItem
            className="interface-edit-item"
            {...formItemLayout}
            label={custom_field.name}
            name="custom_field_value"
            initialValue={custom_field_value}
          >
            <Input placeholder="请输入" />
          </FormItem>
        )}
      </div>
    </>
  );
};

BasicSettingPanel.propTypes = {
  /** 项目基本路径（props.basepath，只读输入框的值） */
  basepath: PropTypes.string,
  /** 分类树数据（props.cat，经 formatCatTreeData 转换） */
  cat: PropTypes.array,
  /** 项目自定义字段配置（props.custom_field：enable / name） */
  custom_field: PropTypes.object,
  /** 项目 Tag 列表（props.projectMsg.tag） */
  tags: PropTypes.array,
  /** 接口名称初值（父 state.title） */
  title: PropTypes.string,
  /** 分类 id 初值（父 state.catid） */
  catid: PropTypes.any,
  /** 当前方法（父 state.method，方法选择器为受控） */
  method: PropTypes.string,
  /** 接口路径初值（父 state.path） */
  path: PropTypes.string,
  /** 已选 Tag（父 state.tag） */
  tag: PropTypes.array,
  /** 接口状态（父 state.status） */
  status: PropTypes.string,
  /** 自定义字段值（父 state.custom_field_value） */
  custom_field_value: PropTypes.any,
  /** 路径参数行数据（父 state.req_params） */
  req_params: PropTypes.array,
  /** 方法切换（父 onChangeMethod） */
  onChangeMethod: PropTypes.func,
  /** 路径输入（父 handlePath） */
  onPathChange: PropTypes.func,
  /** 打开 Tag 设置弹窗（props.onTagClick） */
  onTagClick: PropTypes.func
};

export default BasicSettingPanel;
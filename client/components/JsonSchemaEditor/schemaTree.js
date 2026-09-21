// @ts-check
import React from 'react';
import { AutoComplete, Button, Checkbox, Input, Select, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CloseOutlined,
  PlusCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { MOCK_SOURCE } from '../../constants/variable.js';
import { SCHEMA_TYPES, flattenRows } from './schemaUtils.js';

/**
 * JsonSchemaEditor 树形行渲染：纯展示 + 受控行为回调，不含自身数据状态。
 * 布局/配色只用中性样式与 --sk-* 皮肤令牌（见 index.scss），不依赖旧编辑器的
 * antd3 scoped 机制，antd5 token 下四皮肤均无硬编码冲突。
 */

/** @type {{value: string}[]} mock 下拉选项（复用 constants.MOCK_SOURCE，允许自由输入自定义值） */
const MOCK_OPTIONS = MOCK_SOURCE.map(item => ({ value: item.mock }));

/**
 * @param {any} node
 * @returns {boolean} mock 输入是否禁用（object/array 不可配 mock，对齐旧编辑器）
 */
function isMockDisabled(node) {
  return !!node && (node.type === 'object' || node.type === 'array');
}

/**
 * @typedef {Object} SchemaTreeActions
 * @property {(path: string[], name: string) => void} onRename 重命名属性
 * @property {(path: string[], type: string) => void} onTypeChange 切换节点类型
 * @property {(path: string[], required: boolean) => void} onRequiredToggle 切换必填
 * @property {(path: string[], field: string, value: any) => void} onFieldChange 通用字段写入
 * @property {(path: string[], mock: string) => void} onMockChange 写入 mock
 * @property {(path: string[]) => void} onAddChild 添加子级（object/array；items 行为其 properties）
 * @property {(row: any) => void} onAddSibling 添加同级属性
 * @property {(row: any) => void} onRemove 删除属性
 * @property {(row: any, dir: 'up'|'down') => void} onMove 同级上移/下移
 * @property {(key: string) => void} onToggleCollapse 展开/折叠
 */

/**
 * @param {Object} props
 * @param {any} props.schema 已解析的根 schema
 * @param {Set<string>} props.collapsedKeys 折叠行 key 集合
 * @param {boolean} props.isMock 是否显示 mock 列
 * @param {SchemaTreeActions} props.actions 行为回调
 */
const SchemaTree = ({ schema, collapsedKeys, isMock, actions }) => {
  const rows = flattenRows(schema, key => collapsedKeys.has(key));
  /** @type {any[]} */
  const rowEls = [];

  rows.forEach(row => {
    const { node, name, depth } = row;
    const collapsed = collapsedKeys.has(row.key);
    const mockValue = node && node.mock && typeof node.mock === 'object' ? node.mock.mock : '';
    /** @type {any[]} */
    const buttons = [];

    // 添加子级仅对 object 行渲染（M1 修复）：array 行的子级入口是 Items 行，
    // 旧条件（expandable 含 array）会渲染出点击后静默无效的按钮
    if (row.expandable && node.type === 'object') {
      buttons.push(
        <Tooltip key="add-child" title="添加子节点">
          <Button
            className="jse-btn jse-btn-add-child"
            type="text"
            size="small"
            icon={<PlusCircleOutlined />}
            onClick={() => actions.onAddChild(row.path)}
          />
        </Tooltip>
      );
    }
    if (row.kind === 'property') {
      buttons.push(
        <Tooltip key="add-sibling" title="添加同级节点">
          <Button
            className="jse-btn jse-btn-add-sibling"
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => actions.onAddSibling(row)}
          />
        </Tooltip>
      );
      buttons.push(
        <Tooltip key="move-up" title="上移">
          <Button
            className="jse-btn jse-btn-up"
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            onClick={() => actions.onMove(row, 'up')}
          />
        </Tooltip>
      );
      buttons.push(
        <Tooltip key="move-down" title="下移">
          <Button
            className="jse-btn jse-btn-down"
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            onClick={() => actions.onMove(row, 'down')}
          />
        </Tooltip>
      );
      buttons.push(
        <Tooltip key="remove" title="删除">
          <Button
            className="jse-btn jse-btn-remove"
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => actions.onRemove(row)}
          />
        </Tooltip>
      );
    }

    rowEls.push(
      <div
        className={'jse-row' + (isMock ? '' : ' jse-row--no-mock')}
        key={row.key}
        data-jse-key={row.key}
      >
        <div className="jse-cell jse-cell-name" style={{ paddingLeft: depth * 16 }}>
          <span className="jse-caret">
            {row.expandable ? (
              <Button
                className="jse-btn jse-caret-btn"
                type="text"
                size="small"
                icon={collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
                onClick={() => actions.onToggleCollapse(row.key)}
              />
            ) : null}
          </span>
          <Input
            className="jse-name-input"
            placeholder="参数名"
            value={name}
            disabled={row.kind === 'items'}
            onChange={(/** @type {any} */ e) => actions.onRename(row.path, e.target.value)}
          />
          {row.kind === 'property' ? (
            <Tooltip title="是否必填">
              <Checkbox
                className="jse-required"
                checked={row.isRequired}
                onChange={(/** @type {any} */ e) => actions.onRequiredToggle(row.path, e.target.checked)}
              />
            </Tooltip>
          ) : null}
        </div>
        <div className="jse-cell">
          <Select
            className="jse-type-select"
            value={node && node.type}
            options={SCHEMA_TYPES.map(item => ({ value: item }))}
            onChange={(/** @type {string} */ value) => actions.onTypeChange(row.path, value)}
          />
        </div>
        <div className="jse-cell">
          <Input
            placeholder="默认值"
            value={node && node.default !== undefined && node.default !== null ? String(node.default) : ''}
            onChange={(/** @type {any} */ e) => actions.onFieldChange(row.path, 'default', e.target.value)}
          />
        </div>
        {isMock ? (
          <div className="jse-cell">
            <AutoComplete
              className="jse-mock"
              options={MOCK_OPTIONS}
              placeholder="mock"
              filterOption
              value={mockValue}
              disabled={isMockDisabled(node)}
              onChange={(/** @type {string} */ value) => actions.onMockChange(row.path, value)}
            />
          </div>
        ) : null}
        <div className="jse-cell">
          <Input
            placeholder="描述"
            value={node && node.description ? node.description : ''}
            onChange={(/** @type {any} */ e) =>
              actions.onFieldChange(row.path, 'description', e.target.value)
            }
          />
        </div>
        <div className="jse-cell jse-cell-actions">{buttons}</div>
      </div>
    );
  });

  return <div className="jse-tree">{rowEls}</div>;
};

export default SchemaTree;

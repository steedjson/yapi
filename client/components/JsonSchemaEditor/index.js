// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Button, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  addProperty,
  changeNodeType,
  getNode,
  isPlainObject,
  moveProperty,
  parseSchema,
  removeProperty,
  renameProperty,
  setMock,
  setNodeField,
  stringifySchema,
  toggleRequired
} from './schemaUtils.js';
import SchemaTree from './schemaTree.js';
import './index.scss';

/**
 * JsonSchemaEditor：YApi 自研 JSON Schema 可视化编辑器（antd5，零新依赖）。
 *
 * 与 json-schema-editor-visual 的消费契约保持兼容（批次 3 才切换消费方）：
 * ```jsx
 * <JsonSchemaEditor data={schemaString} onChange={schemaString => {}} isMock={true} />
 * ```
 * - data：JSON Schema 字符串，可为空串 / 非法 JSON / 历史脏数据（容错为空 object 根）；
 * - onChange：输出 JSON Schema 字符串（compact JSON，键序稳定，与旧编辑器输出形态一致）；
 * - isMock：是否显示 mock 列（下拉复用 constants.MOCK_SOURCE，允许自定义输入）。
 *
 * 受控语义：data 变化（且非本组件自身输出）时重新解析进内部状态；
 * 内部任何变更立即 stringify 上抛。无变更的操作（重名拒改 / 边界移动等）
 * 不会触发 onChange，与旧编辑器"字符串比对后才回调"的行为一致。
 *
 * @param {Object} props
 * @param {string} [props.data] JSON Schema 字符串（容错）
 * @param {(schemaString: string) => void} [props.onChange] 输出回调
 * @param {boolean} [props.isMock] 是否显示 mock 列
 */
const JsonSchemaEditor = ({ data, onChange, isMock }) => {
  const [schema, setSchema] = useState(() => parseSchema(data));
  // 最近一次输出（或初始解析）的序列化结果：onChange 回环抑制与外部 data 比对基准。
  // 用 ref 而非 state：它只参与比较，不驱动渲染。
  const emittedRef = useRef(stringifySchema(parseSchema(data)));
  // 外部 data 的前值镜像：仅当 prop 本身变化时才考虑重解析（对齐旧编辑器的
  // prevProps.data 比对），避免自身输出未回灌时被旧 data 反向覆盖
  const dataRef = useRef(data);
  // 折叠态为纯 UI 状态（行 key 集合），与数据状态分离
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());

  useEffect(() => {
    if (data === dataRef.current) {
      return;
    }
    dataRef.current = data;
    if (typeof data === 'string' && data !== emittedRef.current) {
      const next = parseSchema(data);
      emittedRef.current = stringifySchema(next);
      setSchema(next);
    }
  }, [data]);

  /**
   * 应用一个纯函数变更：无变更（同引用返回）不重渲染不上抛。
   * @param {(current: any) => any} mutator
   * @returns {void}
   */
  const apply = mutator => {
    const next = mutator(schema);
    if (next === schema) {
      return;
    }
    emittedRef.current = stringifySchema(next);
    setSchema(next);
    if (typeof onChange === 'function') {
      onChange(emittedRef.current);
    }
  };

  return (
    <div className="json-schema-editor">
      <div className="jse-toolbar">
        <Button
          className="jse-add-root"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => apply(current => addProperty(current, ['properties'], null))}
        >
          添加属性
        </Button>
      </div>
      <SchemaTree
        schema={schema}
        collapsedKeys={collapsedKeys}
        isMock={!!isMock}
        actions={{
          onRename: (
            /** @type {string[]} */ path,
            /** @type {string} */ name
          ) => {
            // 重名拒改并给出提示（M3 修复：对齐旧编辑器 message.error 行为，不再静默）
            const oldName = path[path.length - 1];
            const siblingProps = getNode(schema, path.slice(0, -1));
            if (
              name &&
              name !== oldName &&
              isPlainObject(siblingProps) &&
              Object.prototype.hasOwnProperty.call(siblingProps, name)
            ) {
              message.error(`The field "${name}" already exists.`);
              return;
            }
            apply(current => renameProperty(current, path, name));
          },
          onTypeChange: (
            /** @type {string[]} */ path,
            /** @type {string} */ type
          ) => apply(current => changeNodeType(current, path, type)),
          onRequiredToggle: (
            /** @type {string[]} */ path,
            /** @type {boolean} */ required
          ) => apply(current => toggleRequired(current, path, required)),
          onFieldChange: (
            /** @type {string[]} */ path,
            /** @type {string} */ field,
            /** @type {any} */ value
          ) => apply(current => setNodeField(current, path, field, value)),
          onMockChange: (
            /** @type {string[]} */ path,
            /** @type {string} */ mock
          ) => apply(current => setMock(current, path, mock)),
          onAddChild: (/** @type {string[]} */ path) =>
            apply(current => addProperty(current, path.concat(['properties']), null)),
          onAddSibling: (/** @type {any} */ row) =>
            apply(current => addProperty(current, row.parentPropsPath || [], row.name)),
          onRemove: (/** @type {any} */ row) => apply(current => removeProperty(current, row.path)),
          onMove: (/** @type {any} */ row, /** @type {'up'|'down'} */ dir) =>
            apply(current => moveProperty(current, row.path, dir)),
          onToggleCollapse: (/** @type {string} */ key) =>
            setCollapsedKeys(prev => {
              const next = new Set(prev);
              if (next.has(key)) {
                next.delete(key);
              } else {
                next.add(key);
              }
              return next;
            })
        }}
      />
    </div>
  );
};

export default JsonSchemaEditor;

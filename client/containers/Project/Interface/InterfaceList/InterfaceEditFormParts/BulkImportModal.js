// @ts-check
/**
 * InterfaceEditForm 子组件：批量添加参数弹窗（自 InterfaceEditForm.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：把父组件持有的「批量导入」弹窗可见性与文本域内容以受控 props 渲染，
 * 并把确认（导入）、取消、文本变化按原签名回调上抛。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛，不持有状态（visible / value 均来自父组件 state）；
 *   - 弹窗正文的结构（wrapper div + TextArea 的占位文案与 autosize 配置）与抽取前逐字
 *     一致；Modal 经 body portal 渲染的既有语义不变（父组件仍位于顶层）；
 *   - 不引入包装 DOM 元素：根节点即原 <Modal>。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Input, Modal } from 'antd';

const TextArea = Input.TextArea;

/**
 * @param {any} props
 */
const BulkImportModal = props => {
  const { visible, value, onChange, onOk, onCancel } = props;

  return (
    <Modal
      title="批量添加参数"
      width={680}
      open={visible}
      onOk={onOk}
      onCancel={onCancel}
      okText="导入"
    >
      <div>
        <TextArea
          placeholder="每行一个name:examples"
          autosize={{ minRows: 6, maxRows: 10 }}
          value={value}
          onChange={onChange}
        />
      </div>
    </Modal>
  );
};

BulkImportModal.propTypes = {
  /** 弹窗可见性（父 state.visible） */
  visible: PropTypes.bool,
  /** 文本域内容（父 state.bulkValue） */
  value: PropTypes.any,
  /** 文本域输入（父 handleBulkValueInput） */
  onChange: PropTypes.func,
  /** 导入（父 handleBulkOk） */
  onOk: PropTypes.func,
  /** 取消（父 handleBulkCancel） */
  onCancel: PropTypes.func
};

export default BulkImportModal;
// @ts-check
/**
 * InterfaceColContent 子组件：自定义测试脚本弹窗（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染「是否开启」开关与用例自定义测试脚本编辑器，并把开关变更、
 * 编辑器内容变更与确认/取消按原有语义上抛。
 *
 * 边界与等价性：
 *   - 受控组件：visible / enableScript / curScript 由父组件以 props 传入，本组件不持有状态；
 *   - AceEditor onChange 载荷（mockEditor.curData，形如 { text }）在本组件内取 .text 后
 *     以 onScriptChange(text) 上抛，等价原父组件 handleScriptChange(d => curScript = d.text)；
 *   - 父组件中该弹窗的打开状态（state.advVisible）保持原样（本批次不作状态下放）；
 *   - 不引入包装 DOM 元素：根节点即原父组件中的 <Modal>。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Modal, Switch } from 'antd';
import AceEditor from 'client/components/AceEditor/AceEditor';

/**
 * @param {any} props
 */
const CaseScriptModal = props => {
  const {
    visible,
    enableScript,
    curScript,
    onEnableScriptChange,
    onScriptChange,
    onOk,
    onCancel
  } = props;

  return (
    <Modal
      title="自定义测试脚本"
      width="660px"
      style={{
        minHeight: '500px'
      }}
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      maskClosable={false}
    >
      <h3>
        是否开启:&nbsp;
        <Switch checked={enableScript} onChange={onEnableScriptChange} />
      </h3>
      <AceEditor
        className="case-script"
        data={curScript}
        onChange={(/** @type {any} */ d) => onScriptChange(d.text)}
      />
    </Modal>
  );
};

CaseScriptModal.propTypes = {
  visible: PropTypes.bool,
  enableScript: PropTypes.bool,
  curScript: PropTypes.string,
  onEnableScriptChange: PropTypes.func,
  /** 上抛编辑器文本（原 payload.text） */
  onScriptChange: PropTypes.func,
  onOk: PropTypes.func,
  onCancel: PropTypes.func
};

export default CaseScriptModal;
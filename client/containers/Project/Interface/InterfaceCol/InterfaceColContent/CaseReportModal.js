// @ts-check
/**
 * InterfaceColContent 子组件：测试报告弹窗（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：把父组件选中的用例测试报告对象以受控 props 渲染为弹窗（报告正文复用
 * 既有 CaseReport 组件），并上抛关闭事件。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛，不持有状态：visible / report 均由父组件传入
 *     （原 state.visible / reportsRef.current[state.curCaseid]）；
 *   - report 为 undefined 时与抽取前一致：CaseReport 以空 props 渲染（JSX 展开
 *     undefined 等价于不传 props）；
 *   - 不引入包装 DOM 元素：根节点即原父组件中的 <Modal>。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';
import CaseReport from '../CaseReport.js';

/**
 * @param {any} props
 */
const CaseReportModal = props => {
  const { visible, report, onCancel } = props;

  return (
    <Modal
      title="测试报告"
      width="900px"
      style={{
        minHeight: '500px'
      }}
      open={visible}
      onCancel={onCancel}
      footer={null}
    >
      <CaseReport {...report} />
    </Modal>
  );
};

CaseReportModal.propTypes = {
  visible: PropTypes.bool,
  /** 当前选中用例的测试报告（reportsRef.current[curCaseid]），缺省时渲染空报告 */
  report: PropTypes.object,
  onCancel: PropTypes.func
};

export default CaseReportModal;
// @ts-check
/**
 * Postman 子组件：两个弹窗 + cross-request 插件安装提示（自 Postman.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：把父组件持有的弹窗可见性与插入点上下文以受控 props 渲染为
 * 「高级参数插入弹窗（ModalPostman）/ 环境设置弹窗（ProjectEnv）/ 插件安装提示
 * （CheckCrossInstall）」三件套，并把确认与取消按原签名回调上抛。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛，不持有任何状态（modalVisible / envModalVisible /
 *     inputValue 均由父组件 state 提供）；
 *   - 不引入包装 DOM 元素：根节点为 Fragment，三件套在原父组件中的兄弟顺序、
 *     条件渲染写法（`state.modalVisible && ...`）原样保留；
 *   - `<ProjectEnv projectId={props.data.project_id} onOk={...} />` 的接线与抽取前一致
 *     （环境弹窗正文复用既有 ProjectEnv 容器）；data 只经 props 透传、在环境弹窗分支内
 *     就地读 project_id，与抽取前「仅在弹窗可见时才求值」的惰性语义完全一致。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';
import ModalPostman from '../../ModalPostman/index.js';
import ProjectEnv from '../../../containers/Project/Setting/ProjectEnv/index.js';
import CheckCrossInstall from '../CheckCrossInstall.js';

/**
 * @param {any} props
 */
const PostmanModals = props => {
  const {
    modalVisible,
    envModalVisible,
    inputValue,
    dataId,
    type,
    data,
    hasPlugin,
    onModalCancel,
    onModalOk,
    onEnvOk,
    onEnvCancel
  } = props;

  return (
    <>
      {modalVisible && (
        <ModalPostman
          open={modalVisible}
          handleCancel={onModalCancel}
          handleOk={onModalOk}
          inputValue={inputValue}
          envType={type}
          id={+dataId}
        />
      )}

      {envModalVisible && (
        <Modal
          title="环境设置"
          open={envModalVisible}
          onOk={onEnvOk}
          onCancel={onEnvCancel}
          footer={null}
          width={800}
          className="env-modal"
        >
          <ProjectEnv projectId={data.project_id} onOk={onEnvOk} />
        </Modal>
      )}
      <CheckCrossInstall hasPlugin={hasPlugin} />
    </>
  );
};

PostmanModals.propTypes = {
  /** 高级参数插入弹窗可见性（父 state.modalVisible） */
  modalVisible: PropTypes.bool,
  /** 环境设置弹窗可见性（父 state.envModalVisible） */
  envModalVisible: PropTypes.bool,
  /** 插入弹窗的输入初值（父 state.inputValue） */
  inputValue: PropTypes.any,
  /** 当前接口/用例 id（父 state._id），插入弹窗按旧写法取正号 */
  dataId: PropTypes.any,
  /** enum[case, inter]，透传为 ModalPostman 的 envType */
  type: PropTypes.string,
  /** 接口/用例渲染数据（环境弹窗正文的 project_id 在此就地读取，保持原 JSX 的惰性求值） */
  data: PropTypes.object,
  hasPlugin: PropTypes.bool,
  onModalCancel: PropTypes.func,
  onModalOk: PropTypes.func,
  onEnvOk: PropTypes.func,
  onEnvCancel: PropTypes.func
};

export default PostmanModals;
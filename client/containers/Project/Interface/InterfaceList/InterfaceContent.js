// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Tabs, Modal, Button, Spin, message } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import Edit from './Edit.js';
import View from './View.js';
import BlockPrompt from '../../../../components/BlockPrompt/BlockPrompt';
import { fetchInterfaceData, changeEditStatus } from '../../../../reducer/modules/interface.js';
import Run from './Run/Run.js';
const plugin = require('client/plugin.js');

const TITLE = 'YApi-高效、易用、功能强大的可视化接口管理平台';

/**
 * 接口详情内容区（预览/编辑/运行 Tabs）。原类组件经 Hooks 现代化迁移，
 * 渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（list 为历史遗留仅声明未消费，
 *   保留订阅避免行为差异）；
 * - 旧 withRouter 注入的 match.params.actionId 改为 useParams，实例字段
 *   this.actionId 改为渲染期同步镜像的 ref（异步回调据此丢弃过期响应）；
 * - 旧 UNSAFE_componentWillMount / UNSAFE_componentWillReceiveProps /
 *   componentWillUnmount 分别改为挂载期 useEffect、actionId 变化 useEffect
 *   （prev ref 比较）与卸载清理。
 */
const Content = () => {
  const dispatch = useDispatch();
  const curdata = useSelector(state => state.inter.curdata);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.inter.list);
  const editStatus = useSelector(state => state.inter.editStatus);
  const { actionId } = /** @type {any} */ (useParams());

  // 镜像旧实例字段 this.actionId：渲染期同步更新，等价旧 cWM/cWRP 中 render 前赋值，
  // 异步恢复回调据此判断响应是否仍对应当前路由接口
  const actionIdRef = useRef(actionId);
  actionIdRef.current = actionId;

  const [state, setState] = useState({
    curtab: 'view',
    visible: false,
    nextTab: '',
    loading: true,
    loadError: ''
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState(prevState => ({ ...prevState, ...patch }));

  /**
   * @param {any} requestActionId
   */
  const handleRequest = async requestActionId => {
    patchState({
      curtab: 'view',
      loading: true,
      loadError: ''
    });
    try {
      const result = await dispatch(fetchInterfaceData(requestActionId));
      const response = result && result.payload;
      if (!response || !response.data || response.data.errcode !== 0 || !response.data.data) {
        throw new Error((response && response.data && response.data.errmsg) || '接口不存在');
      }
      if (actionIdRef.current === requestActionId) {
        patchState({ loading: false });
      }
    } catch (/** @type {any} */ err) {
      if (actionIdRef.current !== requestActionId) return;
      message.error('接口详情加载失败：' + err.message);
      patchState({ loading: false, loadError: '接口详情加载失败，请稍后重试' });
    }
  };

  // 对应旧 UNSAFE_componentWillMount（拉取接口数据）与 componentWillUnmount（清除编辑状态、还原标题）
  useEffect(() => {
    handleRequest(actionIdRef.current);
    return () => {
      dispatch(changeEditStatus(false));
      document.getElementsByTagName('title')[0].innerText = TITLE;
    };
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：路由 actionId 变化时清除上一个接口的
  // 编辑状态并重新拉取，避免旧提示影响新接口
  const prevActionIdRef = useRef(actionId);
  useEffect(() => {
    if (prevActionIdRef.current === actionId) return;
    prevActionIdRef.current = actionId;
    dispatch(changeEditStatus(false));
    handleRequest(actionId);
  }, [actionId]);

  const switchToView = () => {
    patchState({
      curtab: 'view'
    });
  };

  /**
   * @param {any} key
   */
  const onChange = key => {
    if (state.curtab === 'edit' && editStatus) {
      showModal();
    } else {
      patchState({
        curtab: key
      });
    }
    patchState({
      nextTab: key
    });
  };
  // 确定离开页面
  const handleOk = () => {
    setState(prevState => ({
      ...prevState,
      visible: false,
      curtab: prevState.nextTab
    }));
  };
  // 离开编辑页面的提示
  const showModal = () => {
    patchState({
      visible: true
    });
  };
  // 取消离开编辑页面
  const handleCancel = () => {
    patchState({
      visible: false
    });
  };

  if (state.loading) {
    return <Spin className="interface-content-loading" tip="正在加载接口详情..." />;
  }
  if (state.loadError) {
    return <div className="interface-content-error">{state.loadError}</div>;
  }
  if (curdata.title) {
    document.getElementsByTagName('title')[0].innerText = curdata.title + '-' + TITLE;
  }

  let InterfaceTabs = /** @type {any} */ ({
    view: {
      component: View,
      name: '预览'
    },
    edit: {
      component: Edit,
      name: '编辑'
    },
    run: {
      component: Run,
      name: '运行'
    }
  });

  plugin.emitHook('interface_tab', InterfaceTabs);

  const tabs = (
    <Tabs
      className="tabs-large"
      onChange={onChange}
      activeKey={state.curtab}
      defaultActiveKey="view"
      items={Object.keys(InterfaceTabs).map((/** @type {any} */ key) => {
        let item = InterfaceTabs[key];
        return { label: item.name, key: key };
      })}
    />
  );
  let tabContent = null;
  if (state.curtab) {
    let C = InterfaceTabs[state.curtab].component;
    // 路由切换时强制重建当前 Tab，避免复用上一个接口的表单和编辑器状态。
    tabContent = <C key={actionIdRef.current} switchToView={switchToView} />;
  }

  return (
    <div className="interface-content">
      <BlockPrompt
        when={state.curtab === 'edit' && editStatus ? true : false}
        message={() => {
          // this.showModal();
          return '离开页面会丢失当前编辑的内容，确定要离开吗？';
        }}
      />
      {tabs}
      {tabContent}
      {state.visible && (
        <Modal
          title="你即将离开编辑页面"
          open={state.visible}
          onCancel={handleCancel}
          footer={[
            <Button key="back" onClick={handleCancel}>
              取 消
            </Button>,
            <Button key="submit" onClick={handleOk}>
              确 定
            </Button>
          ]}
        >
          <p>离开页面会丢失当前编辑的内容，确定要离开吗？</p>
        </Modal>
      )}
    </div>
  );
};

export default Content;

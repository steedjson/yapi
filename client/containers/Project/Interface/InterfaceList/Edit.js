// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import InterfaceEditForm from './InterfaceEditForm.js';
import {
  fetchInterfaceListMenu,
  fetchInterfaceData
} from '../../../../reducer/modules/interface.js';
import { getProject } from '../../../../reducer/modules/project.js';
import axios from 'axios';
import { message, Modal } from 'antd';
import './Edit.scss';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import ProjectTag from '../../Setting/ProjectMessage/ProjectTag.js';

/**
 * 接口编辑 Tab。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch，旧 withRouter 注入的
 *   match.params 改为 useParams（父级传入的 switchToView 历史上即未消费）；
 * - mockUrl 与旧构造函数一致，仅在首次渲染时基于当时的 props 计算一次；
 * - 旧 componentDidMount 的编辑冲突 WebSocket 与 3s 初始化兜底定时器改为
 *   挂载期 useEffect，卸载时关闭连接并清理定时器（对应旧 componentWillUnmount）；
 * - 定时器 / WebSocket 回调中对 this.props 的实时读取统一改为 latestRef
 *   镜像读取，语义一致。
 */
const InterfaceEdit = () => {
  const dispatch = useDispatch();
  const curdata = useSelector(state => state.inter.curdata);
  const catList = useSelector(state => state.inter.list);
  const currProject = useSelector(state => state.project.currProject);
  const { id: projectId, actionId } = useParams();

  const [state, setState] = useState(
    /** @type {any} */ (
      () => ({
        mockUrl:
          location.protocol +
          '//' +
          location.hostname +
          (location.port !== '' ? ':' + location.port : '') +
          `/mock/${currProject._id}${currProject.basepath}${curdata.path}`,
        curdata: {},
        status: 0,
        visible: false
      })
    )
  );
  const patchState = (/** @type {any} */ patch) =>
    setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  const mountedRef = useRef(false);
  const initTimerRef = useRef(null);
  const webSocketRef = useRef(null);
  const tagRef = useRef(null);

  // 镜像最新 redux 值与路由参数：定时器 / WebSocket 回调中的读取
  // 等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { curdata, catList, currProject, projectId, actionId };

  // 对应旧 componentDidMount（冲突检测 WebSocket + 初始化兜底定时器），
  // 清理逻辑对应旧 componentWillUnmount
  useEffect(() => {
    mountedRef.current = true;
    // Redux 中尚无分类树时主动加载，保证编辑表单能拿到带 children 的多级分类。
    if (!latestRef.current.catList || latestRef.current.catList.length === 0) {
      dispatch(fetchInterfaceListMenu(projectId));
    }
    const domain = location.hostname + (location.port !== '' ? ':' + location.port : '');
    let s;
    let initData = false;
    // 因后端 node 仅支持 ws， 暂不支持 wss
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

    initTimerRef.current = setTimeout(() => {
      if (mountedRef.current && initData === false) {
        setState((/** @type {any} */ prevState) => ({
          ...prevState,
          curdata: latestRef.current.curdata,
          status: 1
        }));
        initData = true;
      }
    }, 3000);

    try {
      s = new WebSocket(
        wsProtocol + '://' + domain + '/api/interface/solve_conflict?id=' + actionId
      );
      webSocketRef.current = s;
      s.onopen = () => {};

      s.onmessage = e => {
        if (!mountedRef.current) return;
        initData = true;
        let result;
        try {
          result = JSON.parse(e.data);
        } catch (/** @type {any} */ err) {
          return console.warn('WebSocket 返回数据解析失败：' + err.message);
        }
        if (result.errno === 0) {
          setState((/** @type {any} */ prevState) => ({
            ...prevState,
            curdata: result.data,
            status: 1
          }));
        } else {
          setState((/** @type {any} */ prevState) => ({
            ...prevState,
            curdata: result.data,
            status: 2
          }));
        }
      };

      s.onerror = () => {
        if (!mountedRef.current) return;
        setState((/** @type {any} */ prevState) => ({
          ...prevState,
          curdata: latestRef.current.curdata,
          status: 1
        }));
        console.warn('websocket 连接失败，将导致多人编辑同一个接口冲突。');
      };
    } catch (/** @type {any} */ e) {
      if (!mountedRef.current) return;
      setState((/** @type {any} */ prevState) => ({
        ...prevState,
        curdata: latestRef.current.curdata,
        status: 1
      }));
      console.error('websocket 连接失败，将导致多人编辑同一个接口冲突。');
    }

    return () => {
      mountedRef.current = false;
      if (initTimerRef.current) clearTimeout(initTimerRef.current);
      try {
        if (webSocketRef.current) webSocketRef.current.close();
      } catch (/** @type {any} */ err) {
        // WebSocket 已关闭时无需重复处理。
      }
      webSocketRef.current = null;
    };
  }, []);

  const onSubmit = async (/** @type {any} */ params) => {
    const data = Object.assign({}, params, {
      id: actionId
    });
    try {
      const result = await axios.post('/api/interface/up', data);
      if (result.data.errcode !== 0) {
        message.error(result.data.errmsg);
        return false;
      }

      // 只有保存成功后才刷新分类和接口数据，避免失败响应覆盖当前编辑内容。
      await Promise.all([
        dispatch(fetchInterfaceListMenu(currProject._id)),
        dispatch(fetchInterfaceData(data.id))
      ]);
      // 刷新接口详情后直接使用服务端数据，避免用不完整的提交参数覆盖详情字段。
      message.success('保存成功');
      return true;
    } catch (/** @type {any} */ err) {
      message.error('保存失败：' + err.message);
      return false;
    }
  };

  const onTagClick = () => {
    patchState({
      visible: true
    });
  };

  const handleOk = async () => {
    let { tag } = tagRef.current.state;
    tag = tag.filter((/** @type {any} */ val) => {
      return val.name !== '';
    });

    const id = currProject._id;
    const params = {
      id,
      tag
    };
    const result = await axios.post('/api/project/up_tag', params);

    if (result.data.errcode === 0) {
      await dispatch(getProject(id));
      message.success('保存成功');
    } else {
      message.error(result.data.errmsg);
    }

    patchState({
      visible: false
    });
  };

  const handleCancel = () => {
    patchState({
      visible: false
    });
  };

  const tagSubmit = (/** @type {any} */ tagFormRef) => {
    tagRef.current = tagFormRef;
  };

  const { cat, basepath, switch_notice, tag } = currProject;
  return (
    <div className="interface-edit">
      {state.status === 1 ? (
        <InterfaceEditForm
          cat={catList && catList.length ? catList : cat}
          mockUrl={state.mockUrl}
          basepath={basepath}
          noticed={switch_notice}
          onSubmit={onSubmit}
          curdata={state.curdata}
          onTagClick={onTagClick}
        />
      ) : null}
      {state.status === 2 ? (
        <div style={{ textAlign: 'center', fontSize: '14px', paddingTop: '10px' }}>
          <Link to={'/user/profile/' + state.curdata.uid}>
            <b>{state.curdata.username}</b>
          </Link>
          <span>正在编辑该接口，请稍后再试...</span>
        </div>
      ) : null}
      {state.status === 0 && '正在加载，请耐心等待...'}

      <Modal
        title="Tag 设置"
        width={680}
        open={state.visible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="保存"
      >
        <div className="tag-modal-center">
          <ProjectTag tagMsg={tag} ref={tagSubmit} />
        </div>
      </Modal>
    </div>
  );
};

export default InterfaceEdit;

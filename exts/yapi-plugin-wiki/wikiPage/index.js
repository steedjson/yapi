// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './index.scss';
import { timeago } from '../../../common/utils';
import WikiView from './View.js';
import WikiEditor from './Editor.js';

/**
 * Wiki 协同编辑页。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector，旧 props.match.params.id 改为 useParams；
 * - 旧 constructor state 改为 useState（单对象 patch，保持浅合并语义）；
 * - 旧 componentDidMount / componentWillUnmount 改为挂载期 useEffect 及其清理函数；
 * - WebSocket 实例与最新 state 分别以 wsRef / latestRef 镜像，回调内读取等价
 *   旧类组件的实时 this.WebSocket / this.state；
 * - 已知遗留行为 bug-for-bug 保持：endWebSocket 调用
 *   handleWebsocketAccidentClose 时不传 callback，内部 callback 调用必然抛
 *   TypeError，被 endWebSocket 外层 try/catch 静默吞掉（'end' 消息仍会发出）。
 */
const WikiPage = () => {
  const projectMsg = useSelector((/** @type {any} */ state) => state.project.currProject);
  const { id } = /** @type {any} */ (useParams());

  /** @type {any} */
  const [state, setState] = useState({
    isEditor: false,
    isUpload: true,
    desc: '',
    markdown: '',
    notice: projectMsg.switch_notice,
    status: 'INIT',
    editUid: '',
    editName: '',
    curdata: null
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  /** @type {any} */
  const wsRef = useRef(null);

  // 镜像最新 redux 值、路由参数与本地 state：WebSocket 回调等异步回调中的读取
  // 等价于旧类组件的实时 this.props / this.state
  const latestRef = useRef({});
  latestRef.current = { state, projectMsg, id };

  // 结束编辑websocket
  const endWebSocket = () => {
    try {
      if (latestRef.current.state.status === 'CLOSE') {
        const sendEnd = () => {
          wsRef.current.send('end');
        };
        handleWebsocketAccidentClose(sendEnd);
      }
    } catch (e) {
      return null;
    }
  };

  // 处理多人编辑冲突问题
  const handleConflict = () => {
    // console.log(location)
    let domain = location.hostname + (location.port !== '' ? ':' + location.port : '');
    //因后端 node 仅支持 ws， 暂不支持 wss
    let wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    let s = new WebSocket(
      wsProtocol +
        '://' +
        domain +
        '/api/ws_plugin/wiki_desc/solve_conflict?id=' +
        latestRef.current.id
    );
    s.onopen = () => {
      wsRef.current = s;
      s.send('start');
    };

    s.onmessage = e => {
      let result = JSON.parse(e.data);
      if (result.errno === 0) {
        // 更新
        if (result.data) {
          patchState({
            // curdata: result.data,
            desc: result.data.desc,
            username: result.data.username,
            uid: result.data.uid,
            editorTime: timeago(result.data.up_time)
          });
        }
        // 新建
        setState((/** @type {any} */ prevState) => ({
          ...prevState,
          isEditor: !prevState.isEditor,
          status: 'CLOSE'
        }));
      } else {
        patchState({
          editUid: result.data.uid,
          editName: result.data.username,
          status: 'EDITOR'
        });
      }
    };

    s.onerror = () => {
      patchState({
        status: 'CLOSE'
      });
      console.warn('websocket 连接失败，将导致多人编辑同一个接口冲突。');
    };
  };

  // 点击编辑按钮 发送 websocket 获取数据
  const onEditor = () => {
    // this.WebSocket.send('editor');
    const sendEditor = () => {
      wsRef.current.send('editor');
    };
    handleWebsocketAccidentClose(sendEditor, (/** @type {any} */ status) => {
      // 如果websocket 启动不成功用户依旧可以对wiki 进行编辑
      if (!status) {
        setState((/** @type {any} */ prevState) => ({
          ...prevState,
          isEditor: !prevState.isEditor
        }));
      }
    });
  };

  // 处理websocket  意外断开问题
  /**
   * @param {any} fn
   * @param {any} [callback] 旧调用存在不传 callback 的路径（endWebSocket），此时静默失败
   */
  const handleWebsocketAccidentClose = (fn, callback) => {
    // websocket 是否启动
    if (wsRef.current) {
      // websocket 断开
      if (wsRef.current.readyState !== 1) {
        message.error('websocket 链接失败，请重新刷新页面');
      } else {
        fn();
      }
      (/** @type {any} */ (callback))(true);
    } else {
      (/** @type {any} */ (callback))(false);
    }
  };

  //  获取数据
  /**
   * @param {any} params
   */
  const handleData = async params => {
    let result = await axios.get('/api/plugin/wiki_desc/get', { params });
    if (result.data.errcode === 0) {
      const data = result.data.data;
      if (data) {
        patchState({
          desc: data.desc,
          markdown: data.markdown,
          username: data.username,
          uid: data.uid,
          editorTime: timeago(data.up_time)
        });
      }
    } else {
      message.error(`请求数据失败： ${result.data.errmsg}`);
    }
  };

  // 数据上传
  /**
   * @param {any} desc
   * @param {any} markdown
   */
  const onUpload = async (desc, markdown) => {
    const currProjectId = latestRef.current.id;
    let option = {
      project_id: currProjectId,
      desc,
      markdown,
      email_notice: latestRef.current.state.notice
    };
    let result = await axios.post('/api/plugin/wiki_desc/up', option);
    if (result.data.errcode === 0) {
      await handleData({ project_id: currProjectId });
      patchState({ isEditor: false });
    } else {
      message.error(`更新失败： ${result.data.errmsg}`);
    }
    endWebSocket();
    // this.WebSocket.send('end');
  };
  // 取消编辑
  const onCancel = () => {
    patchState({ isEditor: false });
    endWebSocket();
  };

  // 邮件通知
  const onEmailNotice = (/** @type {any} */ e) => {
    patchState({
      notice: e.target.checked
    });
  };

  // 对应旧 componentDidMount；清理函数对应旧 componentWillUnmount
  useEffect(() => {
    handleData({ project_id: id }).then(() => {
      handleConflict();
    });
    return () => {
      // willUnmount
      try {
        if (latestRef.current.state.status === 'CLOSE') {
          wsRef.current.send('end');
          wsRef.current.close();
        }
      } catch (e) {
        return null;
      }
    };
  }, []);

  const { isEditor, username, editorTime, notice, uid, status, editUid, editName } = state;
  const editorEable =
    projectMsg.role === 'admin' ||
    projectMsg.role === 'owner' ||
    projectMsg.role === 'dev';
  const isConflict = status === 'EDITOR';

  return (
    <div className="g-row">
      <div className="m-panel wiki-content">
        <div className="wiki-content">
          {isConflict && (
            <div className="wiki-conflict">
              <Link to={`/user/profile/${editUid || uid}`}>
                <b>{editName || username}</b>
              </Link>
              <span>正在编辑该wiki，请稍后再试...</span>
            </div>
          )}
        </div>
        {!isEditor ? (
          <WikiView
            editorEable={editorEable}
            onEditor={onEditor}
            uid={uid}
            username={username}
            editorTime={editorTime}
            desc={state.desc}
          />
        ) : (
          <WikiEditor
            isConflict={isConflict}
            onUpload={onUpload}
            onCancel={onCancel}
            notice={notice}
            onEmailNotice={onEmailNotice}
            desc={state.desc}
          />
        )}
      </div>
    </div>
  );
};

export default WikiPage;

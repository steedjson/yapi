// @ts-check
// react-router v6 的非数据路由（HistoryRouter）不支持 <Prompt>/getUserConfirmation，
// 这里基于 history.block 自实现等价的「路由离开确认」：
// when 为真时拦截一切导航（含浏览器前进/后退），弹出与原 getUserConfirmation
// 相同的 MyPopConfirm 确认框，确认后重放被阻止的导航。
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import PropTypes from 'prop-types';
import MyPopConfirm from '../MyPopConfirm/MyPopConfirm';
import history from '../../history';

/**
 * @param {{ when?: any, message?: any }} props
 */
export default function BlockPrompt({ when, message }) {
  const whenRef = useRef(when);
  whenRef.current = when;
  const messageRef = useRef(message);
  messageRef.current = message;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!when) return undefined;
    /** @type {any} */
    let unblock = null;

    // 确认放行后：先解除拦截再重放导航；导航完成后若组件仍挂载且仍处于编辑态，
    // 重新注册拦截（history.block 为一次性消费语义）
    const register = () => {
      unblock = history.block(tx => {
        const msg =
          typeof messageRef.current === 'function'
            ? messageRef.current(tx.location, tx.action)
            : messageRef.current;
        const container = document.createElement('div');
        document.body.appendChild(container);
        // React 18 每次弹窗新建独立容器，单独建 root 渲染
        const root = createRoot(container);
        root.render(
          <MyPopConfirm
            msg={msg}
            callback={(/** @type {boolean} */ result) => {
              root.unmount();
              container.remove();
              if (result) {
                if (unblock) {
                  unblock();
                  unblock = null;
                }
                tx.retry();
                setTimeout(() => {
                  if (mountedRef.current && whenRef.current) {
                    register();
                  }
                }, 0);
              }
            }}
          />
        );
      });
    };

    register();
    return () => {
      if (unblock) {
        unblock();
        unblock = null;
      }
    };
  }, [when]);

  return null;
}

BlockPrompt.propTypes = {
  when: PropTypes.bool,
  message: PropTypes.oneOfType([PropTypes.func, PropTypes.string])
};

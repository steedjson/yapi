import React, { useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import PropTypes from 'prop-types';

// 嵌入到 BrowserRouter 内部，覆盖掉默认的 window.confirm
// http://reacttraining.cn/web/api/BrowserRouter/getUserConfirmation-func
function MyPopConfirm(props) {
  const [visible, setVisible] = useState(true);

  // 每次新的拦截（msg 变化）时重新弹出
  useEffect(() => {
    setVisible(true);
  }, [props.msg]);

  function yes() {
    props.callback(true);
    setVisible(false);
  }

  function no() {
    props.callback(false);
    setVisible(false);
  }

  if (!visible) {
    return null;
  }
  return (<Modal
    title="你即将离开编辑页面"
    open={visible}
    onCancel={no}
    footer={[
      <Button key="back" onClick={no}>取 消</Button>,
      <Button key="submit" onClick={yes}>确 定</Button>
    ]}
  >
    <p>{props.msg}</p>
  </Modal>);
}

MyPopConfirm.propTypes = {
  msg: PropTypes.string,
  callback: PropTypes.func
};

export default MyPopConfirm;

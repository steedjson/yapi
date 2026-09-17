import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert } from 'antd';

export default function Notify() {
  const [version] = useState(process.env.version);
  const [newVersion, setNewVersion] = useState(process.env.version);

  useEffect(() => {
    // 卸载后不再 setState，避免 React 18 下对已卸载组件的更新告警
    let active = true;
    const versions = 'https://www.fastmock.site/mock/1529fa78fa4c4880ad153d115084a940/yapi/versions';
    // 外网 mock 已失效，失败时静默忽略，避免 axios 1.x 未捕获 Network Error 打断页面。
    axios
      .get(versions, { timeout: 3000 })
      .then(req => {
        if (active && req.status === 200 && req.data && req.data.data && req.data.data[0]) {
          setNewVersion(req.data.data[0]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isShow = newVersion !== version;
  return (
    <div>
      {isShow && (
        <Alert
          message={
            <div>
              当前版本是：{version}&nbsp;&nbsp;可升级到: {newVersion}
              &nbsp;&nbsp;&nbsp;
              <a
                target="view_window"
                href="https://github.com/YMFE/yapi/blob/master/CHANGELOG.md"
              >
                版本详情
              </a>
            </div>
          }
          banner
          closable
          type="info"
        />
      )}
    </div>
  );
}

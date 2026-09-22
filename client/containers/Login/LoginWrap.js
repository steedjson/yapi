// @ts-check
import React from 'react';
import { Tabs } from 'antd';
// user 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useUserStore from '../../store/userStore';
import LoginForm from './Login';
import RegForm from './Reg';
import './Login.scss';

/**
 * 登录/注册页外壳（Tabs）。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector（批次4 随 user 切片迁移改经 useUserStore）；
 * - 组件无副作用与本地状态，类壳与仅声明未消费的 props（form）随迁移移除。
 */
const LoginWrap = () => {
  const loginWrapActiveKey = useUserStore(state => state.loginWrapActiveKey);
  const canRegister = useUserStore(state => state.canRegister);

  // show only login when register is disabled
  return (
    <Tabs
      defaultActiveKey={loginWrapActiveKey}
      className="login-form"
      tabBarStyle={{ border: 'none' }}
      items={[
        {
          label: '登录',
          key: '1',
          children: <LoginForm />
        },
        {
          label: '注册',
          key: '2',
          children: canRegister ? (
            <RegForm />
          ) : (
            <div style={{ minHeight: 200 }}>管理员已禁止注册，请联系管理员</div>
          )
        }
      ]}
    />
  );
};

export default LoginWrap;

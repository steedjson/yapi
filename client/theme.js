/**
 * 皮肤运行时模块
 *
 * 两层皮肤机制:
 * 1. 页面层令牌:documentElement 上的 data-skin 属性 → client/styles/skins.scss 的变量覆盖;
 * 2. antd 组件层:ConfigProvider theme token——getThemeConfig(skin) 产出 antd5 主题对象,
 *    client/index.js 经 useSkinTheme() 订阅消费;皮肤变更通过本模块的发布订阅即时生效,
 *    不再注入任何预编译主题 <link>(v5 组件样式为 css-in-js 运行时生成)。
 *
 * 优先级:localStorage 个人偏好 > 服务端全局默认 > enterprise(默认皮肤,零 token 覆盖)。
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { message, theme as antdTheme } from 'antd';

export const SKINS = [
  { name: 'enterprise', label: '默认' },
  // hidden 仅为菜单入口隐藏:白名单校验/主题映射/已选用户的 localStorage 偏好均保持有效
  { name: 'gov', label: '政务风', hidden: true },
  { name: 'anime', label: '二次元' },
  { name: 'dark', label: '暗色', hidden: true }
];

const SKIN_NAMES = SKINS.map(item => item.name);
const STORAGE_KEY = 'yapi-skin';

/**
 * 皮肤 → antd5 theme 映射(模块级缓存,引用稳定,避免 ConfigProvider 无效重算)。
 * enterprise 为 undefined 即 antd 默认主题。
 */
const THEME_CONFIGS = {
  enterprise: undefined,
  gov: {
    token: {
      colorPrimary: '#1e4f9c',
      borderRadius: 2,
      colorBgLayout: '#f0f2f5'
    }
  },
  anime: {
    token: {
      colorPrimary: '#a05ce6',
      borderRadius: 12,
      colorBgLayout: '#fff7fb'
    }
  },
  dark: {
    algorithm: antdTheme.darkAlgorithm,
    token: {
      colorPrimary: '#2395f1',
      borderRadius: 4
    }
  }
};

// —— 皮肤变更发布订阅(根组件 ConfigProvider / 其他消费者按需订阅) ——
const listeners = new Set();

/**
 * @param {(skin: string) => void} fn 皮肤变更回调
 * @returns {() => void} 取消订阅函数
 */
function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners(skin) {
  listeners.forEach(fn => {
    try {
      fn(skin);
    } catch (e) {
      // 单个订阅者异常不影响其余订阅者
    }
  });
}

/**
 * @param {string|null} name
 * @returns {boolean}
 */
function isSkinName(name) {
  return typeof name === 'string' && SKIN_NAMES.indexOf(name) > -1;
}

/**
 * @returns {string|null} localStorage 中的个人皮肤偏好
 */
function readLocalSkin() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // 隐私模式等场景 localStorage 不可用,忽略
    return null;
  }
}

/**
 * 应用皮肤到当前文档(仅 DOM/localStorage 层,不做白名单校验,内部使用)。
 */
function applySkin(skin) {
  const root = document.documentElement;
  if (skin === 'enterprise') {
    root.removeAttribute('data-skin');
  } else {
    root.setAttribute('data-skin', skin);
  }
}

/**
 * @returns {string} 当前生效皮肤名
 */
export function getSkin() {
  const skin = document.documentElement.getAttribute('data-skin');
  return isSkinName(skin) && skin !== 'enterprise' ? skin : 'enterprise';
}

/**
 * 皮肤 → antd5 ConfigProvider theme 对象映射。
 * @param {string} skin
 * @returns {object|undefined} enterprise/未知皮肤返回 undefined(antd 默认主题)
 */
export function getThemeConfig(skin) {
  return isSkinName(skin) ? THEME_CONFIGS[skin] : THEME_CONFIGS.enterprise;
}

/**
 * React hook:返回当前皮肤的 antd5 theme 对象,皮肤变更时触发组件重渲染。
 * 供根组件(和任何需要感知皮肤的组件)消费 ConfigProvider theme。
 * @returns {object|undefined}
 */
export function useSkinTheme() {
  const [skin, setSkin] = useState(getSkin());
  useEffect(() => subscribe(setSkin), []);
  return getThemeConfig(skin);
}

/**
 * 初始化皮肤:同步应用本地偏好;无本地偏好时异步拉取全局默认兜底。
 * 任何失败都不影响页面正常渲染(静默容错)。
 */
export function initSkin() {
  const local = readLocalSkin();
  if (isSkinName(local)) {
    applySkin(local);
    notifyListeners(getSkin());
    return;
  }
  axios
    .get('/api/user/skin_config')
    .then(res => {
      const skin = res.data && res.data.data && res.data.data.skin;
      // 全局默认为 enterprise 时不做任何事(等价默认皮肤)
      if (isSkinName(skin) && skin !== 'enterprise') {
        applySkin(skin);
        notifyListeners(getSkin());
      }
    })
    .catch(() => {
      // 未登录/接口异常时保持默认皮肤
    });
}

/**
 * 设置当前用户个人皮肤:白名单校验 → 应用 → 写 localStorage → 通知订阅者。
 * @param {string} name
 * @returns {boolean} 是否为合法皮肤并已应用
 */
export function setSkin(name) {
  if (!isSkinName(name)) {
    return false;
  }
  applySkin(name);
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch (e) {
    // localStorage 不可用时仅本次会话生效
  }
  notifyListeners(getSkin());
  return true;
}

/**
 * 设置全局默认皮肤(仅 admin,由路由层鉴权)。
 * @param {string} name
 * @returns {Promise<any>} 成功时 resolve 服务端响应;失败时 message.error 并 reject
 */
export function setGlobalSkin(name) {
  if (!isSkinName(name)) {
    return Promise.reject(new Error('非法皮肤名: ' + name));
  }
  return axios
    .post('/api/user/skin_config', { skin: name })
    .then(res => {
      if (res.data && res.data.errcode !== 0) {
        throw new Error(res.data.errmsg || '全局皮肤保存失败');
      }
      return res;
    })
    .catch(err => {
      message.error((err && err.message) || '全局皮肤保存失败');
      throw err;
    });
}

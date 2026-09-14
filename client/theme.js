/**
 * 皮肤运行时模块
 *
 * 两层皮肤机制:
 * 1. 页面层令牌:documentElement 上的 data-skin 属性 → client/styles/skins.scss 的变量覆盖;
 * 2. antd 组件层:按需注入预编译主题 CSS(client/styles/themes/*.less 的产物,
 *    固定文件名 theme-*@prd.css / theme-*@dev.css)。
 *
 * 优先级:localStorage 个人偏好 > 服务端全局默认 > enterprise(默认皮肤,无额外加载)。
 */
import axios from 'axios';
import { message } from 'antd';

export const SKINS = [
  { name: 'enterprise', label: '企业风' },
  { name: 'gov', label: '政务风' },
  { name: 'anime', label: '二次元风' },
  { name: 'dark', label: '暗色' }
];

const SKIN_NAMES = SKINS.map(item => item.name);
const STORAGE_KEY = 'yapi-skin';
const THEME_LINK_ID = 'skin-theme-link';

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
 * 推导皮肤主题 CSS 的运行时 URL(确定性固定名,不依赖 assets manifest:
 * assets-webpack-plugin 基于 chunk.files 生成,emit 阶段重命名后的 CSS 不会进 manifest)。
 * 生产:build/webpack.standalone.config.js 的 ThemeCssFixedNamePlugin 保证产物固定为
 *       /prd/theme-*@prd.css(页面统一以 /prd/ 前缀引用,与 index.html 一致);
 * 开发:dev server(4000) 的 publicPath 为 /prd/,产物本身固定为 theme-*@dev.css。
 * @param {string} skin
 * @returns {string}
 */
function getThemeHref(skin) {
  const suffix = process.env.NODE_ENV === 'production' ? 'prd' : 'dev';
  // 主题 CSS 与 index 样式同源同前缀。开发模式页面由后端(3000)提供而资源在
  // webpack dev server(4000),相对路径会按页面 origin 解析到 404,
  // 因此从已加载的样式表链接推导资源基址;生产同源时推导结果即当前站点 /prd/。
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (let i = 0; i < links.length; i++) {
    const href = links[i].getAttribute('href') || '';
    if (href.indexOf('/prd/') > -1) {
      return href.split('/prd/')[0] + '/prd/theme-' + skin + '@' + suffix + '.css';
    }
  }
  return '/prd/theme-' + skin + '@' + suffix + '.css';
}

/**
 * 注入(或切换)皮肤主题 link,幂等:同一 href 不重复设置。
 * @param {string} skin
 */
function injectThemeLink(skin) {
  let link = document.getElementById(THEME_LINK_ID);
  if (!link) {
    link = document.createElement('link');
    link.id = THEME_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const href = getThemeHref(skin);
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
}

function removeThemeLink() {
  const link = document.getElementById(THEME_LINK_ID);
  if (link && link.parentNode) {
    link.parentNode.removeChild(link);
  }
}

/**
 * 应用皮肤到当前文档(仅 DOM/localStorage 层,不做白名单校验,内部使用)。
 * @param {string} skin
 */
function applySkin(skin) {
  const root = document.documentElement;
  if (skin === 'enterprise') {
    root.removeAttribute('data-skin');
    removeThemeLink();
  } else {
    root.setAttribute('data-skin', skin);
    injectThemeLink(skin);
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
 * 初始化皮肤:同步应用本地偏好;无本地偏好时异步拉取全局默认兜底。
 * 任何失败都不影响页面正常渲染(静默容错)。
 */
export function initSkin() {
  const local = readLocalSkin();
  if (isSkinName(local)) {
    applySkin(local);
    return;
  }
  axios
    .get('/api/user/skin_config')
    .then(res => {
      const skin = res.data && res.data.data && res.data.data.skin;
      // 全局默认为 enterprise 时不做任何事(等价默认皮肤)
      if (isSkinName(skin) && skin !== 'enterprise') {
        applySkin(skin);
      }
    })
    .catch(() => {
      // 未登录/接口异常时保持默认皮肤
    });
}

/**
 * 设置当前用户个人皮肤:白名单校验 → 应用 → 写 localStorage。
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

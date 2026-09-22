// @ts-check
import './Header.scss';
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Layout, Dropdown, message, Tooltip, Popover, Tag } from 'antd';
import {
  SkinOutlined,
  CheckOutlined,
  LogoutOutlined,
  StarOutlined,
  PlusCircleOutlined,
  QuestionCircleOutlined,
  DownOutlined
} from '@ant-design/icons';
import { getV4Icon } from '../../constants/v4IconMap';
import { logoutActions } from '../../reducer/modules/user';
// menu 切片已迁至 Zustand（批次2），user 模块仍未迁移
import useMenuStore from '../../store/menuStore';
import { useNavigate } from 'react-router-dom';
import Srch from './Search/Search';
import { SKINS, getSkin, setSkin } from '../../theme';
const { Header } = Layout;
import LogoSVG from '../LogoSVG/index.js';
import Breadcrumb from '../Breadcrumb/Breadcrumb.js';
import GuideBtns from '../GuideBtns/GuideBtns.js';
const plugin = require('client/plugin.js');

/**
 * @type {Record<string, { path: string, name: string, icon: string, adminFlag: boolean }>}
 */
let HeaderMenu = {
  user: {
    path: '/user/profile',
    name: '个人中心',
    icon: 'user',
    adminFlag: false
  },
  solution: {
    path: '/user/list',
    name: '用户管理',
    icon: 'solution',
    adminFlag: true
  }
};

plugin.emitHook('header_menu', HeaderMenu);

// antd5 的 Dropdown overlay 已移除,改用 menu(items 配置);theme="dark" 沿用原深色菜单,
// className="user-menu" 经 MenuProps 透传保持原 hook 挂载点。
/**
 * @param {any} props
 */
const buildUserMenuItems = props => {
  const isAdmin = props.role === 'admin';
  /** @type {any[]} */
  const items = Object.keys(HeaderMenu)
    .filter(key => !HeaderMenu[key].adminFlag || isAdmin)
    .map(key => {
      const item = HeaderMenu[key];
      const path = item.name === '个人中心' ? item.path + `/${props.uid}` : item.path;
      return {
        key,
        icon: React.createElement(getV4Icon(item.icon)),
        label: <Link to={path}>{item.name}</Link>
      };
    });
  // hidden 皮肤不显示入口;但当前正激活的 hidden 皮肤仍列出,避免用户无法切回
  items.push({
    key: 'skin',
    icon: <SkinOutlined />,
    label: '界面皮肤',
    children: SKINS.filter(item => !item.hidden || item.name === props.skin).map(item => ({
      key: 'skin-' + item.name,
      label: (
        <a onClick={() => props.onSelectSkin(item.name)}>
          <CheckOutlined
            style={{ visibility: props.skin === item.name ? 'visible' : 'hidden' }}
          />
          {item.label}
        </a>
      )
    }))
  });
  items.push({
    key: '9',
    icon: <LogoutOutlined />,
    label: <a onClick={props.logout}>退出</a>
  });
  return items;
};

const tipFollow = (
  <div className="title-container">
    <h3 className="title">
      <StarOutlined /> 关注
    </h3>
    <p>这里是你的专属收藏夹，便于你找到自己的项目</p>
  </div>
);
const tipAdd = (
  <div className="title-container">
    <h3 className="title">
      <PlusCircleOutlined /> 新建项目
    </h3>
    <p>在任何页面都可以快速新建项目</p>
  </div>
);
const tipDoc = (
  <div className="title-container">
    <h3 className="title">
      使用文档 <Tag color="orange">推荐!</Tag>
    </h3>
    <p>
      初次使用 YApi，强烈建议你阅读{' '}
      <a target="_blank" href="https://hellosean1025.github.io/yapi/" rel="noopener noreferrer">
        使用文档
      </a>
      ，我们为你提供了通俗易懂的快速入门教程，更有详细的使用说明，欢迎阅读！{' '}
    </p>
  </div>
);

/**
 * @param {any} props
 */
const ToolUser = props => {
  let imageUrl = props.imageUrl ? props.imageUrl : `/api/user/avatar?uid=${props.uid}`;
  return (
    <ul>
      <li className="toolbar-li item-search">
        <Srch />
      </li>
      <Popover
        overlayClassName="popover-index"
        content={<GuideBtns />}
        title={tipFollow}
        placement="bottomRight"
        arrowPointAtCenter
        open={props.studyTip === 1 && !props.study}
      >
        <Tooltip placement="bottom" title={'我的关注'}>
          <li className="toolbar-li">
            <Link to="/follow">
              <StarOutlined className="dropdown-link" style={{ fontSize: 16 }} />
            </Link>
          </li>
        </Tooltip>
      </Popover>
      <Popover
        overlayClassName="popover-index"
        content={<GuideBtns />}
        title={tipAdd}
        placement="bottomRight"
        arrowPointAtCenter
        open={props.studyTip === 2 && !props.study}
      >
        <Tooltip placement="bottom" title={'新建项目'}>
          <li className="toolbar-li">
            <Link to="/add-project">
              <PlusCircleOutlined className="dropdown-link" style={{ fontSize: 16 }} />
            </Link>
          </li>
        </Tooltip>
      </Popover>
      <Popover
        overlayClassName="popover-index"
        content={<GuideBtns isLast={true} />}
        title={tipDoc}
        placement="bottomRight"
        arrowPointAtCenter
        open={props.studyTip === 3 && !props.study}
      >
        <Tooltip placement="bottom" title={'使用文档'}>
          <li className="toolbar-li">
            <a target="_blank" href="https://hellosean1025.github.io/yapi" rel="noopener noreferrer">
              <QuestionCircleOutlined className="dropdown-link" style={{ fontSize: 16 }} />
            </a>
          </li>
        </Tooltip>
      </Popover>
      <li className="toolbar-li">
        <Dropdown
          placement="bottomRight"
          trigger={['click']}
          menu={{
            theme: 'dark',
            className: 'user-menu',
            items: buildUserMenuItems({
              uid: props.uid,
              role: props.role,
              skin: props.skin,
              onSelectSkin: props.onSelectSkin,
              logout: props.logout
            })
          }}
        >
          <a className="dropdown-link">
            <span className="avatar-image">
              <img src={imageUrl} />
            </span>
            {/*props.imageUrl? <Avatar src={props.imageUrl} />: <Avatar src={`/api/user/avatar?uid=${props.uid}`} />*/}
            <span className="name">
              <DownOutlined />
            </span>
          </a>
        </Dropdown>
      </li>
    </ul>
  );
};
ToolUser.propTypes = {
  user: PropTypes.string,
  role: PropTypes.string,
  uid: PropTypes.number,
  skin: PropTypes.string,
  onSelectSkin: PropTypes.func,
  relieveLink: PropTypes.func,
  logout: PropTypes.func,
  studyTip: PropTypes.number,
  study: PropTypes.bool,
  imageUrl: PropTypes.any
};

export default function HeaderCom() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const changeMenuItem = useMenuStore(state => state.changeMenuItem);
  const user = useSelector(state => state.user.userName);
  const uid = useSelector(state => state.user.uid);
  const role = useSelector(state => state.user.role);
  const login = useSelector(state => state.user.isLogin);
  const studyTip = useSelector(state => state.user.studyTip);
  const study = useSelector(state => state.user.study);
  const imageUrl = useSelector(state => state.user.imageUrl);
  const [skin, setSkinState] = useState(getSkin());

  /**
   * @param {string} name
   */
  function selectSkin(name) {
    if (setSkin(name)) {
      setSkinState(getSkin());
    }
  }

  function relieveLink() {
    changeMenuItem('');
  }

  /**
   * @param {any} e
   */
  function logout(e) {
    e.preventDefault();
    dispatch(logoutActions())
      .then((/** @type {any} */ res) => {
        if (res.payload.data.errcode == 0) {
          navigate('/');
          changeMenuItem('/');
          message.success('退出成功! ');
        } else {
          message.error(res.payload.data.errmsg);
        }
      })
      .catch((/** @type {any} */ err) => {
        message.error(err);
      });
  }

  return (
    <Header className="header-box m-header">
      <div className="content g-row">
        <Link onClick={relieveLink} to="/group" className="logo">
          <div className="href">
            <span className="img">
              <LogoSVG length="32px" />
            </span>
          </div>
        </Link>
        <Breadcrumb />
        <div
          className="user-toolbar"
          style={{ position: 'relative', zIndex: studyTip > 0 ? 3 : 1 }}
        >
          {login ? (
            <ToolUser
              {...{ studyTip, study, user, uid, role, imageUrl }}
              skin={skin}
              onSelectSkin={selectSkin}
              relieveLink={relieveLink}
              logout={logout}
            />
          ) : (
            ''
          )}
        </div>
      </div>
    </Header>
  );
}

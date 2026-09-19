// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { EditOutlined } from '@ant-design/icons';
import { Row, Col, Input, Button, Select, message, Upload, Tooltip } from 'antd';
import axios from 'axios';
import { formatTime } from '../../common.js';
import PropTypes from 'prop-types';
import { setBreadcrumb, setImageUrl } from '../../reducer/modules/user';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';

/**
 * @param {any} props
 */
const EditButton = props => {
  const { isAdmin, isOwner, onClick, name, admin } = props;
  if (isOwner) {
    // 本人
    if (admin) {
      return null;
    }
    return (
      <Button
        icon={<EditOutlined />}
        onClick={() => {
          onClick(name, true);
        }}
      >
        修改
      </Button>
    );
  } else if (isAdmin) {
    // 管理员
    return (
      <Button
        icon={<EditOutlined />}
        onClick={() => {
          onClick(name, true);
        }}
      >
        修改
      </Button>
    );
  } else {
    return null;
  }
};
EditButton.propTypes = {
  isAdmin: PropTypes.bool,
  isOwner: PropTypes.bool,
  onClick: PropTypes.func,
  name: PropTypes.string,
  admin: PropTypes.bool
};

/**
 * 用户资料页。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 的 curUid/userType/curRole 映射改为 useSelector；
 * - 旧 withRouter 注入的 match.params.uid 改为 useParams；
 * - 旧 componentDidMount / UNSAFE_componentWillReceiveProps 的 uid 变更拉取逻辑改为
 *   挂载期 + uid 变化期两个 useEffect（挂载不判空、更新期空 uid 跳过的旧行为保持一致）；
 * - 旧类 state 拆分为独立 useState（四个编辑态开关 + userinfo/_userinfo 两块数据，
 *   _userinfo 旧实现无初始值，保持为 undefined）。
 */
const Profile = () => {
  const dispatch = useDispatch();
  // 旧 withRouter 注入的 match.params.uid 改为 v6 useParams
  const { uid } = useParams();
  const curUid = useSelector(state => state.user.uid);
  const userType = useSelector(state => state.user.type);
  const curRole = useSelector(state => state.user.role);
  const [usernameEdit, setUsernameEdit] = useState(false);
  const [emailEdit, setEmailEdit] = useState(false);
  const [secureEdit, setSecureEdit] = useState(false);
  const [roleEdit, setRoleEdit] = useState(false);
  const [userinfo, setUserinfo] = useState(/** @type {any} */ ({}));
  const [_userinfo, set_userinfo] = useState(/** @type {any} */ (undefined));

  /**
   * @param {string} key
   * @param {any} val
   */
  const handleEdit = (key, val) => {
    /** @type {Record<string, any>} */
    const setters = {
      usernameEdit: setUsernameEdit,
      emailEdit: setEmailEdit,
      secureEdit: setSecureEdit,
      roleEdit: setRoleEdit
    };
    setters[key](val);
  };

  /**
   * @param {any} id
   */
  const getUserInfo = id => {
    axios.get('/api/user/find?id=' + id).then((/** @type {any} */ res) => {
      setUserinfo(res.data.data);
      set_userinfo(res.data.data);
      if (curUid === +id) {
        dispatch(setBreadcrumb([{ name: res.data.data.username }]));
      } else {
        dispatch(setBreadcrumb([{ name: '管理: ' + res.data.data.username }]));
      }
    });
  };

  // 旧 componentDidMount：记录初始 uid 并拉取（不判空，与旧行为一致）
  const uidRef = useRef();
  useEffect(() => {
    uidRef.current = uid;
    getUserInfo(uid);
  }, []);
  // 旧 UNSAFE_componentWillReceiveProps：空 uid 跳过，uid 变化时重新拉取
  useEffect(() => {
    if (!uid) {
      return;
    }
    if (uidRef.current !== uid) {
      uidRef.current = uid;
      getUserInfo(uid);
    }
  }, [uid]);

  /**
   * @param {any} name
   */
  const updateUserinfo = name => {
    let value = _userinfo[name];
    const params = /** @type {Record<string, any>} */ ({ uid: userinfo.uid });
    params[name] = value;

    axios.post('/api/user/update', params).then(
      (/** @type {any} */ res) => {
        let data = res.data;
        if (data.errcode === 0) {
          // 与旧实现一致：就地修改 userinfo 后同引用 setState，最终由随后的
          // 编辑态切换触发重渲染读取新值
          userinfo[name] = value;
          setUserinfo(userinfo);

          handleEdit(name + 'Edit', false);
          message.success('更新用户信息成功');
        } else {
          message.error(data.errmsg);
        }
      },
      (/** @type {any} */ err) => {
        message.error(err.message);
      }
    );
  };

  /**
   * @param {any} e
   */
  const changeUserinfo = e => {
    let dom = e.target;
    let name = dom.getAttribute('name');
    let value = dom.value;

    set_userinfo({
      ..._userinfo,
      [name]: value
    });
  };

  /**
   * @param {any} val
   */
  const changeRole = val => {
    userinfo.role = val;
    // 与旧实现一致：将 userinfo 同一引用写入 _userinfo
    set_userinfo(userinfo);
    updateUserinfo('role');
  };

  const updatePassword = () => {
    let old_password = (/** @type {any} */ (document.getElementById('old_password'))).value;
    let password = (/** @type {any} */ (document.getElementById('password'))).value;
    let verify_pass = (/** @type {any} */ (document.getElementById('verify_pass'))).value;
    if (password != verify_pass) {
      return message.error('两次输入的密码不一样');
    }
    let params = {
      uid: userinfo.uid,
      password: password,
      old_password: old_password
    };

    axios.post('/api/user/change_password', params).then(
      (/** @type {any} */ res) => {
        let data = res.data;
        if (data.errcode === 0) {
          handleEdit('secureEdit', false);
          message.success('修改密码成功');
          if (curUid === userinfo.uid) {
            location.reload();
          }
        } else {
          message.error(data.errmsg);
        }
      },
      (/** @type {any} */ err) => {
        message.error(err.message);
      }
    );
  };

  let ButtonGroup = Button.Group;
  let userNameEditHtml, emailEditHtml, secureEditHtml, roleEditHtml;
  const Option = Select.Option;
  /** @type {Record<string, string>} */
  let roles = { admin: '管理员', member: '会员' };
  /** @type {any} */
  let siteLogin = '';
  if (userType === 'third') {
    siteLogin = false;
  } else if (userType === 'site') {
    siteLogin = true;
  } else {
    siteLogin = false;
  }

  // 用户名信息修改
  if (usernameEdit === false) {
    userNameEditHtml = (
      <div>
        <span className="text">{userinfo.username}</span>&nbsp;&nbsp;
        {/*<span className="text-button"  onClick={() => { handleEdit('usernameEdit', true) }}>修改</span>*/}
        {/* {btn} */}
        {/* 站点登陆才能编辑 */}
        {siteLogin && (
          <EditButton
            userType={siteLogin}
            isOwner={userinfo.uid === curUid}
            isAdmin={curRole === 'admin'}
            onClick={handleEdit}
            name="usernameEdit"
          />
        )}
      </div>
    );
  } else {
    userNameEditHtml = (
      <div>
        <Input
          value={_userinfo.username}
          name="username"
          onChange={changeUserinfo}
          placeholder="用户名"
        />
        <ButtonGroup className="edit-buttons">
          <Button
            className="edit-button"
            onClick={() => {
              handleEdit('usernameEdit', false);
            }}
          >
            取消
          </Button>
          <Button
            className="edit-button"
            onClick={() => {
              updateUserinfo('username');
            }}
            type="primary"
          >
            确定
          </Button>
        </ButtonGroup>
      </div>
    );
  }
  // 邮箱信息修改
  if (emailEdit === false) {
    emailEditHtml = (
      <div>
        <span className="text">{userinfo.email}</span>&nbsp;&nbsp;
        {/*<span className="text-button" onClick={() => { handleEdit('emailEdit', true) }} >修改</span>*/}
        {/* {btn} */}
        {/* 站点登陆才能编辑 */}
        {siteLogin && (
          <EditButton
            admin={userinfo.role === 'admin'}
            isOwner={userinfo.uid === curUid}
            isAdmin={curRole === 'admin'}
            onClick={handleEdit}
            name="emailEdit"
          />
        )}
      </div>
    );
  } else {
    emailEditHtml = (
      <div>
        <Input
          placeholder="Email"
          value={_userinfo.email}
          name="email"
          onChange={changeUserinfo}
        />
        <ButtonGroup className="edit-buttons">
          <Button
            className="edit-button"
            onClick={() => {
              handleEdit('emailEdit', false);
            }}
          >
            取消
          </Button>
          <Button
            className="edit-button"
            type="primary"
            onClick={() => {
              updateUserinfo('email');
            }}
          >
            确定
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  if (roleEdit === false) {
    roleEditHtml = (
      <div>
        <span className="text">{roles[userinfo.role]}</span>&nbsp;&nbsp;
      </div>
    );
  } else {
    roleEditHtml = (
      <Select defaultValue={_userinfo.role} onChange={changeRole} style={{ width: 150 }}>
        <Option value="admin">管理员</Option>
        <Option value="member">会员</Option>
      </Select>
    );
  }

  if (secureEdit === false) {
    /** @type {any} */
    let btn = '';
    if (siteLogin) {
      btn = (
        <Button
          icon={<EditOutlined />}
          onClick={() => {
            handleEdit('secureEdit', true);
          }}
        >
          修改
        </Button>
      );
    }
    secureEditHtml = btn;
  } else {
    secureEditHtml = (
      <div>
        <Input
          style={{
            display: curRole === 'admin' && userinfo.role != 'admin' ? 'none' : ''
          }}
          placeholder="旧的密码"
          type="password"
          name="old_password"
          id="old_password"
        />
        <Input placeholder="新的密码" type="password" name="password" id="password" />
        <Input placeholder="确认密码" type="password" name="verify_pass" id="verify_pass" />
        <ButtonGroup className="edit-buttons">
          <Button
            className="edit-button"
            onClick={() => {
              handleEdit('secureEdit', false);
            }}
          >
            取消
          </Button>
          <Button className="edit-button" onClick={updatePassword} type="primary">
            确定
          </Button>
        </ButtonGroup>
      </div>
    );
  }
  return (
    <div className="user-profile">
      <div className="user-item-body">
        {userinfo.uid === curUid ? (
          <h3>个人设置</h3>
        ) : (
          <h3>{userinfo.username} 资料设置</h3>
        )}

        <Row className="avatarCon" type="flex" justify="start">
          <Col span={24}>
            {userinfo.uid === curUid ? (
              <AvatarUpload uid={userinfo.uid}>点击上传头像</AvatarUpload>
            ) : (
              <div className="avatarImg">
                <img src={`/api/user/avatar?uid=${userinfo.uid}`} />
              </div>
            )}
          </Col>
        </Row>
        <Row className="user-item" type="flex" justify="start">
          <div className="maoboli" />
          <Col span={6}>用户id</Col>
          <Col span={18}>{userinfo.uid}</Col>
        </Row>
        <Row className="user-item" type="flex" justify="start">
          <div className="maoboli" />
          <Col span={6}>用户名</Col>
          <Col span={18}>{userNameEditHtml}</Col>
        </Row>
        <Row className="user-item" type="flex" justify="start">
          <div className="maoboli" />
          <Col span={6}>Email</Col>
          <Col span={18}>{emailEditHtml}</Col>
        </Row>
        <Row
          className="user-item"
          style={{ display: curRole === 'admin' ? '' : 'none' }}
          type="flex"
          justify="start"
        >
          <div className="maoboli" />
          <Col span={6}>角色</Col>
          <Col span={18}>{roleEditHtml}</Col>
        </Row>
        <Row
          className="user-item"
          style={{ display: curRole === 'admin' ? '' : 'none' }}
          type="flex"
          justify="start"
        >
          <div className="maoboli" />
          <Col span={6}>登陆方式</Col>
          <Col span={18}>{userinfo.type === 'site' ? '站点登陆' : '第三方登陆'}</Col>
        </Row>
        <Row className="user-item" type="flex" justify="start">
          <div className="maoboli" />
          <Col span={6}>创建账号时间</Col>
          <Col span={18}>{formatTime(userinfo.add_time)}</Col>
        </Row>
        <Row className="user-item" type="flex" justify="start">
          <div className="maoboli" />
          <Col span={6}>更新账号时间</Col>
          <Col span={18}>{formatTime(userinfo.up_time)}</Col>
        </Row>

        {siteLogin ? (
          <Row className="user-item" type="flex" justify="start">
            <div className="maoboli" />
            <Col span={6}>密码</Col>
            <Col span={18}>{secureEditHtml}</Col>
          </Row>
        ) : (
          ''
        )}
      </div>
    </div>
  );
};

/**
 * 头像上传。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 的 url 映射改为 useSelector，setImageUrl 改为 useDispatch；
 * - 旧 handleChange 的 this 绑定随函数组件一并移除。
 */
/**
 * @param {{ uid: any }} props
 */
const AvatarUpload = ({ uid }) => {
  const dispatch = useDispatch();
  const url = useSelector(state => state.user.imageUrl);
  let imageUrl = url ? url : `/api/user/avatar?uid=${uid}`;

  /**
   * @param {any} basecode
   */
  const uploadAvatar = basecode => {
    axios
      .post('/api/user/upload_avatar', { basecode: basecode })
      .then(() => {
        dispatch(setImageUrl(basecode));
      })
      .catch((/** @type {any} */ e) => {
        console.log(e);
      });
  };

  /**
   * @param {any} info
   */
  const handleChange = info => {
    if (info.file.status === 'done') {
      // Get this url from response in real world.
      getBase64(info.file.originFileObj, (/** @type {any} */ basecode) => {
        uploadAvatar(basecode);
      });
    }
  };

  return (
    <div className="avatar-box">
      <Tooltip
        placement="right"
        title={<div>点击头像更换 (只支持jpg、png格式且大小不超过200kb的图片)</div>}
      >
        <div>
          <Upload
            className="avatar-uploader"
            name="basecode"
            showUploadList={false}
            action="/api/user/upload_avatar"
            beforeUpload={beforeUpload}
            onChange={handleChange}
          >
            {/*<Avatar size="large" src={imageUrl}  />*/}
            <div style={{ width: 100, height: 100 }}>
              <img className="avatar" src={imageUrl} />
            </div>
          </Upload>
        </div>
      </Tooltip>
      <span className="avatarChange" />
    </div>
  );
};
AvatarUpload.propTypes = {
  uid: PropTypes.number
};

/**
 * @param {any} file
 */
function beforeUpload(file) {
  const isJPG = file.type === 'image/jpeg';
  const isPNG = file.type === 'image/png';
  if (!isJPG && !isPNG) {
    message.error('图片的格式只能为 jpg、png！');
  }
  const isLt2M = file.size / 1024 / 1024 < 0.2;
  if (!isLt2M) {
    message.error('图片必须小于 200kb!');
  }

  return (isPNG || isJPG) && isLt2M;
}

/**
 * @param {any} img
 * @param {any} callback
 */
function getBase64(img, callback) {
  const reader = new FileReader();
  reader.addEventListener('load', () => callback(reader.result));
  reader.readAsDataURL(img);
}

export default Profile;

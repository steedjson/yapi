import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './index.scss';
import { Layout, Tooltip, message, Row, Popconfirm } from 'antd';
import { DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
const { Content, Sider } = Layout;
import ProjectEnvContent from './ProjectEnvContent.js';
import { useDispatch, useSelector } from 'react-redux';
import { updateEnv, getProject, getEnv } from '../../../../reducer/modules/project';
import EasyDragSort from '../../../../components/EasyDragSort/EasyDragSort.js';

/**
 * 环境配置面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch；
 * - 类 state 整体迁移为单个 useState 对象，setState 局部合并语义经
 *   setState(prev => ({ ...prev, ...patch })) 等价保留；
 * - 旧 async UNSAFE_componentWillMount（拉取项目 → 读取最新 projectMsg → 回填 env
 *   并选中第一项）改为挂载期 useEffect + projectMsg ref 镜像（await 恢复后的 redux
 *   读取等价于旧类组件的实时 this.props 语义）；
 * - 旧 _isMounted 标记（componentWillUnmount 置否，onSave 恢复后守卫 setState）
 *   改为 isMountedRef + useEffect cleanup 等价实现。
 */
const ProjectEnv = props => {
  const { projectId, onOk } = props;
  const dispatch = useDispatch();
  const projectMsg = useSelector(state => state.project.currProject);

  const [state, setState] = useState({
    env: [],
    _id: null,
    currentEnvMsg: {},
    delIcon: null,
    currentKey: -2
  });

  // 镜像最新 redux 值：挂载期 await getProject 恢复后的读取等价于旧 this.props.projectMsg
  const projectMsgRef = useRef(projectMsg);
  projectMsgRef.current = projectMsg;

  // 旧 _isMounted：componentWillUnmount 后不再回写本地 state
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleClick = (key, data) => {
    setState(prevState => ({
      ...prevState,
      currentEnvMsg: data,
      currentKey: key
    }));
  };

  // 增加环境变量项
  const addParams = name => {
    let data = { name: '新环境', domain: '', header: [] };
    setState(prevState => ({
      ...prevState,
      [name]: [].concat(data, prevState[name])
    }));
    handleClick(0, data);
  };

  // 删除提示信息
  const showConfirm = (key, name) => {
    let assignValue = delParams(key, name);
    onSave(assignValue);
  };

  // 删除环境变量项
  const delParams = (key, name) => {
    let curValue = state.env;
    let newValue = {};
    newValue[name] = curValue.filter((val, index) => {
      return index !== key;
    });
    setState(prevState => ({
      ...prevState,
      ...newValue
    }));
    handleClick(0, newValue[name][0]);
    newValue['_id'] = state._id;
    return newValue;
  };

  const enterItem = key => {
    setState(prevState => ({ ...prevState, delIcon: key }));
  };

  // 保存设置
  async function onSave(assignValue) {
    await dispatch(updateEnv(assignValue))
      .then(res => {
        if (res.payload.data.errcode == 0) {
          dispatch(getProject(projectId));
          dispatch(getEnv(projectId));
          message.success('修改成功! ');
          if (isMountedRef.current) {
            setState(prevState => ({ ...prevState, ...assignValue }));
          }
        }
      })
      .catch(() => {
        message.error('环境设置不成功 ');
      });
  }

  //  提交保存信息
  const onSubmit = (value, index) => {
    let assignValue = {};
    assignValue['env'] = [].concat(state.env);
    assignValue['env'].splice(index, 1, value['env']);
    assignValue['_id'] = state._id;
    onSave(assignValue);
    onOk && onOk(assignValue['env'], index);
  };

  // 动态修改环境名称
  const handleInputChange = (value, currentKey) => {
    let newValue = [].concat(state.env);
    newValue[currentKey].name = value || '新环境';
    setState(prevState => ({ ...prevState, env: newValue }));
  };

  // 侧边栏拖拽
  const handleDragMove = name => {
    return (data, from, to) => {
      let newValue = {
        [name]: data
      };
      setState(prevState => ({
        ...prevState,
        ...newValue
      }));
      newValue['_id'] = state._id;
      handleClick(to, newValue[name][to]);
      onSave(newValue);
    };
  };

  // 旧 async UNSAFE_componentWillMount：拉取项目后回填 env 列表并选中第一项
  useEffect(() => {
    (async () => {
      await dispatch(getProject(projectId));
      const { env, _id } = projectMsgRef.current;
      setState(prevState => ({
        ...prevState,
        env: [].concat(env),
        _id
      }));
      handleClick(0, env[0]);
    })();
  }, []);

  const { env, currentKey } = state;

  const envSettingItems = env.map((item, index) => {
    return (
      <Row
        key={index}
        className={'menu-item ' + (index === currentKey ? 'menu-item-checked' : '')}
        onClick={() => handleClick(index, item)}
        onMouseEnter={() => enterItem(index)}
      >
        <span className="env-icon-style">
          <span className="env-name" style={{ color: item.name === '新环境' && '#2395f1' }}>
            {item.name}
          </span>
          <Popconfirm
            title="您确认删除此环境变量?"
            onConfirm={e => {
              e.stopPropagation();
              showConfirm(index, 'env');
            }}
            okText="确定"
            cancelText="取消"
          >
            <DeleteOutlined
              className="interface-delete-icon"
              style={{
                display: state.delIcon == index && env.length - 1 !== 0 ? 'block' : 'none'
              }}
            />
          </Popconfirm>
        </span>
      </Row>
    );
  });

  return (
    <div className="m-env-panel">
      <Layout className="project-env">
        <Sider width={195} style={{ background: 'var(--sk-bg-component)' }}>
          <div style={{ height: '100%', borderRight: 0 }}>
            <Row className="first-menu-item menu-item">
              <div className="env-icon-style">
                <h3>
                  环境列表&nbsp;<Tooltip placement="top" title="在这里添加项目的环境配置">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </h3>
                <Tooltip title="添加环境变量">
                  <PlusOutlined onClick={() => addParams('env')} />
                </Tooltip>
              </div>
            </Row>
            <EasyDragSort data={() => env} onChange={handleDragMove('env')}>
              {envSettingItems}
            </EasyDragSort>
          </div>
        </Sider>
        <Layout className="env-content">
          <Content style={{ background: 'var(--sk-bg-component)', padding: 24, margin: 0, minHeight: 280 }}>
            <ProjectEnvContent
              projectMsg={state.currentEnvMsg}
              onSubmit={e => onSubmit(e, currentKey)}
              handleEnvInput={e => handleInputChange(e, currentKey)}
            />
          </Content>
        </Layout>
      </Layout>
    </div>
  );
};

ProjectEnv.propTypes = {
  projectId: PropTypes.number,
  onOk: PropTypes.func
};

export default ProjectEnv;

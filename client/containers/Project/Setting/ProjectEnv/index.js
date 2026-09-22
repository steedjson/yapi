// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './index.scss';
import { Layout, Tooltip, message, Row, Popconfirm } from 'antd';
import { DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
const { Content, Sider } = Layout;
import ProjectEnvContent from './ProjectEnvContent.js';
// project 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useProjectStore from '../../../../store/projectStore';
import EasyDragSort from '../../../../components/EasyDragSort/EasyDragSort.js';

/**
 * 环境配置面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 Zustand store 订阅（批次4）；
 * - 类 state 整体迁移为单个 useState 对象，setState 局部合并语义经
 *   setState(prev => ({ ...prev, ...patch })) 等价保留；
 * - 旧 async UNSAFE_componentWillMount（拉取项目 → 读取最新 projectMsg → 回填 env
 *   并选中第一项）改为挂载期 useEffect + projectMsg ref 镜像（await 恢复后的 redux
 *   读取等价于旧类组件的实时 this.props 语义）；
 * - 旧 _isMounted 标记（componentWillUnmount 置否，onSave 恢复后守卫 setState）
 *   改为 isMountedRef + useEffect cleanup 等价实现。
 */
/**
 * @param {any} props
 */
const ProjectEnv = props => {
  const { projectId, onOk } = props;
  const projectMsg = useProjectStore(state => state.currProject);
  const updateEnv = useProjectStore(state => state.updateEnv);
  const getProject = useProjectStore(state => state.getProject);
  const getEnv = useProjectStore(state => state.getEnv);

  const [state, setState] = useState(/** @type {any} */ ({
    env: [],
    _id: null,
    currentEnvMsg: {},
    delIcon: null,
    currentKey: -2
  }));

  // 镜像最新 store 值：挂载期 await getProject 恢复后的读取等价于旧 this.props.projectMsg
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

  /**
   * @param {any} key
   * @param {any} data
   */
  const handleClick = (key, data) => {
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      currentEnvMsg: data,
      currentKey: key
    }));
  };

  // 增加环境变量项
  /**
   * @param {any} name
   */
  const addParams = name => {
    let data = { name: '新环境', domain: '', header: [] };
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      [name]: (/** @type {any[]} */ ([])).concat(data, prevState[name])
    }));
    handleClick(0, data);
  };

  // 删除提示信息
  /**
   * @param {any} key
   * @param {any} name
   */
  const showConfirm = (key, name) => {
    let assignValue = delParams(key, name);
    onSave(assignValue);
  };

  // 删除环境变量项
  /**
   * @param {any} key
   * @param {any} name
   */
  const delParams = (key, name) => {
    let curValue = state.env;
    let newValue = /** @type {any} */ ({});
    newValue[name] = curValue.filter((/** @type {any} */ val, /** @type {number} */ index) => {
      return index !== key;
    });
    setState((/** @type {any} */ prevState) => ({
      ...prevState,
      ...newValue
    }));
    handleClick(0, newValue[name][0]);
    newValue['_id'] = state._id;
    return newValue;
  };

  /**
   * @param {any} key
   */
  const enterItem = key => {
    setState((/** @type {any} */ prevState) => ({ ...prevState, delIcon: key }));
  };

  // 保存设置
  /**
   * @param {any} assignValue
   */
  async function onSave(assignValue) {
    await updateEnv(assignValue)
      .then((/** @type {any} */ res) => {
        if (res && res.data.errcode == 0) {
          getProject(projectId);
          getEnv(projectId);
          message.success('修改成功! ');
          if (isMountedRef.current) {
            setState((/** @type {any} */ prevState) => ({ ...prevState, ...assignValue }));
          }
        }
      })
      .catch(() => {
        message.error('环境设置不成功 ');
      });
  }

  //  提交保存信息
  /**
   * @param {any} value
   * @param {any} index
   */
  const onSubmit = (value, index) => {
    let assignValue = /** @type {any} */ ({});
    assignValue['env'] = [].concat(state.env);
    assignValue['env'].splice(index, 1, value['env']);
    assignValue['_id'] = state._id;
    onSave(assignValue);
    onOk && onOk(assignValue['env'], index);
  };

  // 动态修改环境名称
  /**
   * @param {any} value
   * @param {any} currentKey
   */
  const handleInputChange = (value, currentKey) => {
    let newValue = (/** @type {any[]} */ ([])).concat(state.env);
    newValue[currentKey].name = value || '新环境';
    setState((/** @type {any} */ prevState) => ({ ...prevState, env: newValue }));
  };

  // 侧边栏拖拽
  /**
   * @param {any} name
   */
  const handleDragMove = name => {
    return (/** @type {any} */ data, /** @type {any} */ from, /** @type {any} */ to) => {
      let newValue = /** @type {any} */ ({
        [name]: data
      });
      setState((/** @type {any} */ prevState) => ({
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
      await getProject(projectId);
      const { env, _id } = projectMsgRef.current;
      setState((/** @type {any} */ prevState) => ({
        ...prevState,
        env: [].concat(env),
        _id
      }));
      handleClick(0, env[0]);
    })();
  }, []);

  const { env, currentKey } = state;

  const envSettingItems = env.map((/** @type {any} */ item, /** @type {number} */ index) => {
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
            onConfirm={(/** @type {any} */ e) => {
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
              onSubmit={(/** @type {any} */ e) => onSubmit(e, currentKey)}
              handleEnvInput={(/** @type {any} */ e) => handleInputChange(e, currentKey)}
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

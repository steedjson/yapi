// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Collapse, Row, Col, Input, message, Button } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { fetchInterfaceColList } from '../../../../../reducer/modules/interfaceCol';

const { TextArea } = Input;

/**
 * 添加到集合弹窗。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch，旧 @withRouter 注入的
 *   match.params.id 改为 useParams；
 * - 类 state 迁移为单个 useState 对象（旧 state.visible 仅初始化从未读写，
 *   属死状态，随迁移移除）；caseName 以 props 初值（等价旧 cWM 首帧前赋值）；
 * - 旧 UNSAFE_componentWillMount 拉取集合列表改为挂载期 useEffect；
 * - 旧 UNSAFE_componentWillReceiveProps（任意外部 props 变化即回填列表首项
 *   与 props.caseName；旧 withRouter 注入的 match 每次父渲染都是新引用，故
 *   任意父渲染均触发）改为每次渲染后运行的 useEffect + 浅比较 prev ref。
 * - 唯一行为偏差：父组件 Run 旧实现传 open={...} 而本组件读 props.visible，prop 名错位
 *   导致弹窗在旧版永远无法打开；Run 侧迁移改为 visible={...} 修复该缺陷。
 */
/**
 * @param {any} props
 */
const AddColModal = props => {
  const { visible, caseName, onOk, onCancel } = props;
  const interfaceColList = useSelector(state => state.interfaceCol.interfaceColList);
  const dispatch = useDispatch();
  const { id: projectId } = /** @type {any} */ (useParams());

  const [state, setState] = useState(/** @type {any} */ ({
    addColName: '',
    addColDesc: '',
    id: 0,
    caseName: caseName
  }));
  /**
   * @param {any} patch
   */
  const patchState = patch =>
    setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 对应旧 UNSAFE_componentWillMount：拉取项目集合列表
  useEffect(() => {
    dispatch(fetchInterfaceColList(projectId));
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps
  const prevPropsRef = useRef(null);
  useEffect(() => {
    const prev = prevPropsRef.current;
    prevPropsRef.current = { visible, caseName, onOk, onCancel, interfaceColList };
    if (!prev) return; // 挂载期对应旧 cWM，cWRP 不执行
    if (
      prev.visible !== visible ||
      prev.caseName !== caseName ||
      prev.onOk !== onOk ||
      prev.onCancel !== onCancel ||
      prev.interfaceColList !== interfaceColList
    ) {
      patchState({ id: interfaceColList[0]._id, caseName });
    }
  });

  const addCol = async () => {
    const { addColName: name, addColDesc: desc } = state;
    const res = await axios.post('/api/col/add_col', { name, desc, project_id: projectId });
    if (!res.data.errcode) {
      message.success('添加集合成功');
      await dispatch(fetchInterfaceColList(projectId));

      patchState({ id: res.data.data._id });
    } else {
      message.error(res.data.errmsg);
    }
  };

  /**
   * @param {any} colId
   */
  const select = colId => {
    patchState({ id: colId });
  };

  const { id } = state;
  return (
    <Modal
      className="add-col-modal"
      title="添加到集合"
      open={visible}
      onOk={() => onOk(id, state.caseName)}
      onCancel={onCancel}
    >
      <Row gutter={6} className="modal-input">
        <Col span="5">
          <div className="label">接口用例名：</div>
        </Col>
        <Col span="15">
          <Input
            placeholder="请输入接口用例名称"
            value={state.caseName}
            onChange={(/** @type {any} */ e) => patchState({ caseName: e.target.value })}
          />
        </Col>
      </Row>
      <p>请选择添加到的集合：</p>
      <ul className="col-list">
        {interfaceColList.length ? (
          interfaceColList.map((/** @type {any} */ col) => (
            <li
              key={col._id}
              className={`col-item ${col._id === id ? 'selected' : ''}`}
              onClick={() => select(col._id)}
            >
              <FolderOpenOutlined style={{ marginRight: 6 }} />
              {col.name}
            </li>
          ))
        ) : (
          <span>暂无集合，请添加！</span>
        )}
      </ul>
      <Collapse
        items={[
          {
            key: '0',
            label: '添加新集合',
            children: (
              <>
                <Row gutter={6} className="modal-input">
                  <Col span="5">
                    <div className="label">集合名：</div>
                  </Col>
                  <Col span="15">
                    <Input
                      placeholder="请输入集合名称"
                      value={state.addColName}
                      onChange={(/** @type {any} */ e) => patchState({ addColName: e.target.value })}
                    />
                  </Col>
                </Row>
                <Row gutter={6} className="modal-input">
                  <Col span="5">
                    <div className="label">简介：</div>
                  </Col>
                  <Col span="15">
                    <TextArea
                      rows={3}
                      placeholder="请输入集合描述"
                      value={state.addColDesc}
                      onChange={(/** @type {any} */ e) => patchState({ addColDesc: e.target.value })}
                    />
                  </Col>
                </Row>
                <Row type="flex" justify="end">
                  <Button style={{ float: 'right' }} type="primary" onClick={addCol}>
                    添 加
                  </Button>
                </Row>
              </>
            )
          }
        ]}
      />
    </Modal>
  );
};

AddColModal.propTypes = {
  visible: PropTypes.bool,
  onOk: PropTypes.func,
  onCancel: PropTypes.func,
  caseName: PropTypes.string
};

export default AddColModal;

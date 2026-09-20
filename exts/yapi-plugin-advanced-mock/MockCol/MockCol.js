// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Table, Button, message, Popconfirm, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { fetchMockCol } from 'client/reducer/modules/mockCol';
import { formatTime } from 'client/common.js';
import constants from 'client/constants/variable.js';
import CaseDesModal from './CaseDesModal';
import { json5_parse } from '../../../client/common';

/**
 * 接口高级 Mock 期望用例列表面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch，旧 @withRouter 注入的
 *   match.params（actionId / id）改为 useParams；
 * - 旧 constructor state 改为 useState（单对象 patch，保持浅合并语义），
 *   旧 UNSAFE_componentWillMount 改为挂载期 useEffect；
 * - 异步回调对 this.props / this.state 的实时读取改为 latestRef 镜像读取；
 * - 历史遗留：旧代码向 CaseDesModal 传入未定义的 ref（this.saveFormRef 未定义、
 *   组件亦未消费），迁移保持等价——不补 ref 定义，亦不新增该 ref 的消费。
 */
const MockCol = () => {
  const dispatch = useDispatch();
  const list = useSelector((/** @type {any} */ state) => state.mockCol.list);
  const currInterface = useSelector((/** @type {any} */ state) => state.inter.curdata);
  const currProject = useSelector((/** @type {any} */ state) => state.project.currProject);
  const { id, actionId } = /** @type {any} */ (useParams());

  /** @type {any} */
  const [state, setState] = useState({
    caseData: {},
    caseDesModalVisible: false,
    isAdd: false
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 镜像最新 redux 值、路由参数与本地 state：异步回调中的读取
  // 等价于旧类组件的实时 this.props / this.state
  const latestRef = useRef({});
  latestRef.current = { state, actionId, id, currInterface, currProject };

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    dispatch(fetchMockCol(actionId));
  }, []);

  /**
   * @param {any} record
   * @param {any} [isAdd]
   */
  const openModal = (record, isAdd) => {
    return async () => {
      const currInterfaceLatest = latestRef.current.currInterface;
      if (currInterfaceLatest.res_body_is_json_schema && isAdd) {
        let result = await axios.post('/api/interface/schema2json', {
          schema: json5_parse(currInterfaceLatest.res_body),
          required: true
        });
        record.res_body = JSON.stringify(result.data);
      }
      // 参数过滤schema形式
      if (currInterfaceLatest.req_body_is_json_schema) {
        let result = await axios.post('/api/interface/schema2json', {
          schema: json5_parse(currInterfaceLatest.req_body_other),
          required: true
        });
        record.req_body_other = JSON.stringify(result.data);
      }

      patchState({
        isAdd: isAdd,
        caseDesModalVisible: true,
        caseData: record
      });
    };
  };

  const handleOk = async (/** @type {any} */ caseData) => {
    if (!caseData) {
      return null;
    }
    const { caseData: currcase } = latestRef.current.state;
    const interface_id = latestRef.current.actionId;
    const project_id = latestRef.current.id;
    caseData = Object.assign({
      ...caseData,
      interface_id: interface_id,
      project_id: project_id
    });
    if (!latestRef.current.state.isAdd) {
      caseData.id = currcase._id;
    }
    await axios.post('/api/plugin/advmock/case/save', caseData).then(async (/** @type {any} */ res) => {
      if (res.data.errcode === 0) {
        message.success(latestRef.current.state.isAdd ? '添加成功' : '保存成功');
        await dispatch(fetchMockCol(interface_id));
        patchState({ caseDesModalVisible: false });
      } else {
        message.error(res.data.errmsg);
      }
    });
  };

  const deleteCase = async (/** @type {any} */ id) => {
    const interface_id = latestRef.current.actionId;
    await axios.post('/api/plugin/advmock/case/del', { id }).then(async (/** @type {any} */ res) => {
      if (res.data.errcode === 0) {
        message.success('删除成功');
        await dispatch(fetchMockCol(interface_id));
      } else {
        message.error(res.data.errmsg);
      }
    });
  };

  // mock case 可以设置开启的关闭
  const openMockCase = async (/** @type {any} */ id, /** @type {boolean} */ enable = true) => {
    const interface_id = latestRef.current.actionId;

    await axios.post('/api/plugin/advmock/case/hide', {
      id,
      enable: !enable
    }).then(async (/** @type {any} */ res) => {
      if (res.data.errcode === 0) {
        message.success('修改成功');
        await dispatch(fetchMockCol(interface_id));
      } else {
        message.error(res.data.errmsg);
      }
    })
  };

  const { isAdd, caseData, caseDesModalVisible } = state;

  const role = currProject.role;
  const isGuest = role === 'guest';
  const initCaseData = {
    ip: '',
    ip_enable: false,
    name: currInterface.title,
    code: '200',
    delay: 0,
    headers: [{ name: '', value: '' }],
    params: {},
    res_body: currInterface.res_body
  };

  let ipFilters = [];
  /** @type {Record<string, string>} */
  let ipObj = {};
  let userFilters = [];
  /** @type {Record<string, string>} */
  let userObj = {};
  Array.isArray(list) &&
    list.forEach(/** @param {any} item */ item => {
      ipObj[item.ip_enable ? item.ip : ''] = '';
      userObj[item.username] = '';
    });
  ipFilters = Object.keys(Object.assign(ipObj)).map(value => {
    if (!value) {
      value = '无过滤';
    }
    return { text: value, value };
  });
  userFilters = Object.keys(Object.assign(userObj)).map(value => {
    return { text: value, value };
  });
  const columns = [
    {
      title: '期望名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'ip',
      dataIndex: 'ip',
      key: 'ip',
      render: (/** @type {any} */ text, /** @type {any} */ recode) => {
        if (!recode.ip_enable) {
          text = '';
        }
        return text;
      },
      onFilter: (/** @type {any} */ value, /** @type {any} */ record) =>
        (record.ip === value && record.ip_enable) || (value === '无过滤' && !record.ip_enable),
      filters: ipFilters
    },
    {
      title: '创建人',
      dataIndex: 'username',
      key: 'username',
      onFilter: (/** @type {any} */ value, /** @type {any} */ record) => record.username === value,
      filters: userFilters
    },
    {
      title: '编辑时间',
      dataIndex: 'up_time',
      key: 'up_time',
      render: (/** @type {any} */ text) => formatTime(text)
    },
    {
      title: '操作',
      dataIndex: '_id',
      key: '_id',
      render: (/** @type {any} */ _id, /** @type {any} */ recode) => {
        // console.log(recode)
        return (
          !isGuest && (
            <div>
              <span style={{ marginRight: 5 }}>
                <Button size="small" onClick={openModal(recode)}>
                  编辑
                </Button>
              </span>
              <span style={{ marginRight: 5 }}>
                <Popconfirm
                  title="你确定要删除这条期望?"
                  onConfirm={() => deleteCase(_id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button size="small" onClick={() => {}}>
                    删除
                  </Button>
                </Popconfirm>
              </span>
              <span>
                <Button size="small" onClick={() => openMockCase(_id, recode.case_enable)}>
                  {recode.case_enable ? <span>已开启</span> : <span>未开启</span>}
                </Button>
              </span>
            </div>
          )
        );
      }
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Button type="primary" onClick={openModal(initCaseData, true)} disabled={isGuest}>
          添加期望
        </Button>
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={constants.docHref.adv_mock_case}
          style={{ marginLeft: 8 }}
        >
          <Tooltip title="点击查看文档">
            <QuestionCircleOutlined />
          </Tooltip>
        </a>
      </div>
      <Table columns={columns} dataSource={list} pagination={false} rowKey="_id" />
      {caseDesModalVisible && (
        // 旧实现 ref={this.saveFormRef} 实为 undefined（未消费），等价保持：不传 ref
        <CaseDesModal
          open={caseDesModalVisible}
          isAdd={isAdd}
          caseData={caseData}
          onOk={handleOk}
          onCancel={() => patchState({ caseDesModalVisible: false })}
        />
      )}
    </div>
  );
};

export default MockCol;

// @ts-check
import React, { useRef, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';
// user/project 切片已迁至 Zustand（批次4）；interface 切片已迁至 Zustand（批次5）
import { useParams } from 'react-router-dom';
import useUserStore from '../../../../../store/userStore';
import useProjectStore from '../../../../../store/projectStore';
import useInterfaceStore from '../../../../../store/interfaceStore';
import { Postman } from '../../../../../components';
import AddColModal from './AddColModal';

// import {
// } from '../../../reducer/modules/group.js'

import './Run.scss';

/**
 * 接口运行 Tab。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 store 订阅（interface 切片批次5 迁 Zustand），旧 @withRouter
 *   注入的 match.params.id 改为 useParams；
 * - 实例引用 this.postman 改为 useRef；异步回调 saveCase 经 latestRef 镜像
 *   读取最新 redux 值与路由参数，与旧类组件实时 this.props 语义一致；
 * - 空实现的 UNSAFE_componentWillMount / UNSAFE_componentWillReceiveProps 随迁移移除。
 * - 唯一行为偏差：旧实现传 open={saveCaseModalVisible}，而 AddColModal 读 props.visible，
 *   prop 名错位导致「保存到集合」弹窗在旧版永远无法打开；迁移改为 visible={...} 修复该缺陷。
 */
const Run = () => {
  const currInterface = useInterfaceStore(state => state.curdata);
  const currProject = useProjectStore(state => state.currProject);
  const curUid = useUserStore(state => state.uid);
  const { id } = /** @type {any} */ (useParams());

  const [saveCaseModalVisible, setSaveCaseModalVisible] = useState(false);
  const postmanRef = useRef(null);

  // 镜像最新 redux 值与路由参数：异步回调(saveCase)中的读取等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { currInterface, currProject, curUid, paramsId: id };

  /**
   * @param {any} colId
   * @param {any} caseName
   */
  const saveCase = async (colId, caseName) => {
    const { currInterface: interfaceData, paramsId: project_id } = latestRef.current;
    const {
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other
    } = postmanRef.current.state;

    let params = /** @type {any} */ ({
      interface_id: interfaceData._id,
      casename: caseName,
      col_id: colId,
      project_id,
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other
    });

    if (params.test_res_body && typeof params.test_res_body === 'object') {
      params.test_res_body = JSON.stringify(params.test_res_body, null, '   ');
    }

    const res = await axios.post('/api/col/add_case', params);
    if (res.data.errcode) {
      message.error(res.data.errmsg);
    } else {
      message.success('添加成功');
      setSaveCaseModalVisible(false);
    }
  };

  const data = Object.assign({}, currInterface, {
    env: currProject.env,
    pre_script: currProject.pre_script,
    after_script: currProject.after_script
  });
  data.path = currProject.basepath + currInterface.path;
  return (
    <div>
      <Postman
        data={data}
        id={currProject._id}
        type="inter"
        saveTip="保存到集合"
        save={() => setSaveCaseModalVisible(true)}
        ref={postmanRef}
        interfaceId={currInterface._id}
        projectId={currInterface.project_id}
        curUid={curUid}
      />
      <AddColModal
        visible={saveCaseModalVisible}
        caseName={currInterface.title}
        onCancel={() => setSaveCaseModalVisible(false)}
        onOk={saveCase}
      />
    </div>
  );
};

export default Run;

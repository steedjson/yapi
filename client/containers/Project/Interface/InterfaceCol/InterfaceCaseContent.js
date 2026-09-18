import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { message, Tooltip, Input } from 'antd';
import { getEnv } from '../../../../reducer/modules/project';
import {
  fetchInterfaceColList,
  setColData,
  fetchCaseData
} from '../../../../reducer/modules/interfaceCol';
import { Postman } from '../../../../components';

import './InterfaceCaseContent.scss';

/** 按用例 id 反查所属集合 id */
function getColId(colList, currCaseId) {
  let currColId = 0;
  colList.forEach(col => {
    col.caseList.forEach(caseItem => {
      if (+caseItem._id === +currCaseId) {
        currColId = col._id;
      }
    });
  });
  return currColId;
}

/**
 * 用例详情内容区。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch（currColId/isShowCol 为历史遗留
 *   仅声明未消费，保留订阅避免行为差异），旧 @withRouter 注入的
 *   match.params 改为 useParams；
 * - 旧 async UNSAFE_componentWillMount（拉取集合列表 → 推导用例 id → 拉取用例
 *   数据 → 同步集合状态 → 拉取环境变量 → 回填用例名）改为挂载期 useEffect；
 * - 旧 UNSAFE_componentWillReceiveProps（路由 case id 变化时重拉）改为
 *   actionId 变化 useEffect + prev ref 比较；
 * - await 恢复后对 this.props 的实时读取统一改为 latestRef 镜像读取，语义一致。
 */
const InterfaceCaseContent = () => {
  const dispatch = useDispatch();
  const interfaceColList = useSelector(state => state.interfaceCol.interfaceColList);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.interfaceCol.currColId);
  const currCaseId = useSelector(state => state.interfaceCol.currCaseId);
  const currCase = useSelector(state => state.interfaceCol.currCase);
  // 历史遗留仅声明未消费，保留订阅避免行为差异
  useSelector(state => state.interfaceCol.isShowCol);
  const currProject = useSelector(state => state.project.currProject);
  const projectEnv = useSelector(state => state.project.projectEnv);
  const curUid = useSelector(state => state.user.uid);
  const { id, actionId } = useParams();

  const [state, setState] = useState({
    isEditingCasename: true,
    editCasename: ''
  });
  const patchState = patch => setState(prevState => ({ ...prevState, ...patch }));

  const postmanRef = useRef(null);

  // 镜像最新 redux 值与路由参数：await 恢复后的读取等价于旧类组件的实时 this.props
  const latestRef = useRef({});
  latestRef.current = { id, actionId, currCaseId, currCase, interfaceColList };

  // 对应旧 async UNSAFE_componentWillMount
  useEffect(() => {
    (async () => {
      const result = await dispatch(fetchInterfaceColList(latestRef.current.id));
      const { currCaseId: caseId, actionId: routeActionId } = latestRef.current;
      const nextCaseId =
        +routeActionId || +caseId || result.payload.data.data[0].caseList[0]._id;
      const currColId = getColId(result.payload.data.data, nextCaseId);
      await dispatch(fetchCaseData(nextCaseId));
      dispatch(setColData({ currCaseId: +nextCaseId, currColId, isShowCol: false }));
      // 获取当前case 下的环境变量
      await dispatch(getEnv(latestRef.current.currCase.project_id));
      patchState({ editCasename: latestRef.current.currCase.casename });
    })();
  }, []);

  // 对应旧 UNSAFE_componentWillReceiveProps：路由 case id 变化时重拉用例数据并同步集合状态
  const prevActionIdRef = useRef(actionId);
  useEffect(() => {
    if (prevActionIdRef.current === actionId) return;
    prevActionIdRef.current = actionId;
    (async () => {
      const currColId = getColId(latestRef.current.interfaceColList, actionId);
      await dispatch(fetchCaseData(actionId));
      dispatch(setColData({ currCaseId: +actionId, currColId, isShowCol: false }));
      await dispatch(getEnv(latestRef.current.currCase.project_id));
      patchState({ editCasename: latestRef.current.currCase.casename });
    })();
  }, [actionId]);

  const updateCase = async () => {
    const {
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other,
      test_script,
      enable_script,
      test_res_body,
      test_res_header
    } = postmanRef.current.state;

    const { editCasename: casename } = state;
    const { _id: caseRecordId } = latestRef.current.currCase;
    let params = {
      id: caseRecordId,
      casename,
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other,
      test_script,
      enable_script,
      test_res_body,
      test_res_header
    };

    const res = await axios.post('/api/col/up_case', params);
    if (latestRef.current.currCase.casename !== casename) {
      dispatch(fetchInterfaceColList(latestRef.current.id));
    }
    if (res.data.errcode) {
      message.error(res.data.errmsg);
    } else {
      message.success('更新成功');
      dispatch(fetchCaseData(caseRecordId));
    }
  };

  const triggerEditCasename = () => {
    patchState({
      isEditingCasename: true,
      editCasename: currCase.casename
    });
  };

  const { isEditingCasename, editCasename } = state;

  const data = Object.assign(
    {},
    currCase,
    {
      env: projectEnv.env,
      pre_script: currProject.pre_script,
      after_script: currProject.after_script
    },
    { _id: currCase._id }
  );

  return (
    <div style={{ padding: '6px 0' }} className="case-content">
      <div className="case-title">
        {!isEditingCasename && (
          <Tooltip title="点击编辑" placement="bottom">
            <div className="case-name" onClick={triggerEditCasename}>
              {currCase.casename}
            </div>
          </Tooltip>
        )}

        {isEditingCasename && (
          <div className="edit-case-name">
            <Input
              value={editCasename}
              onChange={e => patchState({ editCasename: e.target.value })}
              style={{ fontSize: 18 }}
            />
          </div>
        )}
        <span className="inter-link" style={{ margin: '0px 8px 0px 6px', fontSize: 12 }}>
          <Link
            className="text"
            to={`/project/${currCase.project_id}/interface/api/${currCase.interface_id}`}
          >
            对应接口
          </Link>
        </span>
      </div>
      <div>
        {Object.keys(currCase).length > 0 && (
          <Postman
            data={data}
            type="case"
            saveTip="更新保存修改"
            save={updateCase}
            ref={postmanRef}
            interfaceId={currCase.interface_id}
            projectId={currCase.project_id}
            curUid={curUid}
          />
        )}
      </div>
    </div>
  );
};

export default InterfaceCaseContent;

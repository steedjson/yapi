// @ts-check
import axios from 'axios';

// Actions
const FETCH_GROUP_LIST = 'yapi/group/FETCH_GROUP_LIST';
const SET_CURR_GROUP = 'yapi/group/SET_CURR_GROUP';
const FETCH_GROUP_MEMBER = 'yapi/group/FETCH_GROUP_MEMBER';
const FETCH_GROUP_MSG = 'yapi/group/FETCH_GROUP_MSG';
const ADD_GROUP_MEMBER = 'yapi/group/ADD_GROUP_MEMBER';
const DEL_GROUP_MEMBER = 'yapi/group/DEL_GROUP_MEMBER';
const CHANGE_GROUP_MEMBER = 'yapi/group/CHANGE_GROUP_MEMBER';
const CHANGE_GROUP_MESSAGE = 'yapi/group/CHANGE_GROUP_MESSAGE';
const UPDATE_GROUP_LIST = 'yapi/group/UPDATE_GROUP_LIST';
const DEL_GROUP = 'yapi/group/DEL_GROUP';
// SET_CURR_GROUP 与 FETCH_GROUP_MSG 都写 currGroup，共用一个递增请求序号，
// 保证“最后发起的分组请求获胜”，与 interface.js 的 interfaceRequestSequence 同一模式。
let groupRequestSequence = 0;

// Reducer
const initialState = {
  groupList: [],
  currGroup: {
    group_name: '',
    group_desc: '',
    custom_field1: {
      name: '',
      enable: false
    }
  },
  field: {
    name: '',
    enable: false
  },
  member: [],
  role: '',
  groupRequestId: 0
};

/**
 * @param {Record<string, any>} [state]
 * @param {any} [action]
 */
export default (state = initialState, action) => {
  switch (action.type) {
    case FETCH_GROUP_LIST: {
      return {
        ...state,
        groupList: action.payload.data.data
      };
    }
    case UPDATE_GROUP_LIST: {
      return {
        ...state,
        groupList: action.payload
      };
    }
    case SET_CURR_GROUP: {
      // 快速切换分组时，忽略先发后至的旧响应，避免旧分组覆盖 URL 对应分组；
      // 失败响应（errcode 非 0 / payload 异常）不污染已有状态。
      if (action.requestId && action.requestId < state.groupRequestId) {
        return state;
      }
      if (!action.payload || !action.payload.data || action.payload.data.errcode !== 0) {
        return state;
      }
      return {
        ...state,
        currGroup: action.payload.data.data,
        groupRequestId: action.requestId || state.groupRequestId
      };
    }
    case FETCH_GROUP_MEMBER: {
      return {
        ...state,
        member: action.payload.data.data
      };
    }
    case FETCH_GROUP_MSG: {
      // 与 SET_CURR_GROUP 共用序号：过期响应直接忽略，失败响应不污染已有状态。
      if (action.requestId && action.requestId < state.groupRequestId) {
        return state;
      }
      if (!action.payload || !action.payload.data || action.payload.data.errcode !== 0) {
        return state;
      }
      const data = action.payload.data.data;
      return {
        ...state,
        role: data.role,
        currGroup: data,
        field: {
          name: data.custom_field1.name,
          enable: data.custom_field1.enable
        },
        groupRequestId: action.requestId || state.groupRequestId
      };
    }

    default:
      return state;
  }
};

// 获取 group 信息 (权限信息)
/**
 * @param {any} id
 * @returns {Promise<{ type: string, payload: any, requestId: number }>}
 */
export async function fetchGroupMsg(id) {
  const requestId = ++groupRequestSequence;
  const result = await axios.get('/api/group/get', {
    params: { id }
  });
  return {
    type: FETCH_GROUP_MSG,
    payload: result,
    requestId
  };
}

// 添加分组成员
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function addMember(param) {
  return {
    type: ADD_GROUP_MEMBER,
    payload: axios.post('/api/group/add_member', param)
  };
}

// 删除分组成员
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function delMember(param) {
  return {
    type: DEL_GROUP_MEMBER,
    payload: axios.post('/api/group/del_member', param)
  };
}

// 修改分组成员权限
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function changeMemberRole(param) {
  return {
    type: CHANGE_GROUP_MEMBER,
    payload: axios.post('/api/group/change_member_role', param)
  };
}

// 修改分组信息
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function changeGroupMsg(param) {
  return {
    type: CHANGE_GROUP_MESSAGE,
    payload: axios.post('/api/group/up', param)
  };
}

// 更新左侧的分组列表
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function updateGroupList(param) {
  return {
    type: UPDATE_GROUP_LIST,
    payload: param
  };
}

// 删除分组
/**
 * @param {any} param
 * @returns {{ type: string, payload: any }}
 */
export function deleteGroup(param) {
  return {
    type: DEL_GROUP,
    payload: axios.post('/api/group/del', param)
  };
}

// 获取分组成员列表
/**
 * @param {any} id
 * @returns {{ type: string, payload: any }}
 */
export function fetchGroupMemberList(id) {
  return {
    type: FETCH_GROUP_MEMBER,
    payload: axios.get('/api/group/get_member_list', {
      params: { id }
    })
  };
}

// Action Creators
/**
 * @returns {{ type: string, payload: any }}
 */
export function fetchGroupList() {
  return {
    type: FETCH_GROUP_LIST,
    payload: axios.get('/api/group/list')
  };
}

/**
 * @param {any} group
 * @returns {Promise<{ type: string, payload: any, requestId: number }>}
 */
export async function setCurrGroup(group) {
  const requestId = ++groupRequestSequence;
  const result = await axios.get('/api/group/get', {
    params: { id: group._id }
  });
  return {
    type: SET_CURR_GROUP,
    payload: result,
    requestId
  };
}

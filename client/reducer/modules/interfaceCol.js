// @ts-check
import axios from 'axios';
// Actions
const FETCH_INTERFACE_COL_LIST = 'yapi/interfaceCol/FETCH_INTERFACE_COL_LIST';
const FETCH_CASE_DATA = 'yapi/interfaceCol/FETCH_CASE_DATA';
const FETCH_CASE_LIST = 'yapi/interfaceCol/FETCH_CASE_LIST';
const SET_COL_DATA = 'yapi/interfaceCol/SET_COL_DATA';
const FETCH_VARIABLE_PARAMS_LIST = 'yapi/interfaceCol/FETCH_VARIABLE_PARAMS_LIST';
const FETCH_CASE_ENV_LIST = 'yapi/interfaceCol/FETCH_CASE_ENV_LIST';
// Reducer
const initialState = {
  interfaceColList: [
    {
      _id: 0,
      name: '',
      uid: 0,
      project_id: 0,
      desc: '',
      add_time: 0,
      up_time: 0,
      caseList: [{}]
    }
  ],
  isShowCol: true,
  isRender: false,
  currColId: 0,
  currCaseId: 0,
  currCase: {},
  currCaseList: [],
  variableParamsList: [],
  envList: []
};

/**
 * @param {Record<string, any>} [state]
 * @param {any} [action]
 */
export default (state = initialState, action) => {
  switch (action.type) {
    case FETCH_INTERFACE_COL_LIST: {
      return {
        ...state,
        interfaceColList: action.payload.data.data
      };
    }
    case FETCH_CASE_DATA: {
      return {
        ...state,
        currCase: action.payload.data.data
      };
    }
    case FETCH_CASE_LIST: {
      return {
        ...state,
        currCaseList: action.payload.data.data
      };
    }

    case FETCH_VARIABLE_PARAMS_LIST: {
      return {
        ...state,
        variableParamsList: action.payload.data.data
      };
    }
    case SET_COL_DATA: {
      return {
        ...state,
        ...action.payload
      };
    }
    case FETCH_CASE_ENV_LIST: {
      return {
        ...state,
        envList: action.payload.data.data
      };
    }
    default:
      return state;
  }
};

// Action Creators
/**
 * @param {any} projectId
 * @returns {{ type: string, payload: any }}
 */
export function fetchInterfaceColList(projectId) {
  return {
    type: FETCH_INTERFACE_COL_LIST,
    payload: axios.get('/api/col/list?project_id=' + projectId)
  };
}

/**
 * @param {any} caseId
 * @returns {{ type: string, payload: any }}
 */
export function fetchCaseData(caseId) {
  return {
    type: FETCH_CASE_DATA,
    payload: axios.get('/api/col/case?caseid=' + caseId)
  };
}

/**
 * @param {any} colId
 * @returns {{ type: string, payload: any }}
 */
export function fetchCaseList(colId) {
  return {
    type: FETCH_CASE_LIST,
    payload: axios.get('/api/col/case_list/?col_id=' + colId)
  };
}

/**
 * @param {any} col_id
 * @returns {{ type: string, payload: any }}
 */
export function fetchCaseEnvList(col_id) {
  return {
    type: FETCH_CASE_ENV_LIST,
    payload: axios.get('/api/col/case_env_list', {
      params: { col_id }
    })
  };
}

/**
 * @param {any} colId
 * @returns {{ type: string, payload: any }}
 */
export function fetchVariableParamsList(colId) {
  return {
    type: FETCH_VARIABLE_PARAMS_LIST,
    payload: axios.get('/api/col/case_list_by_var_params?col_id=' + colId)
  };
}

/**
 * @param {any} data
 * @returns {{ type: string, payload: any }}
 */
export function setColData(data) {
  return {
    type: SET_COL_DATA,
    payload: data
  };
}

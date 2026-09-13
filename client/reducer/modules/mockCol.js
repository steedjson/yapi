// @ts-check
import axios from 'axios';

// Actions
const FETCH_MOCK_COL = 'yapi/mockCol/FETCH_MOCK_COL';

// Reducer
const initialState = {
  list: []
};

/**
 * @param {Record<string, any>} [state]
 * @param {any} [action]
 */
export default (state = initialState, action) => {
  switch (action.type) {
    case FETCH_MOCK_COL:
      return {
        ...state,
        list: action.payload.data
      };
    default:
      return state;
  }
};

// Action Creators
/**
 * @param {any} interfaceId
 * @returns {Promise<{ type: string, payload: any }>}
 */
export async function fetchMockCol(interfaceId) {
  let result = await axios.get('/api/plugin/advmock/case/list?interface_id=' + interfaceId);
  return {
    type: FETCH_MOCK_COL,
    payload: result.data
  };
}

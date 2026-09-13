// @ts-check
// Actions
const CHANGE_MENU_ITEM = 'yapi/menu/CHANGE_MENU_ITEM';

// Reducer
const initialState = {
  curKey: '/' + window.location.hash.split('/')[1]
};

/**
 * @param {typeof initialState} [state]
 * @param {any} [action]
 */
export default (state = initialState, action) => {
  if (action.type === CHANGE_MENU_ITEM) {
    return {
      ...state,
      curKey: action.data
    };
  } else {
    return state;
  }
};

// Action Creators
/**
 * @param {string} curKey
 */
export function changeMenuItem(curKey) {
  return {
    type: CHANGE_MENU_ITEM,
    data: curKey
  };
}

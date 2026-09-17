// @ts-check
import { message } from 'antd';

/**
 * 全局错误消息中间件：payload 携带业务错误码时提示并抛出，其余情况透传。
 * 参数类型以内联 JSDoc 标注（redux 中间件的柯里化箭头函数无法用块级 @param 描述）。
 */
export default () => (/** @type {*} */ next) => (/** @type {*} */ action) => {
  if (!action) {
    return;
  }
  if (action.error) {
    message.error((action.payload && action.payload.message) || '服务器错误');
  } else if (
    action.payload &&
    action.payload.data &&
    action.payload.data.errcode &&
    action.payload.data.errcode !== 40011
  ) {
    message.error(action.payload.data.errmsg);
    throw new Error(action.payload.data.errmsg);
  }
  return next(action);
};

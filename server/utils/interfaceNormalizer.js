// @ts-check

/**
 * 归一化接口请求头与请求表单字段。
 * 导入数据可能缺少字段或携带非数组值，统一归一化后再处理，避免保存阶段抛出类型错误。
 *
 * @param {Record<string, any>} values 接口保存参数对象
 * @returns {void}
 */
function handleHeaders(values) {
  let isfile = false,
    isHaveContentType = false;
  // 导入数据可能缺少字段或携带非数组值，统一归一化后再处理，避免保存阶段抛出类型错误。
  const headers = Array.isArray(values.req_headers) ? values.req_headers : [];
  const bodyForm = Array.isArray(values.req_body_form) ? values.req_body_form : [];
  values.req_headers = headers;
  if (values.req_body_type === 'form') {
    bodyForm.forEach(item => {
      if (item && item.type === 'file') {
        isfile = true;
      }
    });

    headers.forEach(item => {
      if (item.name === 'Content-Type') {
        item.value = isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        isHaveContentType = true;
      }
    });
    if (isHaveContentType === false) {
      values.req_headers.unshift({
        name: 'Content-Type',
        value: isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      });
    }
  } else if (values.req_body_type === 'json') {
    headers.forEach(item => {
      if (item && item.name === 'Content-Type') {
        item.value = 'application/json';
        isHaveContentType = true;
      }
    });
    if (isHaveContentType === false) {
      values.req_headers.unshift({
        name: 'Content-Type',
        value: 'application/json'
      });
    }
  }
}

module.exports = handleHeaders;

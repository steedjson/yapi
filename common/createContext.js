// @ts-check
/**
 * 将用户、项目、接口标识转换为数值上下文
 * @param {string|number} uid
 * @param {string|number} projectId
 * @param {string|number} interfaceId
 * @returns {{ uid: number, projectId: number, interfaceId: number }}
 */
module.exports = function (uid, projectId,interfaceId) {
  if(!uid || !projectId || !interfaceId){
    console.error('uid projectId interfaceId 不能为空', uid, projectId,interfaceId)
  }

  /**
   * 统一转换为number
   */
  return {
    uid: +uid,
    projectId: +projectId,
    interfaceId: +interfaceId
  }
}
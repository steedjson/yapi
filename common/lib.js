// @ts-check
/**
 * @param {*} object 待判定值
 * @returns {*} 是纯对象时返回真值
 */
function isObj(object) {
  return (
    object &&
    typeof object == 'object' &&
    Object.prototype.toString.call(object).toLowerCase() == '[object object]'
  );
}

/**
 * @param {*} object 待判定值
 * @returns {*} 是数组时返回真值
 */
function isArray(object) {
  return object && typeof object == 'object' && object.constructor == Array;
}

/**
 * @param {*} object 任意对象
 * @returns {number} 自有可枚举键数量
 */
function getLength(object) {
  return Object.keys(object).length;
}

/**
 * @param {*} objA 左值
 * @param {*} objB 右值
 * @returns {boolean} 是否深度相等
 */
function Compare(objA, objB) {
  if (!isObj(objA) && !isObj(objB)) {
    if (isArray(objA) && isArray(objB)) {
      return CompareArray(objA, objB, true);
    }
    return objA == objB;
  }
  if (!isObj(objA) || !isObj(objB)) return false;
  if (getLength(objA) != getLength(objB)) return false;
  return CompareObj(objA, objB, true);
}

/**
 * @param {*} objA 数组 A
 * @param {*} objB 数组 B
 * @param {*} flag 初始比较结果
 * @returns {boolean} 是否相等
 */
function CompareArray(objA, objB, flag) {
  if (objA.length != objB.length) return false;
  for (let i in objB) {
    if (!Compare(objA[i], objB[i])) {
      flag = false;
      break;
    }
  }

  return flag;
}

/**
 * @param {*} objA 对象 A
 * @param {*} objB 对象 B
 * @param {*} flag 初始比较结果
 * @returns {boolean} 是否相等
 */
function CompareObj(objA, objB, flag) {
  for (var key in objA) {
    if (!flag) break;
    if (!Object.prototype.hasOwnProperty.call(objB, key)) {
      flag = false;
      break;
    }
    if (!isArray(objA[key])) {
      if (objB[key] != objA[key]) {
        flag = false;
        break;
      }
    } else {
      if (!isArray(objB[key])) {
        flag = false;
        break;
      }
      var oA = objA[key],
        oB = objB[key];
      if (oA.length != oB.length) {
        flag = false;
        break;
      }
      for (var k in oA) {
        if (!flag) break;
        flag = CompareObj(oA[k], oB[k], flag);
      }
    }
  }
  return flag;
}

exports.jsonEqual = Compare;

/**
 * @param {*} obj 目标对象
 * @param {*} properties 需匹配的属性子集
 * @returns {boolean} 目标是否包含该子集
 */
exports.isDeepMatch = function(obj, properties) {
 
  if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
    return true;
  }

  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    return false;
  }

  let match = true;
  let keys = Object.keys(properties)
  for (let index=0; index< keys.length; index++) {
    let i = keys[index];
    if (!Compare(obj[i], properties[i])) {
      match = false;
      break;
    }
  }
  return match;
};

// @ts-check

/**
 * @param {any} obj
 * @returns {boolean}
 */
function isPlainObject(obj) {
  return obj ? typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype : false;
}

/**
 * @param {Record<string, any>} sourceProperties
 * @param {Record<string, any>} mergeProperties
 * @returns {Record<string, any>}
 */
function handleProperties(sourceProperties, mergeProperties){
  if(!isPlainObject(mergeProperties)){
    return mergeProperties
  }
  if(! isPlainObject(sourceProperties)){
    return mergeProperties
  }
  Object.keys(mergeProperties).forEach(key=>{
    mergeProperties[key]= handleSchema(sourceProperties[key], mergeProperties[key])
  })
  return mergeProperties;
}


/**
 * @param {Record<string, any>} source
 * @param {Record<string, any>} merge
 * @returns {Record<string, any>}
 */
function handleSchema(source, merge){
  if(!isPlainObject(source)) return merge;
  if(!isPlainObject(merge)) return merge;
  /** @type {Record<string, any>} */
  let result = {}
  Object.assign(result, source, merge)
  if(merge.type === 'object'){
    result.properties = handleProperties(source.properties, merge.properties);
  }else if(merge.type === 'array'){
    result.items = handleSchema(source.items, merge.items);
  }
  return result;
}

/**
 * @param {Record<string, any>} sourceJsonSchema
 * @param {Record<string, any>} mergeJsonSchema
 * @returns {Record<string, any>}
 */
module.exports = function(sourceJsonSchema, mergeJsonSchema){
  return handleSchema(sourceJsonSchema, mergeJsonSchema)
}
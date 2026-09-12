// @ts-check
/**
 * 以非字面量参数调用 require，避免 tsc 静态解析后递归检查未迁移的模型和框架代码。
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);

/**
 * @param {string|number} id
 * @returns {{ getItem: (name?: string) => Promise<any>, setItem: (name: string, value: any) => Promise<any> }}
 */
module.exports = function storageCreator(id) {
  /** @type {any} */
  const storageModel = requireAny('../models/storage.js');
  /** @type {any} */
  const yapi = requireAny('../yapi.js');
  const defaultData = {}
  return {
    getItem: async (name = '') => {
      let inst = yapi.getInst(storageModel);
      let data = await inst.get(id);
      data = data || defaultData;
      if (name) return data[name];
      return data;
    },
    setItem: async (name, value) => {
      let inst = yapi.getInst(storageModel);
      let curData = await inst.get(id);
      let data =  curData || defaultData;
      let result;
      data[name] = value;
      if(!curData){
        result = await inst.save(id, data, true)
      }else{
        result = await inst.save(id, data, false)
      }

      return result;
    }
  }
}

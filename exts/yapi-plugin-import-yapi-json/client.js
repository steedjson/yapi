import { message } from 'antd';

function importData(importDataModule) {
  async function run(res) {
    try {
      let interfaceData = { apis: [], cats: [] };
      res = JSON.parse(res);
      res.forEach(item => {
        const cat = {
          name: item.name,
          desc: item.desc
        };
        // 新版 json 导出带有多级分类信息（path/parent_path/parent_id），
        // 完整保留传入 HandleImportData 即可自动复原层级；老版本单层结构无这些字段，保持原样。
        if (item.parent_id !== undefined) cat.parent_id = item.parent_id;
        if (item.path !== undefined) cat.path = item.path;
        if (item.parent_path !== undefined) cat.parent_path = item.parent_path;
        interfaceData.cats.push(cat);
        item.list.forEach(api => {
          api.catname = item.name;
        });
        interfaceData.apis = interfaceData.apis.concat(item.list);
      });
      return interfaceData;
    } catch (e) {
      console.error(e);
      message.error('数据格式有误');
    }
  }

  if (!importDataModule || typeof importDataModule !== 'object') {
    console.error('importDataModule 参数Must be Object Type');
    return null;
  }

  importDataModule.json = {
    name: 'json',
    run: run,
    desc: 'YApi接口 json数据导入'
  };
}

module.exports = function() {
  this.bindHook('import_data', importData);
};

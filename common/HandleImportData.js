const _ = require('underscore');
const axios = require('axios');

const isNode = typeof global == 'object' && global.global === global;

async function handle(
  res,
  projectId,
  selectCatid,
  menuList,
  basePath,
  dataSync,
  messageError,
  messageSuccess,
  callback,
  token,
  port
) {
  const taskNotice = _.throttle((index, len) => {
    messageSuccess('正在导入，已执行任务 ' + (index + 1) + ' 个，共 ' + len + ' 个');
  }, 3000);
  const errors = [];
  const categories = {};
  (menuList || []).forEach(menu => {
    categories[menu.name] = menu;
  });

  const finish = () => {
    if (callback) callback({ showLoading: false });
  };

  const handleAddCat = async cats => {
    if (!Array.isArray(cats)) return categories;
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      if (!cat || !cat.name) continue;
      const existing = categories[cat.path] || categories[cat.name];
      if (existing) {
        cat.id = existing._id || existing.id;
        continue;
      }
      const apipath = isNode
        ? 'http://127.0.0.1:' + port + '/api/interface/add_cat'
        : '/api/interface/add_cat';
      try {
        const result = await axios.post(apipath, {
          name: cat.name,
          project_id: projectId,
          parent_id: cat.parent_path && categories[cat.parent_path] ? categories[cat.parent_path].id : 0,
          desc: cat.desc,
          token
        });
        if (result.data.errcode) {
          errors.push('分类「' + cat.name + '」：' + result.data.errmsg);
          continue;
        }
        cat.id = result.data.data._id;
        categories[cat.path || cat.name] = cat;
        categories[cat.name] = cat;
      } catch (err) {
        errors.push('分类「' + cat.name + '」：' + err.message);
      }
    }
    return categories;
  };

  const handleAddInterface = async info => {
    if (!info || !Array.isArray(info.apis)) {
      messageError('解析数据为空');
      finish();
      return;
    }
    const cats = await handleAddCat(info.cats);
    const res = info.apis;
    const len = res.length;
    let successNum = 0;
    let existNum = 0;
    if (len === 0) {
      messageError('解析数据为空');
      finish();
      return;
    }

    if (info.basePath) {
      const projectApiPath = isNode
        ? 'http://127.0.0.1:' + port + '/api/project/up'
        : '/api/project/up';
      try {
        const result = await axios.post(projectApiPath, {
          id: projectId,
          basepath: info.basePath,
          token
        });
        if (result.data.errcode) errors.push('项目 BasePath：' + result.data.errmsg);
      } catch (err) {
        errors.push('项目 BasePath：' + err.message);
      }
    }

    for (let index = 0; index < res.length; index++) {
      const item = res[index];
      const data = Object.assign({}, item, {
        project_id: projectId,
        catid: selectCatid,
        token,
        dataSync
      });
      if (basePath && data.path.indexOf(basePath) === 0) {
        data.path = data.path.substr(basePath.length) || '/';
      }
      if (data.catname && cats[data.catname] && cats[data.catname].id) {
        data.catid = cats[data.catname].id;
      }

      const apipath = isNode
        ? 'http://127.0.0.1:' + port + (dataSync !== 'normal' ? '/api/interface/save' : '/api/interface/add')
        : dataSync !== 'normal'
          ? '/api/interface/save'
          : '/api/interface/add';
      try {
        const result = await axios.post(apipath, data);
        if (result.data.errcode) {
          if (result.data.errcode === 40022) existNum++;
          errors.push(data.method + ' ' + data.path + '：' + result.data.errmsg);
        } else {
          successNum++;
          if (dataSync !== 'normal' && Array.isArray(result.data.data)) {
            existNum += result.data.data.length;
          }
        }
      } catch (err) {
        errors.push(data.method + ' ' + data.path + '：' + err.message);
      }
      taskNotice(index, len);
    }

    finish();
    if (errors.length) {
      const preview = errors.slice(0, 10).join('；');
      messageError(
        '导入完成：成功 ' + successNum + ' 个，已存在 ' + existNum + ' 个，失败 ' + errors.length + ' 个。' + preview
      );
    } else {
      messageSuccess('成功导入接口 ' + successNum + ' 个，已存在的接口 ' + existNum + ' 个');
    }
  };

  return handleAddInterface(res);
}

module.exports = handle;

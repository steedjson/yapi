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
  const categoryId = category => category && (category.id || category._id);
  const menuById = {};
  (menuList || []).forEach(menu => {
    if (menu && menu._id !== undefined) menuById[menu._id] = menu;
  });
  (menuList || []).forEach(menu => {
    if (!menu || !menu.name) return;
    // 按父级拼出完整路径，避免不同父分类下同名子分类匹配错误。
    const parts = [menu.name];
    const visited = {};
    let parent = menuById[menu.parent_id];
    while (parent && !visited[parent._id]) {
      visited[parent._id] = true;
      parts.unshift(parent.name);
      parent = menuById[parent.parent_id];
    }
    categories[parts.join('/')] = menu;
    if (!categories[menu.name]) categories[menu.name] = menu;
  });

  const finish = () => {
    if (callback) callback({ showLoading: false });
  };

  const handleAddCat = async cats => {
    if (!Array.isArray(cats)) return categories;
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      if (!cat || !cat.name) continue;
      const existing = categories[cat.path] || (!cat.parent_path && categories[cat.name]);
      if (existing) {
        cat.id = existing._id || existing.id;
        continue;
      }
      const parent = cat.parent_path ? categories[cat.parent_path] : null;
      if (cat.parent_path && !categoryId(parent)) {
        // 父分类未找到时禁止降级到根分类，避免多级分类被错误放入公共分类。
        errors.push('分类「' + cat.name + '」：父分类不存在（' + cat.parent_path + '）');
        continue;
      }
      const apipath = isNode
        ? 'http://127.0.0.1:' + port + '/api/interface/add_cat'
        : '/api/interface/add_cat';
      try {
        const result = await axios.post(apipath, {
          name: cat.name,
          project_id: projectId,
          parent_id: categoryId(parent) || 0,
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
      const category = data.catname && cats[data.catname];
      // 旧分类来自接口时使用 _id，新建分类使用 id，统一读取避免接口落到默认分类。
      if (categoryId(category)) data.catid = categoryId(category);

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

// @ts-check
const axios = require('axios');

const isNode = typeof global == 'object' && global.global === global;
// 测试和嵌入式调用可能不传端口，此时使用相对路径，避免拼出 undefined 地址。
/**
 * @param {number} [port] 服务端口；未传时使用相对路径
 * @returns {string} 接口地址前缀
 */
const getApiPrefix = port => (isNode && port !== undefined && port !== null ? 'http://127.0.0.1:' + port : '');

/**
 * 分类/接口 id：数据库 _id 与 client 侧 URL 参数都可能是数字或字符串。
 * @typedef {number|string} Id
 */

/**
 * 分类对象：既表示已存在的菜单/分类（含 _id/parent_id），
 * 也表示导入源给出的待建分类（含 path/parent_path）。
 * @typedef {object} Category
 * @property {Id} _id 已存在分类的 id
 * @property {string} name 分类名
 * @property {Id} parent_id 父分类 id（根分类为 0）
 * @property {Id} [id] 新建分类后回填的 id
 * @property {string} [desc] 分类描述
 * @property {string} [path] 导入源给出的完整分类路径（旧式导入源没有该字段）
 * @property {string} [parent_path] 导入源给出的父分类完整路径
 */

/**
 * 待导入的接口数据。字段较多，此处只声明本文件读取/覆盖的部分。
 * @typedef {object} Api
 * @property {string} method 请求方法
 * @property {string} path 接口路径
 * @property {string} [catname] 目标分类名（导入源可选给出，har 等不提供）
 * @property {Id} [catid] 目标分类 id
 */

/**
 * 导入源解析结果。
 * @typedef {object} ImportInfo
 * @property {Category[]} [cats] 待创建的分类
 * @property {Api[]} [apis] 待导入的接口
 * @property {string} [basePath] 项目基础路径
 */

/**
 * 导入结果统计。
 * @typedef {object} ImportResult
 * @property {number} successNum 成功导入的接口数
 * @property {number} existNum 已存在的接口数
 * @property {number} failedNum 失败的接口数
 * @property {string[]} errors 失败详情
 */

// 极简 throttle: 首次立即执行, 间隔内的后续调用丢弃(仅覆盖本文件的原 _.throttle 用法)
/**
 * @param {(index: number, len: number) => void} fn 被节流函数
 * @param {number} wait 节流间隔（毫秒）
 * @returns {(this: *, index: number, len: number) => void} 透传 this 后调用 fn 的包装
 */
function throttle(fn, wait) {
  let lastExecTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastExecTime >= wait) {
      lastExecTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 导入接口数据（含分类创建与 basePath 设置）。
 * @param {ImportInfo} res 导入源解析结果
 * @param {Id} projectId 项目 id
 * @param {Id} selectCatid 默认分类 id（接口未匹配到 catname 时使用）
 * @param {Category[]} menuList 项目现有分类列表
 * @param {string} basePath 项目 basePath（用于裁掉接口路径里的前缀，可为空串）
 * @param {string} dataSync 导入模式（'normal' 为新增，其余为同步保存）
 * @param {(msg: string) => void} messageError 错误提示
 * @param {(msg: string) => void} messageSuccess 成功/进度提示
 * @param {(opts: {showLoading: boolean}) => void} [callback] 结束回调
 * @param {string} [token] 项目 token
 * @param {number} [port] 服务端口
 * @returns {Promise<ImportResult>} 导入结果统计
 */
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
  const taskNotice = throttle((index, len) => {
    messageSuccess('正在导入，已执行任务 ' + (index + 1) + ' 个，共 ' + len + ' 个');
  }, 3000);
  /** @type {string[]} */
  const errors = [];
  /** @type {Record<string, Category>} */
  const categories = {};
  /** @param {Category|''|null} [category] 分类对象（未匹配到分类时可能是假值） */
  const categoryId = category => category && (category.id || category._id);
  /** @type {Record<string, Category>} */
  const menuById = {};
  (menuList || []).forEach(menu => {
    if (menu && menu._id !== undefined) menuById[menu._id] = menu;
  });
  (menuList || []).forEach(menu => {
    if (!menu || !menu.name) return;
    // 按父级拼出完整路径，避免不同父分类下同名子分类匹配错误。
    const parts = [menu.name];
    /** @type {Record<string, boolean>} */
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

  /**
   * 按导入源给出的分类逐级创建分类（已存在的直接复用）。
   * @param {Category[]} [cats] 待创建分类；旧式导入源可能不传
   * @returns {Promise<Record<string, Category>>} 分类表（完整路径与分类名双索引）
   */
  const handleAddCat = async cats => {
    if (!Array.isArray(cats)) return categories;
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      if (!cat || !cat.name) continue;
      // 旧式导入源没有 path，此时 categories[undefined] 查不到（键被转成 "undefined"），
      // 由下方 !cat.parent_path && categories[cat.name] 兜底。
      const existing =
        categories[/** @type {string} */ (cat.path)] || (!cat.parent_path && categories[cat.name]);
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
      const apipath = getApiPrefix(port) + '/api/interface/add_cat';
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
        errors.push('分类「' + cat.name + '」：' + (/** @type {Error} */ (err)).message);
      }
    }
    return categories;
  };

  /**
   * 逐个提交接口，并汇总成功/已存在/失败的统计与提示。
   * @param {ImportInfo} [info] 导入源解析结果
   * @returns {Promise<ImportResult>} 导入结果统计
   */
  const handleAddInterface = async info => {
    if (!info || !Array.isArray(info.apis)) {
      messageError('解析数据为空');
      finish();
      return { successNum: 0, existNum: 0, failedNum: 0, errors: [] };
    }
    const cats = await handleAddCat(info.cats);
    const res = info.apis;
    const len = res.length;
    let successNum = 0;
    let existNum = 0;
    if (len === 0) {
      messageError('解析数据为空');
      finish();
      return { successNum: 0, existNum: 0, failedNum: 0, errors: [] };
    }

    if (info.basePath) {
      const projectApiPath = getApiPrefix(port) + '/api/project/up';
      try {
        const result = await axios.post(projectApiPath, {
          id: projectId,
          basepath: info.basePath,
          token
        });
        if (result.data.errcode) errors.push('项目 BasePath：' + result.data.errmsg);
      } catch (err) {
        errors.push('项目 BasePath：' + (/** @type {Error} */ (err)).message);
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
      // categoryId 的返回可能为假值，上面已判定为真，故此处必为有效 id。
      if (categoryId(category)) data.catid = /** @type {Id} */ (categoryId(category));

      const apipath =
        getApiPrefix(port) + (dataSync !== 'normal' ? '/api/interface/save' : '/api/interface/add');
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
        errors.push(data.method + ' ' + data.path + '：' + (/** @type {Error} */ (err)).message);
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
    return { successNum, existNum, failedNum: errors.length, errors };
  };

  return handleAddInterface(res);
}

module.exports = handle;

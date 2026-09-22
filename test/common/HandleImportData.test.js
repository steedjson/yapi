import test from 'ava';
import assert from 'assert';
import axios from 'axios';
import handleImportData from '../../common/HandleImportData';

test.serial('导入接口应按完整分类路径匹配已有子分类', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    return {data: {errcode: 0, data: {}}};
  };

  try {
    await handleImportData(
      {
        cats: [],
        apis: [{method: 'GET', path: '/health', title: 'health', catname: '服务/B'}]
      },
      1,
      99,
      [
        {_id: 10, name: '服务', parent_id: 0},
        {_id: 11, name: 'B', parent_id: 10},
        {_id: 20, name: '其他', parent_id: 0},
        {_id: 21, name: 'B', parent_id: 20}
      ],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
  } finally {
    axios.post = originalPost;
  }

  const interfaceRequest = requests.find(item => item.url.indexOf('/api/interface/add') > -1);
  assert.ok(interfaceRequest);
  t.is(interfaceRequest.data.catid, 11);
});


test.serial('导入多级分类找不到父分类时不得降级到根分类', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    return {data: {errcode: 0, data: {_id: 99}}};
  };

  try {
    await handleImportData(
      {
        cats: [{name: '子分类', path: '不存在/子分类', parent_path: '不存在'}],
        apis: [{method: 'GET', path: '/health', title: 'health', catname: '不存在/子分类'}]
      },
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
  } finally {
    axios.post = originalPost;
  }

  t.false(requests.some(item => item.url.indexOf('/api/interface/add_cat') > -1));
  t.is(requests.filter(item => item.url.indexOf('/api/interface/add') > -1).length, 1);
  t.is(requests[0].data.catid, 99);
});


test.serial('导入部分失败时返回准确的结果统计', async t => {
  const originalPost = axios.post;
  let apiCount = 0;
  axios.post = async url => {
    if (url.indexOf('/api/interface/add') > -1) {
      apiCount += 1;
      if (apiCount === 1) return {data: {errcode: 400, errmsg: '接口保存失败'}};
    }
    return {data: {errcode: 0, data: {_id: 100 + apiCount}}};
  };

  try {
    const result = await handleImportData(
      {apis: [
        {method: 'GET', path: '/failed', title: 'failed'},
        {method: 'GET', path: '/success', title: 'success'}
      ]},
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
    t.is(result.successNum, 1);
    t.is(result.existNum, 0);
    t.is(result.failedNum, 1);
    t.is(result.errors.length, 1);
  } finally {
    axios.post = originalPost;
  }
});


test.serial('新版 JSON 导入多级分类应按父子关系依次创建分类', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    return {data: {errcode: 0, data: {_id: 500 + requests.length}}};
  };

  try {
    await handleImportData(
      {
        cats: [
          {name: '父分类', desc: '', parent_id: 0, path: '父分类', parent_path: ''},
          {name: '子分类', desc: '', parent_id: 12, path: '父分类/子分类', parent_path: '父分类'}
        ],
        apis: [{method: 'GET', path: '/health', title: 'health', catname: '子分类'}]
      },
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
  } finally {
    axios.post = originalPost;
  }

  // 注意 add_cat 的 url 含 add 前缀，需精确区分两类请求。
  const addCatRequests = requests.filter(item => item.url.indexOf('/api/interface/add_cat') > -1);
  const addInterfaceRequests = requests.filter(
    item => item.url.indexOf('/api/interface/add') > -1 && item.url.indexOf('add_cat') === -1
  );
  t.is(addCatRequests.length, 2);
  t.is(addCatRequests[0].data.name, '父分类');
  t.is(addCatRequests[0].data.parent_id, 0);
  t.is(addCatRequests[1].data.name, '子分类');
  t.is(addCatRequests[1].data.parent_id, 501);
  t.is(addInterfaceRequests.length, 1);
  t.is(addInterfaceRequests[0].data.catid, 502);
});

test.serial('分类创建请求异常：错误进入 errors 且不中断后续接口导入', async t => {
  const originalPost = axios.post;
  axios.post = async url => {
    if (url.indexOf('/api/interface/add_cat') > -1) throw new Error('add_cat 网络错误');
    return {data: {errcode: 0, data: {_id: 601}}};
  };

  try {
    const result = await handleImportData(
      {
        cats: [{name: '新分类', path: '新分类', parent_path: ''}],
        apis: [{method: 'GET', path: '/x', title: 'x', catname: '新分类'}]
      },
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
    t.is(result.errors.length, 1);
    t.is(result.errors[0], '分类「新分类」：add_cat 网络错误');
    t.is(result.successNum, 1, '分类失败不阻断接口导入（catid 回落 selectCatid）');
  } finally {
    axios.post = originalPost;
  }
});

test.serial('项目 BasePath 更新异常：错误进入 errors 且接口导入继续', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    if (url.indexOf('/api/project/up') > -1) throw new Error('up 网络错误');
    return {data: {errcode: 0, data: {_id: 701}}};
  };

  try {
    const result = await handleImportData(
      {basePath: '/v2', apis: [{method: 'GET', path: '/v2/health', title: 'h'}]},
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
    t.is(result.errors.length, 1);
    t.is(result.errors[0], '项目 BasePath：up 网络错误');
    t.is(result.successNum, 1);
    const upRequest = requests.find(item => item.url.indexOf('/api/project/up') > -1);
    t.truthy(upRequest, 'info.basePath 存在时应上送项目 BasePath 更新');
    t.is(upRequest.data.basepath, '/v2');
  } finally {
    axios.post = originalPost;
  }
});

test.serial('接口保存请求异常：失败计入 failedNum 且错误携带方法名与路径', async t => {
  const originalPost = axios.post;
  axios.post = async url => {
    if (url.indexOf('/api/interface/add') > -1) throw new Error('保存超时');
    return {data: {errcode: 0, data: {_id: 801}}};
  };

  try {
    const result = await handleImportData(
      {apis: [{method: 'POST', path: '/submit', title: 's'}]},
      1,
      99,
      [],
      '',
      'normal',
      () => {},
      () => {},
      () => {}
    );
    t.is(result.failedNum, 1);
    t.is(result.errors[0], 'POST /submit：保存超时');
  } finally {
    axios.post = originalPost;
  }
});

test.serial('dataSync 非 normal：改走 interface/save 且响应数组长度计入 existNum', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    return {data: {errcode: 0, data: [{_id: 1}, {_id: 2}]}};
  };

  try {
    const result = await handleImportData(
      {apis: [{method: 'GET', path: '/sync', title: 's'}]},
      1,
      99,
      [],
      '',
      'sync',
      () => {},
      () => {},
      () => {}
    );
    const saveRequest = requests.find(item => item.url.indexOf('/api/interface/save') > -1);
    t.truthy(saveRequest, 'dataSync 非 normal 应走 /api/interface/save');
    t.is(saveRequest.data.dataSync, 'sync');
    t.is(result.successNum, 1);
    t.is(result.existNum, 2, '同步保存返回数组时按长度累加已存在数');
  } finally {
    axios.post = originalPost;
  }
});

test.serial('basePath 前缀裁剪：路径裁掉前缀且整段前缀回退为 /', async t => {
  const requests = [];
  const originalPost = axios.post;
  axios.post = async (url, data) => {
    requests.push({url, data});
    return {data: {errcode: 0, data: {_id: 901}}};
  };

  try {
    await handleImportData(
      {
        apis: [
          {method: 'GET', path: '/api/v1/health', title: 'h'},
          {method: 'GET', path: '/api/v1', title: 'root'}
        ]
      },
      1,
      99,
      [],
      '/api/v1',
      'normal',
      () => {},
      () => {},
      () => {}
    );
    const ifaceRequests = requests.filter(
      item => item.url.indexOf('/api/interface/add') > -1 && item.url.indexOf('add_cat') === -1
    );
    t.is(ifaceRequests.length, 2);
    t.is(ifaceRequests[0].data.path, '/health');
    t.is(ifaceRequests[1].data.path, '/', '路径等于前缀时回退为 /');
  } finally {
    axios.post = originalPost;
  }
});

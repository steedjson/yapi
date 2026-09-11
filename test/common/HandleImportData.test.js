import test from 'ava';
import assert from 'assert';
import axios from 'axios';
import handleImportData from '../../common/HandleImportData';

test('导入接口应按完整分类路径匹配已有子分类', async t => {
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


test('导入多级分类找不到父分类时不得降级到根分类', async t => {
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

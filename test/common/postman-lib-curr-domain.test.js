import test from 'ava';
const { handleCurrDomain } = require('../../common/postmanLib.js');

// React 19 迁移批次回归：handleCurrDomain 的数据就绪守卫。
// 背景：React 19 并发调度下 InterfaceColContent 渲染期可能在 env 列表加载完成前
// 消费该函数，此前 domains 为 undefined 时在 .find 处抛
// "Cannot read properties of undefined (reading 'find')"（React 18 同步渲染时序掩盖）。
// 守卫约定：domains 非数组时等价于"无 env 命中"，返回 undefined，不抛错。

const DOMAINS = [
  { name: 'prod', domain: 'https://prod.example.com', header: [] },
  { name: 'test', domain: 'https://test.example.com', header: [] }
];

test('命中环境名时返回对应域名配置（既有语义不变）', t => {
  const hit = handleCurrDomain(DOMAINS, 'test');
  t.is(hit, DOMAINS[1]);
});

test('未命中环境名时回退到首个域名配置（既有语义不变）', t => {
  const fallback = handleCurrDomain(DOMAINS, 'not-exist-env');
  t.is(fallback, DOMAINS[0]);
});

test('env 列表为空数组时返回 undefined（既有语义不变）', t => {
  t.is(handleCurrDomain([], 'prod'), undefined);
});

test('守卫：domains 为 undefined（未就绪）时返回 undefined 而非抛错', t => {
  t.is(handleCurrDomain(undefined, 'prod'), undefined);
});

test('守卫：domains 为 null 时返回 undefined 而非抛错', t => {
  t.is(handleCurrDomain(null, 'prod'), undefined);
});

test('守卫：domains 为非数组对象时返回 undefined 而非抛错', t => {
  t.is(handleCurrDomain({ name: 'prod' }, 'prod'), undefined);
});

// —— 以下 2 例为 tester 独立复核补充的守卫边界（Array.isArray 严格性） ——

test('守卫：domains 为伪数组对象（array-like）时按非数组处理返回 undefined', t => {
  // Array.isArray 不做鸭子类型判定：带 length+索引的普通对象仍视为未就绪。
  // 仓库内 envList 唯一来源是 store（初始 [] / 接口返回真数组），不存在伪数组形态，
  // 按非数组拒绝是安全方向。
  const arrayLike = { length: 1, 0: { name: 'prod', domain: 'https://prod.example.com', header: [] } };
  t.is(handleCurrDomain(arrayLike, 'prod'), undefined);
});

test('守卫：domains 为字符串等原始值时返回 undefined 而非抛错', t => {
  t.is(handleCurrDomain('prod', 'prod'), undefined);
});

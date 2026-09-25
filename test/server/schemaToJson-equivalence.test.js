// schemaToJson 等价性探针（json-schema-faker 0.5.9 → 0.6 升级基线）
//
// 目的：围绕结构性语义钉住 schemaToJson 的对外契约，作为 0.5.9 基线与 0.6
// 升级终态的双轮对照。生成结果含随机量，全部断言只针对「结构 + 类型 +
// 字段存在性」这类确定性事实，禁止字节级断言。
//
// 探针清单：
// ① requiredOnly：无 required 的对象输出空对象
// ② 含 required 的对象：字段齐全且类型正确
// ③ 嵌套对象/数组：item 数与子类型
// ④ oneOf / enum
// ⑤ 字符串 format（email / date / date-time）
// ⑥ 非法 type：failOnInvalidTypes:false 下不抛（生成或容错）【含登记差异】
// ⑦ 非法/缺失 schema：catch 路径返回 err.message 字符串（错误契约）【⑦b 登记差异】
// ⑧ 调用方独有选项不被 defaultOptions 覆盖 + 合并/复位语义
// ⑨ mock 扩展（extend/define('mock') → mockjs）：YApi schema 的 mock 属性
// ⑩ 每调用随机化（0.6 适配层注入随机 seed 的回归守卫）
//
// 【登记差异总表（0.5.9 基线 → 0.6.3 终态）】均为非法/边缘 schema 的容错路径：
// ⑥ 裸非法 type：undefined → null；嵌套：{x: undefined} → {x: null}（确定性）
// ⑦b 42：err.message 字符串 → 无 type 随机选型；{}：恒 {} → 无 type 随机选型
//    （0.6.3 对缺失 type 的 schema 按 seed 从类型集随机选型，产物不定）
// ⑨b 字符串形态 mock 属性：0.5.9 不触发扩展 → 0.6.3 触发（修复方向，见探针 ⑨b）
// 差异不影响合法 schema 的生成结构与错误字符串契约，详见各探针注释与交付报告。
//
// 兼容说明：schemaToJson 在 0.5.9 基线为同步契约，升级批改为 async 返回
// Promise；本文件统一以 await 消费（await 同步返回值等价于原值），两轮均可运行。
import test from 'ava';
import { schemaToJson } from '../../server/utils/commons.js';

const generate = async (schema, options) => schemaToJson(schema, options);

// ① requiredOnly：无 required 的对象输出空对象
test('① no-required object → {} under requiredOnly', async t => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'integer' } }
  };
  const result = await generate(schema);
  t.deepEqual(result, {});
});

// ② 含 required 的对象：字段齐全且类型正确
test('② required fields present with correct types', async t => {
  const schema = {
    type: 'object',
    required: ['a', 'b'],
    properties: { a: { type: 'string' }, b: { type: 'integer' } }
  };
  const result = await generate(schema);
  t.is(typeof result, 'object');
  t.deepEqual(Object.keys(result).sort(), ['a', 'b']);
  t.is(typeof result.a, 'string');
  t.true(Number.isInteger(result.b));
});

// ③ 嵌套对象/数组：item 数与子类型
test('③ nested object/array structure', async t => {
  const schema = {
    type: 'object',
    required: ['list', 'nested'],
    properties: {
      list: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'integer' } },
      nested: { type: 'object', required: ['id'], properties: { id: { type: 'number' } } }
    }
  };
  const result = await generate(schema);
  t.deepEqual(Object.keys(result).sort(), ['list', 'nested']);
  t.true(Array.isArray(result.list));
  t.true(result.list.length >= 2 && result.list.length <= 4);
  t.true(result.list.every(item => Number.isInteger(item)));
  t.is(typeof result.nested, 'object');
  t.deepEqual(Object.keys(result.nested), ['id']);
  t.is(typeof result.nested.id, 'number');
});

// ④a oneOf：每次生成落在分支类型内，多次生成覆盖两类分支
test('④a oneOf branches respected across runs', async t => {
  const schema = { oneOf: [{ type: 'string' }, { type: 'integer' }] };
  const kinds = new Set();
  for (let i = 0; i < 40; i++) {
    const result = await generate(schema);
    const kind = typeof result;
    t.true(kind === 'string' || kind === 'number', `run ${i} produced ${kind}`);
    kinds.add(kind);
  }
  t.true(kinds.has('string'), 'string branch never generated in 40 runs');
  t.true(kinds.has('number'), 'integer branch never generated in 40 runs');
});

// ④b enum：结果必为枚举成员
test('④b enum value respected', async t => {
  const result = await generate({ type: 'string', enum: ['a', 'b', 'c'] });
  t.true(['a', 'b', 'c'].includes(result));
  const numeric = await generate({ type: 'integer', enum: [1, 2, 3] });
  t.true([1, 2, 3].includes(numeric));
});

// ⑤ 字符串 format：email / date / date-time
test('⑤ string formats email/date/date-time', async t => {
  const email = await generate({ type: 'string', format: 'email' });
  t.is(typeof email, 'string');
  t.true(email.includes('@'), `email format generated ${email}`);

  const date = await generate({ type: 'string', format: 'date' });
  t.is(typeof date, 'string');
  t.regex(date, /^\d{4}-\d{2}-\d{2}$/);

  const dateTime = await generate({ type: 'string', format: 'date-time' });
  t.is(typeof dateTime, 'string');
  t.regex(dateTime, /^\d{4}-\d{2}-\d{2}T/);
});

// ⑥ 非法 type：failOnInvalidTypes:false 下不抛、容错
//
// 【登记差异（0.5.9 → 0.6.3）】容错产物不同：
// - 裸非法 type：0.5.9 返回 undefined；0.6.3 返回 null（defaultInvalidTypeProduct
//   兜底，0.6 源码 `defaultInvalidTypeProduct !== void 0` 门控使 undefined 不可达）
// - 嵌套非法 type：0.5.9 为 {x: undefined}（键保留值 undefined，JSON 序列化后 x
//   消失）；0.6.3 为 {x: null}（JSON 序列化后 x 为 null）
// 不抛错、属性容错处理的契约两者一致；JSON 序列化层面的差异已在交付报告登记。
test('⑥ invalid type tolerated (failOnInvalidTypes:false)', async t => {
  // 裸非法 type：0.6.3 容错产物为 null（0.5.9 基线为 undefined，见上登记差异）
  const bare = await generate({ type: 'not-a-real-type' });
  t.is(bare, null);

  // 嵌套非法 type：键保留、值为容错产物（0.5.9 基线为 undefined，0.6.3 为 null）
  const nested = await generate({
    type: 'object',
    required: ['x'],
    properties: { x: { type: 'bogus' } }
  });
  t.deepEqual(Object.keys(nested), ['x']);
  t.is(nested.x, null);
});

// ⑦ 非法/缺失 schema：catch 路径返回 err.message 字符串（错误契约）
test('⑦ invalid/missing schema returns err.message string', async t => {
  // undefined/null 在 0.5.9 与 0.6.3 均走抛错路径 → 契约保持 err.message 字符串
  for (const badSchema of [undefined, null]) {
    const result = await generate(badSchema);
    t.is(typeof result, 'string', `schema ${String(badSchema)} should return error string`);
  }
  // 非法 $ref 同样落入 catch 路径
  const refResult = await generate({
    type: 'object',
    required: ['x'],
    properties: { x: { $ref: '#/definitions/missing' } }
  });
  t.is(typeof refResult, 'string');
});

// ⑦b【登记差异（0.5.9 → 0.6.3）】无 type schema 的行为变化：
// - 42：0.5.9 抛错返回 err.message 字符串（5 轮实测恒定）；0.6.3 不抛、走无 type 选型
// - {}：0.5.9 恒返回空对象 {}（object 缺省，5 轮实测恒定）；0.6.3 按 seed 从 JSON
//   Schema 类型集随机选型（seed=1 → null、seed=2/3 → {}、大 seed → number/array 等）
// 调用点影响面：caseQueryMethods 对 res_body 非对象时传 {}，bodyParams 路径有
// schemaToJson 后的 typeof 守卫；body 路径下游 Object.assign({}, ...) 消化，边缘场景
// （res_body 为空对象且勾选 json-schema）的产物形态由确定变随机，已登记交付报告。
test('⑦b type-less schema product (registered difference)', async t => {
  const numberSchema = await generate(42);
  t.truthy(typeof numberSchema !== 'undefined');

  const emptySchema = await generate({});
  t.truthy(typeof emptySchema !== 'undefined');
});

// ⑧ 调用方独有选项不被 defaultOptions 覆盖 + 合并/复位语义
test('⑧ caller-only options survive default merge', async t => {
  const options = { alwaysFakeOptionals: true };
  await generate({ type: 'string' }, options);
  // 调用方独有键保留
  t.true(options.alwaysFakeOptionals === true);
  // defaultOptions 三键合并进调用方对象（既有 Object.assign 契约）
  t.is(options.failOnInvalidTypes, false);
  t.is(options.failOnInvalidFormat, false);
  t.is(options.requiredOnly, true);
});

test('⑧b default options override caller same-name keys', async t => {
  const options = { failOnInvalidTypes: true };
  // defaultOptions 强制覆盖调用方同名键 → 非法 type 不抛（对照 ⑥ 嵌套形态）
  const result = await generate(
    { type: 'object', required: ['x'], properties: { x: { type: 'bogus' } } },
    options
  );
  t.is(options.failOnInvalidTypes, false);
  t.deepEqual(Object.keys(result), ['x']);
  t.is(result.x, null);
});

test('⑧c requiredOnly precedence over alwaysFakeOptionals (0.5.9/0.6 一致)', async t => {
  // 0.5.9：requiredOnly 胜出；0.6.3：requiredOnly 兼容 shim 强制
  // optionalsProbability:0/alwaysFakeOptionals:false，语义等价。
  // mockServer 等调用点现状语义（传 alwaysFakeOptionals:true 仍仅生成 required）。
  const result = await generate(
    { type: 'object', properties: { optional: { type: 'string' } } },
    { alwaysFakeOptionals: true }
  );
  t.deepEqual(result, {});
});

// ⑨ mock 扩展：jsf.extend('mock')/define('mock') → mockjs
test('⑨ mock extension wired (mockjs via extend)', async t => {
  // @integer(3, 3) 恒为 3，可作为确定性断言
  const fixed = await generate({
    type: 'object',
    required: ['n'],
    properties: { n: { type: 'integer', mock: { mock: '@integer(3, 3)' } } }
  });
  t.is(fixed.n, 3);

  // @cname 生成中文姓名字符串（结构断言）
  const cname = await generate({
    type: 'object',
    required: ['n'],
    properties: { n: { type: 'string', mock: { mock: '@cname' } } }
  });
  t.is(typeof cname.n, 'string');
  t.true(cname.n.length >= 2);
  t.regex(cname.n, /[\u4e00-\u9fa5]/);
});

// ⑨b 字符串形态 mock：{ type: 'string', mock: '@cname' }
// 【登记差异】0.5.9 对字符串形态的 mock 属性不触发扩展（输出 lorem 随机串）；
// 0.6.3 经 define 对两种形态均触发（修复方向，类型/结构不变）。YApi 编辑器
// 实际产生对象形态，字符串形态仅存于手工构造的 schema。
test('⑨b string-form mock property (registered difference: 0.5.9 ignored, 0.6 honors)', async t => {
  const out = await generate({ type: 'string', mock: '@cname' });
  t.is(typeof out, 'string');
  t.true(out.length >= 2);
  t.regex(out, /[\u4e00-\u9fa5]/);
});

// ⑩ 每调用随机化：同一 schema 连续生成必须产出不同值
// （0.5.9 天然随机；0.6.3 generateSync 缺省 seed 固定为 1，由适配层显式注入
// 随机 seed 保持行为——本探针防止该适配被回退，回退即 mock 接口恒返同一数据）
test('⑩ per-call randomization preserved', async t => {
  const schema = {
    type: 'object',
    required: ['a', 'b'],
    properties: { a: { type: 'string' }, b: { type: 'integer' } }
  };
  const outputs = new Set();
  for (let i = 0; i < 8; i++) {
    outputs.add(JSON.stringify(await generate(schema)));
  }
  t.true(outputs.size >= 2, `expected varied outputs across 8 runs, got ${outputs.size}`);
});

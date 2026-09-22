/**
 * 批次 2 补充对抗语料（csl-tester 增补）：在 equiv 测试 9 语料之外的等价性补强。
 *
 * 新增语料维度：
 * - emptyKey：空字符串属性名（含 required: [''] 空串必填项）；
 * - longKey：10000 字符超长属性名；
 * - metaCollide：与 schema 元关键字同名的属性（type/properties/required/items/description/mock）；
 * - protoMethods：原型方法名遮蔽属性（hasOwnProperty/valueOf）；
 * - dotKey：含点号与 __proto__ 子串的键名（'a.b'、'x.__proto__.y'）；
 * - unicodeKey：中文 + emoji 组合键名；
 * - symbol 输入语义：Symbol 键在 JSON 契约两侧均不可存在（显式断言两侧输出一致）。
 *
 * 装载与驱动方式与 JsonSchemaEditor.equiv.test.js 相同（@babel/core 仅 commonjs 插件
 * 转译 models/schema.js + 真实 moox store dispatch），归一化规则同 docs §3
 * （N4/N5/N9/N10/P1/P2；N7 空名偏离在该套语料下不适用——空名仅作为既有键存在，
 * 不作为改名目标，改名目标偏离由 equiv 测试偏离② 显式覆盖）。
 */
import test from 'ava';
import path from 'path';
import Module from 'module';
import fs from 'fs';

const u = require('../../../client/components/JsonSchemaEditor/schemaUtils.js');

const OLD_PKG = path.join(__dirname, '..', '..', 'fixtures', 'json-schema-editor-visual');

function loadOldEditorModel() {
  const babelCore = require('@babel/core');
  const commonjs = require('@babel/plugin-transform-modules-commonjs');
  const absPath = path.join(OLD_PKG, 'models', 'schema.js');
  const code = fs.readFileSync(absPath, 'utf8');
  const transpiled = babelCore.transformSync(code, {
    filename: absPath,
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    compact: false
  }).code;
  const m = new Module(absPath, null);
  m.filename = absPath;
  m.paths = Module._nodeModulePaths(path.dirname(absPath));
  m._compile(transpiled, absPath);
  const model = m.exports.default || m.exports;
  if (!model || !model.changeEditorSchemaAction) {
    throw new Error('旧编辑器 models/schema.js 装载失败');
  }
  return model;
}

const oldModel = loadOldEditorModel();
const moox = require('../../../test/fixtures/json-schema-editor-visual/moox-lite.js');

function createOldStore() {
  return moox({ schema: oldModel }).getStore();
}

function oldLoad(store, schemaObj) {
  store.dispatch({
    type: 'moox/schema/changeEditorSchemaAction',
    params: { value: JSON.parse(JSON.stringify(schemaObj)) }
  });
}

function oldAct(store, action, params) {
  store.dispatch({ type: 'moox/schema/' + action, params });
}

function oldOut(store) {
  return JSON.parse(JSON.stringify(store.getState().schema.data));
}

function setRawKey(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
  return target;
}

function baseSchema() {
  return {
    type: 'object',
    title: 'base',
    properties: {
      a: { type: 'string', description: 'A desc' },
      b: { type: 'number', default: 1 },
      obj: { type: 'object', properties: { c: { type: 'string' } }, required: ['c'] },
      arr: { type: 'array', items: { type: 'string' } }
    },
    required: ['a']
  };
}

const LONG_NAME = 'k'.repeat(10000);

const CORPORA2 = [
  {
    name: 'emptyKey-空串键名',
    build: () => {
      const schema = baseSchema();
      setRawKey(schema.properties, '', { type: 'string', description: 'empty name' });
      schema.required.push(''); // 空串必填项
      return schema;
    }
  },
  {
    name: 'longKey-超长键名(10000字符)',
    build: () => {
      const schema = baseSchema();
      setRawKey(schema.properties, LONG_NAME, { type: 'string', description: 'long' });
      schema.required.push(LONG_NAME);
      return schema;
    }
  },
  {
    name: 'metaCollide-元关键字同名属性',
    build: () => {
      const schema = baseSchema();
      schema.properties.type = { type: 'string' };
      schema.properties.properties = { type: 'number' };
      schema.properties.required = { type: 'boolean' };
      schema.properties.items = { type: 'integer' };
      schema.properties.description = { type: 'string' };
      schema.properties.mock = { type: 'string' };
      return schema;
    }
  },
  {
    name: 'protoMethods-原型方法名遮蔽',
    build: () => {
      const schema = baseSchema();
      setRawKey(schema.properties, 'hasOwnProperty', { type: 'string' });
      setRawKey(schema.properties, 'valueOf', { type: 'number' });
      schema.properties.obj.properties.hasOwnProperty = { type: 'string' };
      return schema;
    }
  },
  {
    name: 'dotKey-点号与proto子串键名',
    build: () => {
      const schema = baseSchema();
      schema.properties['a.b'] = { type: 'string' };
      schema.properties['x.__proto__.y'] = { type: 'number' };
      schema.properties['obj.x'] = { type: 'string' };
      return schema;
    }
  },
  {
    name: 'unicodeKey-中英emoji组合键名',
    build: () => {
      const schema = baseSchema();
      schema.properties['字段🚀名称'] = { type: 'string', description: '🚀 描述' };
      schema.properties['名字 with 空格'] = { type: 'number' };
      return schema;
    }
  }
];

const OPS2 = [
  {
    id: 'add-root',
    old: store => oldAct(store, 'addChildFieldAction', { key: ['properties'] }),
    apply: schema => u.addProperty(schema, ['properties'], null)
  },
  {
    id: 'add-sibling-a',
    old: store => oldAct(store, 'addFieldAction', { prefix: ['properties'], name: 'a' }),
    apply: schema => u.addProperty(schema, ['properties'], 'a')
  },
  {
    id: 'add-child-obj',
    old: store => oldAct(store, 'addChildFieldAction', { key: ['properties', 'obj', 'properties'] }),
    apply: schema => u.addProperty(schema, ['properties', 'obj', 'properties'], null)
  },
  {
    id: 'delete-a',
    old: store => {
      oldAct(store, 'deleteItemAction', { key: ['properties', 'a'] });
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'a', required: false });
    },
    apply: schema => u.removeProperty(schema, ['properties', 'a'])
  },
  {
    id: 'rename-a-to-a2',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'a2', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'a2')
  },
  {
    id: 'rename-a-to-existing-b',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'b', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'b')
  },
  {
    id: 'rename-a-to-constructor',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'constructor', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'constructor')
  },
  {
    id: 'type-switch-a-array',
    old: store =>
      oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'array' }),
    apply: schema => u.changeNodeType(schema, ['properties', 'a'], 'array'),
    newOpts: () => ({ typeSwitchPath: ['properties', 'a'] })
  },
  {
    id: 'type-switch-a-object',
    old: store =>
      oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'object' }),
    apply: schema => u.changeNodeType(schema, ['properties', 'a'], 'object'),
    newOpts: () => ({ typeSwitchPath: ['properties', 'a'] })
  },
  {
    id: 'type-switch-root-array',
    old: store => oldAct(store, 'changeTypeAction', { key: ['type'], value: 'array' }),
    apply: schema => u.changeNodeType(schema, [], 'array'),
    newOpts: () => ({ typeSwitchPath: [] })
  },
  {
    id: 'require-off-a',
    old: store =>
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'a', required: false }),
    apply: schema => u.toggleRequired(schema, ['properties', 'a'], false),
    newOpts: () => ({ requiredRemove: { ownerPath: [], name: 'a' } })
  },
  {
    id: 'require-on-b',
    old: store =>
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'b', required: true }),
    apply: schema => u.toggleRequired(schema, ['properties', 'b'], true)
  },
  {
    id: 'mock-set-a',
    old: store =>
      oldAct(store, 'changeValueAction', {
        key: ['properties', 'a', 'mock'],
        value: { mock: '@name' }
      }),
    apply: schema => u.setMock(schema, ['properties', 'a'], '@name')
  },
  {
    id: 'mock-clear-a',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'mock'], value: '' }),
    apply: schema => u.setMock(schema, ['properties', 'a'], '')
  },
  {
    id: 'desc-set-a',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'description'], value: 'x' }),
    apply: schema => u.setNodeField(schema, ['properties', 'a'], 'description', 'x')
  },
  {
    id: 'desc-clear-a',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'description'], value: '' }),
    apply: schema => u.setNodeField(schema, ['properties', 'a'], 'description', '')
  },
  {
    id: 'default-string-b',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: '42' }),
    apply: schema => u.setNodeField(schema, ['properties', 'b'], 'default', '42')
  },
  {
    id: 'default-false-b-N5',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: false }),
    apply: schema => u.setNodeField(schema, ['properties', 'b'], 'default', false),
    newOpts: () => ({ falsyDelete: { path: ['properties', 'b'], field: 'default' } })
  },
  {
    id: 'move-up-b',
    old: () => {},
    apply: schema => u.moveProperty(schema, ['properties', 'b'], 'up')
  },
  {
    id: 'move-down-a',
    old: () => {},
    apply: schema => u.moveProperty(schema, ['properties', 'a'], 'down')
  }
];

// ---- 归一化（与 equiv 测试 docs §3 同规则） ----

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function samePath(x, y) {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function normalize(schemaIn, opts) {
  const o = opts || {};
  const root = JSON.parse(JSON.stringify(schemaIn));

  function walk(node, nodePath) {
    if (!isPlain(node)) {
      return;
    }
    if (o.newSide && o.typeSwitchPath && samePath(nodePath, o.typeSwitchPath)) {
      Object.keys(node).forEach(key => {
        if (['type', 'description', 'properties', 'items'].indexOf(key) === -1) {
          delete node[key];
        }
      });
    }
    if (
      o.newSide &&
      o.falsyDelete &&
      samePath(nodePath, o.falsyDelete.path) &&
      Object.prototype.hasOwnProperty.call(node, o.falsyDelete.field)
    ) {
      delete node[o.falsyDelete.field];
    }
    if (isPlain(node.properties)) {
      const props = node.properties;
      if (
        o.requiredRemove &&
        samePath(nodePath, o.requiredRemove.ownerPath) &&
        Array.isArray(node.required)
      ) {
        node.required = node.required.filter(name => name !== o.requiredRemove.name);
      }
      if (Object.getOwnPropertyDescriptor(props, '__proto__')) {
        delete props.__proto__;
      }
      const renameMap = {};
      let seq = 0;
      Object.keys(props).forEach(key => {
        if (/^field_\d+$/.test(key)) {
          seq += 1;
          const nextName = 'field_' + seq;
          if (nextName !== key) {
            setRawKey(props, nextName, props[key]);
            delete props[key];
            renameMap[key] = nextName;
          }
        }
      });
      if (Array.isArray(node.required)) {
        const names = Object.keys(props);
        const mapped = node.required.map(name =>
          renameMap[name] !== undefined ? renameMap[name] : name
        );
        const kept = mapped.filter(name => names.indexOf(name) !== -1);
        const uniq = kept.filter((name, i) => kept.indexOf(name) === i);
        if (uniq.length > 0) {
          node.required = uniq;
        } else {
          delete node.required;
        }
      }
      Object.keys(props).forEach(key => {
        walk(props[key], nodePath.concat(['properties', key]));
      });
    }
    if (isPlain(node.items)) {
      walk(node.items, nodePath.concat(['items']));
    }
  }

  walk(root, []);
  return root;
}

// ---- 矩阵主测试：补充语料 × 操作 ----

CORPORA2.forEach(corpus => {
  test.serial(
    `补充语料等价: [${corpus.name}] × ${OPS2.length} 类操作，旧动作链 vs 新 schemaUtils 归一化后 deepEqual`,
    t => {
      OPS2.forEach(op => {
        const source = corpus.build();

        const store = createOldStore();
        oldLoad(store, source);
        op.old(store);
        const fromOld = oldOut(store);

        const nextSchema = op.apply(u.parseSchema(JSON.parse(JSON.stringify(source))));
        const fromNew = JSON.parse(u.stringifySchema(nextSchema));

        const opts = op.newOpts ? op.newOpts() : {};
        const normOld = normalize(fromOld, { oldSide: true, ...opts });
        const normNew = normalize(fromNew, { newSide: true, ...opts });
        t.deepEqual(normNew, normOld, `语料[${corpus.name}] × 操作[${op.id}]`);
      });
    }
  );
});

// ---- 补充显式断言 ----

test.serial('补充: symbol 键输入——JSON 契约两侧均不可承载，输出一致（symbol 不入契约）', t => {
  const source = baseSchema();
  const sym = Symbol('ghost');
  source.properties[sym] = { type: 'string', description: 'symbol node' };

  // 旧链：装载前 JSON 克隆（与组件 data prop 为 JSON 字符串的生产形态一致），symbol 不可存活
  const store = createOldStore();
  oldLoad(store, source);
  const fromOld = oldOut(store);
  const fromNew = JSON.parse(u.stringifySchema(u.parseSchema(JSON.parse(JSON.stringify(source)))));

  t.deepEqual(fromNew, fromOld, 'symbol 键在两侧均被 JSON 契约丢弃，其余字段一致');
  t.is(Object.keys(fromOld.properties).length, 4, '旧侧仅剩 4 个字符串键');
});

test.serial('补充: metaCollide 语料改名目标为元关键字——双侧守卫一致拒改（已有同名属性）', t => {
  const source = CORPORA2[2].build();

  const store = createOldStore();
  oldLoad(store, source);
  oldAct(store, 'changeNameAction', { value: 'properties', prefix: ['properties'], name: 'a' });
  const fromOld = oldOut(store);
  t.true(Object.prototype.hasOwnProperty.call(fromOld.properties, 'a'), '旧拒改：a 保留');
  t.is(fromOld.properties.properties.type, 'number', '旧：同名 properties 属性未被覆盖');

  const result = u.renameProperty(
    u.parseSchema(JSON.parse(JSON.stringify(source))),
    ['properties', 'a'],
    'properties'
  );
  t.is(result.properties.a.type, 'string', '新拒改：a 保留');
  t.is(result.properties.properties.type, 'number', '新：同名属性未被覆盖');
  t.deepEqual(
    Object.keys(JSON.parse(u.stringifySchema(result)).properties),
    Object.keys(fromOld.properties),
    '双侧键集一致'
  );
});

test.serial('补充: emptyKey 语料 parse/stringify 往返零丢失，required 空串项保留', t => {
  const source = CORPORA2[0].build();
  const out = JSON.parse(u.stringifySchema(u.parseSchema(JSON.parse(JSON.stringify(source)))));
  t.true(Object.prototype.hasOwnProperty.call(out.properties, ''), '空串键保留');
  t.true(out.required.indexOf('') !== -1, '空串必填项保留');
  t.is(out.properties[''].description, 'empty name');
});

test.serial('补充偏离N9c: 旧 field_N 计数器与用户已有 field_N 碰撞时覆写用户数据，新空闲槽位保全（旧毁数据，显式固化）', t => {
  // 旧 fieldNum 为模块级计数器（进程内跨 store 累计，值依赖执行顺序），
  // 故预置 field_1..field_1000 大区间用户数据，对计数器任意落点 c 均确定性成立：
  // 旧侧追加字段落名 field_c 时覆写同名用户属性；新侧取首个空闲槽位 field_1001。
  const source = { type: 'object', properties: {}, required: [] };
  for (let i = 1; i <= 1000; i++) {
    setRawKey(source.properties, 'field_' + i, { type: 'string', description: 'user data ' + i });
  }

  const store = createOldStore();
  oldLoad(store, source);
  oldAct(store, 'addChildFieldAction', { key: ['properties'] });
  const fromOld = oldOut(store);
  t.is(Object.keys(fromOld.properties).length, 1000, '旧：无新键产生（落名与用户键碰撞覆写）');
  const clobbered = Object.keys(fromOld.properties).filter(
    name => Object.keys(fromOld.properties[name]).length === 1
  );
  t.is(clobbered.length, 1, '旧：恰一个用户属性被毁');
  t.deepEqual(
    fromOld.properties[clobbered[0]],
    { type: 'string' },
    '旧：被碰撞用户属性内容毁为默认节点（毁数据）'
  );
  t.deepEqual(fromOld.required, [clobbered[0]], '旧：required 记录落名');

  const next = u.addProperty(u.parseSchema(JSON.parse(JSON.stringify(source))), ['properties'], null);
  const fromNew = JSON.parse(u.stringifySchema(next));
  t.is(Object.keys(fromNew.properties).length, 1001, '新：1000 用户属性 + 1 新增');
  t.is(Object.keys(fromNew.properties).indexOf('field_1001'), 1000, '新：空闲槽位 field_1001 追加末尾');
  t.deepEqual(
    fromNew.properties.field_1,
    { type: 'string', description: 'user data 1' },
    '新：用户数据零丢失'
  );
  const intact = Object.keys(fromNew.properties).filter(
    name => fromNew.properties[name].description === 'user data ' + Number(name.slice(6))
  );
  t.is(intact.length, 1000, '新：全部 1000 个用户属性内容完好');
  t.deepEqual(fromNew.required, ['field_1001'], '新：required 仅记录新字段');
});

test.serial('补充PO: protoKeys 语料经新侧 move/rename/remove 后 __proto__ 数据键仍保全（P1 归一化的新侧事实核验）', t => {
  const source = CORPORA2_META().protoSource;

  // move：buildObject 重建不丢自有数据键
  let schema = u.moveProperty(u.parseSchema(JSON.parse(JSON.stringify(source))), ['properties', 'a'], 'down');
  let out = JSON.parse(u.stringifySchema(schema));
  t.true(Object.prototype.hasOwnProperty.call(out.properties, '__proto__'), 'move 后 __proto__ 保全');
  t.is(out.properties.__proto__.description, 'proto node');

  // rename 兄弟字段：CreateDataProperty 重建
  schema = u.renameProperty(u.parseSchema(JSON.parse(JSON.stringify(source))), ['properties', 'a'], 'a2');
  out = JSON.parse(u.stringifySchema(schema));
  t.true(Object.prototype.hasOwnProperty.call(out.properties, '__proto__'), 'rename 兄弟后 __proto__ 保全');
  t.is(Object.getPrototypeOf(schema.properties), Object.prototype, 'rename 目标对象原型未被偷换');

  // remove 兄弟字段
  schema = u.removeProperty(u.parseSchema(JSON.parse(JSON.stringify(source))), ['properties', 'b']);
  out = JSON.parse(u.stringifySchema(schema));
  t.true(Object.prototype.hasOwnProperty.call(out.properties, '__proto__'), 'remove 兄弟后 __proto__ 保全');
  t.is(out.properties.__proto__.description, 'proto node');
});

/** protoKeys 专属语料（__proto__ 以自有数据键存在） */
function protoSource() {
  const schema = baseSchema();
  setRawKey(schema.properties, '__proto__', { type: 'string', description: 'proto node' });
  return schema;
}
function CORPORA2_META() {
  return { protoSource: protoSource() };
}

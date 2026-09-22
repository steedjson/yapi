/**
 * 批次 2：新旧 JSON Schema 编辑器往返等价测试。
 *
 * 证明：同一 schema 输入，经「旧编辑器动作链（json-schema-editor-visual 真实 moox store）」
 * 与「新 schemaUtils 动作链」执行等价操作序列后，字段级 deepEqual
 * （差异仅限 docs/json-schema-editor-equiv-map.md §3 已声明的方向性偏离，
 * 每处归一化以 N 系列或 P 系列编号显式注明）。
 *
 * 旧编辑器装载方式（可 require 性结论，见对照文档 §1）：
 * - models/schema.js 为 CJS/ESM 混排但无 JSX → @babel/core(仅 commonjs 插件) 转译后
 *   经 Module._compile 以原路径求值；
 * - 以 moox-lite 夹具（应用自带 immer 10 produce，语义对齐真实 moox）创建 store，
 *   store.dispatch({type: 'moox/schema/<action>', params}) 驱动，与生产链路同构。
 */
import test from 'ava';
import path from 'path';
import Module from 'module';
import fs from 'fs';

const u = require('../../../client/components/JsonSchemaEditor/schemaUtils.js');
const { MOCK_SOURCE } = require('../../../client/constants/variable.js');

// ================= 旧编辑器动作链装载 =================

const OLD_PKG = path.join(__dirname, '..', '..', 'fixtures', 'json-schema-editor-visual');

/** 转译并求值 models/schema.js（进程内仅一次；后续直接复用动作对象） */
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

/** 等价旧组件 componentWillMount / data prop 变化：changeEditorSchemaAction 装载（deep clone 防语料共享） */
function oldLoad(store, schemaObj) {
  store.dispatch({
    type: 'moox/schema/changeEditorSchemaAction',
    params: { value: JSON.parse(JSON.stringify(schemaObj)) }
  });
}

function oldAct(store, action, params) {
  store.dispatch({ type: 'moox/schema/' + action, params });
}

/** 旧链输出：JSON.stringify(state.schema.data)（与旧组件 onChange 同形态），返回解析对象 */
function oldOut(store) {
  return JSON.parse(JSON.stringify(store.getState().schema.data));
}

// ================= 对抗语料（评审批次 2 指定全量覆盖） =================

/** 以 CreateDataProperty 语义写入语料的任意键名（__proto__ 等） */
function setRawKey(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
  return target;
}

/** 公共基底：全部语料共享 a/b/obj/arr 四字段，保证每类操作对每条语料均可施加 */
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

const CORPORA = [
  {
    name: 'plain-基线',
    build: () => baseSchema()
  },
  {
    name: 'protoKeys-原型敏感键',
    build: () => {
      const schema = baseSchema();
      const props = schema.properties;
      // __proto__ 以自有数据键存在（JSON.parse 形态）；constructor/toString 为普通遮蔽键
      setRawKey(props, '__proto__', { type: 'string', description: 'proto node' });
      setRawKey(props, 'constructor', { type: 'string' });
      setRawKey(props, 'toString', { type: 'string' });
      return schema;
    }
  },
  {
    name: 'legacyMock-字符串形态旧mock',
    build: () => {
      const schema = baseSchema();
      schema.properties.a.mock = '@raw-string';
      schema.properties.b.mock = { mock: '@integer(1,5)' };
      schema.properties.obj.properties.c.mock = '@natural';
      return schema;
    }
  },
  {
    name: 'defaults-数字布尔default',
    build: () => {
      const schema = baseSchema();
      schema.properties.a.default = 42;
      schema.properties.b.default = true;
      schema.properties.obj.properties.c.default = '';
      schema.properties.arr.default = null;
      return schema;
    }
  },
  {
    name: 'schemaKeywords-透传保留字',
    build: () => {
      const schema = baseSchema();
      schema.$schema = 'http://json-schema.org/draft-04/schema#';
      schema.$id = 'urn:legacy:api';
      schema.$comment = 'root comment';
      schema.properties.a.$comment = 'field comment';
      return schema;
    }
  },
  {
    name: 'itemsUnknown-items内未知键',
    build: () => {
      const schema = baseSchema();
      schema.properties.arr.items = {
        type: 'string',
        unknownInItems: '$ref-like',
        $comment: 'keep me'
      };
      schema.properties.obj.properties.c = {
        type: 'array',
        items: { type: 'object', properties: { deep: { type: 'string' } }, unknownDeep: 1 }
      };
      return schema;
    }
  },
  {
    name: 'deepNesting-超深嵌套',
    build: () => {
      const schema = baseSchema();
      // root→obj→l1→l2→l3→l4→l5 共 6 层 properties 链（≥5 层）
      schema.properties.obj = {
        type: 'object',
        properties: {
          l1: {
            type: 'object',
            properties: {
              l2: {
                type: 'object',
                properties: {
                  l3: {
                    type: 'object',
                    properties: {
                      l4: {
                        type: 'object',
                        properties: { l5: { type: 'string', mock: { mock: '@name' } } },
                        required: ['l5']
                      }
                    },
                    required: ['l4']
                  }
                },
                required: ['l3']
              }
            },
            required: ['l2']
          }
        },
        required: ['l1']
      };
      // 数组嵌数组（items 链 3 层）
      schema.properties.arr.items = {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } }
      };
      return schema;
    }
  },
  {
    name: 'enumEnumDesc-枚举与说明',
    build: () => {
      const schema = baseSchema();
      schema.properties.a.enum = ['a', 1, null];
      schema.properties.a.enumDesc = 'a 是甲, 1 是乙, 空是丙';
      schema.properties.a.format = 'ipv4';
      schema.properties.b.enum = [true, false];
      schema.properties.b.enumDesc = 'true 是, false 否';
      return schema;
    }
  },
  {
    name: 'dirtyRequired-重名悬挂与空properties',
    build: () => {
      const schema = baseSchema();
      schema.required = ['a', 'a', 'ghost', 'b']; // 重复项 + 悬挂项
      schema.properties.obj.required = ['c', 'ghost2'];
      schema.properties.obj.properties = {}; // 空 properties（add-child 操作的空表起点）
      return schema;
    }
  }
];

// ================= 方向性偏离归一化（对照文档 §3 逐条编号） =================

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function samePath(x, y) {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * 对输出 schema 做归一化（原地），使已声明偏离不再影响 deepEqual。
 * @param {any} schemaIn 输出（deep clone 后处理）
 * @param {Object} opts
 * @param {boolean} [opts.newSide] 是否新链输出（N4/N5 仅作用于新侧）
 * @param {string[]} [opts.typeSwitchPath] N4：类型切换操作的节点路径——新侧该节点仅保留 type/description/properties/items
 * @param {{path: string[], field: string}} [opts.falsyDelete] N5：falsy 写入操作——新侧删除该字段（旧已删）
 * @param {{ownerPath: string[], name: string}} [opts.requiredRemove] N10：必填取消操作——双侧
 *   required 全量剔除该名字（旧 enableRequire 只 splice 首个匹配，脏重复项残留悬挂）
 * @returns {any} 归一化后的 schema
 */
function normalize(schemaIn, opts) {
  const o = opts || {};
  const root = JSON.parse(JSON.stringify(schemaIn));

  /**
   * @param {any} node
   * @param {string[]} nodePath
   * @returns {void}
   */
  function walk(node, nodePath) {
    if (!isPlain(node)) {
      return;
    }
    // N4（偏离①）：类型切换——旧仅保留 description；新保留全部非结构字段。
    // 归一化：新侧被切节点仅保留 type/description/properties/items（required 双方均丢弃，天然一致）。
    if (o.newSide && o.typeSwitchPath && samePath(nodePath, o.typeSwitchPath)) {
      Object.keys(node).forEach(key => {
        if (['type', 'description', 'properties', 'items'].indexOf(key) === -1) {
          delete node[key];
        }
      });
    }
    // N5（偏离③）：falsy 字段写入——旧全删；新保留 false/0。
    // 归一化：新侧删除该字段再比对（新实现的保留行为另由 D3 显式固化）。
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
      // N10（旧实现毁数据）：取消必填时旧 enableRequire 只 splice 首个匹配，脏 required
      // 重复项残留悬挂；新实现按名全量过滤。归一化：双侧 required 全量剔除该名字。
      if (
        o.requiredRemove &&
        samePath(nodePath, o.requiredRemove.ownerPath) &&
        Array.isArray(node.required)
      ) {
        node.required = node.required.filter(name => name !== o.requiredRemove.name);
      }
      // P1（旧实现毁数据）：properties 重建类动作在旧链命中 __proto__ 原型存取器丢键；
      // 新链 CreateDataProperty 保全。归一化：双侧剥离 __proto__ 键。
      if (Object.getOwnPropertyDescriptor(props, '__proto__')) {
        delete props.__proto__;
      }
      // N9（实现细节）：新增字段名——旧为模块级自增计数器，新为首空闲槽位，均为 field_N 形态。
      // 归一化：每个 properties 作用域内按出现顺序重编号为 field_1..n，required 同步映射。
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
      // P2（旧实现毁数据）：旧 enableRequire 只 splice 首个匹配，required 可能留悬挂/重复项；
      // 新实现按名全量过滤。归一化：required 映射 N9 改名后，剔除指向不存在属性名的悬挂项并去重；
      // 清空后删键（对齐双侧的空 required 删键行为）。
      if (Array.isArray(node.required)) {
        const names = Object.keys(props);
        const mapped = node.required.map(name => (renameMap[name] !== undefined ? renameMap[name] : name));
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

// ================= 操作矩阵（旧动作链 ↔ 新 schemaUtils 一一对应） =================

const OPS = [
  {
    id: 'add-root-根级追加',
    old: store => oldAct(store, 'addChildFieldAction', { key: ['properties'] }),
    apply: schema => u.addProperty(schema, ['properties'], null)
  },
  {
    id: 'add-sibling-a-锚点后插入兄弟',
    old: store => oldAct(store, 'addFieldAction', { prefix: ['properties'], name: 'a' }),
    apply: schema => u.addProperty(schema, ['properties'], 'a')
  },
  {
    id: 'add-child-obj-object加子级',
    old: store => oldAct(store, 'addChildFieldAction', { key: ['properties', 'obj', 'properties'] }),
    apply: schema => u.addProperty(schema, ['properties', 'obj', 'properties'], null)
  },
  {
    id: 'delete-a-删除字段含required清理',
    old: store => {
      // 对齐旧组件 handleDeleteItem 的两连发：deleteItemAction + enableRequireAction(false)
      oldAct(store, 'deleteItemAction', { key: ['properties', 'a'] });
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'a', required: false });
    },
    apply: schema => u.removeProperty(schema, ['properties', 'a'])
  },
  {
    id: 'delete-obj-删除带子节点字段',
    old: store => {
      oldAct(store, 'deleteItemAction', { key: ['properties', 'obj'] });
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'obj', required: false });
    },
    apply: schema => u.removeProperty(schema, ['properties', 'obj'])
  },
  {
    id: 'rename-a-重命名',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'a2', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'a2')
  },
  {
    id: 'rename-to-existing-重名拒改',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'b', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'b')
  },
  {
    id: 'rename-to-constructor-遮蔽键改名',
    old: store =>
      oldAct(store, 'changeNameAction', { value: 'constructor', prefix: ['properties'], name: 'a' }),
    apply: schema => u.renameProperty(schema, ['properties', 'a'], 'constructor')
  },
  {
    id: 'type-switch-a-array-类型切换',
    old: store =>
      oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'array' }),
    apply: schema => u.changeNodeType(schema, ['properties', 'a'], 'array'),
    newOpts: () => ({ typeSwitchPath: ['properties', 'a'] })
  },
  {
    id: 'type-switch-a-object-类型切换',
    old: store =>
      oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'object' }),
    apply: schema => u.changeNodeType(schema, ['properties', 'a'], 'object'),
    newOpts: () => ({ typeSwitchPath: ['properties', 'a'] })
  },
  {
    id: 'type-switch-root-根类型切换',
    old: store => oldAct(store, 'changeTypeAction', { key: ['type'], value: 'array' }),
    apply: schema => u.changeNodeType(schema, [], 'array'),
    newOpts: () => ({ typeSwitchPath: [] })
  },
  {
    id: 'require-off-a-取消必填',
    old: store =>
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'a', required: false }),
    apply: schema => u.toggleRequired(schema, ['properties', 'a'], false),
    newOpts: () => ({ requiredRemove: { ownerPath: [], name: 'a' } })
  },
  {
    id: 'require-on-b-勾选必填',
    old: store =>
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'b', required: true }),
    apply: schema => u.toggleRequired(schema, ['properties', 'b'], true)
  },
  {
    id: 'require-off-absent-未勾选再取消no-op',
    old: store =>
      oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'arr', required: false }),
    apply: schema => u.toggleRequired(schema, ['properties', 'arr'], false),
    newOpts: () => ({ requiredRemove: { ownerPath: [], name: 'arr' } })
  },
  {
    id: 'mock-set-a-mock写入',
    old: store =>
      oldAct(store, 'changeValueAction', {
        key: ['properties', 'a', 'mock'],
        value: { mock: '@name' }
      }),
    apply: schema => u.setMock(schema, ['properties', 'a'], '@name')
  },
  {
    id: 'mock-clear-a-mock清空',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'mock'], value: '' }),
    apply: schema => u.setMock(schema, ['properties', 'a'], '')
  },
  {
    id: 'mock-replace-stringform-字符串形态mock覆写',
    old: store =>
      oldAct(store, 'changeValueAction', {
        key: ['properties', 'a', 'mock'],
        value: { mock: '@cname' }
      }),
    apply: schema => u.setMock(schema, ['properties', 'a'], '@cname')
  },
  {
    id: 'desc-set-a-描述写入',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'description'], value: 'x desc' }),
    apply: schema => u.setNodeField(schema, ['properties', 'a'], 'description', 'x desc')
  },
  {
    id: 'desc-clear-a-空串清描述',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'description'], value: '' }),
    apply: schema => u.setNodeField(schema, ['properties', 'a'], 'description', '')
  },
  {
    id: 'default-set-string-b-字符串default',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: '42' }),
    apply: schema => u.setNodeField(schema, ['properties', 'b'], 'default', '42')
  },
  {
    id: 'default-false-b-falsy偏离N5',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: false }),
    apply: schema => u.setNodeField(schema, ['properties', 'b'], 'default', false),
    newOpts: () => ({ falsyDelete: { path: ['properties', 'b'], field: 'default' } })
  },
  {
    id: 'default-zero-b-falsy偏离N5',
    old: store =>
      oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: 0 }),
    apply: schema => u.setNodeField(schema, ['properties', 'b'], 'default', 0),
    newOpts: () => ({ falsyDelete: { path: ['properties', 'b'], field: 'default' } })
  },
  {
    id: 'move-up-b-新增能力N偏离④',
    // 旧编辑器无 move 能力：旧链不执行任何操作，验证新 move 内容零丢失（deepEqual 序无关）
    old: () => {},
    apply: schema => u.moveProperty(schema, ['properties', 'b'], 'up')
  },
  {
    id: 'move-down-a-新增能力N偏离④',
    old: () => {},
    apply: schema => u.moveProperty(schema, ['properties', 'a'], 'down')
  }
];

// ================= 矩阵主测试：语料 × 操作 =================

CORPORA.forEach(corpus => {
  test.serial(
    `往返等价: 语料[${corpus.name}] × ${OPS.length} 类操作，旧动作链 vs 新 schemaUtils 归一化后字段级 deepEqual`,
    t => {
      OPS.forEach(op => {
        const source = corpus.build();

        // 旧链：真实 moox store 装载 + 动作
        const store = createOldStore();
        oldLoad(store, source);
        op.old(store);
        const fromOld = oldOut(store);

        // 新链：parseSchema 装载 + 纯函数操作
        const nextSchema = op.apply(u.parseSchema(JSON.parse(JSON.stringify(source))));
        const fromNew = JSON.parse(u.stringifySchema(nextSchema));

        // 归一化（N 系列与 P 系列逐条注明于 normalize/OPS），双侧 deepEqual
        const opts = op.newOpts ? op.newOpts() : {};
        const normOld = normalize(fromOld, { oldSide: true, ...opts });
        const normNew = normalize(fromNew, { newSide: true, ...opts });
        t.deepEqual(normNew, normOld, `语料[${corpus.name}] × 操作[${op.id}]`);
      });
    }
  );
});

// ================= 偏离点显式断言（不做归一化强等） =================

test.serial('偏离⑤: 旧组件空 data 初始态注入 title empty object，新 parseSchema 空串不写', t => {
  // 旧 App.componentWillMount: 空 data → 注入 {"type":"object","title":"empty object",...}
  const store = createOldStore();
  oldLoad(store, { type: 'object', title: 'empty object', properties: {} });
  const fromOld = oldOut(store);
  t.is(fromOld.title, 'empty object', '旧初始态带 empty object 标题');

  const fromNew = JSON.parse(u.stringifySchema(u.parseSchema('')));
  t.is(fromNew.title, undefined, '新空态不写 title');
  // N2 归一化（剥根 title === 'empty object'）后相等
  delete fromOld.title;
  t.deepEqual(fromNew, fromOld, '归一化后空态结构一致');
});

test.serial('偏离②: 空名改键——旧接受并产生空键与 required 副作用，新拒改原样返回', t => {
  const source = baseSchema();

  const store = createOldStore();
  oldLoad(store, source);
  oldAct(store, 'changeNameAction', { value: '', prefix: ['properties'], name: 'a' });
  const fromOld = oldOut(store);
  t.true(Object.prototype.hasOwnProperty.call(fromOld.properties, ''), '旧产生空字符串键');
  t.is(fromOld.properties.a, undefined, '旧原键移除');
  t.deepEqual(fromOld.required, [''], '旧 required 同步映射为空串项');

  const schema = u.parseSchema(JSON.parse(JSON.stringify(source)));
  const result = u.renameProperty(schema, ['properties', 'a'], '');
  t.is(result, schema, '新拒改：原引用原样返回（组件据此跳过 onChange）');
  t.true(Object.prototype.hasOwnProperty.call(result.properties, 'a'), '新键集不变');
});

test.serial('偏离③: falsy 写入——旧 default:false/0 整键删除，新保留合法 falsy 值', t => {
  const store = createOldStore();
  oldLoad(store, baseSchema());
  oldAct(store, 'changeValueAction', { key: ['properties', 'b', 'default'], value: false });
  oldAct(store, 'changeValueAction', { key: ['properties', 'a', 'default'], value: 0 });
  const fromOld = oldOut(store);
  t.is(fromOld.properties.b.default, undefined, '旧删 default:false');
  t.is(fromOld.properties.a.default, undefined, '旧删 default:0');

  let schema = u.parseSchema(JSON.parse(JSON.stringify(baseSchema())));
  schema = u.setNodeField(schema, ['properties', 'b'], 'default', false);
  schema = u.setNodeField(schema, ['properties', 'a'], 'default', 0);
  const fromNew = JSON.parse(u.stringifySchema(schema));
  t.is(fromNew.properties.b.default, false, '新保留 default:false');
  t.is(fromNew.properties.a.default, 0, '新保留 default:0');
});

test.serial('偏离①: 类型切换——旧仅保留 description，新保留全部非结构字段（新更保守）', t => {
  const rich = baseSchema();
  rich.properties.a.title = '标题';
  rich.properties.a.mock = { mock: '@name' };
  rich.properties.a.enum = ['x'];
  rich.properties.a.default = 'd';
  rich.properties.a.customExt = { keep: true };

  const store = createOldStore();
  oldLoad(store, rich);
  oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'number' });
  const aOld = oldOut(store).properties.a;
  t.deepEqual(aOld, { type: 'number', description: 'A desc' }, '旧仅剩 type+description');

  let schema = u.parseSchema(JSON.parse(JSON.stringify(rich)));
  schema = u.changeNodeType(schema, ['properties', 'a'], 'number');
  const aNew = JSON.parse(u.stringifySchema(schema)).properties.a;
  t.is(aNew.title, '标题', '新保留 title');
  t.deepEqual(aNew.mock, { mock: '@name' }, '新保留 mock');
  t.deepEqual(aNew.enum, ['x'], '新保留 enum');
  t.is(aNew.default, 'd', '新保留 default');
  t.deepEqual(aNew.customExt, { keep: true }, '新保留未知字段');
  t.is(aNew.description, 'A desc', '新保留 description');
});

test.serial('旧独有: requireAllAction 根复选框全必填/清空（新无对应入口，仅记录语义）', t => {
  const source = baseSchema();
  const store = createOldStore();
  oldLoad(store, source);
  oldAct(store, 'requireAllAction', { required: true, value: JSON.parse(JSON.stringify(source)) });
  const on = oldOut(store);
  t.deepEqual(on.required, ['a', 'b', 'obj', 'arr'], '根 required = 全部字段名');
  t.deepEqual(on.properties.obj.required, ['c'], '嵌套 object 递归全必填');

  oldAct(store, 'requireAllAction', { required: false, value: JSON.parse(JSON.stringify(source)) });
  const off = oldOut(store);
  t.is(off.required, undefined, '清空后根 required 删键');
  t.is(off.properties.obj.required, undefined, '清空后嵌套 required 删键');
});

// ================= __proto__ 语料特殊性（对照文档 §3-P1 的正向固化） =================

test.serial('PO: __proto__ 语料未触碰时双侧 JSON 往返均保全；兄弟重建时旧丢键、新保全', t => {
  const source = CORPORA[1].build();

  // PO1 旧链装载→stringify（未触碰）：__proto__ 自有数据键保全
  const store = createOldStore();
  oldLoad(store, source);
  const untouchedOld = oldOut(store);
  t.true(
    Object.prototype.hasOwnProperty.call(untouchedOld.properties, '__proto__'),
    '旧链 JSON.stringify 保全未触碰的 __proto__'
  );
  t.is(untouchedOld.properties.__proto__.description, 'proto node');

  // PO2 新链 parse→stringify：同保全
  const untouchedNew = JSON.parse(u.stringifySchema(u.parseSchema(JSON.parse(JSON.stringify(source)))));
  t.true(
    Object.prototype.hasOwnProperty.call(untouchedNew.properties, '__proto__'),
    '新链 CreateDataProperty 保全 __proto__'
  );
  t.is(untouchedNew.properties.__proto__.description, 'proto node');

  // PO3 旧链兄弟新增（properties 重建）：__proto__ 键被原型存取器吞掉（旧实现毁数据行为）
  oldAct(store, 'addChildFieldAction', { key: ['properties'] });
  const rebuiltOld = oldOut(store);
  t.false(
    Object.prototype.hasOwnProperty.call(rebuiltOld.properties, '__proto__'),
    '旧链重建后 __proto__ 丢失（毁数据，P1 归一化的前提）'
  );
  t.is(Object.getPrototypeOf(rebuiltOld.properties), Object.prototype, '重建对象原型恢复正常');

  // PO4 新链兄弟新增：__proto__ 保全
  const afterAdd = u.addProperty(
    u.parseSchema(JSON.parse(JSON.stringify(source))),
    ['properties'],
    null
  );
  const rebuiltNew = JSON.parse(u.stringifySchema(afterAdd));
  t.true(
    Object.prototype.hasOwnProperty.call(rebuiltNew.properties, '__proto__'),
    '新链重建后 __proto__ 保全'
  );
  t.is(rebuiltNew.properties.__proto__.description, 'proto node');
});

test.serial('偏离N6: 改名目标 __proto__——旧误判重名拒改，新按自有键判定正常改名', t => {
  const source = baseSchema();

  const store = createOldStore();
  oldLoad(store, source);
  oldAct(store, 'changeNameAction', { value: '__proto__', prefix: ['properties'], name: 'a' });
  const fromOld = oldOut(store);
  // 旧守卫 propertiesData['__proto__'] 读到 Object.prototype（typeof 'object'）→ 误判重名 no-op
  t.true(Object.prototype.hasOwnProperty.call(fromOld.properties, 'a'), '旧拒改：a 键不变');
  t.false(Object.prototype.hasOwnProperty.call(fromOld.properties, '__proto__'), '旧未产生该键');

  const result = u.renameProperty(u.parseSchema(JSON.parse(JSON.stringify(source))), ['properties', 'a'], '__proto__');
  t.true(
    Object.prototype.hasOwnProperty.call(result.properties, '__proto__'),
    '新按自有键判定为空闲名，CreateDataProperty 正常改名'
  );
  t.is(Object.getOwnPropertyDescriptor(result.properties, '__proto__').value.description, 'A desc');
  t.is(Object.getPrototypeOf(result.properties), Object.prototype, '原型未被偷换');
  t.false(Object.prototype.hasOwnProperty.call(result.properties, 'a'), '旧键移除');
});

// ================= 新增能力④: move 内容零丢失 + 键序交换 =================

test.serial('偏离④: 新 move 上下移仅交换键序，内容零丢失（旧无此能力，矩阵已验证内容等价）', t => {
  let schema = u.parseSchema(JSON.parse(JSON.stringify(baseSchema())));
  const before = JSON.parse(u.stringifySchema(schema));

  schema = u.moveProperty(schema, ['properties', 'b'], 'up');
  let out = JSON.parse(u.stringifySchema(schema));
  t.deepEqual(Object.keys(out.properties), ['b', 'a', 'obj', 'arr'], '上移交换键序');
  t.deepEqual(normalize(out, {}), normalize(before, {}), '上移内容零丢失');

  schema = u.moveProperty(schema, ['properties', 'b'], 'down');
  schema = u.moveProperty(schema, ['properties', 'b'], 'down');
  schema = u.moveProperty(schema, ['properties', 'b'], 'down');
  out = JSON.parse(u.stringifySchema(schema));
  t.deepEqual(Object.keys(out.properties), ['a', 'obj', 'arr', 'b'], '连续下移至末尾（相邻交换）');
  const boundary = u.moveProperty(schema, ['properties', 'b'], 'down');
  t.is(boundary, schema, '边界下移 no-op 原样返回');
});

// ================= 往返交接：旧→新、新→旧继续编辑不丢字段 =================

function kitchenSink() {
  const schema = baseSchema();
  schema.$schema = 'http://json-schema.org/draft-04/schema#';
  schema.$id = 'urn:legacy:api';
  schema.$comment = 'root comment';
  schema.properties.obj.properties.c = {
    type: 'string',
    enum: ['x', 'y'],
    enumDesc: 'x 是甲, y 是乙',
    format: 'email',
    mock: { mock: '@string' }
  };
  schema.properties.arr.items = { type: 'string', unknownInItems: '$ref', $comment: 'keep' };
  schema.properties.b.mock = '@raw-string'; // 字符串形态旧 mock（旧编辑器手写历史形态）
  schema.properties.obj.properties.l1 = {
    type: 'object',
    properties: { l2: { type: 'object', properties: { l3: { type: 'string' } } } }
  };
  return schema;
}

test.serial('交接 旧→新: 旧动作链输出交给新组件继续编辑，透传/枚举/mock/深嵌套字段零丢失', t => {
  const rich = kitchenSink();

  // 旧链五步
  const store = createOldStore();
  oldLoad(store, rich);
  oldAct(store, 'addChildFieldAction', { key: ['properties'] }); // field_N
  const addedName = Object.keys(store.getState().schema.data.properties).find(name =>
    /^field_\d+$/.test(name)
  );
  oldAct(store, 'changeNameAction', { value: 'added', prefix: ['properties'], name: addedName });
  oldAct(store, 'changeTypeAction', { key: ['properties', 'a', 'type'], value: 'array' });
  oldAct(store, 'changeValueAction', {
    key: ['properties', 'a', 'mock'],
    value: { mock: '@name' }
  });
  oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'b', required: true });
  oldAct(store, 'changeValueAction', {
    key: ['properties', 'b', 'description'],
    value: 'edited by old'
  });
  const fromOldStr = JSON.stringify(store.getState().schema.data);

  // 新组件接管继续编辑
  let schema = u.parseSchema(fromOldStr);
  schema = u.addProperty(schema, ['properties', 'obj', 'properties'], null); // field_1
  schema = u.renameProperty(schema, ['properties', 'obj', 'properties', 'field_1'], 'fromNew');
  schema = u.moveProperty(schema, ['properties', 'obj'], 'up');
  schema = u.setMock(schema, ['properties', 'added'], '@now');
  schema = u.toggleRequired(schema, ['properties', 'added'], false);
  const out = JSON.parse(u.stringifySchema(schema));

  // 透传保留字
  t.is(out.$schema, rich.$schema, '$schema 跨双编辑器保留');
  t.is(out.$id, rich.$id, '$id 保留');
  t.is(out.$comment, rich.$comment, '$comment 保留');

  // a：旧类型切换（偏离①，enum 被旧丢弃为预期）+ mock 写入，新接管后字段完整
  t.is(out.properties.a.type, 'array');
  t.deepEqual(out.properties.a.items, { type: 'string' });
  t.deepEqual(out.properties.a.mock, { mock: '@name' });
  t.is(out.properties.a.description, 'A desc', 'description 经旧类型切换保留');
  t.is(out.properties.a.enum, undefined, 'a 的 enum 被旧类型切换丢弃（偏离①旧毁数据方向，预期）');

  // obj.c 枚举族完全保留
  t.deepEqual(out.properties.obj.properties.c.enum, ['x', 'y']);
  t.is(out.properties.obj.properties.c.enumDesc, 'x 是甲, y 是乙');
  t.is(out.properties.obj.properties.c.format, 'email');
  t.deepEqual(out.properties.obj.properties.c.mock, { mock: '@string' });

  // 新增子字段 + 深嵌套链
  t.true(Object.prototype.hasOwnProperty.call(out.properties.obj.properties, 'fromNew'));
  t.true(out.properties.obj.required.indexOf('fromNew') !== -1, '新加子字段默认必填');
  t.is(
    out.properties.obj.properties.l1.properties.l2.properties.l3.type,
    'string',
    '深嵌套链零丢失'
  );

  // items 未知键
  t.is(out.properties.arr.items.unknownInItems, '$ref');
  t.is(out.properties.arr.items.$comment, 'keep');

  // 字符串形态旧 mock 未触碰保留
  t.is(out.properties.b.mock, '@raw-string');
  t.is(out.properties.b.description, 'edited by old');

  // required 状态：['a','added','b'] → 新取消 added → ['a','b']
  t.deepEqual(out.required, ['a', 'b']);
  t.deepEqual(out.properties.added.mock, { mock: '@now' }, '新接管后 mock 写入');

  // 移动生效（相邻交换：obj 与 b 换位）
  t.deepEqual(
    Object.keys(out.properties),
    ['a', 'obj', 'b', 'arr', 'added'],
    '新 move 将 obj 上移一位'
  );
});

test.serial('交接 新→旧: 新组件输出交给旧动作链继续编辑，保守类型切换产物被旧完整读取', t => {
  const rich = kitchenSink();

  // 新链六步
  let schema = u.parseSchema(JSON.parse(JSON.stringify(rich)));
  schema = u.addProperty(schema, ['properties'], null); // field_1
  schema = u.renameProperty(schema, ['properties', 'field_1'], 'fresh');
  schema = u.changeNodeType(schema, ['properties', 'a'], 'object'); // 新保守：保留 enum/mock 等
  schema = u.setMock(schema, ['properties', 'b'], '@natural');
  schema = u.setNodeField(schema, ['properties', 'b'], 'default', 7);
  schema = u.moveProperty(schema, ['properties', 'b'], 'down');
  const fromNewStr = u.stringifySchema(schema);

  // 旧链接管
  const store = createOldStore();
  oldLoad(store, JSON.parse(fromNewStr));
  oldAct(store, 'addChildFieldAction', { key: ['properties', 'obj', 'properties'] }); // field_M
  oldAct(store, 'changeValueAction', {
    key: ['properties', 'fresh', 'description'],
    value: 'edited by old'
  });
  oldAct(store, 'enableRequireAction', { prefix: ['properties'], name: 'fresh', required: false });
  const out = oldOut(store);

  // 透传与保守类型切换产物被旧完整读取
  t.is(out.$schema, rich.$schema, '$schema 经新输出被旧保留');
  t.is(out.properties.a.type, 'object');
  t.deepEqual(out.properties.a.enum, undefined, 'a 原无 enum（enum 在 obj.c）');
  t.deepEqual(out.properties.obj.properties.c.enum, ['x', 'y'], '枚举跨双编辑器保留');
  t.is(out.properties.a.description, 'A desc', '新类型切换保留的 description 被旧读取');

  // b：mock 覆写 + 数字 default
  t.deepEqual(out.properties.b.mock, { mock: '@natural' });
  t.is(out.properties.b.default, 7, '数字 default 跨双编辑器保留');

  // fresh 字段：旧链编辑与 required 清理
  t.is(out.properties.fresh.description, 'edited by old');
  t.deepEqual(out.required, ['a'], '旧 enableRequire 清除 fresh 后仅剩 a');

  // obj 新子字段 + required
  const objChild = Object.keys(out.properties.obj.properties).find(name => /^field_\d+$/.test(name));
  t.truthy(objChild, '旧链在 obj 下新增子字段');
  t.true(out.properties.obj.required.indexOf(objChild) !== -1, '旧链子字段默认必填');

  // 新的键序输出被旧保留（旧装载不重排）；move 为相邻交换：b 与 obj 换位
  t.deepEqual(Object.keys(out.properties), ['a', 'obj', 'b', 'arr', 'fresh'], '键序经旧装载保留');
});

// ================= mock 下拉对齐（MOCK_SOURCE 消费契约） =================

test.serial('MOCK_SOURCE 契约: 每项含字符串 mock 字段（新旧下拉选项值的共同数据源）', t => {
  t.true(Array.isArray(MOCK_SOURCE) && MOCK_SOURCE.length > 0, 'MOCK_SOURCE 非空数组');
  MOCK_SOURCE.forEach(item => {
    t.is(typeof item.mock, 'string', `选项 ${JSON.stringify(item)} 的 mock 须为字符串`);
    t.is(typeof item.name, 'string', `选项 ${JSON.stringify(item)} 的 name 须为字符串`);
  });
  // 两侧消费形态一致性（详见 docs/json-schema-editor-equiv-map.md §4）：
  // 旧 MockSelect: <Option key={item.mock}>{item.mock}</Option> —— 选项值 = item.mock
  // 新 schemaTree: MOCK_SOURCE.map(item => ({ value: item.mock })) —— 选项值 = item.mock
  const values = MOCK_SOURCE.map(item => item.mock);
  t.is(new Set(values).size, values.length, 'mock 值无重复（下拉无歧义项）');
});

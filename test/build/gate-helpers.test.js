import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';
// 被锁对象：类型门禁锁测的共享辅助 test/build/gate-helpers.js（纯函数直测，不连库、无网络）。
// 既有两条腿锁测（build-tscheck-coverage / scripts-tscheck-include-coverage）用 17 个样本
// 自证 marker 语义、用真实 tsconfig 走通 readJsonc——但那些是「经消费方间接覆盖」；本文件
// 直测批 D 加固后的 readJsonc 状态机边界（字符串内序列原样保留、未闭合即响亮报错）与
// glob/枚举的边界语义，并把批 C 评审⑦登记的两处继承性弱点各自钉成回归断言。
const { hasTsCheckMarker, readJsonc, globToRegExp, listCodeFiles } = require('./gate-helpers');

const ROOT = path.resolve(__dirname, '../..');

// readJsonc 只接受文件路径，夹具一律写系统临时目录（不落仓库），文件级 teardown 清理。
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-helpers-test-'));
test.after.always(() => fs.rmSync(TMP, { recursive: true, force: true }));
let seq = 0;
function fixture(text) {
  const file = path.join(TMP, `case-${++seq}.jsonc`);
  fs.writeFileSync(file, text);
  return file;
}

// ---------- readJsonc：正例（解析值精确匹配） ----------

// 负向对照 / 缺陷回归钉（防恒真）：批 C 评审⑦登记——旧实现分两步（先整段剥注释，再用
// 全局正则 /,(\s*[\]}])/ 去尾随逗号），正则会命中字符串字面量，实测 {"glob": "a,}b"} 被
// 静默改写为 {"glob":"a}b"}。若实现退回「整段正则」路线，本测试立即失败。
test('readJsonc: 字符串内的 ,} 与 ,] 序列原样保留（旧缺陷回归钉）', t => {
  const v = readJsonc(fixture('{"glob": "a,}b", "x": "c,]d"}'));
  t.is(v.glob, 'a,}b', '字符串内的 ,} 不得被尾随逗号剥除改写');
  t.is(v.x, 'c,]d');
  t.is(JSON.stringify(v), '{"glob":"a,}b","x":"c,]d"}');
});

test('readJsonc: 字符串内的 // 与 /* 序列不被当作注释起点', t => {
  const v = readJsonc(fixture('{"a": "http://x", "b": "/* not comment */", "c": "build/**/*.js"}'));
  t.deepEqual(v, { a: 'http://x', b: '/* not comment */', c: 'build/**/*.js' });
});

test('readJsonc: 转义引号与转义反斜杠不破坏字符串状态', t => {
  // `\"` 不得提前闭串：其后的 ,} 仍属字符串内容。
  const v = readJsonc(fixture(String.raw`{"a": "say \"hi\",}", "p": "C:\\dir\\"}`));
  t.is(v.a, 'say "hi",}');
  t.is(v.p, 'C:\\dir\\');
  // 转义反斜杠之后再遇引号 = 正常闭串（"back\\" 的闭引号前是转义反斜杠）。
  const w = readJsonc(fixture(String.raw`{"tail": "back\\", "n": 1,}`));
  t.is(w.tail, 'back\\');
  t.is(w.n, 1);
});

test('readJsonc: 注释剥离与尾随逗号剥除同遍完成（注释夹在逗号与闭括号之间也生效）', t => {
  const v = readJsonc(
    fixture(
      '{\n' +
        '  // 整行注释\n' +
        '  "a": [1, 2, /* 块注释 */ ],\n' +
        '  "b": {\n' +
        '    "c": 1 // 行尾注释\n' +
        '  },\n' +
        '}'
    )
  );
  t.deepEqual(v, { a: [1, 2], b: { c: 1 } });
});

test('readJsonc: 数组与对象尾随逗号（含嵌套）正常剥除', t => {
  t.deepEqual(readJsonc(fixture('{"a": [1,], "b": {"x": 1,},}')), { a: [1], b: { x: 1 } });
});

test('readJsonc: 单引号语义——双引号串内的单引号原样保留，纯单引号 JSON 仍由 JSON.parse 拒绝', t => {
  // 双引号字符串内含单引号：`'` 不得被当作新的字符串定界符而吞掉后续内容。
  const v = readJsonc(fixture('{"note": "it\'s a,} test"}'));
  t.is(v.note, "it's a,} test");

  // 纯单引号字符串不是合法 JSON：readJsonc 只做注释/尾随逗号容错，不做语法扩展，必须
  // 原样交给 JSON.parse 报错（而不是被串内的 `//` 当注释截断后换一种错法）。
  const single = "{'glob': 'a,}// not comment'}";
  const err = t.throws(() => readJsonc(fixture(single)), { instanceOf: SyntaxError });
  // 与「原样文本直接 JSON.parse」报错逐字一致，证明错误同源于原始文本。注意本夹具首处报错
  // 位置（`'`）在 `//` 截断点之前，本条对「截断类改写」无区分力——该区分力由上方取值断言
  //（`it's a,} test` 保真）承担，勿据本条推断截断已被排除。
  const expected = t.throws(() => JSON.parse(single), { instanceOf: SyntaxError });
  t.is(err.message, expected.message);
  t.false(/未闭合/.test(err.message), '单引号串已闭合，不应报「字符串未闭合」');
});

// ---------- readJsonc：负例（不得静默截断） ----------

// 缺陷回归钉（防恒真）：批 C 评审⑦登记——旧实现在「未闭合块注释之后无有效文本」时丢弃
// `/*` 到 EOF，若前缀恰可解析即静默返回残缺配置（实测 {"include":["x"]}\n/* unclosed
// → {"include":["x"]}），门禁读 tsconfig 时存在假绿风险。
test('readJsonc: 块注释未闭合必须 throw 且消息含文件路径（旧缺陷回归钉）', t => {
  const file = fixture('{"include":["x"]}\n/* unclosed');
  const err = t.throws(() => readJsonc(file), { instanceOf: Error });
  t.regex(err.message, /块注释未闭合/);
  t.true(err.message.includes(file), '错误消息必须含文件路径：' + err.message);
});

test('readJsonc: 字符串未闭合必须 throw 且消息含文件路径', t => {
  const file = fixture('{"a": "abc');
  const err = t.throws(() => readJsonc(file), { instanceOf: Error });
  t.regex(err.message, /字符串未闭合/);
  t.true(err.message.includes(file), '错误消息必须含文件路径：' + err.message);

  // 以转义反斜杠结尾的字符串同样未闭合（不得把 EOF 当转义目标而静默吞掉）。
  const file2 = fixture('{"a": "abc\\');
  const err2 = t.throws(() => readJsonc(file2), { instanceOf: Error });
  t.regex(err2.message, /字符串未闭合/);
  t.true(err2.message.includes(file2), '错误消息必须含文件路径：' + err2.message);
});

// ---------- readJsonc：仓库真实文件 ----------

// 计数为「有意紧锁快照」（批 D 评审 Minor-3）：include 扩容或 scripts/ 增删脚本时须同步更新；
// 相比 >= 下限，紧锁能在白名单条目被静默删除时立即失败（代价是合法扩容要改测试）。
test('readJsonc: 仓库两份 tsconfig 解析成功且 include 计数 264 / 4', t => {
  const main = readJsonc(path.join(ROOT, 'tsconfig.json'));
  const build = readJsonc(path.join(ROOT, 'tsconfig.build.json'));
  t.is(main.include.length, 264);
  t.is(build.include.length, 4);
  t.deepEqual(build.include, [
    'build/**/*.js',
    'build/**/*.mjs',
    'scripts/**/*.mjs',
    'rsbuild.config.mjs'
  ]);
  t.true(main.compilerOptions.strict === true, '主配置注释剥离后仍应保持对象结构');
});

// ---------- hasTsCheckMarker：四类边界（与既有 17 样本自证互补，不重复全量） ----------

test('hasTsCheckMarker: 位置边界（shebang 后 / 前导注释块后 / 代码后 / 块注释内）', t => {
  t.true(hasTsCheckMarker('#!/usr/bin/env node\n// @ts-check\nconst a = 1;\n'));
  t.true(hasTsCheckMarker('/* 头部块注释 */\n// @ts-check\nconst a = 1;\n'));
  t.false(hasTsCheckMarker('const a = 1;\n// @ts-check\n'), '代码之后的 marker 不识别');
  t.false(hasTsCheckMarker('/* @ts-check */\nconst a = 1;\n'), '块注释内的 marker 不识别');
});

test('hasTsCheckMarker: 拼写边界（//@ts-check 认，// @ts-check-extra 不认）', t => {
  t.true(hasTsCheckMarker('//@ts-check\nconst a = 1;\n'));
  t.false(hasTsCheckMarker('// @ts-check-extra\nconst a = 1;\n'));
});

// ---------- globToRegExp ----------

test('globToRegExp: **/ 跨目录、* 不跨目录、字面量点号转义', t => {
  const anyJs = globToRegExp('**/*.js');
  t.true(anyJs.test('common/utils.js'), '**/ 应跨目录匹配');
  t.true(anyJs.test('root.js'), '**/ 也应匹配根级（零级目录）');
  t.false(anyJs.test('a/b.ts'), '扩展名口径不得放宽');

  const rootJs = globToRegExp('*.js');
  t.true(rootJs.test('root.js'));
  t.false(rootJs.test('a/b.js'), '* 不得跨 / 匹配');

  const exact = globToRegExp('rsbuild.config.mjs');
  t.true(exact.test('rsbuild.config.mjs'));
  t.false(exact.test('rsbuildXconfig.mjs'), '字面量点号必须转义（X 不得顶替 .）');
});

// ---------- listCodeFiles ----------

test('listCodeFiles: 根级非递归枚举含隐藏文件，且按扩展名过滤', t => {
  const files = listCodeFiles(ROOT);
  t.true(files.includes('.prettierrc.js'), '隐藏代码文件必须被枚举到');
  t.true(files.includes('babel.config.js'));
  t.false(
    files.some(f => f.includes('/')),
    '非递归：结果不得含子目录路径'
  );
  t.true(fs.existsSync(path.join(ROOT, 'package.json')), '前置事实：根级存在 package.json');
  t.false(files.includes('package.json'), '.json 不在代码文件口径内');
  t.false(
    files.some(f => /\.(json|txt)$/.test(f)),
    '枚举结果不得含 .json/.txt'
  );
});

// 计数紧锁同前（有意快照，非下限守卫）。
test('listCodeFiles: recursive 递归子目录且路径相对仓库根（scripts/ 当前 5 个）', t => {
  const files = listCodeFiles(path.join(ROOT, 'scripts'), { recursive: true });
  t.is(files.length, 5, 'scripts/ 应枚举到 5 个代码文件：' + files.join(', '));
  t.true(
    files.every(f => f.startsWith('scripts/')),
    '路径基为仓库根：' + files.join(', ')
  );
  t.true(files.includes('scripts/audit-check.js'));
  t.true(files.includes('scripts/antd5-css-lib.cjs'));
  t.true(files.includes('scripts/antd5-candidate-scan.mjs'));
  t.false(files.includes('scripts/audit-baseline.json'), '.json 不枚举');
});

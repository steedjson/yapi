import test from 'ava';

const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons.js');

// 后台副作用统一出口（fireAndForget）的语义钉：立即返回、不改变调用时序，
// 但把拒绝转为 error 日志——全仓 20 处「操作后顺带写库/触发钩子」依赖它避免
// 未处理拒绝（Node ≥22 默认终止进程，全仓无进程级兜底）。

test.before('挂载真实 commons 到 yapi 单例', () => {
  yapi.commons = commons;
});

/**
 * 捕获日志出口。注意：fireAndForget 内部经 `yapi.commons.log` 取用（运行时查表），
 * 故须替换 yapi.commons 上的 log，而不是 commons 模块导出对象上的同名属性。
 * @param {any} t ava 断言对象
 * @returns {{ logs: any[] }}
 */
function captureLog(t) {
  const logs = [];
  const real = yapi.commons.log;
  yapi.commons.log = (msg, type) => logs.push([msg, type]);
  t.teardown(() => {
    yapi.commons.log = real;
  });
  return { logs };
}

test.serial('fireAndForget：同步返回 undefined，不等待 promise', t => {
  const { logs } = captureLog(t);
  let resolved = false;
  const p = new Promise(resolve => setTimeout(() => { resolved = true; resolve('done'); }, 30));
  const ret = commons.fireAndForget(p, 'probe');
  t.is(ret, undefined, '立即返回，不阻塞调用方');
  t.is(resolved, false, '返回时 promise 尚未兑现（确为后台执行）');
  t.deepEqual(logs, [], '成功路径不产生日志');
});

test.serial('fireAndForget：拒绝被吸收为 error 日志，不产生未处理拒绝', async t => {
  const { logs } = captureLog(t);
  commons.fireAndForget(Promise.reject(new Error('boom')), 'probe-label');
  // 等一个宏任务让 catch 落地
  await new Promise(resolve => setImmediate(resolve));
  t.is(logs.length, 1, '恰一条日志');
  t.is(logs[0][1], 'error', '级别为 error');
  t.regex(String(logs[0][0]), /probe-label/, '日志含调用方给定标签（便于定位来源）');
  t.regex(String(logs[0][0]), /boom/, '日志含原始错误信息');
});

test.serial('fireAndForget：非 Error 拒绝（字符串/undefined）同样被吸收且不抛', async t => {
  const { logs } = captureLog(t);
  commons.fireAndForget(Promise.reject('plain-string'), 'probe2');
  commons.fireAndForget(Promise.reject(), 'probe3');
  await new Promise(resolve => setImmediate(resolve));
  t.is(logs.length, 2);
  t.true(logs.every(l => l[1] === 'error'));
});

test.serial('fireAndForget：缺省标签回退为 fire-and-forget', async t => {
  const { logs } = captureLog(t);
  commons.fireAndForget(Promise.reject(new Error('x')));
  await new Promise(resolve => setImmediate(resolve));
  t.regex(String(logs[0][0]), /fire-and-forget/);
});

test.serial('fireAndForget：非 promise 入参（同步值/同步抛错）也被规范化处理', async t => {
  const { logs } = captureLog(t);
  t.notThrows(() => commons.fireAndForget('not-a-promise', 'sync-value'));
  await new Promise(resolve => setImmediate(resolve));
  t.deepEqual(logs, [], '同步值包装后直接兑现，无日志');
});

// 不变量：全仓服务端/插件代码不得再出现裸 `.then();`（fire-and-forget 未吸收拒绝，
// Node ≥22 下会成为进程级未处理拒绝）。新增后台副作用请走 commons.fireAndForget。
test.serial('不变量：server/ 与 exts/ 下无裸 .then(); fire-and-forget（须经 commons.fireAndForget）', async t => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const ROOT = path.resolve(__dirname, '../..');
  // git grep 无命中时 exit 1（正常语义），故捕获退出码后按输出判定
  /** @type {string} */
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-nE', '\\.then\\(\\);', '--', 'server/**', 'exts/**'], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
  } catch (/** @type {any} */ err) {
    // 退出码 1 = 无命中（期望）；其它退出码 = 检索本身失败，应大声暴露
    if (err.status !== 1) {
      throw new Error('git grep 检索失败（status=' + err.status + '）: ' + err.message);
    }
    hits = String(err.stdout || '').trim();
  }
  t.is(hits, '', '存在裸 .then(); 站点（后台失败会成未处理拒绝）：\n' + hits);
  // 反恒真守卫：检索面非空（确有使用 .then( 的文件被扫到），防 pattern 失效导致假绿
  const scanned = execFileSync('git', ['grep', '-lE', '\\.then\\(', '--', 'server/**', 'exts/**'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  t.true(scanned.length > 0, '检索面非空（确有使用 .then( 的文件被扫到）');
  t.true(fs.existsSync(path.join(ROOT, 'server/utils/commons.js')));
});
